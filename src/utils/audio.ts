import { Blob as GeminiBlob } from '@google/genai';

/**
 * Convert base64 string to raw bytes
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
 * Encode raw bytes to base64
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decode raw PCM data into an AudioBuffer
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
 * Convert Float32Array from AudioContext to PCM Int16 Blob for API
 */
export function createPcmBlob(data: Float32Array, sampleRate: number): GeminiBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: `audio/pcm;rate=${Math.floor(sampleRate)}`,
  };
}

/**
 * Audio Recorder class for capturing and exporting WAV audio
 * WAV format works universally on all devices, mobile, and WhatsApp
 */
export class AudioRecorder {
  private audioChunks: Float32Array[] = [];
  private sampleRate: number;
  private isRecording: boolean = false;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  start() {
    this.audioChunks = [];
    this.isRecording = true;
  }

  addChunk(audioData: Float32Array) {
    if (this.isRecording) {
      // Clone the data to avoid reference issues
      this.audioChunks.push(new Float32Array(audioData));
    }
  }

  stop(): Blob | null {
    this.isRecording = false;
    
    if (this.audioChunks.length === 0) {
      return null;
    }

    // Merge all chunks into one array
    const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const mergedAudio = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of this.audioChunks) {
      mergedAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to WAV
    const wavBlob = this.createWavBlob(mergedAudio);
    this.audioChunks = [];
    
    return wavBlob;
  }

  private createWavBlob(audioData: Float32Array): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = this.sampleRate * blockAlign;
    const dataSize = audioData.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // WAV Header
    // "RIFF" chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, totalSize - 8, true); // File size - 8
    this.writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, this.sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitsPerSample, true); // BitsPerSample

    // "data" sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true); // Subchunk2Size

    // Write audio data as 16-bit PCM
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }

  clear() {
    this.audioChunks = [];
    this.isRecording = false;
  }
}

/**
 * Convert AudioBuffer to Float32Array
 */
export function audioBufferToFloat32(buffer: AudioBuffer): Float32Array {
  const channelData = buffer.getChannelData(0);
  return new Float32Array(channelData);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Format duration in MM:SS
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
