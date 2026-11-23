import { AudioAssetCache } from './audioAssetCache';
import { BrowserTTSFallback } from './browserTtsFallback';
import type {
  NarrationCompletionReason,
  NarrationCompletionResult,
  NarrationDiagnosticsEntry,
  NarrationPlaybackStatus,
  NarrationRate,
  NeuralTTSStatusResponse,
  TTSProviderKind,
  VoiceOption,
} from './narrationTypes';
import { NeuralTTSProvider } from './neuralTtsProvider';
import { extractFinalWord, prepareSpokenText } from './pronunciationGlossary';

const POST_AUDIO_BREATH_PAUSE_MS = 420;
const MAX_DIAGNOSTICS_LOG = 40;

export type PlaybackStatusListener = (status: NarrationPlaybackStatus) => void;

/**
 * Coordinates monotonic session generation tokens so stale async callbacks,
 * effect cleanups, or previous-scene completions can NEVER interrupt or cancel
 * a newly started narration segment.
 */
export class PlaybackCancellationManager {
  private currentGeneration = 0;

  nextGeneration(): number {
    this.currentGeneration += 1;
    return this.currentGeneration;
  }

  getCurrentGeneration(): number {
    return this.currentGeneration;
  }

  isCurrent(generationId: number): boolean {
    return generationId === this.currentGeneration;
  }

  invalidate(): number {
    this.currentGeneration += 1;
    return this.currentGeneration;
  }
}

/**
 * Records playback completion diagnostics so both tests and presenters can inspect
 * whether every spoken sentence completed naturally with its final word intact.
 */
export class NarrationQualityDiagnostics {
  private entries: NarrationDiagnosticsEntry[] = [];

  record(result: NarrationCompletionResult): NarrationDiagnosticsEntry {
    const words = result.spokenText.trim().split(/\s+/).filter(Boolean);
    const truncatedSuspected =
      result.completedNaturally &&
      result.expectedDurationSec !== null &&
      result.expectedDurationSec > 1.0 &&
      result.actualElapsedMs < result.expectedDurationSec * 650;

    const entry: NarrationDiagnosticsEntry = {
      timestamp: new Date().toISOString(),
      generationId: result.generationId,
      sceneId: result.sceneId,
      providerUsed: result.providerUsed,
      voiceId: result.voiceId,
      reason: result.reason,
      completedNaturally: result.completedNaturally,
      expectedDurationSec: result.expectedDurationSec,
      actualElapsedMs: result.actualElapsedMs,
      truncatedSuspected,
      wordCount: words.length,
      finalWord: extractFinalWord(result.spokenText),
      errorMessage: result.errorMessage,
    };

    this.entries = [...this.entries.slice(-(MAX_DIAGNOSTICS_LOG - 1)), entry];
    return entry;
  }

  getEntries(): NarrationDiagnosticsEntry[] {
    return this.entries;
  }

  getLatest(): NarrationDiagnosticsEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * Maps tutorial playback speed (0.5x–2x) to natural human speech playback rate
 * so faster walkthrough pacing never makes the narrator sound artificial or chipmunked.
 */
export function mapDemoSpeedToNaturalSpeechRate(demoSpeed: number, baseRate: NarrationRate): number {
  let factor = 1.0;
  if (demoSpeed <= 0.5) factor = 0.9;
  else if (demoSpeed >= 2) factor = 1.18;
  else if (demoSpeed >= 1.5) factor = 1.1;
  return Number(Math.min(1.28, Math.max(0.82, baseRate * factor)).toFixed(2));
}

/**
 * Authoritative Narration Playback Controller.
 *
 * Guarantees:
 * - Prefers server-side Gemini Neural TTS (cached WAV clips) when configured.
 * - Transparently falls back to synchronized BrowserTTSFallback when neural TTS is not configured.
 * - NEVER truncates active speech with an arbitrary short timer.
 * - Waits strictly for real audio `ended` / utterance `onend` + a 420ms natural trailing breath pause.
 * - Preserves exact playback position on pause() and resumes cleanly on resume().
 * - Cancels audio ONLY on explicit user skip, exit, restart, or jump.
 */
export class NarrationPlaybackController {
  readonly cache = new AudioAssetCache();
  readonly neuralProvider = new NeuralTTSProvider(this.cache);
  readonly browserFallback = new BrowserTTSFallback();
  readonly cancellation = new PlaybackCancellationManager();
  readonly diagnostics = new NarrationQualityDiagnostics();

  private status: NarrationPlaybackStatus = 'idle';
  private activeProvider: TTSProviderKind = 'captions-only';
  private activeAudio: HTMLAudioElement | null = null;
  private activeAudioCancel: ((reason: NarrationCompletionReason) => void) | null = null;
  private statusListeners = new Set<PlaybackStatusListener>();

  getStatus(): NarrationPlaybackStatus {
    return this.status;
  }

  getActiveProvider(): TTSProviderKind {
    if (this.neuralProvider.isAvailable()) return 'gemini-neural';
    if (this.browserFallback.isSupported()) return 'browser-fallback';
    return 'captions-only';
  }

  getLastUsedProvider(): TTSProviderKind {
    return this.activeProvider;
  }

  onStatusChange(listener: PlaybackStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setStatus(next: NarrationPlaybackStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.statusListeners) {
      listener(next);
    }
  }

  async initialize(): Promise<NeuralTTSStatusResponse> {
    const status = await this.neuralProvider.refreshStatus();
    this.activeProvider = this.getActiveProvider();
    return status;
  }

  /**
   * Lists ONLY genuinely available voices (Gemini Neural voices if configured, plus genuine browser voices).
   */
  getAvailableVoices(): VoiceOption[] {
    const neuralVoices = this.neuralProvider.getVoices();
    const browserVoices = this.browserFallback.getAvailableVoices();
    return [...neuralVoices, ...browserVoices];
  }

  getDefaultVoiceId(): string {
    const neural = this.neuralProvider.getVoices();
    if (neural.length > 0) return neural[0].id;
    const browser = this.browserFallback.getAvailableVoices();
    if (browser.length > 0) return browser[0].id;
    return 'browser:default';
  }

  prefetchSceneText(authoritativeCaption: string, voiceId: string): void {
    if (!this.neuralProvider.isAvailable()) return;
    if (voiceId.startsWith('browser:')) return;
    const spoken = prepareSpokenText(authoritativeCaption);
    this.neuralProvider.prefetch(spoken, voiceId);
  }

  pause(): void {
    if (this.status !== 'playing' && this.status !== 'loading') return;
    if (this.activeAudio && !this.activeAudio.paused) {
      try {
        this.activeAudio.pause();
      } catch {
        // ignore
      }
    }
    this.browserFallback.pause();
    this.setStatus('paused');
  }

  resume(): void {
    if (this.status !== 'paused') return;
    if (this.activeAudio && this.activeAudio.paused && !this.activeAudio.ended) {
      this.setStatus('playing');
      void this.activeAudio.play().catch(() => {
        // ignore autoplay rejection
      });
      return;
    }
    this.setStatus('playing');
    this.browserFallback.resume();
  }

  /**
   * Explicitly cancels any active narration. Call ONLY on user skip, jump, restart, exit, mute, or preview switch.
   * NEVER call this when a sentence completes normally.
   */
  cancel(reason: NarrationCompletionReason = 'cancelled'): void {
    this.cancellation.invalidate();
    this.teardownActiveAudio(reason);
    this.browserFallback.cancel(reason);
    this.setStatus(reason === 'interrupted' ? 'interrupted' : 'idle');
  }

  private teardownActiveAudio(reason: NarrationCompletionReason): void {
    const cancelFn = this.activeAudioCancel;
    this.activeAudioCancel = null;
    if (cancelFn) cancelFn(reason);

    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.onended = null;
        this.activeAudio.onerror = null;
        this.activeAudio.onplaying = null;
        this.activeAudio.src = '';
      } catch {
        // ignore
      }
      this.activeAudio = null;
    }
  }

  /**
   * Speaks one complete authoritative scene transcript and resolves ONLY when:
   * - Real audio / utterance playback finishes completely (plus natural trailing breath pause), OR
   * - Explicitly cancelled via cancel(), OR
   * - Voice narration is muted.
   */
  async speakScene(params: {
    sceneId: string;
    authoritativeCaption: string;
    voiceId: string;
    rate: number;
    enabled: boolean;
  }): Promise<NarrationCompletionResult> {
    const spokenText = prepareSpokenText(params.authoritativeCaption);
    const generationId = this.cancellation.nextGeneration();
    const isStillCurrent = () => this.cancellation.isCurrent(generationId);

    if (!params.enabled || !spokenText) {
      this.setStatus('idle');
      return {
        generationId,
        sceneId: params.sceneId,
        providerUsed: 'captions-only',
        voiceId: params.voiceId,
        reason: 'muted',
        completedNaturally: true,
        expectedDurationSec: null,
        actualElapsedMs: 0,
        spokenText,
      };
    }

    // Stop any lingering prior playback only if a previous audio handle was somehow still open
    this.teardownActiveAudio('interrupted');

    const preferBrowserExplicitly = params.voiceId.startsWith('browser:');
    const startMs = Date.now();

    // 1. Primary path: Gemini Neural TTS (server-synthesized cached WAV clip)
    if (!preferBrowserExplicitly && this.neuralProvider.isAvailable()) {
      this.setStatus('loading');
      const abortCtrl = new AbortController();
      const clip = await this.neuralProvider.synthesizeOrGetCached({
        text: spokenText,
        voiceId: params.voiceId,
        signal: abortCtrl.signal,
      });

      if (!isStillCurrent()) {
        return {
          generationId,
          sceneId: params.sceneId,
          providerUsed: 'gemini-neural',
          voiceId: params.voiceId,
          reason: 'cancelled',
          completedNaturally: false,
          expectedDurationSec: clip?.durationSec ?? null,
          actualElapsedMs: Date.now() - startMs,
          spokenText,
        };
      }

      if (clip) {
        this.activeProvider = 'gemini-neural';
        this.setStatus('ready');
        const audioOutcome = await this.playWavClipToCompletion({
          objectUrl: clip.objectUrl,
          rate: params.rate,
          expectedDurationSec: clip.durationSec,
          isStillCurrent,
        });

        const result: NarrationCompletionResult = {
          generationId,
          sceneId: params.sceneId,
          providerUsed: 'gemini-neural',
          voiceId: clip.voiceId,
          reason: audioOutcome.reason,
          completedNaturally: audioOutcome.reason === 'ended',
          expectedDurationSec: audioOutcome.durationSec || clip.durationSec || null,
          actualElapsedMs: audioOutcome.actualElapsedMs,
          spokenText,
          errorMessage: audioOutcome.errorMessage,
        };
        this.diagnostics.record(result);
        this.setStatus(
          result.completedNaturally
            ? 'completed'
            : result.reason === 'cancelled'
            ? 'idle'
            : result.reason === 'interrupted'
            ? 'interrupted'
            : 'failed'
        );
        return result;
      }
    }

    // 2. Fallback path: Synchronized non-truncating Browser Web Speech API
    if (this.browserFallback.isSupported()) {
      this.activeProvider = 'browser-fallback';
      this.setStatus('ready');
      const fbOutcome = await this.browserFallback.speak({
        text: spokenText,
        preferredVoiceId: params.voiceId,
        rate: params.rate,
        generationId,
        isStillCurrent,
        onPlaying: () => {
          if (isStillCurrent()) this.setStatus('playing');
        },
      });

      const result: NarrationCompletionResult = {
        generationId,
        sceneId: params.sceneId,
        providerUsed: 'browser-fallback',
        voiceId: fbOutcome.voiceId,
        reason: fbOutcome.reason,
        completedNaturally: fbOutcome.reason === 'ended' || fbOutcome.reason === 'stalled',
        expectedDurationSec: null,
        actualElapsedMs: fbOutcome.actualElapsedMs,
        spokenText,
        errorMessage: fbOutcome.errorMessage,
      };
      this.diagnostics.record(result);
      this.setStatus(
        result.completedNaturally
          ? 'completed'
          : result.reason === 'cancelled'
          ? 'idle'
          : result.reason === 'interrupted'
          ? 'interrupted'
          : 'failed'
      );
      return result;
    }

    // 3. Captions-only fallback when neither neural nor browser speech is available
    this.activeProvider = 'captions-only';
    this.setStatus('failed');
    const result: NarrationCompletionResult = {
      generationId,
      sceneId: params.sceneId,
      providerUsed: 'captions-only',
      voiceId: 'none',
      reason: 'error',
      completedNaturally: false,
      expectedDurationSec: null,
      actualElapsedMs: 0,
      spokenText,
      errorMessage: 'No neural or browser speech engine is available; captions remain active.',
    };
    this.diagnostics.record(result);
    return result;
  }

  private playWavClipToCompletion(params: {
    objectUrl: string;
    rate: number;
    expectedDurationSec: number;
    isStillCurrent: () => boolean;
  }): Promise<{
    reason: NarrationCompletionReason;
    durationSec: number;
    actualElapsedMs: number;
    errorMessage?: string;
  }> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let settled = false;
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = params.objectUrl;
      const safeRate = Math.min(1.28, Math.max(0.82, params.rate));
      audio.playbackRate = safeRate;

      // Preserve natural voice pitch when adjusting playback rate
      const pitchAudio = audio as HTMLAudioElement & {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ('preservesPitch' in pitchAudio) pitchAudio.preservesPitch = true;
      if ('mozPreservesPitch' in pitchAudio) pitchAudio.mozPreservesPitch = true;
      if ('webkitPreservesPitch' in pitchAudio) pitchAudio.webkitPreservesPitch = true;

      this.activeAudio = audio;

      const finish = (reason: NarrationCompletionReason, errorMessage?: string) => {
        if (settled) return;
        settled = true;
        if (this.activeAudioCancel === abortFn) {
          this.activeAudioCancel = null;
        }
        if (this.activeAudio === audio) {
          this.activeAudio = null;
        }
        const resolvedDuration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Number(audio.duration.toFixed(3))
            : params.expectedDurationSec;
        resolve({
          reason,
          durationSec: resolvedDuration,
          actualElapsedMs: Date.now() - startedAt,
          errorMessage,
        });
      };

      const abortFn = (reason: NarrationCompletionReason) => {
        try {
          audio.pause();
        } catch {
          // ignore
        }
        finish(reason);
      };
      this.activeAudioCancel = abortFn;

      audio.onplaying = () => {
        if (params.isStillCurrent()) {
          this.setStatus('playing');
        }
      };

      audio.onended = () => {
        if (!params.isStillCurrent()) {
          finish('cancelled');
          return;
        }
        // Preserve a calm natural pause after the final spoken syllable clears
        window.setTimeout(() => {
          finish(params.isStillCurrent() ? 'ended' : 'cancelled');
        }, POST_AUDIO_BREATH_PAUSE_MS);
      };

      audio.onerror = () => {
        finish('error', 'Audio playback element failed to play synthesized WAV clip.');
      };

      void audio.play().catch((err) => {
        const msg = err instanceof Error ? err.message : 'Browser blocked audio autoplay.';
        finish('error', msg);
      });
    });
  }
}
