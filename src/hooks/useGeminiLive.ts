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
  downloadUrl: string | null;
  recordingDuration: number;
}

export const useGeminiLive = ({ apiKey, vadThreshold = 0.01 }: UseGeminiLiveProps): UseGeminiLiveReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isVadActive, setIsVadActive] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // WAV Audio Recorder
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const vadThresholdRef = useRef(vadThreshold);
  useEffect(() => {
    vadThresholdRef.current = vadThreshold;
  }, [vadThreshold]);

  // Clean up duration interval
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  const disconnect = useCallback(async () => {
    setStatus('disconnected');
    setAudioStream(null);
    setInputVolume(0);
    setIsVadActive(false);

    // Stop duration timer
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop audio recorder and get WAV file
    if (audioRecorderRef.current) {
      const wavBlob = audioRecorderRef.current.stop();
      if (wavBlob && wavBlob.size > 44) { // More than just WAV header
        // Revoke old URL if exists
        if (downloadUrl) {
          URL.revokeObjectURL(downloadUrl);
        }
        const url = URL.createObjectURL(wavBlob);
        setDownloadUrl(url);
      }
      audioRecorderRef.current = null;
    }

    sessionPromiseRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (fileSourceRef.current) {
      try {
        fileSourceRef.current.stop();
      } catch (e) {
        // Ignore errors when stopping
      }
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

    if (inputAudioContextRef.current) {
      if (inputAudioContextRef.current.state !== 'closed') {
        await inputAudioContextRef.current.close();
      }
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
      if (outputAudioContextRef.current.state !== 'closed') {
        await outputAudioContextRef.current.close();
      }
      outputAudioContextRef.current = null;
    }
  }, [downloadUrl]);

  const connect = useCallback(async (persona: Persona, file?: File, language: LanguageCode = 'en') => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }

    try {
      // Reset state
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
      setDownloadUrl(null);
      setRecordingDuration(0);

      await disconnect();
      setStatus('connecting');
      setError(null);
      setActivePersona(persona);

      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      const inputCtx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: 24000 });

      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      // Initialize WAV recorder (24kHz to match output)
      audioRecorderRef.current = new AudioRecorder(24000);

      let source: AudioNode;
      let streamForVisualizer: MediaStream;

      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await inputCtx.decodeAudioData(arrayBuffer);
        const bufferSource = inputCtx.createBufferSource();
        bufferSource.buffer = audioBuffer;
        source = bufferSource;
        fileSourceRef.current = bufferSource;
        const fileDest = inputCtx.createMediaStreamDestination();
        bufferSource.connect(fileDest);
        streamForVisualizer = fileDest.stream;
      } else {
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
        streamForVisualizer = stream;
      }

      setAudioStream(streamForVisualizer);
      sourceRef.current = source;

      const ai = new GoogleGenAI({ apiKey });
      const systemInst = `${persona.systemInstruction} 
      Shadow the user's voice in ${language.toUpperCase()}.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voiceName } } },
          systemInstruction: systemInst,
        },
        callbacks: {
          onopen: () => {
            setStatus('connected');
            
            // Start recording
            if (audioRecorderRef.current) {
              audioRecorderRef.current.start();
            }
            
            // Start duration timer
            recordingStartTimeRef.current = Date.now();
            durationIntervalRef.current = setInterval(() => {
              const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
              setRecordingDuration(elapsed);
            }, 1000);
            
            if (fileSourceRef.current) fileSourceRef.current.start(0);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                
                // Record the audio data for WAV export
                if (audioRecorderRef.current) {
                  const floatData = audioBufferToFloat32(audioBuffer);
                  audioRecorderRef.current.addChunk(floatData);
                }
                
                const sourceNode = ctx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(ctx.destination);
                sourceNode.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
              } catch (e) {
                console.error("Audio decoding error:", e);
              }
            }

            if (message.serverContent?.turnComplete) {
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => {
            setStatus('disconnected');
          },
          onerror: (err: any) => {
            setError(err.message || "Connection failed.");
            setStatus('error');
            disconnect();
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

      // Audio processor for VAD and sending to API
      const processor = inputCtx.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      const vadState = { hangover: 0, isActive: false };
      const HANGOVER_FRAMES = 8;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i += 4) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / (inputData.length / 4));
        setInputVolume(rms);

        let shouldTransmit = false;
        if (file) {
          shouldTransmit = true;
          setIsVadActive(true);
        } else {
          if (rms > vadThresholdRef.current) {
            vadState.hangover = HANGOVER_FRAMES;
            if (!vadState.isActive) {
              vadState.isActive = true;
              setIsVadActive(true);
            }
          } else {
            if (vadState.hangover > 0) vadState.hangover--;
            else if (vadState.isActive) {
              vadState.isActive = false;
              setIsVadActive(false);
            }
          }
          shouldTransmit = vadState.isActive;
        }

        if (shouldTransmit && sessionPromiseRef.current) {
          const pcmBlob = createPcmBlob(inputData, inputCtx.sampleRate);
          sessionPromiseRef.current.then(session => session.sendRealtimeInput({ media: pcmBlob })).catch(() => { });
        }
      };

      source.connect(processor);
      const muteNode = inputCtx.createGain();
      muteNode.gain.value = 0;
      processor.connect(muteNode);
      muteNode.connect(inputCtx.destination);

    } catch (err: any) {
      setError(err.message || "Failed to start session");
      setStatus('error');
      disconnect();
    }
  }, [apiKey, disconnect, downloadUrl]);

  return {
    connect,
    disconnect,
    status,
    error,
    activePersona,
    mediaStream: audioStream,
    inputVolume,
    isVadActive,
    downloadUrl,
    recordingDuration
  };
};
