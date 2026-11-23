import type { NarrationCompletionReason, VoiceOption } from './narrationTypes';
import { splitIntoCompleteSentences } from './pronunciationGlossary';

const PREFERRED_BROWSER_VOICE_PATTERNS: readonly RegExp[] = [
  /microsoft aria.*natural/i,
  /microsoft jenny.*natural/i,
  /microsoft guy.*natural/i,
  /microsoft ana.*natural/i,
  /google us english/i,
  /^samantha$/i,
  /^ava(\s|\(|$)/i,
  /^allison(\s|\(|$)/i,
  /^alex$/i,
  /natural.*english/i,
  /enhanced.*english/i,
  /^daniel$/i,
];

const INTER_SENTENCE_PAUSE_MS = 180;
const POST_UTTERANCE_SETTLE_MS = 380;

export interface BrowserSpeakOutcome {
  reason: NarrationCompletionReason;
  voiceId: string;
  actualElapsedMs: number;
  errorMessage?: string;
}

/**
 * Synchronized, non-truncating browser Web Speech API fallback.
 *
 * Fixes every classic Web Speech API cut-off defect:
 * 1. Retains a strong reference to active SpeechSynthesisUtterance instances so Chrome never GC-kills them mid-sentence.
 * 2. Splits paragraphs strictly on complete sentence boundaries (avoiding Chrome's ~15s single-utterance stall bug).
 * 3. NEVER uses a fixed short timeout to cut off active speech — watchdog ONLY triggers when the engine fails to start
 *    (e.g. headless browser with no audio output) or stops speaking without firing onend.
 * 4. NEVER calls speechSynthesis.cancel() during normal scene completion; only on explicit user cancellation.
 * 5. Supports true pause() and resume() without discarding the spoken sentence.
 */
export class BrowserTTSFallback {
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private activeGenerationId = 0;
  private isPaused = false;
  private cancelCurrentRun: ((reason: NarrationCompletionReason) => void) | null = null;
  private pauseResumeWaiter: (() => void) | null = null;

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance !== 'undefined'
    );
  }

  /**
   * Lists ONLY genuinely available English browser voices, ranked by naturalness.
   * Returns up to 2 curated top American English voices (Natural Voice 1 & 2) plus fallback.
   */
  getAvailableVoices(): VoiceOption[] {
    if (!this.isSupported()) return [];
    try {
      const all = window.speechSynthesis.getVoices() || [];
      const english = all.filter((v) => /^en(-|_|$)/i.test(v.lang));
      if (english.length === 0) return [];

      const ranked = [...english].sort((a, b) => {
        const score = (v: SpeechSynthesisVoice) => {
          for (let i = 0; i < PREFERRED_BROWSER_VOICE_PATTERNS.length; i += 1) {
            if (PREFERRED_BROWSER_VOICE_PATTERNS[i].test(v.name)) return 100 - i * 5;
          }
          if (/^en-US$/i.test(v.lang) && /online|natural|neural/i.test(v.name)) return 70;
          if (/^en-US$/i.test(v.lang) && v.localService) return 40;
          if (/^en-US$/i.test(v.lang)) return 30;
          return 10;
        };
        return score(b) - score(a);
      });

      // Deduplicate by voice name and expose top 2 distinct genuine browser voices
      const unique: SpeechSynthesisVoice[] = [];
      const seen = new Set<string>();
      for (const v of ranked) {
        if (!seen.has(v.name)) {
          seen.add(v.name);
          unique.push(v);
        }
        if (unique.length >= 2) break;
      }

      return unique.map((v, idx) => ({
        id: `browser:${v.name}`,
        label: `Browser Voice ${idx + 1} — ${v.name}`,
        description: `${v.lang}${v.localService ? ' · Local OS voice' : ' · Online browser voice'}`,
        locale: v.lang || 'en-US',
        provider: 'browser-fallback',
        browserVoiceName: v.name,
      }));
    } catch {
      return [];
    }
  }

  private resolveBrowserVoice(preferredVoiceId: string): SpeechSynthesisVoice | null {
    if (!this.isSupported()) return null;
    try {
      const all = window.speechSynthesis.getVoices() || [];
      if (all.length === 0) return null;

      if (preferredVoiceId.startsWith('browser:')) {
        const name = preferredVoiceId.slice('browser:'.length);
        const exact = all.find((v) => v.name === name);
        if (exact) return exact;
      }

      const curated = this.getAvailableVoices();
      if (curated.length > 0 && curated[0].browserVoiceName) {
        const best = all.find((v) => v.name === curated[0].browserVoiceName);
        if (best) return best;
      }

      return all.find((v) => /^en-US$/i.test(v.lang)) || all.find((v) => /^en/i.test(v.lang)) || null;
    } catch {
      return null;
    }
  }

  pause(): void {
    this.isPaused = true;
    if (!this.isSupported()) return;
    try {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
      }
    } catch {
      // ignore
    }
  }

  resume(): void {
    this.isPaused = false;
    const waiter = this.pauseResumeWaiter;
    this.pauseResumeWaiter = null;
    if (waiter) waiter();

    if (!this.isSupported()) return;
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch {
      // ignore
    }
  }

  /**
   * Explicitly cancels active browser speech (called ONLY on user skip, exit, restart, or jump —
   * NEVER during ordinary sentence completion).
   */
  cancel(reason: NarrationCompletionReason = 'cancelled'): void {
    this.activeGenerationId += 1;
    this.isPaused = false;
    const waiter = this.pauseResumeWaiter;
    this.pauseResumeWaiter = null;
    if (waiter) waiter();

    const abortFn = this.cancelCurrentRun;
    this.cancelCurrentRun = null;
    if (abortFn) abortFn(reason);

    this.activeUtterance = null;
    if (this.isSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  async speak(params: {
    text: string;
    preferredVoiceId: string;
    rate: number;
    generationId: number;
    isStillCurrent: () => boolean;
    onPlaying?: () => void;
  }): Promise<BrowserSpeakOutcome> {
    const startMs = Date.now();
    if (!this.isSupported() || !params.text.trim()) {
      return {
        reason: 'error',
        voiceId: 'browser:unavailable',
        actualElapsedMs: 0,
        errorMessage: 'Web Speech API is unavailable in this browser.',
      };
    }

    const sentences = splitIntoCompleteSentences(params.text);
    const voice = this.resolveBrowserVoice(params.preferredVoiceId);
    const voiceId = voice ? `browser:${voice.name}` : 'browser:default';
    // Keep rate strictly natural so browser voices never distort or clip endings
    const safeRate = Math.min(1.25, Math.max(0.82, params.rate));

    this.activeGenerationId = params.generationId;
    this.isPaused = false;

    for (let i = 0; i < sentences.length; i += 1) {
      if (!params.isStillCurrent()) {
        return { reason: 'cancelled', voiceId, actualElapsedMs: Date.now() - startMs };
      }

      // If user paused between sentences, wait cleanly until resumed or cancelled
      while (this.isPaused && params.isStillCurrent()) {
        await new Promise<void>((resolve) => {
          this.pauseResumeWaiter = resolve;
        });
      }
      if (!params.isStillCurrent()) {
        return { reason: 'cancelled', voiceId, actualElapsedMs: Date.now() - startMs };
      }

      const sentenceOutcome = await this.speakSingleSentence({
        sentence: sentences[i],
        voice,
        rate: safeRate,
        isFirst: i === 0,
        isStillCurrent: params.isStillCurrent,
        onPlaying: params.onPlaying,
      });

      if (sentenceOutcome !== 'ended') {
        return {
          reason: sentenceOutcome,
          voiceId,
          actualElapsedMs: Date.now() - startMs,
        };
      }

      // Brief natural breathing pause between sentences (never cancels synthesis)
      if (i < sentences.length - 1 && params.isStillCurrent()) {
        await this.waitNaturalPause(INTER_SENTENCE_PAUSE_MS, params.isStillCurrent);
      }
    }

    // Preserve a calm natural trailing pause after the final sentence so the final syllable
    // fully clears the audio output buffer before any UI transition begins.
    if (params.isStillCurrent()) {
      await this.waitNaturalPause(POST_UTTERANCE_SETTLE_MS, params.isStillCurrent);
    }

    return {
      reason: params.isStillCurrent() ? 'ended' : 'cancelled',
      voiceId,
      actualElapsedMs: Date.now() - startMs,
    };
  }

  private waitNaturalPause(ms: number, isStillCurrent: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (!isStillCurrent() || Date.now() - started >= ms) {
          window.clearInterval(timer);
          resolve();
        }
      }, 40);
    });
  }

  private speakSingleSentence(params: {
    sentence: string;
    voice: SpeechSynthesisVoice | null;
    rate: number;
    isFirst: boolean;
    isStillCurrent: () => boolean;
    onPlaying?: () => void;
  }): Promise<NarrationCompletionReason> {
    return new Promise((resolve) => {
      let settled = false;
      let startedSpeaking = false;
      let silentCheckSinceMs: number | null = null;
      const queuedAtMs = Date.now();

      const cleanup = () => {
        window.clearInterval(watchdog);
        if (this.cancelCurrentRun === abortHandler) {
          this.cancelCurrentRun = null;
        }
        if (this.activeUtterance === utter) {
          this.activeUtterance = null;
        }
      };

      const finish = (reason: NarrationCompletionReason) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(reason);
      };

      const abortHandler = (reason: NarrationCompletionReason) => {
        finish(reason);
      };

      const utter = new window.SpeechSynthesisUtterance(params.sentence);
      if (params.voice) {
        utter.voice = params.voice;
        utter.lang = params.voice.lang || 'en-US';
      } else {
        utter.lang = 'en-US';
      }
      utter.rate = params.rate;
      utter.pitch = 1.0;
      utter.volume = 1.0;

      // Strong reference prevents Chrome GC from silently terminating utterance mid-sentence
      this.activeUtterance = utter;
      this.cancelCurrentRun = abortHandler;

      utter.onstart = () => {
        startedSpeaking = true;
        silentCheckSinceMs = null;
        if (params.isFirst) params.onPlaying?.();
      };

      utter.onend = () => {
        finish(params.isStillCurrent() ? 'ended' : 'cancelled');
      };

      utter.onerror = (event) => {
        const errCode = (event as SpeechSynthesisErrorEvent | undefined)?.error;
        if (errCode === 'canceled' || errCode === 'interrupted') {
          finish(params.isStillCurrent() ? 'interrupted' : 'cancelled');
        } else {
          finish('error');
        }
      };

      // Stall-ONLY watchdog:
      // NEVER cuts off speech while window.speechSynthesis.speaking === true or paused === true!
      // Only resolves if the speech engine never starts (e.g. headless browser with no audio voices)
      // or becomes completely silent (speaking=false, pending=false) without firing onend.
      const watchdog = window.setInterval(() => {
        if (!params.isStillCurrent()) {
          finish('cancelled');
          return;
        }
        if (this.isPaused || window.speechSynthesis.paused) {
          silentCheckSinceMs = null;
          return;
        }

        const isSpeaking = window.speechSynthesis.speaking;
        const isPending = window.speechSynthesis.pending;

        if (isSpeaking) {
          startedSpeaking = true;
          silentCheckSinceMs = null;
          return;
        }

        if (!startedSpeaking && !isPending && Date.now() - queuedAtMs > 2600) {
          // Headless / silent browser where speechSynthesis never emits onstart or onend
          finish('stalled');
          return;
        }

        if (startedSpeaking && !isSpeaking && !isPending) {
          if (silentCheckSinceMs === null) {
            silentCheckSinceMs = Date.now();
          } else if (Date.now() - silentCheckSinceMs > 1800) {
            // Engine finished speaking silently without dispatching onend
            finish('ended');
          }
        }
      }, 150);

      try {
        window.speechSynthesis.speak(utter);
      } catch {
        finish('error');
      }
    });
  }
}
