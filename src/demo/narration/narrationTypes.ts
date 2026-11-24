export type NarrationPlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'interrupted'
  | 'failed';

export type NarrationCompletionReason =
  | 'ended'
  | 'cancelled'
  | 'interrupted'
  | 'error'
  | 'muted'
  | 'stalled';

export type TTSProviderKind = 'gemini-neural' | 'browser-fallback' | 'captions-only';

export type NarrationRate = 0.85 | 1 | 1.15 | 1.25;

export interface VoiceOption {
  id: string;
  label: string;
  description: string;
  locale: string;
  provider: TTSProviderKind;
  /** Underlying browser voice name when provider === 'browser-fallback' */
  browserVoiceName?: string;
}

export interface NeuralTTSModelOption {
  id: string;
  label: string;
  description: string;
  tier: 'default' | 'comparison';
}

export interface NeuralTTSStatusResponse {
  neuralConfigured: boolean;
  provider: 'gemini-neural' | 'none';
  model: string;
  availableModels?: NeuralTTSModelOption[];
  locale: string;
  voices: VoiceOption[];
  cacheEntries?: number;
  missingReason?: string;
}

export interface NarrationSettings {
  enabled: boolean;
  preferredVoiceId: string;
  narrationRate: NarrationRate;
}

export interface NarrationCompletionResult {
  generationId: number;
  sceneId: string;
  providerUsed: TTSProviderKind;
  voiceId: string;
  model?: string;
  reason: NarrationCompletionReason;
  completedNaturally: boolean;
  expectedDurationSec: number | null;
  actualElapsedMs: number;
  spokenText: string;
  errorMessage?: string;
}

export interface NarrationDiagnosticsEntry {
  timestamp: string;
  generationId: number;
  sceneId: string;
  providerUsed: TTSProviderKind;
  voiceId: string;
  model?: string;
  reason: NarrationCompletionReason;
  completedNaturally: boolean;
  expectedDurationSec: number | null;
  actualElapsedMs: number;
  truncatedSuspected: boolean;
  wordCount: number;
  finalWord: string;
  errorMessage?: string;
}

export interface CachedAudioClip {
  key: string;
  objectUrl: string;
  durationSec: number;
  byteLength: number;
  voiceId: string;
  model?: string;
  provider: TTSProviderKind;
  createdAt: number;
}
