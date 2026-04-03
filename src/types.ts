export type Mode = 'Creator' | 'Fast' | 'Voice';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type: 'text' | 'image' | 'script';
  imageUrl?: string;
  timestamp: number;
}

export interface JarvisState {
  messages: Message[];
  memory: string[];
  currentMode: Mode;
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
}
