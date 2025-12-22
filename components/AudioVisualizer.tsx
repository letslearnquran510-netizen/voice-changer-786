import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream?: MediaStream;
  isListening: boolean;
  accentColor?: string;
  sampleRate?: number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  stream,
  isListening,
  accentColor = '#3b82f6',
  sampleRate = 16000 // Default to 16kHz to match the app's processing engine
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode>();
  const audioContextRef = useRef<AudioContext>();
  const sourceRef = useRef<MediaStreamAudioSourceNode>();

  useEffect(() => {
    if (!stream || !isListening) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    if (!audioContextRef.current) {
      // CRITICAL: We must match the sample rate of the input stream (especially from MediaStreamDestination)
      // or the browser will throw "Connecting AudioNodes from AudioContexts with different sample-rate is currently not supported"
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: sampleRate
        });
      } catch (e) {
        console.warn("Could not set sample rate for visualizer context, falling back to default", e);
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Reuse analyser if exists, otherwise create
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256;
    }

    // Connect stream
    try {
      // Disconnect old source if exists
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      sourceRef.current = ctx.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
    } catch (e) {
      console.error("Error connecting visualizer stream", e);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!isListening) return;
      animationRef.current = requestAnimationFrame(draw);

      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 2;

        // Gradient
        const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, accentColor);
        gradient.addColorStop(1, '#ffffff');

        canvasCtx.fillStyle = gradient;

        // Rounded bars
        canvasCtx.beginPath();
        canvasCtx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, 5);
        canvasCtx.fill();

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
    };
  }, [stream, isListening, accentColor, sampleRate]);

  // Clean up context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = undefined;
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={150}
      className="w-full h-32 rounded-lg bg-zinc-900/50 backdrop-blur-sm border border-zinc-800"
    />
  );
};

export default AudioVisualizer;
