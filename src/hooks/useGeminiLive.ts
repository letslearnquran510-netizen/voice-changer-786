import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Persona, ConnectionStatus, TranscriptItem, LanguageCode } from '../types';
import { createPcmBlob, decode, decodeAudioData } from '../utils/audio';

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
  transcripts: TranscriptItem[];
}

export const useGeminiLive = ({ apiKey, vadThreshold = 0.01 }: UseGeminiLiveProps): UseGeminiLiveReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [activePersona, setActivePersona] = useState<Persona | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isVadActive, setIsVadActive] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const transcriptsRef = useRef<TranscriptItem[]>([]);
  const currentInputTextRef = useRef<string>('');
  const currentOutputTextRef = useRef<string>('');
  const currentInputIdRef = useRef<string>('');
  const currentOutputIdRef = useRef<string>('');

  const vadThresholdRef = useRef(vadThreshold);
  useEffect(() => {
    vadThresholdRef.current = vadThreshold;
  }, [vadThreshold]);

  const disconnect = useCallback(async () => {
    setStatus('disconnected');
    setAudioStream(null);
    setInputVolume(0);
    setIsVadActive(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else if (recordedChunksRef.current.length > 0) {
      const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
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
  }, []);

  const connect = useCallback(async (persona: Persona, file?: File, language: LanguageCode = 'en') => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }

    try {
      setDownloadUrl(null);
      recordedChunksRef.current = [];
      setTranscripts([]);
      transcriptsRef.current = [];
      currentInputTextRef.current = '';
      currentOutputTextRef.current = '';
      currentInputIdRef.current = '';
      currentOutputIdRef.current = '';

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

      const dest = outputCtx.createMediaStreamDestination();
      recordingDestRef.current = dest;

      try {
        const recorder = new MediaRecorder(dest.stream);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          if (recordedChunksRef.current.length > 0) {
            const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            setDownloadUrl(url);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch (e) {
        console.warn("Recorder failed to start:", e);
      }

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

      const updateTranscriptState = (id: string, text: string, sender: 'user' | 'model', isFinal: boolean) => {
        const now = new Date();
        const existingIndex = transcriptsRef.current.findIndex(t => t.id === id);
        if (existingIndex >= 0) {
          transcriptsRef.current[existingIndex] = { ...transcriptsRef.current[existingIndex], text, isFinal };
        } else {
          transcriptsRef.current.push({ id, sender, text, timestamp: now, isFinal });
        }
        setTranscripts([...transcriptsRef.current]);
      };

      const ai = new GoogleGenAI({ apiKey });
      const systemInst = `${persona.systemInstruction} 
      Shadow the user's voice in ${language.toUpperCase()}.`;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.voiceName } } },
          systemInstruction: systemInst,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            setStatus('connected');
            if (fileSourceRef.current) fileSourceRef.current.start(0);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              try {
                const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                const sourceNode = ctx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(ctx.destination);
                if (recordingDestRef.current) sourceNode.connect(recordingDestRef.current);
                sourceNode.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
              } catch (e) {
                console.error("Audio decoding error:", e);
              }
            }

            const outputText = message.serverContent?.outputTranscription?.text;
            if (outputText) {
              if (!currentOutputIdRef.current) currentOutputIdRef.current = `model-${Date.now()}`;
              currentOutputTextRef.current += outputText;
              updateTranscriptState(currentOutputIdRef.current, currentOutputTextRef.current, 'model', false);
            }

            const inputText = message.serverContent?.inputTranscription?.text;
            if (inputText) {
              if (!currentInputIdRef.current) currentInputIdRef.current = `user-${Date.now()}`;
              currentInputTextRef.current += inputText;
              updateTranscriptState(currentInputIdRef.current, currentInputTextRef.current, 'user', false);
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputIdRef.current) updateTranscriptState(currentInputIdRef.current, currentInputTextRef.current, 'user', true);
              if (currentOutputIdRef.current) updateTranscriptState(currentOutputIdRef.current, currentOutputTextRef.current, 'model', true);
              currentInputIdRef.current = '';
              currentInputTextRef.current = '';
              currentOutputIdRef.current = '';
              currentOutputTextRef.current = '';
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

      // REDUCED BUFFER SIZE FOR LOWER LATENCY (512 or 1024)
      const processor = inputCtx.createScriptProcessor(1024, 1, 1);
      processorRef.current = processor;

      const vadState = { hangover: 0, isActive: false };
      // OPTIMIZED HANGOVER: 8 frames (~500ms) for snappy voice changing
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
    downloadUrl,
    transcripts
  };
};
