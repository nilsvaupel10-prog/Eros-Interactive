export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  isInitial?: boolean;
}

export interface CharacterState {
  name: string;
  arousal: number; // 0 to 100
  tags: string[];
}

export interface StoryState {
  paragraphs: string[];
  options: { id: string, num: string, text: string }[];
  characterStates?: CharacterState[];
}

export interface CharacterDefinition {
  id: string;
  name: string;
  shortDescription: string;
  definition: string;
  personality?: {
    assertiveness: number; // Submissive (0) to Dominant (100)
    sociability: number;   // Introvert (0) to Extravert (100)
    temperament: number;   // Sweet/Passive (0) to Aggressive (100)
  };
  body?: {
    height: number;       // Short (0) to Tall (100) -> 140cm to 210cm
    athleticism: number;  // Soft (0) to Muscular (100)
    curviness: number;    // Petite/Lean (0) to Voluptuous/Thick (100)
  };
  dickSize?: number;      // None (0) to Massive (100)
}

export type GameMode = 'standard' | 'free_will';

export interface ScenarioContext {
  characters: CharacterDefinition[];
  playerCharacterId: string; // The ID of the character the user is playing, or '3rd_person'
  gameMode: GameMode;
  scenarioDescription: string;
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
  provider: 'gemini' | 'openrouter';
  openRouterModel: string;
  customApiKey?: string;
}

