import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Persona, ConnectionStatus, LanguageCode } from '../types';
import { createPcmBlob, decode, decodeAudioData, AudioRecorder, audioBufferToFloat32 } from '../utils/audio';

interface UseGeminiLiveProps {
  apiKey: string;
  vadThreshold?: number;
}

interface UseGeminiLiveReturn {
  connect: (persona: Persona, file?: File, language?: LanguageCode) => Promise<void>;
  disconnect: () => Promise<void>;
  status: ConnectionStatus;
  error: string | null;
  activePersona: Persona | null;
  mediaStream: MediaStream | null;
  inputVolume: number;
  isVadActive: boolean;
  audioBlob: Blob | null;
  recordingDuration: number;
}

export const useGeminiLive = ({ apiKey, vadThreshold = 0.01 }: UseGeminiLiveProps): UseGeminiLiveReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isVadActive, setIsVadActive] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Refs for audio contexts
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Recording refs
  const recorderRef = useRef<AudioRecorder | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // VAD threshold ref for real-time updates
  const vadRef = useRef(vadThreshold);
  useEffect(() => {
    vadRef.current = vadThreshold;
  }, [vadThreshold]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /**
   * Disconnect and cleanup all resources
   */
  const disconnect = useCallback(async () => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop recorder and get WAV blob
    if (recorderRef.current) {
      const blob = recorderRef.current.stop();
      if (blob && blob.size > 44) {
        setAudioBlob(blob);
      }
      recorderRef.current = null;
    }

    // Clear session
    sessionRef.current = null;

    // Stop media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    // Stop file source
    if (fileSourceRef.current) {
      try { fileSourceRef.current.stop(); } catch {}
      fileSourceRef.current.disconnect();
      fileSourceRef.current = null;
    }

    // Disconnect audio nodes
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio contexts
    if (inputCtxRef.current?.state !== 'closed') {
      await inputCtxRef.current?.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current?.state !== 'closed') {
      await outputCtxRef.current?.close().catch(() => {});
      outputCtxRef.current = null;
    }

    // Reset state
    setStatus('disconnected');
    setAudioStream(null);
    setInputVolume(0);
    setIsVadActive(false);
  }, []);

  /**
   * Connect and start voice transformation
   */
  const connect = useCallback(async (persona: Persona, file?: File, language: LanguageCode = 'en') => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }

    try {
      // Reset
      setAudioBlob(null);
      setRecordingDuration(0);
      setError(null);

      await disconnect();
      
      setStatus('connecting');
      setActivePersona(persona);

      // Create audio contexts with optimal settings for LOW LATENCY
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });

      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextPlayTimeRef.current = 0;

      // Initialize recorder (24kHz for output quality)
      recorderRef.current = new AudioRecorder(24000);

      // Setup audio source
      let source: AudioNode;
      let visualizerStream: MediaStream;

      if (file) {
        // File input mode
        const arrayBuf = await file.arrayBuffer();
        const audioBuf = await inputCtx.decodeAudioData(arrayBuf);
        const bufSrc = inputCtx.createBufferSource();
        bufSrc.buffer = audioBuf;
        source = bufSrc;
        fileSourceRef.current = bufSrc;
        
        const dest = inputCtx.createMediaStreamDestination();
        bufSrc.connect(dest);
        visualizerStream = dest.stream;
      } else {
        // Microphone input mode
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        });
        mediaStreamRef.current = stream;
        source = inputCtx.createMediaStreamSource(stream);
        visualizerStream = stream;
      }

      setAudioStream(visualizerStream);
      sourceRef.current = source;

      // Connect to Gemini
      const ai = new GoogleGenAI({ apiKey });
      const systemPrompt = `${persona.systemInstruction}\nShadow the user's voice in ${language.toUpperCase()}.`;

      const session = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: persona.voiceName }
            }
          },
          systemInstruction: systemPrompt,
        },
        callbacks: {
          onopen: () => {
            setStatus('connected');
            
            // Start recorder
            recorderRef.current?.start();
            
            // Start duration timer
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
              setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 500);
            
            // Start file playback if applicable
            fileSourceRef.current?.start(0);
          },
          
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (audioData && outputCtxRef.current) {
              const ctx = outputCtxRef.current;
              
              try {
                // Decode and play audio
                const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                
                // Record the output
                if (recorderRef.current) {
                  recorderRef.current.addChunk(audioBufferToFloat32(buffer));
                }
                
                // Schedule playback
                const now = ctx.currentTime;
                const startTime = Math.max(nextPlayTimeRef.current, now);
                
                const srcNode = ctx.createBufferSource();
                srcNode.buffer = buffer;
                srcNode.connect(ctx.destination);
                srcNode.start(startTime);
                
                nextPlayTimeRef.current = startTime + buffer.duration;
              } catch (e) {
                console.error("Audio decode error:", e);
              }
            }

            // Reset timing on turn complete
            if (msg.serverContent?.turnComplete) {
              nextPlayTimeRef.current = 0;
            }
          },
          
          onclose: () => setStatus('disconnected'),
          
          onerror: (err: any) => {
            setError(err.message || "Connection failed");
            setStatus('error');
            disconnect();
          }
        }
      });

      sessionRef.current = session;

      // OPTIMIZED: Smaller buffer = lower latency (512 samples)
      const processor = inputCtx.createScriptProcessor(512, 1, 1);
      processorRef.current = processor;

      // VAD state
      let vadHangover = 0;
      let vadActive = false;
      const HANGOVER_MAX = 5; // ~160ms hangover for quick response

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS (fast method - sample every 4th)
        let sum = 0;
        const len = input.length;
        for (let i = 0; i < len; i += 4) {
          const v = input[i];
          sum += v * v;
        }
        const rms = Math.sqrt(sum / (len / 4));
        setInputVolume(rms);

        // Determine if we should transmit
        let transmit = false;
        
        if (file) {
          // File mode: always transmit
          transmit = true;
          setIsVadActive(true);
        } else {
          // Mic mode: use VAD
          if (rms > vadRef.current) {
            vadHangover = HANGOVER_MAX;
            if (!vadActive) {
              vadActive = true;
              setIsVadActive(true);
            }
          } else if (vadHangover > 0) {
            vadHangover--;
          } else if (vadActive) {
            vadActive = false;
            setIsVadActive(false);
          }
          transmit = vadActive;
        }

        // Send to Gemini
        if (transmit && sessionRef.current) {
          const pcm = createPcmBlob(input, inputCtx.sampleRate);
          sessionRef.current
            .then(s => s.sendRealtimeInput({ media: pcm }))
            .catch(() => {});
        }
      };

      // Connect processor (muted output to prevent feedback)
      source.connect(processor);
      const gain = inputCtx.createGain();
      gain.gain.value = 0;
      processor.connect(gain);
      gain.connect(inputCtx.destination);

    } catch (err: any) {
      setError(err.message || "Failed to start");
      setStatus('error');
      disconnect();
    }
  }, [apiKey, disconnect]);

  return {
    connect,
    disconnect,
    status,
    error,
    activePersona,
    mediaStream: audioStream,
    inputVolume,
    isVadActive,
    audioBlob,
    recordingDuration
  };
};
