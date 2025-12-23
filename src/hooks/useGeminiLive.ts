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
  originalAudioBlob: Blob | null;
  transformedAudioBlob: Blob | null;
  recordingDuration: number;
}

/**
 * Pre-buffer for capturing word starts
 */
class PreBuffer {
  private buffers: Float32Array[] = [];
  private maxBuffers: number;

  constructor(maxBuffers: number = 10) {
    this.maxBuffers = maxBuffers;
  }

  push(data: Float32Array): void {
    const copy = new Float32Array(data.length);
    copy.set(data);
    this.buffers.push(copy);
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

/**
 * Language-specific instructions for better natural voice output
 */
const getLanguageInstruction = (lang: LanguageCode): string => {
  const instructions: Record<LanguageCode, string> = {
    en: 'Speak in natural English with perfect pronunciation and human-like flow.',
    hi: 'Speak in natural Hindi (हिंदी) with authentic native pronunciation and natural rhythm.',
    ur: 'Speak in beautiful Urdu (اردو) with elegant Lahore/Karachi accent and poetic flow.',
    ar: 'Speak in authentic Arabic (العربية) with proper makhraj and natural Middle Eastern rhythm.',
    es: 'Speak in natural Spanish (Español) with authentic pronunciation and melodic flow.',
    fr: 'Speak in natural French (Français) with proper liaison and elegant rhythm.',
    de: 'Speak in natural German (Deutsch) with proper pronunciation and clear articulation.',
    zh: 'Speak in natural Mandarin Chinese (中文) with correct tones and natural rhythm.',
    ja: 'Speak in natural Japanese (日本語) with proper pitch accent and polite tone.',
    ko: 'Speak in natural Korean (한국어) with authentic pronunciation and natural speech patterns.',
    pt: 'Speak in natural Portuguese (Português) with authentic Brazilian/European pronunciation.',
    ru: 'Speak in natural Russian (Русский) with authentic pronunciation and natural intonation.',
  };
  return instructions[lang] || instructions.en;
};

export const useGeminiLive = ({ apiKey, vadThreshold = 0.006 }: UseGeminiLiveProps): UseGeminiLiveReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isVadActive, setIsVadActive] = useState(false);
  const [originalAudioBlob, setOriginalAudioBlob] = useState<Blob | null>(null);
  const [transformedAudioBlob, setTransformedAudioBlob] = useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Audio contexts
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const sessionRef = useRef<Promise<any> | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Two recorders
  const originalRecorderRef = useRef<AudioRecorder | null>(null);
  const transformedRecorderRef = useRef<AudioRecorder | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preBufferRef = useRef<PreBuffer | null>(null);

  // VAD state
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
   * Disconnect and save recordings
   */
  const disconnect = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Save original voice
    if (originalRecorderRef.current) {
      const blob = originalRecorderRef.current.stop();
      if (blob && blob.size > 44) {
        setOriginalAudioBlob(blob);
      }
      originalRecorderRef.current = null;
    }

    // Save transformed voice
    if (transformedRecorderRef.current) {
      const blob = transformedRecorderRef.current.stop();
      if (blob && blob.size > 44) {
        setTransformedAudioBlob(blob);
      }
      transformedRecorderRef.current = null;
    }

    if (preBufferRef.current) {
      preBufferRef.current.clear();
      preBufferRef.current = null;
    }

    sessionRef.current = null;

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

    vadActiveRef.current = false;
    hangoverRef.current = 0;
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
      setOriginalAudioBlob(null);
      setTransformedAudioBlob(null);
      setRecordingDuration(0);
      setError(null);

      await disconnect();
      
      setStatus('connecting');
      setActivePersona(persona);

      // Create high-quality audio contexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });

      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextPlayTimeRef.current = 0;

      // Initialize recorders with matching sample rates
      originalRecorderRef.current = new AudioRecorder(16000);
      transformedRecorderRef.current = new AudioRecorder(24000);

      // Larger pre-buffer for better word capture (captures ~300ms before voice)
      preBufferRef.current = new PreBuffer(10);

      vadActiveRef.current = false;
      hangoverRef.current = 0;

      // Setup audio source
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
        // Request highest quality microphone input
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          }
        });
        mediaStreamRef.current = stream;
        source = inputCtx.createMediaStreamSource(stream);
        visualizerStream = stream;
      }

      setAudioStream(visualizerStream);
      sourceRef.current = source;

      // Build enhanced system prompt for natural human voice
      const languageInstruction = getLanguageInstruction(language);
      const systemPrompt = `${persona.systemInstruction}

=== CURRENT SESSION LANGUAGE ===
${languageInstruction}

=== FINAL REMINDER ===
You are a HUMAN VOICE ACTOR performing live.
- ONLY repeat exactly what user says
- NEVER add any words, greetings, or acknowledgments
- Sound 100% natural and human
- Match their exact emotion and tone
- If they say nothing, you say NOTHING
`;

      // Connect to Gemini with optimized settings
      const ai = new GoogleGenAI({ apiKey });

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
            
            originalRecorderRef.current?.start();
            transformedRecorderRef.current?.start();
            
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
                
                // Record transformed voice
                if (transformedRecorderRef.current) {
                  transformedRecorderRef.current.addChunk(audioBufferToFloat32(buffer));
                }
                
                // Smooth audio playback scheduling
                const now = ctx.currentTime;
                const startTime = Math.max(nextPlayTimeRef.current, now + 0.01);
                
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

      // Audio processor with optimized buffer size
      const processor = inputCtx.createScriptProcessor(256, 1, 1);
      processorRef.current = processor;

      // Longer hangover for complete word capture (~500ms)
      const HANGOVER_FRAMES = 30;

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
        
        // Calculate RMS with full accuracy
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        setInputVolume(rms);

        // File mode: always send
        if (file) {
          if (originalRecorderRef.current) {
            originalRecorderRef.current.addChunk(input);
          }
          sendAudio(input);
          setIsVadActive(true);
          return;
        }

        // Mic mode: Smart VAD
        const threshold = vadRef.current;
        const isVoice = rms > threshold;

        if (isVoice) {
          if (!vadActiveRef.current) {
            vadActiveRef.current = true;
            setIsVadActive(true);
            
            // Send ALL pre-buffered audio (captures word starts)
            const preBuffered = preBufferRef.current?.flush() || [];
            for (const chunk of preBuffered) {
              if (originalRecorderRef.current) {
                originalRecorderRef.current.addChunk(chunk);
              }
              sendAudio(chunk);
            }
          }
          
          hangoverRef.current = HANGOVER_FRAMES;
          
          // Record and send
          if (originalRecorderRef.current) {
            originalRecorderRef.current.addChunk(input);
          }
          sendAudio(input);
          
        } else {
          if (vadActiveRef.current) {
            if (hangoverRef.current > 0) {
              hangoverRef.current--;
              // Continue recording/sending during hangover
              if (originalRecorderRef.current) {
                originalRecorderRef.current.addChunk(input);
              }
              sendAudio(input);
            } else {
              vadActiveRef.current = false;
              setIsVadActive(false);
            }
          } else {
            // Store in pre-buffer
            preBufferRef.current?.push(input);
          }
        }
      };

      // Connect (muted output to prevent feedback)
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
    originalAudioBlob,
    transformedAudioBlob,
    recordingDuration
  };
};
