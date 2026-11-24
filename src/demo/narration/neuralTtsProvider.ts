import { AudioAssetCache, buildAudioCacheKey } from './audioAssetCache';
import type { CachedAudioClip, NeuralTTSStatusResponse, VoiceOption } from './narrationTypes';
import { NARRATION_SCRIPT_VERSION } from './pronunciationGlossary';

const DEFAULT_STATUS: NeuralTTSStatusResponse = {
  neuralConfigured: false,
  provider: 'none',
  model: 'gemini-3.8-flash-lite-tts',
  locale: 'en-US',
  voices: [],
  missingReason: 'Checking server neural TTS availability…',
};

/**
 * Client-side adapter for the server-side Gemini Neural TTS API (/api/tts/*).
 * Never touches API keys on the client; caches verified WAV clips by text/voice/locale/version.
 */
export class NeuralTTSProvider {
  private readonly cache: AudioAssetCache;
  private status: NeuralTTSStatusResponse = DEFAULT_STATUS;
  private statusLoaded = false;
  private inFlightRequests = new Map<string, Promise<CachedAudioClip | null>>();

  constructor(cache: AudioAssetCache) {
    this.cache = cache;
  }

  getStatus(): NeuralTTSStatusResponse {
    return this.status;
  }

  isAvailable(): boolean {
    return this.status.neuralConfigured && this.status.voices.length > 0;
  }

  getVoices(): VoiceOption[] {
    return this.status.voices;
  }

  async refreshStatus(force = false): Promise<NeuralTTSStatusResponse> {
    if (this.statusLoaded && !force) return this.status;
    if (typeof fetch === 'undefined') {
      this.status = {
        ...DEFAULT_STATUS,
        missingReason: 'Fetch API unavailable in current environment.',
      };
      this.statusLoaded = true;
      return this.status;
    }

    try {
      const resp = await fetch('/api/tts/status', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        this.status = {
          ...DEFAULT_STATUS,
          missingReason: `Server TTS status endpoint returned HTTP ${resp.status}.`,
        };
      } else {
        const data = (await resp.json()) as NeuralTTSStatusResponse;
        this.status = {
          neuralConfigured: Boolean(data.neuralConfigured),
          provider: data.neuralConfigured ? 'gemini-neural' : 'none',
          model: data.model || 'gemini-3.8-flash-lite-tts',
          availableModels: Array.isArray(data.availableModels) ? data.availableModels : [],
          locale: data.locale || 'en-US',
          voices: Array.isArray(data.voices) ? data.voices : [],
          cacheEntries: data.cacheEntries,
          missingReason: data.missingReason,
        };
      }
    } catch {
      this.status = {
        ...DEFAULT_STATUS,
        missingReason: 'Could not reach /api/tts/status on the server; using browser voice fallback.',
      };
    }

    this.statusLoaded = true;
    return this.status;
  }

  /**
   * Resolves a verified, playable WAV clip for complete sentences/paragraphs.
   * Deduplicates concurrent requests and caches clips by scriptVersion + model + voice + locale + text.
   */
  async synthesizeOrGetCached(params: {
    text: string;
    voiceId: string;
    model?: string;
    locale?: string;
    signal?: AbortSignal;
  }): Promise<CachedAudioClip | null> {
    if (!this.statusLoaded) {
      await this.refreshStatus();
    }
    if (!this.isAvailable()) return null;

    const locale = params.locale || 'en-US';
    const validVoice = this.status.voices.some((v) => v.id === params.voiceId)
      ? params.voiceId
      : this.status.voices[0]?.id || 'Kore';
    const validModel =
      params.model &&
      this.status.availableModels?.some((m) => m.id === params.model)
        ? params.model
        : this.status.model || 'gemini-3.8-flash-lite-tts';

    const key = buildAudioCacheKey({
      scriptVersion: NARRATION_SCRIPT_VERSION,
      provider: 'gemini-neural',
      model: validModel,
      voiceId: validVoice,
      locale,
      text: params.text,
    });

    const cached = this.cache.get(key);
    if (cached) return cached;

    const existingPromise = this.inFlightRequests.get(key);
    if (existingPromise) return existingPromise;

    const fetchPromise = (async (): Promise<CachedAudioClip | null> => {
      try {
        const resp = await fetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: params.signal,
          body: JSON.stringify({
            text: params.text,
            voiceId: validVoice,
            model: validModel,
            locale,
            scriptVersion: NARRATION_SCRIPT_VERSION,
          }),
        });

        if (resp.status === 503) {
          // Server reports GEMINI_API_KEY not configured — mark unavailable cleanly
          this.status = {
            ...this.status,
            neuralConfigured: false,
            provider: 'none',
            voices: [],
            missingReason:
              'GEMINI_API_KEY is not configured on the server (add it in Settings > Secrets to enable Gemini Neural TTS).',
          };
          return null;
        }

        if (!resp.ok) {
          return null;
        }

        const blob = await resp.blob();
        if (!blob || blob.size < 44) {
          return null;
        }

        const headerDuration = Number(resp.headers.get('X-Audio-Duration-Sec') || '0');
        const resolvedModel = resp.headers.get('X-TTS-Model') || validModel;
        const wavBlob = blob.type.includes('wav') ? blob : new Blob([blob], { type: 'audio/wav' });
        const objectUrl = URL.createObjectURL(wavBlob);

        const clip: CachedAudioClip = {
          key,
          objectUrl,
          durationSec: Number.isFinite(headerDuration) && headerDuration > 0 ? headerDuration : 0,
          byteLength: wavBlob.size,
          voiceId: validVoice,
          model: resolvedModel,
          provider: 'gemini-neural',
          createdAt: Date.now(),
        };

        this.cache.set(clip);
        return clip;
      } catch {
        return null;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Silently pre-generates & caches the upcoming scene's clip in the background
   * so step transitions begin speaking immediately with zero lag.
   */
  prefetch(text: string, voiceId: string, model?: string): void {
    if (!this.isAvailable() || !text.trim()) return;
    void this.synthesizeOrGetCached({ text, voiceId, model });
  }
}
