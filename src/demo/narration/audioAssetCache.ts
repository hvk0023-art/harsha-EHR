import type { CachedAudioClip, TTSProviderKind } from './narrationTypes';

const DEFAULT_MAX_CLIPS = 120;

export function buildAudioCacheKey(params: {
  scriptVersion: string;
  provider: TTSProviderKind;
  model?: string;
  voiceId: string;
  locale: string;
  text: string;
}): string {
  return [
    params.scriptVersion,
    params.provider,
    params.model || 'default',
    params.voiceId,
    params.locale,
    params.text.trim(),
  ].join('::');
}

/**
 * Client-side LRU cache for synthesized narration audio clips.
 * Reuses verified Blob ObjectURLs across replays and prefetched steps,
 * revoking evicted URLs cleanly to prevent memory leaks.
 */
export class AudioAssetCache {
  private readonly store = new Map<string, CachedAudioClip>();
  private readonly maxClips: number;

  constructor(maxClips = DEFAULT_MAX_CLIPS) {
    this.maxClips = maxClips;
  }

  get(key: string): CachedAudioClip | null {
    const existing = this.store.get(key);
    if (!existing) return null;
    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, existing);
    return existing;
  }

  set(clip: CachedAudioClip): CachedAudioClip {
    const prev = this.store.get(clip.key);
    if (prev && prev.objectUrl !== clip.objectUrl) {
      this.revokeSafely(prev.objectUrl);
    }
    this.store.delete(clip.key);
    this.store.set(clip.key, clip);

    while (this.store.size > this.maxClips) {
      const oldestKey = this.store.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.store.get(oldestKey);
      this.store.delete(oldestKey);
      if (oldest) this.revokeSafely(oldest.objectUrl);
    }

    return clip;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    for (const clip of this.store.values()) {
      this.revokeSafely(clip.objectUrl);
    }
    this.store.clear();
  }

  private revokeSafely(url: string): void {
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function' && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    } catch {
      // ignore in non-DOM test runtimes
    }
  }
}
