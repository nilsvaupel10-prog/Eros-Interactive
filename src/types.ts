export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isInitial?: boolean;
  rating?: -1 | 0 | 1; // -1: bad, 1: good
}

export interface CharacterState {
  name: string;
  arousal: number; // 0 to 100
  trust?: number;
  affinity?: number;
  tags: string[];
  memories?: string[]; // Persistent character-specific memories
}

export interface PornstarStats {
  subscribers: number;
  tips: number;
  socialMood: string;
}

export interface StoryState {
  paragraphs: string[];
  options: { id: string, num: string, text: string }[];
  characterStates?: CharacterState[];
  pornstarStats?: PornstarStats;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  shortDescription: string;
  definition: string;
  avatarUrl?: string;
  startingArousal?: number;
  tags?: string[];
  personality?: {
    assertiveness: number; // Submissive (0) to Dominant (100)
    sociability: number;   // Introvert (0) to Extravert (100)
    temperament: number;   // Sweet/Passive (0) to Aggressive (100)
    willpower?: number;    // Easily broken (0) to Unbreakable (100)
    sensuality?: number;
    compliance?: number;
    flirtatiousness?: number;
    kinkiness?: number;
    jealousy?: number;
    exhibitionism?: number;
    eloquence?: number;
    playfulness?: number;
    curiosity?: number;
  };
  body?: {
    height: number;       // Short (0) to Tall (100) -> 140cm to 210cm
    athleticism: number;  // Soft (0) to Muscular (100)
    curviness: number;    // Petite/Lean (0) to Voluptuous/Thick (100)
    clothing?: string;
  };
  dickSize?: number;      // None (0) to Massive (100)
}

export type GameMode = 'standard' | 'free_will' | 'pornstar' | 'sexting' | 'hookup';

export interface GameOptions {
  consequences: boolean;
  arousalSpeed: 'slow' | 'normal' | 'fast';
  narrativeTone: 'romantic' | 'smutty' | 'kinky' | 'story-driven';
  complianceLevel?: 'compliant' | 'normal' | 'resistant' | 'defiant';
  arousalDecay?: boolean;
  autoSaveFrequency?: 'off' | 'every-turn' | 'every-5-mins';
  proseLength?: number; // 0 to 100
  dialogueAmount?: number; // 0 to 100
}

export interface ModelSettings {
  temperature: number;
  topP: number;
}

export interface ScenarioContext {
  characters: CharacterDefinition[];
  playerCharacterId: string; // The ID of the character the user is playing, or '3rd_person'
  gameMode: GameMode;
  scenarioDescription: string;
  options?: GameOptions;
  charMemories?: Record<string, string[]>;
}

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: string;
  messages: ChatMessage[];
  scenarioInput: string;
  playerCharacterId: string;
  gameMode: GameMode;
  activeCharacterIds: string[];
  provider: 'gemini' | 'openrouter' | 'mock';
  openRouterModel: string;
  customApiKey?: string;
  options?: GameOptions;
  modelSettings?: ModelSettings;
}

