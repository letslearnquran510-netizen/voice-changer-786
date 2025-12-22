export interface Persona {
  id: string;
  name: string;
  description: string;
  icon: string;
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  systemInstruction: string;
}

export interface AudioState {
  isPlaying: boolean;
  isListening: boolean;
  volume: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type LanguageCode = 'en' | 'hi' | 'ur' | 'ar' | 'es' | 'fr' | 'de' | 'zh' | 'ja' | 'ko' | 'pt' | 'ru';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  flag: string;
}
