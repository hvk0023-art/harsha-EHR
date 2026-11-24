import type { DemoSpeed } from './demoTypes';

export interface CancellationToken {
  cancelled: boolean;
}

/**
 * Pure helper to build progressive visible typing frames for manual vs AI-prepared autofill.
 * Keeps typing clearly visible and authentic without dragging on long paragraphs.
 */
export function buildTypingFrames(
  targetValue: string,
  options?: { mode?: 'manual' | 'ai-autofill'; existingValue?: string; append?: boolean }
): string[] {
  const mode = options?.mode ?? 'manual';
  const prefix = options?.append && options.existingValue ? `${options.existingValue}` : '';
  const text = targetValue;
  if (!text) return [prefix];

  const frames: string[] = [];
  if (mode === 'ai-autofill') {
    // AI-prepared autofill streams in smooth word/phrase chunks so it looks distinctly different from human typing
    const words = text.split(' ');
    let acc = prefix;
    const stride = Math.max(1, Math.ceil(words.length / 8));
    for (let i = 0; i < words.length; i += stride) {
      const chunk = words.slice(i, i + stride).join(' ');
      acc = acc ? `${acc}${acc.endsWith(' ') || acc.endsWith('\n') ? '' : ' '}${chunk}` : chunk;
      frames.push(acc);
    }
    const finalVal = prefix ? `${prefix}${text}` : text;
    if (frames[frames.length - 1] !== finalVal) {
      frames.push(finalVal);
    }
    return frames;
  }

  // Manual entry: character-by-character for short values (vitals, numbers, lab values),
  // 2-3 char cadence for medium sentences so every keystroke feels natural and readable
  const stepSize = text.length <= 16 ? 1 : text.length <= 45 ? 2 : 4;
  for (let i = stepSize; i < text.length; i += stepSize) {
    frames.push(`${prefix}${text.slice(0, i)}`);
  }
  frames.push(`${prefix}${text}`);
  return frames;
}

/**
 * Computes per-frame delay in ms scaled by playback speed.
 */
export function computeTypingFrameDelayMs(
  mode: 'manual' | 'ai-autofill',
  textLength: number,
  speed: DemoSpeed
): number {
  const safeSpeed = speed > 0 ? speed : 1;
  const base = mode === 'ai-autofill' ? 95 : textLength <= 10 ? 115 : 42;
  return Math.max(16, Math.round(base / safeSpeed));
}

export function resolveDemoSelector(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith('#') || trimmed.startsWith('.') || trimmed.startsWith('[')) {
    return trimmed;
  }
  return `[data-demo-target="${trimmed}"]`;
}

export function findDemoTargetElement(target: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const selector = resolveDemoSelector(target);
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return el;
}

export function waitMs(ms: number, token?: CancellationToken): Promise<boolean> {
  return new Promise((resolve) => {
    if (token?.cancelled) {
      resolve(false);
      return;
    }
    const timer = window.setTimeout(() => {
      resolve(!token?.cancelled);
    }, Math.max(10, ms));
    if (token) {
      const poll = window.setInterval(() => {
        if (token.cancelled) {
          window.clearTimeout(timer);
          window.clearInterval(poll);
          resolve(false);
        }
      }, 40);
      window.setTimeout(() => window.clearInterval(poll), Math.max(10, ms) + 60);
    }
  });
}

export async function waitForDemoTargetElement(
  target: string,
  timeoutMs = 1800,
  token?: CancellationToken
): Promise<HTMLElement | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (token?.cancelled) return null;
    const found = findDemoTargetElement(target);
    if (found) return found;
    await waitMs(70, token);
  }
  return findDemoTargetElement(target);
}

/**
 * Computes an unobstructed point on the target element for the SVG tutorial cursor.
 * Positions the cursor tip on the right-center / lower-center of interactive controls
 * so button text and field values remain completely legible.
 */
export function computeCursorAnchor(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const isCompactControl = rect.width <= 260 && rect.height <= 60;
  const x = isCompactControl
    ? rect.left + Math.min(rect.width * 0.72, rect.width - 12)
    : rect.left + Math.min(rect.width - 36, Math.max(24, rect.width * 0.85));
  const y = isCompactControl
    ? rect.top + rect.height * 0.62
    : rect.top + Math.min(rect.height - 16, Math.max(18, Math.min(34, rect.height * 0.3)));

  return {
    x: Math.max(12, Math.min(window.innerWidth - 28, Math.round(x))),
    y: Math.max(12, Math.min(window.innerHeight - 28, Math.round(y))),
  };
}

/**
 * Scrolls the target element into the comfortable middle viewing area above the floating trainer bar.
 */
export function scrollDemoTargetIntoView(el: HTMLElement, targetName: string): void {
  if (targetName === 'role-preview-switcher' || targetName === 'facility-switcher') return;
  const rect = el.getBoundingClientRect();
  const barEl = document.querySelector('[data-demo-director-bar="true"]') as HTMLElement | null;
  const barHeight = barEl ? Math.ceil(barEl.getBoundingClientRect().height) + 20 : 180;
  const modalBody = el.closest('[data-modal-body="true"]') as HTMLElement | null;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (modalBody) {
    const bodyRect = modalBody.getBoundingClientRect();
    if (rect.top < bodyRect.top + 12 || rect.bottom > bodyRect.bottom - 12) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    }
    return;
  }

  const safeTop = 120;
  const safeBottom = window.innerHeight - barHeight;
  if (rect.top < safeTop || rect.bottom > safeBottom) {
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
  }
}

/**
 * Sets value on a React controlled <input>, <textarea>, or <select> using the native
 * prototype setter so React's synthetic onChange fires genuinely and runs real validation.
 */
export function setReactControlledValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Progressively types into a real <input> or <textarea> element so viewers watch
 * each keystroke or AI-prepared fill happen live inside the authentic React form.
 */
export async function performVisibleTyping(
  el: HTMLElement,
  value: string,
  options: {
    mode: 'manual' | 'ai-autofill';
    speed: DemoSpeed;
    append?: boolean;
    token: CancellationToken;
    waitWhilePaused?: () => Promise<boolean>;
    onFrame?: (currentValue: string) => void;
  }
): Promise<boolean> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false;
  }

  el.focus();
  const existing = el.value || '';
  const frames = buildTypingFrames(value, {
    mode: options.mode,
    existingValue: existing,
    append: options.append,
  });

  if (options.mode === 'ai-autofill') {
    el.classList.add('demo-ai-autofill-flash');
  }

  const delayMs = computeTypingFrameDelayMs(options.mode, value.length, options.speed);

  if (!options.append && existing && options.mode === 'manual') {
    if (options.waitWhilePaused && !(await options.waitWhilePaused())) {
      el.classList.remove('demo-ai-autofill-flash');
      return false;
    }
    setReactControlledValue(el, '');
    const ok = await waitMs(Math.max(40, Math.round(90 / options.speed)), options.token);
    if (!ok) {
      el.classList.remove('demo-ai-autofill-flash');
      return false;
    }
  }

  for (const frame of frames) {
    if (options.token.cancelled) {
      el.classList.remove('demo-ai-autofill-flash');
      return false;
    }
    if (options.waitWhilePaused && !(await options.waitWhilePaused())) {
      el.classList.remove('demo-ai-autofill-flash');
      return false;
    }
    if (document.activeElement !== el) {
      el.focus();
    }
    setReactControlledValue(el, frame);
    options.onFrame?.(frame);
    const ok = await waitMs(delayMs, options.token);
    if (!ok) {
      el.classList.remove('demo-ai-autofill-flash');
      return false;
    }
  }

  if (options.mode === 'ai-autofill') {
    await waitMs(Math.max(120, Math.round(350 / options.speed)), options.token);
    el.classList.remove('demo-ai-autofill-flash');
  }

  return !options.token.cancelled;
}
