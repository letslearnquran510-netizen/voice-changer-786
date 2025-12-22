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

/**
 * Ring buffer to store pre-trigger audio (captures start of words)
 */
class PreBuffer {
  private buffers: Float32Array[] = [];
  private maxBuffers: number;

  constructor(maxBuffers: number = 8) {
    this.maxBuffers = maxBuffers;
  }

  push(data: Float32Array): void {
    const copy = new Float32Array(data.length);
    copy.set(data);
    this.buffers.push(copy);
    
    // Keep only last N buffers
    while (this.buffers.length > this.maxBuffers) {
      this.buffers.shift();
    }
  }

  flush(): Float32Array[] {
    const result = [...this.buffers];
    this.buffers = [];
    return result;
  }

  clear(): void {
    this.buffers = [];
  }
}

export const useGeminiLive = ({ apiKey, vadThreshold = 0.008 }: UseGeminiLiveProps): UseGeminiLiveReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isVadActive, setIsVadActive] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Audio context refs
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Recording
  const recorderRef = useRef<AudioRecorder | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pre-buffer for capturing start of words (CRITICAL for no missing audio)
  const preBufferRef = useRef<PreBuffer | null>(null);

  // VAD state refs
  const vadRef = useRef(vadThreshold);
  const vadActiveRef = useRef(false);
  const hangoverRef = useRef(0);

  useEffect(() => {
    vadRef.current = vadThreshold;
  }, [vadThreshold]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /**
   * Disconnect and cleanup
   */
  const disconnect = useCallback(async () => {
    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Get recorded audio
    if (recorderRef.current) {
      const blob = recorderRef.current.stop();
      if (blob && blob.size > 44) {
        setAudioBlob(blob);
      }
      recorderRef.current = null;
    }

    // Clear pre-buffer
    if (preBufferRef.current) {
      preBufferRef.current.clear();
      preBufferRef.current = null;
    }

    // Clear session
    sessionRef.current = null;

    // Stop media
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }

    if (fileSourceRef.current) {
      try { fileSourceRef.current.stop(); } catch {}
      fileSourceRef.current.disconnect();
      fileSourceRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (inputCtxRef.current?.state !== 'closed') {
      await inputCtxRef.current?.close().catch(() => {});
      inputCtxRef.current = null;
    }
    
    if (outputCtxRef.current?.state !== 'closed') {
      await outputCtxRef.current?.close().catch(() => {});
      outputCtxRef.current = null;
    }

    // Reset state
    vadActiveRef.current = false;
    hangoverRef.current = 0;
    setStatus('disconnected');
    setAudioStream(null);
    setInputVolume(0);
    setIsVadActive(false);
  }, []);

  /**
   * Connect and start processing
   */
  const connect = useCallback(async (persona: Persona, file?: File, language: LanguageCode = 'en') => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }

    try {
      setAudioBlob(null);
      setRecordingDuration(0);
      setError(null);

      await disconnect();
      
      setStatus('connecting');
      setActivePersona(persona);

      // Create contexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });

      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextPlayTimeRef.current = 0;

      // Initialize recorder
      recorderRef.current = new AudioRecorder(24000);

      // Initialize pre-buffer (stores ~250ms of audio before voice detected)
      // This ensures we NEVER miss the start of words
      preBufferRef.current = new PreBuffer(8);

      // Reset VAD state
      vadActiveRef.current = false;
      hangoverRef.current = 0;

      // Setup source
      let source: AudioNode;
      let visualizerStream: MediaStream;

      if (file) {
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
        // Request high-quality audio capture
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
            recorderRef.current?.start();
            
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
              setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
            }, 500);
            
            fileSourceRef.current?.start(0);
          },
          
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (audioData && outputCtxRef.current) {
              const ctx = outputCtxRef.current;
              
              try {
                const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
                
                // Record output
                if (recorderRef.current) {
                  recorderRef.current.addChunk(audioBufferToFloat32(buffer));
                }
                
                // Play audio
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

      // CRITICAL: Audio processor with smart VAD
      // Buffer size 256 = lowest latency while maintaining quality
      const processor = inputCtx.createScriptProcessor(256, 1, 1);
      processorRef.current = processor;

      /**
       * HANGOVER_FRAMES: How long to keep transmitting after voice stops
       * Higher = no cut words, but slight delay
       * 25 frames @ 256 samples @ 16kHz = ~400ms hangover
       * This ensures we NEVER cut off the end of words
       */
      const HANGOVER_FRAMES = 25;

      /**
       * Send audio data to Gemini
       */
      const sendAudio = (data: Float32Array) => {
        if (sessionRef.current) {
          const pcm = createPcmBlob(data, inputCtx.sampleRate);
          sessionRef.current
            .then(s => s.sendRealtimeInput({ media: pcm }))
            .catch(() => {});
        }
      };

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS volume (every sample for accuracy)
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        setInputVolume(rms);

        // File mode: always transmit everything
        if (file) {
          sendAudio(input);
          setIsVadActive(true);
          return;
        }

        // Mic mode: Smart VAD with pre-buffer
        const threshold = vadRef.current;
        const isVoice = rms > threshold;

        if (isVoice) {
          // Voice detected!
          
          if (!vadActiveRef.current) {
            // TRANSITION: Silence -> Voice
            // Send ALL pre-buffered audio first (this captures start of words!)
            vadActiveRef.current = true;
            setIsVadActive(true);
            
            const preBuffered = preBufferRef.current?.flush() || [];
            for (const chunk of preBuffered) {
              sendAudio(chunk);
            }
          }
          
          // Reset hangover counter
          hangoverRef.current = HANGOVER_FRAMES;
          
          // Send current audio
          sendAudio(input);
          
        } else {
          // No voice detected
          
          if (vadActiveRef.current) {
            // Was active, check hangover
            if (hangoverRef.current > 0) {
              // Still in hangover period - keep sending
              hangoverRef.current--;
              sendAudio(input);
            } else {
              // Hangover expired - stop transmitting
              vadActiveRef.current = false;
              setIsVadActive(false);
            }
          } else {
            // Not active - store in pre-buffer for next word start
            preBufferRef.current?.push(input);
          }
        }
      };

      // Connect (muted output)
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
