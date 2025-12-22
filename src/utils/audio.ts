import { Blob as GeminiBlob } from '@google/genai';

/**
 * Convert base64 string to raw bytes - OPTIMIZED
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode raw bytes to base64 - OPTIMIZED with chunking
 */
export function encode(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB chunks for better performance
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}

/**
 * Decode raw PCM data into an AudioBuffer - OPTIMIZED
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Convert Float32Array to PCM Int16 Blob for API - OPTIMIZED
 */
export function createPcmBlob(data: Float32Array, sampleRate: number): GeminiBlob {
  const len = data.length;
  const int16 = new Int16Array(len);
  
  // Optimized loop
  for (let i = 0; i < len; i++) {
    const s = data[i];
    // Faster clamping
    const clamped = s > 1 ? 1 : (s < -1 ? -1 : s);
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
  }
  
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${sampleRate | 0}`,
  };
}

/**
 * Fast Audio Recorder - Creates WAV files compatible with all devices
 */
export class AudioRecorder {
  private chunks: Float32Array[] = [];
  private sampleRate: number;
  private recording: boolean = false;
  private totalSamples: number = 0;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  start(): void {
    this.chunks = [];
    this.totalSamples = 0;
    this.recording = true;
  }

  addChunk(data: Float32Array): void {
    if (!this.recording) return;
    // Store copy of data
    const copy = new Float32Array(data.length);
    copy.set(data);
    this.chunks.push(copy);
    this.totalSamples += data.length;
  }

  stop(): Blob | null {
    this.recording = false;
    
    if (this.totalSamples === 0) return null;

    // Merge all chunks efficiently
    const merged = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Create WAV
    const wav = this.createWav(merged);
    
    // Clear memory
    this.chunks = [];
    this.totalSamples = 0;
    
    return wav;
  }

  private createWav(audio: Float32Array): Blob {
    const sampleRate = this.sampleRate;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = audio.length * (bitsPerSample / 8);
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeStr(view, 0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    this.writeStr(view, 8, 'WAVE');

    // fmt chunk
    this.writeStr(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeStr(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Audio samples - optimized conversion
    let pos = 44;
    for (let i = 0; i < audio.length; i++) {
      const s = audio[i];
      const clamped = s > 1 ? 1 : (s < -1 ? -1 : s);
      view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true);
      pos += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeStr(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  isRecording(): boolean {
    return this.recording;
  }

  getDuration(): number {
    return this.totalSamples / this.sampleRate;
  }

  clear(): void {
    this.chunks = [];
    this.totalSamples = 0;
    this.recording = false;
  }
}

/**
 * Get Float32 data from AudioBuffer
 */
export function audioBufferToFloat32(buffer: AudioBuffer): Float32Array {
  return new Float32Array(buffer.getChannelData(0));
}

/**
 * Format seconds as MM:SS
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format bytes as human readable
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}
