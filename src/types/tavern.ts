export type ChatProvider = 'gemini' | 'custom';

export type TtsPayloadMode = 'auto' | 'openai' | 'elevenlabs';

export type TtsTextFilter = 'all' | 'dialogue_only' | 'strip_asterisks';

export interface CharacterCard {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  exampleDialogue: string;
  systemPrompt: string;
  voiceId: string;
  voiceModel: string;
  voiceSpeed: number;
  voiceStability: number;
  voiceSimilarity: number;
}

export interface LorebookEntry {
  id: string;
  name: string;
  keys: string[];
  content: string;
  enabled: boolean;
}

export interface UserPersona {
  name: string;
  avatar: string;
  description: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  swipes: string[];
  swipeIndex: number;
  timestamp: number;
  modelUsed?: string;
}

export interface ChatSession {
  characterId: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export interface TtsConfig {
  endpointUrl: string;
  requestMode: 'proxy' | 'direct';
  payloadMode: TtsPayloadMode;
  autoPlay: boolean;
  textFilter: TtsTextFilter;
  defaultVoiceId: string;
  defaultModelId: string;
  responseFormat: 'mp3' | 'wav' | 'opus';
}

export interface ChatModelConfig {
  provider: ChatProvider;
  geminiModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
  customBaseUrl: string;
  customModel: string;
  contextDepth: number;
  temperature: number;
  maxTokens: number;
  globalSystemPrompt: string;
}

export interface ServerConfigInfo {
  hasGeminiKey: boolean;
  hasCustomChatKey: boolean;
  hasTtsApiKey: boolean;
  defaultTtsEndpoint: string;
  defaultCustomBaseUrl: string;
  defaultCustomModel: string;
}
