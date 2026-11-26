import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Calendar,
  Captions,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  FileText,
  Hand,
  ListOrdered,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Square,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useDemoDirector } from '../../demo/DemoDirectorContext';
import { ROLE_TUTORIAL_CARDS } from '../../demo/roleWorkflowRegistry';
import type { DemoLearningMode, DemoSpeed, WorkClassification } from '../../demo/demoTypes';
import type { NarrationRate } from '../../demo/narration/narrationTypes';
import { resolveDemoSelector } from '../../demo/visibleTypingController';
import { useAppState } from '../../state/AppStateContext';
import { findRegisteredAarav } from '../../demo/registrationConsolidationScenario';
import { buildRegistrationDemoCompletionSummary } from '../../state/registrationIntelligence';
import { Modal, StatusBadge } from '../ui/Primitives';

const SPEEDS: DemoSpeed[] = [0.5, 1, 1.5, 2];
const NARRATION_RATES: NarrationRate[] = [0.85, 1.0, 1.15, 1.25];

const LEARNING_MODES: { id: DemoLearningMode; label: string }[] = [
  { id: 'watch', label: 'Watch Demo' },
  { id: 'practice', label: 'Guided Practice' },
  { id: 'executive', label: 'Executive Demo' },
];

function classificationDisplay(c: WorkClassification | null | undefined): {
  label: string;
  classes: string;
} {
  switch (c) {
    case 'AI-prepared':
      return {
        label: 'AI-prepared — review required',
        classes: 'bg-teal-50 text-[#0F6E50] border-teal-200',
      };
    case 'Human verification required':
      return {
        label: 'Human verification required',
        classes: 'bg-amber-50 text-[#9A5B10] border-amber-200',
      };
    case 'Human approved':
      return {
        label: 'Human approved',
        classes: 'bg-emerald-50 text-[#0F6E50] border-emerald-200',
      };
    case 'Simulated action':
      return {
        label: 'Simulated action',
        classes: 'bg-slate-100 text-[#444441] border-slate-300',
      };
    case 'Completed action':
      return {
        label: 'Completed action',
        classes: 'bg-[#E6F1FB] text-[#042C53] border-[#85B7EB]',
      };
    default:
      return {
        label: 'Manual entry',
        classes: 'bg-[#E6F1FB] text-[#185FA5] border-[#85B7EB]/80',
      };
  }
}

export const DemoDirectorOverlay: React.FC = () => {
  const {
    playback,
    cursor,
    isDemoMode,
    activeScenario,
    activeScene,
    activeCaptionText,
    efficiencySummary,
    exitConfirmOpen,
    summaryOpen,
    speechAvailable,
    narrationStatus,
    activeProvider,
    ttsStatus,
    availableVoices,
    selectedVoiceId,
    selectedTtsModel,
    narrationRate,
    isPreviewingVoice,
    setSelectedVoiceId,
    setSelectedTtsModel,
    setNarrationRate,
    previewVoice,
    stopPreview,
    setSummaryOpen,
    openExitConfirm,
    cancelExitConfirm,
    startScenario,
    playOrResume,
    pause,
    restart,
    replayCurrentStep,
    showMeCurrentStep,
    nextScene,
    previousScene,
    jumpToScene,
    setSpeed,
    setLearningMode,
    toggleCaptions,
    toggleNarration,
    exitDemo,
  } = useDemoDirector();

  const { state, openPatient } = useAppState();
  const barRef = useRef<HTMLElement | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [highlightRect, setHighlightRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const showFloatingBar = Boolean(isDemoMode && activeScenario && activeScene && !summaryOpen && !exitConfirmOpen);

  // Dynamically measure floating Demo Director bar height and publish --demo-bar-clearance
  // so open modals (e.g. Intelligent Scheduled Registration) always stay completely above it.
  useEffect(() => {
    const root = document.documentElement;
    if (!showFloatingBar) {
      root.style.setProperty('--demo-bar-clearance', '0px');
      return;
    }

    const updateClearance = () => {
      const el = barRef.current;
      if (!el) {
        root.style.setProperty('--demo-bar-clearance', '0px');
        return;
      }
      const rect = el.getBoundingClientRect();
      const clearance = Math.ceil(rect.height) + 16;
      root.style.setProperty('--demo-bar-clearance', `${clearance}px`);
    };

    updateClearance();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateClearance) : null;
    if (ro && barRef.current) ro.observe(barRef.current);
    window.addEventListener('resize', updateClearance);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateClearance);
      root.style.setProperty('--demo-bar-clearance', '0px');
    };
  }, [showFloatingBar, minimized, playback.captionsEnabled, playback.errorMessage, playback.activeSceneIndex]);

  // Determine exact DOM target to highlight right now
  const activeTargetToken =
    cursor.activeTargetSelector ||
    (activeScene?.uiActions && activeScene.uiActions.length > 0
      ? activeScene.uiActions[0].target
      : activeScene?.visualTarget || null);

  // Track and measure highlighted real DOM control (including inside open modals)
  useEffect(() => {
    if (!isDemoMode || !activeTargetToken || summaryOpen || exitConfirmOpen) {
      setHighlightRect(null);
      return;
    }

    const measure = () => {
      const selector = resolveDemoSelector(activeTargetToken);
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setHighlightRect(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        setHighlightRect(null);
        return;
      }
      const modalBody = el.closest('[data-modal-body="true"]') as HTMLElement | null;
      const isModalChild = Boolean(modalBody || el.closest('[role="dialog"]'));
      const isTopbarTarget =
        activeTargetToken === 'role-preview-switcher' || activeTargetToken === 'facility-switcher';
      const barTop = barRef.current
        ? Math.floor(barRef.current.getBoundingClientRect().top) - 6
        : window.innerHeight - (minimized ? 68 : 156);
      const minTop = modalBody
        ? Math.max(4, modalBody.getBoundingClientRect().top)
        : isModalChild || isTopbarTarget
        ? 4
        : activeScene?.patientId
        ? 60
        : 56;
      const maxBottom = modalBody
        ? Math.min(barTop, modalBody.getBoundingClientRect().bottom)
        : isTopbarTarget
        ? window.innerHeight - 8
        : barTop;
      const clampedTop = Math.max(minTop, rect.top - 4);
      const clampedBottom = Math.min(maxBottom, rect.bottom + 4);
      const clampedHeight = clampedBottom - clampedTop;
      if (clampedHeight < 18) {
        setHighlightRect(null);
        return;
      }
      setHighlightRect({
        left: Math.max(4, rect.left - 4),
        top: clampedTop,
        width: Math.min(window.innerWidth - 8, rect.width + 8),
        height: clampedHeight,
      });
    };

    const t1 = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 360);
    const interval = window.setInterval(measure, 450);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [
    activeScene?.patientId,
    activeTargetToken,
    exitConfirmOpen,
    isDemoMode,
    minimized,
    playback.activeSceneIndex,
    summaryOpen,
  ]);

  // Presenter keyboard shortcuts: Space = Play/Pause (outside inputs), Escape = Close chapters / Exit confirm
  useEffect(() => {
    if (!isDemoMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape') {
        if (voiceSettingsOpen) {
          setVoiceSettingsOpen(false);
        } else if (chaptersOpen) {
          setChaptersOpen(false);
        } else if (!exitConfirmOpen && !summaryOpen) {
          openExitConfirm();
        }
        return;
      }
      if (e.code === 'Space' && !isEditing && !summaryOpen && !exitConfirmOpen && playback.learningMode !== 'practice') {
        e.preventDefault();
        if (playback.status === 'PLAYING') pause();
        else playOrResume();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chaptersOpen, exitConfirmOpen, isDemoMode, openExitConfirm, pause, playOrResume, playback.learningMode, playback.status, summaryOpen, voiceSettingsOpen]);

  const isRegistrationDemo = activeScenario?.id === 'demo-00-registration-consolidation';
  const registrationSummary = useMemo(() => {
    if (!isDemoMode || !isRegistrationDemo) return null;
    const livePatientId =
      findRegisteredAarav(state)?.id || activeScenario?.patientId || 'pat-demo-aarav';
    return buildRegistrationDemoCompletionSummary(state, livePatientId);
  }, [activeScenario?.patientId, isDemoMode, isRegistrationDemo, state]);

  if (!isDemoMode || !activeScenario || !activeScene) return null;

  const totalScenes = activeScenario.scenes.length;
  const currentAssertion = playback.assertionLogs.find((a) => a.sceneId === activeScene.sceneId);
  const progressPct = Math.round(((playback.activeSceneIndex + 1) / totalScenes) * 100);
  const isPracticeWaiting = playback.status === 'WAITING_FOR_USER';
  const workBadge = classificationDisplay(cursor.classification || activeScene.classification);
  const ringClass = isPracticeWaiting
    ? 'demo-focus-ring-practice border-amber-500'
    : cursor.isAiAutofill || activeScene.classification === 'AI-prepared'
    ? 'demo-focus-ring-ai border-[#1D9E75]'
    : 'demo-focus-ring border-[#185FA5]';

  const modeBadgeText =
    playback.learningMode === 'practice'
      ? 'GUIDED PRACTICE'
      : playback.learningMode === 'executive'
      ? 'EXECUTIVE DEMO'
      : 'WATCH DEMO';

  // Authoritative caption synchronization: during Watch / Executive mode, captions ALWAYS mirror
  // the exact spoken narration transcript (`activeCaptionText`) and never switch early to `explanationAfter`.
  const explanationText = playback.errorMessage
    ? playback.errorMessage
    : isPracticeWaiting
    ? playback.practiceFeedback || activeScene.practiceHint || activeCaptionText
    : activeCaptionText || activeScene.caption;

  const selectedVoiceObj = availableVoices.find((v) => v.id === selectedVoiceId) || availableVoices[0];
  const effectiveModelId = selectedTtsModel || ttsStatus.model || 'gemini-3.8-flash-lite-tts';
  const providerSummaryLabel =
    activeProvider === 'gemini-neural'
      ? `Gemini Neural TTS (${effectiveModelId})`
      : activeProvider === 'browser-fallback'
      ? 'Browser Voice Fallback'
      : 'Captions Only (Voice Unavailable)';


  const narrationStatusLabel =
    narrationStatus === 'loading'
      ? 'Loading audio…'
      : narrationStatus === 'playing'
      ? 'Speaking'
      : narrationStatus === 'paused'
      ? 'Voice Paused'
      : null;

  return (
    <>
      {/* Real-DOM Visual Focus Ring & Realistic SVG Tutorial Cursor (renders above modals) */}
      {!summaryOpen && !exitConfirmOpen && (
        <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-[62]">
          {highlightRect && (
            <div
              data-demo-highlight-ring="true"
              className={`fixed rounded-lg border-2 ${ringClass}`}
              style={{
                left: highlightRect.left,
                top: highlightRect.top,
                width: highlightRect.width,
                height: highlightRect.height,
              }}
            >
              {isPracticeWaiting && (
                <span className="absolute -top-6 left-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-semibold shadow-sm whitespace-nowrap">
                  <Hand className="w-3 h-3" />
                  Your turn — click or complete here
                </span>
              )}
            </div>
          )}

          {/* Realistic SVG Tutorial Mouse Pointer + Click Ripple + Role/Action Pill */}
          {cursor.visible && (
            <div
              data-demo-cursor="true"
              className="demo-cursor-glide fixed top-0 left-0 z-[65]"
              style={{
                transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              }}
            >
              {/* Subtle Click Ripple Ring anchored at cursor tip */}
              {cursor.clickSeq > 0 && cursor.clicking && (
                <span
                  key={cursor.clickSeq}
                  className="demo-click-ripple absolute -left-3 -top-3 w-6 h-6 rounded-full border-2 border-[#185FA5] bg-[#185FA5]/20"
                />
              )}

              {/* Crisp SVG Mouse Pointer Arrow */}
              <svg
                width="24"
                height="28"
                viewBox="0 0 24 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={`drop-shadow-md transition-transform duration-150 ${
                  cursor.clicking ? 'scale-90' : 'scale-100'
                }`}
                style={{ marginLeft: -2, marginTop: -2 }}
              >
                <path
                  d="M2.5 2L20.5 14.2L12.6 15.6L16.2 23.6L13.1 25L9.5 17L4.2 21.8L2.5 2Z"
                  fill={cursor.isAiAutofill ? '#1D9E75' : '#042C53'}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Compact Trainer Role & Action Pill — auto-flips left near right viewport edge */}
              <div
                className={`-mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#042C53] text-white text-[10px] font-medium shadow-md whitespace-nowrap border border-white/20 ${
                  typeof window !== 'undefined' && cursor.x > window.innerWidth - 280
                    ? '-translate-x-full -ml-2'
                    : 'ml-5'
                }`}
              >
                {cursor.isAiAutofill && <Sparkles className="w-3 h-3 text-teal-300 shrink-0" />}
                <span>{cursor.label || activeScene.role}</span>
                {cursor.typingPreview ? (
                  <span className="font-mono text-[9px] text-[#85B7EB] border-l border-white/25 pl-1.5 max-w-[140px] truncate">
                    {cursor.isAiAutofill ? 'AI fill: ' : 'Typing: '}
                    {cursor.typingPreview}
                  </span>
                ) : (
                  <span className="text-[9px] text-[#85B7EB] border-l border-white/25 pl-1.5">
                    {cursor.isAiAutofill ? 'AI-prepared' : workBadge.label}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Compact Voice Settings Popover */}
      {voiceSettingsOpen && !summaryOpen && !exitConfirmOpen && (
        <div
          data-demo-voice-panel="true"
          role="dialog"
          aria-label="Trainer Voice Settings"
          className="fixed bottom-32 right-4 z-[69] w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#042C53]/12 rounded-2xl shadow-2xl overflow-hidden text-xs"
        >
          <div className="px-3.5 py-2.5 bg-[#042C53] text-white flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-[#85B7EB]" />
              Trainer Voice Settings
            </span>
            <button
              type="button"
              onClick={() => setVoiceSettingsOpen(false)}
              aria-label="Close voice settings"
              className="text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 space-y-3">
            {/* Active Speech Provider Status */}
            <div className="rounded-md border border-slate-200 bg-[#F7F7F5] px-2.5 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                  Speech Engine
                </span>
                <span
                  data-demo-voice-provider={activeProvider}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    activeProvider === 'gemini-neural'
                      ? 'bg-emerald-50 text-[#0F6E50] border border-emerald-200'
                      : 'bg-amber-50 text-[#9A5B10] border border-amber-200'
                  }`}
                >
                  {activeProvider === 'gemini-neural'
                    ? 'Model-Generated Audio'
                    : 'Browser Fallback'}
                </span>
              </div>
              <div className="text-[11px] font-medium text-[#042C53]">{providerSummaryLabel}</div>
              {activeProvider === 'gemini-neural' && (
                <p className="text-[10px] text-[#5F5D56] leading-snug">
                  Live server-side <code className="font-mono text-[#042C53]">@google/genai</code>{' '}
                  audio synthesis (cached per sentence; never truncates active speech).
                </p>
              )}
              {!ttsStatus.neuralConfigured && (
                <p className="text-[10px] text-[#5F5D56] leading-snug">
                  Gemini neural voice is ready on the server once{' '}
                  <code className="font-mono text-[#042C53]">GEMINI_API_KEY</code> is added in{' '}
                  <strong>Settings → Secrets</strong>. Synchronized browser voice fallback is active now.
                </p>
              )}
            </div>

            {/* Controlled Flash-Lite vs Flash TTS Model Comparison (Same API Key) */}
            {activeProvider === 'gemini-neural' &&
              ttsStatus.availableModels &&
              ttsStatus.availableModels.length > 1 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                      Gemini TTS Model (A/B Compare)
                    </span>
                    <span className="text-[10px] text-[#0F6E50] font-medium">Same API Key</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ttsStatus.availableModels.map((m) => {
                      const active = effectiveModelId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-demo-tts-model={m.id}
                          onClick={() => setSelectedTtsModel(m.id)}
                          className={`px-2 py-1.5 rounded border text-left transition-colors ${
                            active
                              ? 'bg-[#042C53] text-white border-[#042C53]'
                              : 'bg-white text-[#042C53] border-slate-200 hover:border-[#185FA5]'
                          }`}
                        >
                          <div className="text-[10px] font-semibold leading-tight">
                            {m.tier === 'default' ? 'Flash-Lite (Default)' : 'Flash TTS (Compare)'}
                          </div>
                          <div
                            className={`text-[9px] font-mono mt-0.5 truncate ${
                              active ? 'text-[#85B7EB]' : 'text-[#5F5D56]'
                            }`}
                          >
                            {m.id}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* Voice Selection (only genuinely available voices) */}
            <div className="space-y-1">
              <label htmlFor="demo-voice-select" className="block text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                Trainer Voice ({availableVoices.length} available)
              </label>
              {availableVoices.length > 0 ? (
                <select
                  id="demo-voice-select"
                  data-demo-voice-select="true"
                  value={selectedVoiceObj?.id || ''}
                  onChange={(e) => setSelectedVoiceId(e.target.value)}
                  className="w-full px-2 py-1.5 text-[11px] text-[#042C53] bg-white border border-slate-300 rounded focus:outline-none focus:border-[#185FA5]"
                >
                  {availableVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label} ({v.locale})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-2 py-1.5 text-[11px] text-[#5F5D56] bg-slate-50 border border-slate-200 rounded">
                  System default voice (no named voices reported by browser)
                </div>
              )}
              {selectedVoiceObj?.description && (
                <p className="text-[10px] text-[#5F5D56]">{selectedVoiceObj.description}</p>
              )}
            </div>

            {/* Narration Speed */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                  Narration Speed
                </span>
                <span className="font-mono text-[10px] text-[#185FA5] font-semibold">
                  {narrationRate.toFixed(2).replace(/\.00$/, '')}x
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {NARRATION_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    data-demo-narration-rate={String(rate)}
                    onClick={() => setNarrationRate(rate)}
                    className={`py-1 rounded border text-[11px] font-mono tabular-nums ${
                      narrationRate === rate
                        ? 'bg-[#185FA5] text-white border-[#185FA5] font-semibold'
                        : 'bg-white text-[#444441] border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>

            {/* Actions: Preview Voice & Voice On/Off */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
              <button
                type="button"
                data-demo-voice-preview-btn="true"
                disabled={!speechAvailable}
                onClick={() => {
                  if (isPreviewingVoice) {
                    stopPreview();
                  } else {
                    void previewVoice(selectedVoiceObj?.id, effectiveModelId);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#185FA5] text-[#185FA5] hover:bg-[#E6F1FB] font-medium text-[11px] disabled:opacity-40"
              >
                {isPreviewingVoice ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    Stop Preview
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    Preview Voice
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={toggleNarration}
                disabled={!speechAvailable}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-medium border disabled:opacity-40 ${
                  playback.narrationEnabled
                    ? 'bg-[#042C53] text-white border-[#042C53]'
                    : 'bg-white text-[#444441] border-slate-300 hover:bg-slate-50'
                }`}
              >
                {playback.narrationEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    Voice On
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    Voice Off
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chapters Quick Drawer */}
      {chaptersOpen && (
        <div
          data-demo-chapters="true"
          className="fixed bottom-32 right-4 z-[68] w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#042C53]/12 rounded-2xl shadow-2xl overflow-hidden text-xs"
        >
          <div className="px-3.5 py-2.5 bg-[#042C53] text-white flex items-center justify-between">
            <span className="font-semibold truncate">Steps · {activeScenario.title}</span>
            <button
              type="button"
              onClick={() => setChaptersOpen(false)}
              aria-label="Close chapters"
              className="text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto eigen-scroll divide-y divide-slate-100">
            {activeScenario.scenes.map((sc, idx) => {
              const isCurrent = idx === playback.activeSceneIndex;
              const log = playback.assertionLogs.find((a) => a.sceneId === sc.sceneId);
              return (
                <button
                  key={sc.sceneId}
                  type="button"
                  onClick={() => {
                    jumpToScene(idx);
                    setChaptersOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-[#E6F1FB]/50 ${
                    isCurrent ? 'bg-[#E6F1FB]/80' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#042C53] truncate">
                      {String(sc.sceneNumber).padStart(2, '0')}. {sc.title}
                    </div>
                    <div className="text-[10px] text-[#5F5D56] truncate">
                      {sc.role} · {sc.classification || sc.actorKind}
                    </div>
                  </div>
                  {log && (
                    <span
                      className={`text-[10px] font-mono shrink-0 ${
                        log.passed ? 'text-[#0F6E50]' : 'text-[#B4321F]'
                      }`}
                    >
                      {log.passed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Non-Obscuring Floating EHR Trainer Console (hidden cleanly while Summary/Exit modal is active) */}
      {!summaryOpen && !exitConfirmOpen && (
      <aside
        ref={barRef}
        aria-label="EigenH Guided Demo Academy Trainer Console"
        data-demo-director-bar="true"
        className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-[66] w-[calc(100%-1rem)] sm:w-[calc(100%-1.5rem)] max-w-5xl bg-white/95 backdrop-blur-md border border-[#042C53]/12 rounded-2xl shadow-[0_12px_32px_rgba(4,44,83,0.14)] px-3 sm:px-4 py-2 sm:py-2.5 text-xs space-y-1.5 max-h-[42dvh] overflow-y-auto"
      >
        {/* Row 1: Mode, Role/Screen, Step Counter, Work Classification, Status & Exit */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide rounded uppercase shrink-0 ${
                playback.learningMode === 'practice'
                  ? 'bg-amber-600 text-white'
                  : playback.learningMode === 'executive'
                  ? 'bg-[#1D9E75] text-white'
                  : 'bg-[#042C53] text-white'
              }`}
            >
              {modeBadgeText}
            </span>
            <span className="font-semibold text-[#042C53] truncate max-w-[230px] sm:max-w-[300px]">
              {activeScenario.title}
            </span>
            <span className="font-mono tabular-nums text-[11px] font-semibold text-[#185FA5] shrink-0">
              — Step {playback.activeSceneIndex + 1} of {totalScenes}
            </span>
            <span className="hidden md:inline text-[11px] text-[#444441] font-medium truncate max-w-[240px]">
              · {activeScene.title}
            </span>
            <span
              className={`hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${workBadge.classes}`}
            >
              {workBadge.label}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {currentAssertion && (
              <span
                title={currentAssertion.detail}
                className={`hidden md:inline-flex items-center gap-1 text-[11px] font-medium ${
                  currentAssertion.passed ? 'text-[#0F6E50]' : 'text-[#B4321F]'
                }`}
              >
                {currentAssertion.passed ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {currentAssertion.passed ? 'Verified' : 'Check Failed'}
              </span>
            )}
            {playback.status === 'COMPLETED' && (
              <button
                type="button"
                onClick={() => setSummaryOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#0F6E50] text-white text-[11px] font-medium rounded"
              >
                <Award className="w-3 h-3" />
                Summary & Timeline
              </button>
            )}
            <button
              type="button"
              onClick={() => setMinimized((v) => !v)}
              aria-label={minimized ? 'Expand trainer console' : 'Minimize trainer console'}
              title={minimized ? 'Expand trainer console' : 'Compact trainer console'}
              className="p-1 text-[#5F5D56] hover:text-[#042C53] border border-slate-200 rounded"
            >
              {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={openExitConfirm}
              className="px-2 py-0.5 text-[11px] font-medium text-[#B4321F] border border-red-200 rounded hover:bg-red-50"
            >
              Exit
            </button>
          </div>
        </div>

        {/* Row 2: Authoritative Synchronized Caption / Guided Practice Prompt + Next Step Preview */}
        {!minimized && playback.captionsEnabled && (
          <div
            data-demo-caption-bar="true"
            className={`rounded-xl px-3 py-2 border text-[11px] leading-snug ${
              playback.errorMessage
                ? 'bg-red-50 border-red-200 text-[#B4321F]'
                : isPracticeWaiting
                ? 'bg-amber-50/90 border-amber-200 text-[#042C53]'
                : 'bg-[#FAF9F6] border-[#042C53]/8 text-[#042C53]'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">
                {isPracticeWaiting && (
                  <strong className="text-[#9A5B10] mr-1.5">Your Turn:</strong>
                )}
                {!isPracticeWaiting && playback.narrationEnabled && narrationStatusLabel && (
                  <span
                    data-demo-narration-status={narrationStatus}
                    className="inline-flex items-center mr-1.5 px-1.5 py-0.25 rounded bg-[#E6F1FB] text-[#185FA5] text-[10px] font-semibold align-baseline"
                  >
                    {narrationStatusLabel}
                  </span>
                )}
                <span data-demo-caption-text="true">{explanationText}</span>
              </span>
              {activeScene.nextStepPreview && !playback.errorMessage && (
                <span className="text-[10px] text-[#5F5D56] shrink-0">
                  Next: <span className="font-medium text-[#185FA5]">{activeScene.nextStepPreview}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Row 3: Clickable Step Progress Bar */}
        <div className="flex items-center gap-1" role="group" aria-label="Tutorial progress track">
          {activeScenario.scenes.map((sc, idx) => {
            const done = idx < playback.activeSceneIndex || playback.status === 'COMPLETED';
            const current = idx === playback.activeSceneIndex;
            return (
              <button
                key={sc.sceneId}
                type="button"
                title={`Jump to Step ${sc.sceneNumber}: ${sc.title}`}
                onClick={() => jumpToScene(idx)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  current
                    ? playback.learningMode === 'practice'
                      ? 'bg-amber-500'
                      : 'bg-[#185FA5]'
                    : done
                    ? 'bg-[#1D9E75]'
                    : 'bg-slate-200 hover:bg-slate-300'
                }`}
              />
            );
          })}
          <span className="ml-1.5 font-mono tabular-nums text-[10px] text-[#5F5D56] shrink-0">
            {progressPct}%
          </span>
        </div>

        {/* Row 4: Transport, Show Me, Replay Step, Learning Mode, Speed & Audio */}
        {!minimized && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={previousScene}
                disabled={playback.activeSceneIndex === 0}
                aria-label="Previous step"
                className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 text-[#042C53]"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              {playback.status === 'FAILED' ? (
                <button
                  type="button"
                  onClick={replayCurrentStep}
                  data-demo-retry-step="true"
                  aria-label="Retry failed step"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#B4321F] hover:bg-[#8E2517] text-white font-semibold rounded"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Step
                </button>
              ) : isPracticeWaiting ? (
                <button
                  type="button"
                  onClick={showMeCurrentStep}
                  data-demo-show-me="true"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Show Me
                </button>
              ) : playback.status === 'PLAYING' ? (
                <button
                  type="button"
                  onClick={pause}
                  aria-label="Pause tutorial"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#042C53] text-white font-medium rounded"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={playOrResume}
                  aria-label="Play or resume tutorial"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {playback.status === 'COMPLETED' ? 'Replay' : 'Play'}
                </button>
              )}

              <button
                type="button"
                onClick={nextScene}
                disabled={playback.activeSceneIndex >= totalScenes - 1 && playback.status === 'COMPLETED'}
                aria-label="Next step"
                className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 text-[#042C53]"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={replayCurrentStep}
                aria-label="Replay current step"
                title="Replay this step"
                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 rounded hover:bg-slate-100 text-[11px] text-[#042C53]"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Replay Step</span>
              </button>

              <button
                type="button"
                onClick={restart}
                aria-label="Restart tutorial"
                title="Restart tutorial from clean state"
                className="p-1.5 border border-slate-200 rounded hover:bg-slate-100 text-[#042C53]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Learning Mode Switcher */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                {LEARNING_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLearningMode(m.id)}
                    className={`px-2 py-1 text-[10px] font-medium ${
                      playback.learningMode === m.id
                        ? 'bg-[#042C53] text-white'
                        : 'bg-white text-[#5F5D56] hover:bg-slate-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Speed Pacing */}
              <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpeed(sp)}
                    className={`px-1.5 py-1 text-[10px] font-mono tabular-nums ${
                      playback.speed === sp
                        ? 'bg-[#185FA5] text-white font-semibold'
                        : 'bg-white text-[#5F5D56] hover:bg-slate-50'
                    }`}
                  >
                    {sp}x
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleCaptions}
                aria-label="Toggle captions"
                title={playback.captionsEnabled ? 'Hide captions' : 'Show captions'}
                className={`p-1.5 border rounded ${
                  playback.captionsEnabled
                    ? 'bg-[#E6F1FB] border-[#85B7EB] text-[#042C53]'
                    : 'border-slate-200 text-[#5F5D56]'
                }`}
              >
                <Captions className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={toggleNarration}
                disabled={!speechAvailable}
                aria-label="Toggle voice narration"
                title={
                  speechAvailable
                    ? playback.narrationEnabled
                      ? `Mute spoken trainer voice (${providerSummaryLabel})`
                      : `Turn on spoken trainer voice (${providerSummaryLabel})`
                    : 'Spoken narration unavailable in this browser; captions remain active'
                }
                className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-[11px] font-medium disabled:opacity-40 ${
                  playback.narrationEnabled
                    ? 'bg-[#E6F1FB] border-[#85B7EB] text-[#042C53]'
                    : 'border-slate-200 text-[#5F5D56] hover:bg-slate-50'
                }`}
              >
                {playback.narrationEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-[#185FA5]" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {playback.narrationEnabled ? 'Voice On' : 'Voice Off'}
                </span>
              </button>

              <button
                type="button"
                data-demo-voice-settings-btn="true"
                onClick={() => {
                  setChaptersOpen(false);
                  setVoiceSettingsOpen((v) => !v);
                }}
                aria-label="Open voice settings"
                title="Trainer Voice Settings (voice selection, preview, speed)"
                className={`inline-flex items-center gap-1 px-2 py-1 border rounded text-[11px] font-medium ${
                  voiceSettingsOpen
                    ? 'bg-[#E6F1FB] border-[#85B7EB] text-[#042C53]'
                    : 'border-slate-200 text-[#042C53] hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#185FA5]" />
                <span className="hidden md:inline">Voice</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setVoiceSettingsOpen(false);
                  setChaptersOpen((v) => !v);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 border border-slate-200 rounded text-[11px] font-medium text-[#042C53] hover:bg-slate-50"
              >
                <ListOrdered className="w-3.5 h-3.5 text-[#185FA5]" />
                Steps
              </button>

              {activeScenario.id !== 'demo-01-scheduled-journey' && (
                <button
                  type="button"
                  onClick={() =>
                    startScenario('demo-01-scheduled-journey', {
                      autoPlay: true,
                      learningMode: 'watch',
                    })
                  }
                  className="hidden lg:inline-flex items-center gap-1 px-2 py-1 border border-[#85B7EB] bg-[#E6F1FB]/60 rounded text-[11px] font-medium text-[#042C53] hover:bg-[#E6F1FB]"
                >
                  <Compass className="w-3.5 h-3.5 text-[#185FA5]" />
                  Full Journey
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
      )}

      {/* Consolidated Completion Summary Modal (Scenario-Specific for Registration Demo; Unchanged 8-Role Journey for Elena Alvarez) */}
      <Modal
        open={summaryOpen && !exitConfirmOpen && playback.status === 'COMPLETED'}
        onClose={() => setSummaryOpen(false)}
        title={`Completed: ${activeScenario.title}`}
        subtitle={
          isRegistrationDemo && registrationSummary
            ? `Bengaluru Hub pre-visit registration & data consolidation summary · ${registrationSummary.patientName} (${registrationSummary.mrn})`
            : 'Verified real-state walkthrough summary, AI vs human approval boundaries, and clickable 8-role journey timeline'
        }
        maxWidth="max-w-4xl"
        zIndexClass="z-[75]"
      >
        {isRegistrationDemo && registrationSummary ? (
          <div data-demo-summary-modal="true" data-demo-summary-kind="registration-bengaluru" className="space-y-4 text-xs">
            {/* Registration-Specific Measured Evidence Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="eigen-card-subtle p-3.5">
                <div className="text-[11px] text-[#5F5D56]">Verified Chapters</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#0F6E50] mt-0.5">
                  {efficiencySummary.passedAssertions}/{efficiencySummary.totalScenesExecuted}
                </div>
              </div>
              <div className="eigen-card-subtle p-3.5">
                <div className="text-[11px] text-[#5F5D56]">Verified Profile Fields</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#042C53] mt-0.5">
                  {registrationSummary.verifiedFields.length}
                </div>
                <div className="text-[10px] text-[#5F5D56] truncate">
                  By {registrationSummary.verifiedBy}
                </div>
              </div>
              <div className="eigen-card-subtle p-3.5">
                <div className="text-[11px] text-[#5F5D56]">Extracted Data Reviewed</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#185FA5] mt-0.5">
                  {registrationSummary.acceptedExtractedFields.length} / {registrationSummary.rejectedExtractedFields.length}
                </div>
                <div className="text-[10px] text-[#5F5D56]">Accepted / Rejected</div>
              </div>
              <div className="eigen-card-subtle p-3.5">
                <div className="text-[11px] text-[#5F5D56]">Source Docs / Encounters</div>
                <div className="text-lg font-bold font-mono tabular-nums text-[#042C53] mt-0.5">
                  {registrationSummary.sourceDocuments.length} / {registrationSummary.encountersCreated}
                </div>
                <div className="text-[10px] text-[#0F6E50]">Stops cleanly pre-visit</div>
              </div>
            </div>

            {/* Patient Identity & Next-Visit Readiness Banner */}
            <div className="p-3 bg-[#E6F1FB]/60 border border-[#85B7EB] rounded-lg flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#0F6E50]" />
                  <span className="font-semibold text-[#042C53] text-sm">
                    {registrationSummary.patientName} ({registrationSummary.mrn})
                  </span>
                  <StatusBadge label={registrationSummary.registrationStatus} tone="success" />
                  <StatusBadge label={registrationSummary.readinessLabel} tone="blue" />
                </div>
                <div className="text-[11px] text-[#444441] font-mono">
                  DOB {registrationSummary.dob} · Phone {registrationSummary.phone} ·{' '}
                  {registrationSummary.facilityName}
                </div>
                <div className="text-[11px] text-[#5F5D56]">
                  Verified by <strong className="text-[#042C53]">{registrationSummary.verifiedBy}</strong>{' '}
                  ({registrationSummary.verifiedAt}) · Duplicate guard blocked name-only merge with distinct patient{' '}
                  <span className="font-mono">MRN-208612</span>.
                </div>
              </div>
              {registrationSummary.nextAppointment && (
                <div className="bg-white border border-slate-200 rounded-md px-3 py-2 text-[11px] min-w-[220px]">
                  <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#185FA5]" />
                    Next Scheduled Visit Ready
                  </div>
                  <div className="font-mono text-[#042C53] mt-0.5">
                    {registrationSummary.nextAppointment.date} · {registrationSummary.nextAppointment.startTime} IST
                  </div>
                  <div className="text-[#5F5D56]">{registrationSummary.nextAppointment.providerName}</div>
                </div>
              )}
            </div>

            {/* 2-Column Detailed Registration & Consolidation Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Left: Verified Fields + Accepted/Rejected Extracted Data */}
              <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                <div className="px-3 py-2 bg-[#042C53] text-white font-semibold flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#85B7EB]" />
                    Verified Fields & Consolidated Extraction
                  </span>
                  <span className="text-[10px] text-[#85B7EB]">Human Verified</span>
                </div>
                <div className="p-3 space-y-2.5 max-h-56 overflow-y-auto eigen-scroll">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56] mb-1">
                      Verified Registration Demographics ({registrationSummary.verifiedFields.length})
                    </div>
                    <div className="space-y-1">
                      {registrationSummary.verifiedFields.map((vf) => (
                        <div key={vf.field} className="flex justify-between gap-2 text-[11px]">
                          <span className="text-[#5F5D56]">{vf.field}</span>
                          <span className="font-medium text-[#042C53] text-right truncate max-w-[230px]">
                            {vf.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#0F6E50] mb-1">
                      Accepted Extracted Data ({registrationSummary.acceptedExtractedFields.length})
                    </div>
                    {registrationSummary.acceptedExtractedFields.length === 0 ? (
                      <p className="text-[11px] text-[#5F5D56]">No extracted fields accepted yet.</p>
                    ) : (
                      <ul className="space-y-1 text-[11px] text-[#042C53]">
                        {registrationSummary.acceptedExtractedFields.map((f) => (
                          <li key={f.label} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-[#0F6E50] shrink-0 mt-0.5" />
                            <span>
                              <strong>{f.label}:</strong> {f.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#B4321F] mb-1">
                      Rejected Uncertain Items ({registrationSummary.rejectedExtractedFields.length})
                    </div>
                    {registrationSummary.rejectedExtractedFields.length === 0 ? (
                      <p className="text-[11px] text-[#5F5D56]">No extracted items rejected.</p>
                    ) : (
                      <ul className="space-y-1 text-[11px] text-[#5F5D56]">
                        {registrationSummary.rejectedExtractedFields.map((f) => (
                          <li key={f.label} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-[#C97A1B] shrink-0 mt-0.5" />
                            <span>
                              <strong className="text-[#042C53]">{f.label}</strong> — excluded from chart ({f.reason})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Consolidated Source Documents + Outstanding Pre-Visit Information */}
              <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                <div className="px-3 py-2 bg-[#F7F7F5] border-b border-slate-200 font-semibold text-[#042C53] flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
                    Source Documents & Outstanding Pre-Visit Items
                  </span>
                </div>
                <div className="p-3 space-y-2.5 max-h-56 overflow-y-auto eigen-scroll">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#5F5D56] mb-1">
                      Consolidated Source Documents ({registrationSummary.sourceDocuments.length})
                    </div>
                    {registrationSummary.sourceDocuments.length === 0 ? (
                      <p className="text-[11px] text-[#5F5D56]">No source documents consolidated yet.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {registrationSummary.sourceDocuments.map((doc) => (
                          <div key={doc.id} className="p-2 bg-[#F7F7F5] border border-slate-200 rounded">
                            <div className="font-medium text-[#042C53] text-[11px]">{doc.title}</div>
                            <div className="text-[10px] text-[#5F5D56] mt-0.5">
                              {doc.category} · {doc.source} · {doc.date}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9A5B10] mb-1">
                      Outstanding Information Before Clinical Visit ({registrationSummary.outstandingItems.length})
                    </div>
                    <ul className="space-y-1.5 text-[11px] text-[#444441]">
                      {registrationSummary.outstandingItems.map((item) => (
                        <li key={item} className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#C97A1B] shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Verified Step-by-Step Assertions */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="px-3 py-2 bg-[#F7F7F5] border-b border-slate-200 font-semibold text-[#042C53]">
                Verified Chapter Assertions (10-Chapter Registration & Consolidation Run)
              </div>
              <div className="max-h-36 overflow-y-auto eigen-scroll divide-y divide-slate-100">
                {playback.assertionLogs.map((log) => (
                  <div key={log.sceneId} className="px-3 py-1.5 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-[#042C53]">
                        {String(log.sceneNumber).padStart(2, '0')}. {log.title}{' '}
                        <span className="text-[11px] font-normal text-[#5F5D56]">· {log.role}</span>
                      </div>
                      <div className="text-[11px] text-[#5F5D56]">{log.detail}</div>
                    </div>
                    <StatusBadge label={log.passed ? 'Verified' : 'Failed'} tone={log.passed ? 'success' : 'danger'} />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openPatient(registrationSummary.patientId, 'overview');
                    setSummaryOpen(false);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded hover:bg-slate-50"
                >
                  Open Patient 360° Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openPatient(registrationSummary.patientId, 'data-inbox');
                    setSummaryOpen(false);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded hover:bg-slate-50"
                >
                  Inspect Data Inbox
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openPatient(registrationSummary.patientId, 'knowledge-graph');
                    setSummaryOpen(false);
                  }}
                  className="px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded hover:bg-slate-50"
                >
                  Inspect Knowledge Graph
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSummaryOpen(false);
                    startScenario(activeScenario.id, { learningMode: 'practice', autoPlay: false });
                  }}
                  className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-[#9A5B10] font-medium rounded hover:bg-amber-100"
                >
                  Practice This Workflow Yourself
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Replay Tutorial
                </button>
                <button
                  type="button"
                  onClick={openExitConfirm}
                  className="px-3 py-1.5 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
                >
                  Exit Academy
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div data-demo-summary-modal="true" data-demo-summary-kind="clinical-journey" className="space-y-4 text-xs">
          {/* Measured Workflow Evidence Grid (No Fabricated Percentages) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="eigen-card-subtle p-3.5">
              <div className="text-[11px] text-[#5F5D56]">Verified Steps</div>
              <div className="text-lg font-bold font-mono tabular-nums text-[#0F6E50] mt-0.5">
                {efficiencySummary.passedAssertions}/{efficiencySummary.totalScenesExecuted}
              </div>
            </div>
            <div className="eigen-card-subtle p-3.5">
              <div className="text-[11px] text-[#5F5D56]">AI-Prepared / Human</div>
              <div className="text-lg font-bold font-mono tabular-nums text-[#042C53] mt-0.5">
                {efficiencySummary.aiDraftSteps} / {efficiencySummary.humanVerifiedSteps}
              </div>
            </div>
            <div className="eigen-card-subtle p-3.5">
              <div className="text-[11px] text-[#5F5D56]">Recorded Handoffs</div>
              <div className="text-lg font-bold font-mono tabular-nums text-[#185FA5] mt-0.5">
                {efficiencySummary.roleHandoffsRecorded}
              </div>
            </div>
            <div className="eigen-card-subtle p-3.5">
              <div className="text-[11px] text-[#5F5D56]">Approved / Audit Events</div>
              <div className="text-lg font-bold font-mono tabular-nums text-[#042C53] mt-0.5">
                {efficiencySummary.approvedClinicalActions} / {efficiencySummary.auditEventsGenerated}
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded text-[11px] text-[#042C53]">
            <strong>Measured Workflow Evidence:</strong> {efficiencySummary.verifiedIntakeItems} of{' '}
            {efficiencySummary.prePopulatedIntakeItems} AI-prepared pre-visit extractions verified by staff,{' '}
            {efficiencySummary.approvedClinicalActions} clinician-approved post-visit actions executed with zero autonomous clinical writes.{' '}
            <span className="text-[#5F5D56]">{efficiencySummary.methodologyNote}</span>
          </div>

          {/* Interactive 8-Role Complete Clinical Journey Timeline */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-[#042C53] text-white flex items-center justify-between">
              <span className="font-semibold">
                Complete Clinical Journey Timeline — Click Any Role to Launch Its Dedicated Tutorial
              </span>
              <span className="text-[10px] text-[#85B7EB]">Same patient: Elena Alvarez · MRN-109420</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-[#F7F7F5]">
              {ROLE_TUTORIAL_CARDS.map((card, idx) => {
                const isThisRole = activeScenario.id === card.scenarioId;
                return (
                  <button
                    key={card.roleKey}
                    type="button"
                    onClick={() => {
                      setSummaryOpen(false);
                      startScenario(card.scenarioId, { autoPlay: true, learningMode: 'watch' });
                    }}
                    className={`text-left p-2 rounded border transition-colors ${
                      isThisRole
                        ? 'bg-[#E6F1FB] border-[#185FA5]'
                        : 'bg-white border-slate-200 hover:border-[#185FA5] hover:bg-[#E6F1FB]/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-[#5F5D56]">
                      <span>0{idx + 1}</span>
                      <span className="text-[#0F6E50] font-sans font-medium">Launch →</span>
                    </div>
                    <div className="font-semibold text-[#042C53] text-[11px] mt-0.5 line-clamp-1">
                      {card.roleTitle}
                    </div>
                    <div className="text-[10px] text-[#5F5D56] line-clamp-1">{card.actorExample}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Verified Step-by-Step Assertions */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-[#F7F7F5] border-b border-slate-200 font-semibold text-[#042C53]">
              Verified Step Assertions & Resulting State
            </div>
            <div className="max-h-44 overflow-y-auto eigen-scroll divide-y divide-slate-100">
              {playback.assertionLogs.map((log) => (
                <div key={log.sceneId} className="px-3 py-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#042C53]">
                      {String(log.sceneNumber).padStart(2, '0')}. {log.title}{' '}
                      <span className="text-[11px] font-normal text-[#5F5D56]">· {log.role}</span>
                    </div>
                    <div className="text-[11px] text-[#5F5D56]">{log.detail}</div>
                  </div>
                  <StatusBadge label={log.passed ? 'Verified' : 'Failed'} tone={log.passed ? 'success' : 'danger'} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div className="flex flex-wrap items-center gap-2">
              {activeScenario.patientId && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      openPatient(activeScenario.patientId!, 'pre-consultation');
                      setSummaryOpen(false);
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded hover:bg-slate-50"
                  >
                    Inspect Pre-Consult
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      openPatient(activeScenario.patientId!, 'post-consultation');
                      setSummaryOpen(false);
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded hover:bg-slate-50"
                  >
                    Inspect Post-Consult
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setSummaryOpen(false);
                  startScenario(activeScenario.id, { learningMode: 'practice', autoPlay: false });
                }}
                className="px-2.5 py-1.5 border border-amber-300 bg-amber-50 text-[#9A5B10] font-medium rounded hover:bg-amber-100"
              >
                Practice This Workflow Yourself
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Replay Tutorial
              </button>
              <button
                type="button"
                onClick={openExitConfirm}
                className="px-3 py-1.5 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
              >
                Exit Academy
              </button>
            </div>
          </div>
        </div>
        )}
      </Modal>

      {/* Exit Demo Restore vs Retain Confirmation Modal */}
      <Modal
        open={exitConfirmOpen}
        onClose={cancelExitConfirm}
        title="Exit EigenH Guided Demo Academy"
        subtitle="Choose whether to restore your pre-demo workspace snapshot or keep the synthetic tutorial records."
        maxWidth="max-w-md"
        zIndexClass="z-[80]"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#444441] leading-relaxed">
            Your workspace was snapshotted before starting the tutorial. Restoring returns all patients, appointments, and audit records to their exact pre-demo state. Retaining keeps the synthetic tutorial records so you can inspect or repeat steps manually right now.
          </p>
          <div className="flex flex-col sm:flex-row justify-end gap-2">
            <button
              type="button"
              onClick={cancelExitConfirm}
              className="px-3 py-1.5 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
            >
              Stay in Tutorial
            </button>
            <button
              type="button"
              onClick={() => exitDemo('retain')}
              className="px-3 py-1.5 border border-[#185FA5] text-[#185FA5] font-medium rounded-md hover:bg-[#E6F1FB]"
            >
              Retain Records
            </button>
            <button
              type="button"
              onClick={() => exitDemo('restore')}
              className="px-3 py-1.5 bg-[#042C53] hover:bg-[#185FA5] text-white font-medium rounded-md"
            >
              Restore Pre-Demo State
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
