import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { StaffRole } from '../types/hms';
import {
  advanceToNextFilteredScene,
  clearPreDemoBackup,
  computePacedDurationMs,
  computeWorkflowEfficiencyMetrics,
  createInitialPlaybackState,
  getFilteredSceneIndices,
  loadPreDemoBackup,
  prepareScenarioBeforeIndex,
  savePreDemoBackup,
  seekScenarioToIndex,
  startScenarioAtIndex,
  stepToPreviousFilteredScene,
} from './demoEngine';
import { DEMO_DIRECTOR_SCENARIOS, getScenarioById } from './demoScenarios';
import type {
  CursorOverlayState,
  DemoEfficiencySummary,
  DemoFilterMode,
  DemoLearningMode,
  DemoPlaybackState,
  DemoRunAssertionLog,
  DemoScenarioDefinition,
  DemoSceneDefinition,
  DemoSpeed,
  DemoUiAction,
} from './demoTypes';
import {
  mapDemoSpeedToNaturalSpeechRate,
  NarrationPlaybackController,
} from './narration/narrationPlaybackController';
import type {
  NarrationDiagnosticsEntry,
  NarrationPlaybackStatus,
  NarrationRate,
  NeuralTTSStatusResponse,
  TTSProviderKind,
  VoiceOption,
} from './narration/narrationTypes';
import {
  getAuthoritativeCaption,
  VOICE_PREVIEW_SAMPLE_TEXT,
} from './narration/pronunciationGlossary';
import {
  CancellationToken,
  computeCursorAnchor,
  findDemoTargetElement,
  performVisibleTyping,
  scrollDemoTargetIntoView,
  setReactControlledValue,
  waitForDemoTargetElement,
  waitMs,
} from './visibleTypingController';

const INITIAL_CURSOR: CursorOverlayState = {
  visible: false,
  x: 180,
  y: 160,
  clicking: false,
  clickSeq: 0,
  label: '',
  classification: null,
  activeTargetSelector: null,
  isAiAutofill: false,
  typingPreview: null,
};

const DEFAULT_TTS_STATUS: NeuralTTSStatusResponse = {
  neuralConfigured: false,
  provider: 'none',
  model: 'gemini-3.8-flash-lite-tts',
  locale: 'en-US',
  voices: [],
};

interface StartScenarioOptions {
  startRole?: StaffRole | null;
  startIndex?: number;
  autoPlay?: boolean;
  learningMode?: DemoLearningMode;
  narrationEnabled?: boolean;
  speed?: DemoSpeed;
}

interface DemoDirectorContextValue {
  playback: DemoPlaybackState;
  cursor: CursorOverlayState;
  isDemoMode: boolean;
  activeScenario: DemoScenarioDefinition | null;
  activeScene: DemoSceneDefinition | null;
  /** Exact authoritative caption text synchronized with the currently spoken narration */
  activeCaptionText: string;
  efficiencySummary: DemoEfficiencySummary;
  exitConfirmOpen: boolean;
  summaryOpen: boolean;
  speechAvailable: boolean;
  narrationStatus: NarrationPlaybackStatus;
  activeProvider: TTSProviderKind;
  ttsStatus: NeuralTTSStatusResponse;
  availableVoices: VoiceOption[];
  selectedVoiceId: string;
  selectedTtsModel: string;
  narrationRate: NarrationRate;
  isPreviewingVoice: boolean;
  narrationDiagnostics: NarrationDiagnosticsEntry[];
  setSelectedVoiceId: (voiceId: string) => void;
  setSelectedTtsModel: (modelId: string) => void;
  setNarrationRate: (rate: NarrationRate) => void;
  previewVoice: (voiceId?: string, modelId?: string) => Promise<void>;
  stopPreview: () => void;
  setSummaryOpen: (open: boolean) => void;
  openExitConfirm: () => void;
  cancelExitConfirm: () => void;
  startScenario: (scenarioId: string, options?: StartScenarioOptions) => void;
  playOrResume: () => void;
  pause: () => void;
  restart: () => void;
  replayCurrentStep: () => void;
  showMeCurrentStep: () => void;
  nextScene: () => void;
  previousScene: () => void;
  jumpToScene: (index: number) => void;
  setSpeed: (speed: DemoSpeed) => void;
  setFilterMode: (filter: DemoFilterMode) => void;
  setLearningMode: (mode: DemoLearningMode) => void;
  toggleCaptions: () => void;
  toggleNarration: () => void;
  exitDemo: (choice: 'restore' | 'retain') => void;
}

const DemoDirectorContext = createContext<DemoDirectorContextValue | null>(null);

export const DemoDirectorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { state, replaceEntireState, notify } = useAppState();
  const [playback, setPlayback] = useState<DemoPlaybackState>(createInitialPlaybackState);
  const [cursor, setCursor] = useState<CursorOverlayState>(INITIAL_CURSOR);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Narration engine state (single authoritative controller instance)
  const controllerRef = useRef<NarrationPlaybackController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new NarrationPlaybackController();
  }
  const controller = controllerRef.current;

  const [narrationStatus, setNarrationStatus] = useState<NarrationPlaybackStatus>('idle');
  const [ttsStatus, setTtsStatus] = useState<NeuralTTSStatusResponse>(DEFAULT_TTS_STATUS);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceIdState] = useState<string>('');
  const [selectedTtsModel, setSelectedTtsModelState] = useState<string>('gemini-3.8-flash-lite-tts');
  const [narrationRate, setNarrationRateState] = useState<NarrationRate>(1);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [narrationDiagnostics, setNarrationDiagnostics] = useState<NarrationDiagnosticsEntry[]>([]);
  const [activeCaptionText, setActiveCaptionText] = useState<string>('');

  const stateRef = useRef(state);
  stateRef.current = state;

  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  const selectedVoiceIdRef = useRef(selectedVoiceId);
  selectedVoiceIdRef.current = selectedVoiceId;

  const selectedTtsModelRef = useRef(selectedTtsModel);
  selectedTtsModelRef.current = selectedTtsModel;

  const narrationRateRef = useRef(narrationRate);
  narrationRateRef.current = narrationRate;

  // Monotonic cancellation token + pause gate for live step runner (true pause/resume without truncating speech)
  const runTokenRef = useRef<CancellationToken>({ cancelled: false });
  const runningStepKeyRef = useRef<string | null>(null);
  const isShowingMeRef = useRef(false);
  const pauseGateRef = useRef<{ paused: boolean; waiters: Array<() => void> }>({
    paused: false,
    waiters: [],
  });

  const releasePauseGate = useCallback(() => {
    pauseGateRef.current.paused = false;
    const waiters = pauseGateRef.current.waiters.splice(0);
    for (const resolve of waiters) resolve();
  }, []);

  const waitWhilePaused = useCallback(async (token: CancellationToken): Promise<boolean> => {
    while (pauseGateRef.current.paused && !token.cancelled) {
      await new Promise<void>((resolve) => {
        pauseGateRef.current.waiters.push(resolve);
      });
    }
    return !token.cancelled;
  }, []);

  const cancelActiveRun = useCallback(
    (cancelNarration = true) => {
      runTokenRef.current.cancelled = true;
      runTokenRef.current = { cancelled: false };
      runningStepKeyRef.current = null;
      isShowingMeRef.current = false;
      releasePauseGate();
      if (cancelNarration) {
        controller.cancel('cancelled');
        setIsPreviewingVoice(false);
      }
    },
    [controller, releasePauseGate]
  );

  // Sync voice discovery (server Gemini Neural TTS status + browser voiceschanged)
  const refreshVoiceCatalog = useCallback(async () => {
    const serverStatus = await controller.initialize();
    setTtsStatus(serverStatus);
    const voices = controller.getAvailableVoices();
    setAvailableVoices(voices);
    setSelectedVoiceIdState((prev) => {
      if (prev && voices.some((v) => v.id === prev)) return prev;
      const def = controller.getDefaultVoiceId();
      selectedVoiceIdRef.current = def;
      return def;
    });
  }, [controller]);

  useEffect(() => {
    const unsub = controller.onStatusChange((nextStatus) => {
      setNarrationStatus(nextStatus);
      setNarrationDiagnostics([...controller.diagnostics.getEntries()]);
    });

    void refreshVoiceCatalog();

    const handleVoicesChanged = () => {
      const voices = controller.getAvailableVoices();
      setAvailableVoices(voices);
      setSelectedVoiceIdState((prev) => {
        if (prev && voices.some((v) => v.id === prev)) return prev;
        const def = controller.getDefaultVoiceId();
        selectedVoiceIdRef.current = def;
        return def;
      });
    };

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener?.('voiceschanged', handleVoicesChanged);
    }

    return () => {
      unsub();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener?.('voiceschanged', handleVoicesChanged);
      }
    };
  }, [controller, refreshVoiceCatalog]);

  const activeProvider: TTSProviderKind = useMemo(() => {
    if (selectedVoiceId.startsWith('browser:')) {
      return controller.browserFallback.isSupported() ? 'browser-fallback' : 'captions-only';
    }
    if (ttsStatus.neuralConfigured && ttsStatus.voices.length > 0) return 'gemini-neural';
    if (controller.browserFallback.isSupported()) return 'browser-fallback';
    return 'captions-only';
  }, [controller, selectedVoiceId, ttsStatus.neuralConfigured, ttsStatus.voices.length]);

  const speechAvailable =
    ttsStatus.neuralConfigured || controller.browserFallback.isSupported();

  const activeScenario = useMemo(
    () => getScenarioById(playback.scenarioId) || null,
    [playback.scenarioId]
  );

  const activeScene = useMemo(() => {
    if (!activeScenario) return null;
    return activeScenario.scenes[playback.activeSceneIndex] || null;
  }, [activeScenario, playback.activeSceneIndex]);

  const isDemoMode = playback.status !== 'IDLE' && playback.status !== 'CANCELED';

  // Keep caption synchronized when paused or jumping to a scene deterministically
  useEffect(() => {
    if (!activeScene) {
      setActiveCaptionText('');
      return;
    }
    const authoritative = getAuthoritativeCaption(activeScene, playback.learningMode);
    setActiveCaptionText(authoritative);
  }, [activeScene, playback.learningMode]);

  const setSelectedVoiceId = useCallback((voiceId: string) => {
    selectedVoiceIdRef.current = voiceId;
    setSelectedVoiceIdState(voiceId);
  }, []);

  const setSelectedTtsModel = useCallback((modelId: string) => {
    selectedTtsModelRef.current = modelId;
    setSelectedTtsModelState(modelId);
  }, []);

  const setNarrationRate = useCallback((rate: NarrationRate) => {
    narrationRateRef.current = rate;
    setNarrationRateState(rate);
  }, []);

  const stopPreview = useCallback(() => {
    controller.cancel('cancelled');
    setIsPreviewingVoice(false);
  }, [controller]);

  const previewVoice = useCallback(
    async (voiceId?: string, modelId?: string) => {
      const targetVoice = voiceId || selectedVoiceIdRef.current || controller.getDefaultVoiceId();
      const targetModel = modelId || selectedTtsModelRef.current;
      if (playbackRef.current.status === 'PLAYING') {
        // Pause active tutorial cleanly so preview never overlaps tutorial speech
        pauseGateRef.current.paused = true;
        setPlayback((prev) => (prev.status === 'PLAYING' ? { ...prev, status: 'PAUSED' } : prev));
      }
      controller.cancel('cancelled');
      setIsPreviewingVoice(true);
      try {
        await controller.speakScene({
          sceneId: 'voice-preview',
          authoritativeCaption: VOICE_PREVIEW_SAMPLE_TEXT,
          voiceId: targetVoice,
          model: targetModel,
          rate: narrationRateRef.current,
          enabled: true,
        });
      } finally {
        setIsPreviewingVoice(false);
      }
    },
    [controller]
  );

  const hasLiveUiActions = (scene: DemoSceneDefinition | null): boolean =>
    Boolean(scene?.uiActions && scene.uiActions.length > 0);

  /**
   * Executes one step live in the real browser UI while strictly honoring audio completion:
   * - Captions and spoken audio use ONE authoritative transcript per step.
   * - Cursor glides & real DOM actions run naturally while narration explains the step.
   * - Next step NEVER begins until the active narration has genuinely completed (audio `ended` /
   *   utterance `onend` + trailing natural breath pause) — ZERO fixed-timer truncation!
   * - NEVER calls cancel() during ordinary scene transitions.
   */
  const runStepLive = useCallback(
    async (
      scenario: DemoScenarioDefinition,
      sceneIndex: number,
      token: CancellationToken,
      options?: { singleStepOnly?: boolean; returnToPracticeAfter?: boolean }
    ) => {
      const scene = scenario.scenes[sceneIndex];
      if (!scene || token.cancelled) return;

      const stepKey = `${scenario.id}:${sceneIndex}`;
      runningStepKeyRef.current = stepKey;

      const speed = playbackRef.current.speed;
      const learningMode = playbackRef.current.learningMode;
      const authoritativeText = getAuthoritativeCaption(scene, learningMode);
      const effectiveSpeechRate = mapDemoSpeedToNaturalSpeechRate(speed, narrationRateRef.current);

      setActiveCaptionText(authoritativeText);

      const classification =
        scene.classification ||
        (scene.isSimulatedApproval
          ? 'Human approved'
          : scene.actorKind === 'ai'
          ? 'AI-prepared'
          : scene.actorKind === 'handoff'
          ? 'Completed action'
          : 'Manual entry');

      // Align role / route / patient tab before locating real DOM controls
      if (scene.prepareView) {
        const current = stateRef.current;
        const needsAlign =
          current.currentRole !== scene.role ||
          current.currentNav !== scene.routeNav ||
          (scene.patientId !== null && current.selectedPatientId !== scene.patientId) ||
          (scene.patientTab && current.selectedPatientTab !== scene.patientTab);
        if (needsAlign) {
          replaceEntireState(scene.prepareView(current));
          if (!(await waitMs(160, token))) return;
          if (!(await waitWhilePaused(token))) return;
        }
      }

      setPlayback((prev) => ({
        ...prev,
        stepPhase: 'explaining',
        practiceFeedback: null,
        errorMessage: null,
      }));
      setCursor((prev) => ({
        ...prev,
        activeTargetSelector:
          scene.uiActions && scene.uiActions.length > 0
            ? scene.uiActions[0].target
            : scene.visualTarget || null,
        clicking: false,
        typingPreview: null,
      }));

      // Prefetch upcoming step's neural audio clip in the background for zero-lag transitions
      const pbStart = playbackRef.current;
      const matchingIndices = getFilteredSceneIndices(scenario, pbStart.filterMode, pbStart.learningMode);
      const upcomingIndex = matchingIndices.find((idx) => idx > sceneIndex);
      if (upcomingIndex !== undefined && pbStart.narrationEnabled) {
        const upcomingScene = scenario.scenes[upcomingIndex];
        if (upcomingScene) {
          controller.prefetchSceneText(
            getAuthoritativeCaption(upcomingScene, pbStart.learningMode),
            selectedVoiceIdRef.current,
            selectedTtsModelRef.current
          );
        }
      }

      // Start authoritative narration for this step (never cancelled on normal step advancement!)
      const narrationPromise = controller.speakScene({
        sceneId: scene.sceneId,
        authoritativeCaption: authoritativeText,
        voiceId: selectedVoiceIdRef.current || controller.getDefaultVoiceId(),
        model: selectedTtsModelRef.current,
        rate: effectiveSpeechRate,
        enabled: playbackRef.current.narrationEnabled,
      });

      const actions: DemoUiAction[] =
        scene.uiActions && scene.uiActions.length > 0
          ? scene.uiActions
          : scene.visualTarget
          ? [{ kind: 'review', target: scene.visualTarget, pauseAfterMs: 400 }]
          : [];

      const isInteractiveUiScene = Boolean(scene.uiActions && scene.uiActions.length > 0);
      if (!isInteractiveUiScene) {
        const mutated = scene.execute(stateRef.current);
        replaceEntireState(mutated);
        if (!(await waitMs(140, token))) return;
      }

      // Precondition alignment for registration modal chapters when jumping or retrying directly
      if (scene.sceneId === 'reg-01-scheduled-context') {
        const closeOpenRegBtn = document.querySelector(
          'button[aria-label="Close Intelligent Scheduled Patient Registration"]'
        ) as HTMLButtonElement | null;
        if (closeOpenRegBtn) {
          closeOpenRegBtn.click();
          if (!(await waitMs(140, token))) return;
        }
      } else if (
        (scene.sceneId === 'reg-02-identity-duplicate-check' ||
          scene.sceneId === 'reg-03-intelligent-registration') &&
        !findDemoTargetElement('intelligent-registration-modal')
      ) {
        const openRegBtn = await waitForDemoTargetElement('scheduled-registration-btn', 1200, token);
        if (openRegBtn && !token.cancelled) {
          openRegBtn.click();
          await waitForDemoTargetElement('intelligent-registration-modal', 1500, token);
          if (!(await waitMs(140, token))) return;
        }
      }

      setPlayback((prev) => ({ ...prev, stepPhase: 'acting' }));

      for (const action of actions) {
        if (token.cancelled) return;
        if (!(await waitWhilePaused(token))) return;

        const el = await waitForDemoTargetElement(action.target, 2200, token);
        if (token.cancelled) return;

        if (!el) {
          if (action.requiredTarget) {
            runningStepKeyRef.current = null;
            controller.cancel('cancelled');
            setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
            setPlayback((prev) => ({
              ...prev,
              status: 'FAILED',
              errorMessage: `Real UI target "${action.target}" was not found on screen for Step ${scene.sceneNumber} (${scene.title}). Playback halted honestly instead of simulating a fake click.`,
            }));
            return;
          }
          continue;
        }

        scrollDemoTargetIntoView(el, action.target);
        if (!(await waitMs(Math.max(120, Math.round(240 / speed)), token))) return;
        if (!(await waitWhilePaused(token))) return;

        const anchor = computeCursorAnchor(el);
        const actionClassification =
          action.kind === 'ai-autofill' ? 'AI-prepared' : classification;

        setCursor((prev) => ({
          ...prev,
          visible: true,
          x: anchor.x,
          y: anchor.y,
          clicking: false,
          label: scene.role,
          classification: actionClassification,
          activeTargetSelector: action.target,
          isAiAutofill: action.kind === 'ai-autofill',
          typingPreview: null,
        }));

        const beforeMs = Math.max(
          160,
          Math.round((action.pauseBeforeMs ?? (action.kind === 'review' ? 420 : 520)) / speed)
        );
        if (!(await waitMs(beforeMs, token))) return;
        if (!(await waitWhilePaused(token))) return;

        const liveEl = findDemoTargetElement(action.target) || el;
        const liveAnchor = computeCursorAnchor(liveEl);

        if (action.kind === 'click') {
          setCursor((prev) => ({
            ...prev,
            x: liveAnchor.x,
            y: liveAnchor.y,
            clicking: true,
            clickSeq: prev.clickSeq + 1,
          }));
          liveEl.focus?.();
          liveEl.click();
          if (!(await waitMs(Math.max(120, Math.round(260 / speed)), token))) return;
          setCursor((prev) => ({ ...prev, clicking: false }));
        } else if (action.kind === 'type' || action.kind === 'ai-autofill') {
          const val = action.value ?? '';
          const typedOk = await performVisibleTyping(liveEl, val, {
            mode: action.kind === 'ai-autofill' ? 'ai-autofill' : 'manual',
            speed,
            append: action.append,
            token,
            waitWhilePaused: () => waitWhilePaused(token),
            onFrame: (curr) => {
              setCursor((prev) => ({
                ...prev,
                typingPreview: curr.length > 38 ? `${curr.slice(0, 35)}…` : curr,
              }));
            },
          });
          if (!typedOk || token.cancelled) return;
          setCursor((prev) => ({ ...prev, typingPreview: null, isAiAutofill: false }));
        } else if (action.kind === 'select') {
          if (liveEl instanceof HTMLSelectElement) {
            setCursor((prev) => ({
              ...prev,
              x: liveAnchor.x,
              y: liveAnchor.y,
              clicking: true,
              clickSeq: prev.clickSeq + 1,
            }));
            setReactControlledValue(liveEl, action.value ?? '');
            if (!(await waitMs(Math.max(120, Math.round(240 / speed)), token))) return;
            setCursor((prev) => ({ ...prev, clicking: false }));
          }
        } else if (action.kind === 'review') {
          const reviewPause = Math.max(260, Math.round((action.pauseAfterMs ?? 650) / speed));
          if (!(await waitMs(reviewPause, token))) return;
        }

        if (action.kind !== 'review' && action.pauseAfterMs) {
          if (!(await waitMs(Math.max(100, Math.round(action.pauseAfterMs / speed)), token))) return;
        }
      }

      if (!(await waitMs(150, token))) return;
      if (!(await waitWhilePaused(token))) return;

      // Verify resulting state genuinely
      let finalState = stateRef.current;
      let check = scene.validate(finalState);
      if (!check.passed) {
        const synced = scene.execute(finalState);
        replaceEntireState(synced);
        finalState = synced;
        check = scene.validate(synced);
      }

      const logEntry: DemoRunAssertionLog = {
        sceneId: scene.sceneId,
        sceneNumber: scene.sceneNumber,
        title: scene.title,
        role: scene.role,
        actorKind: scene.actorKind,
        passed: check.passed,
        detail: check.detail,
        expectedMutation: scene.expectedMutation,
        executedAt: new Date().toISOString(),
      };

      if (!check.passed) {
        runningStepKeyRef.current = null;
        controller.cancel('cancelled');
        setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
        setPlayback((prev) => ({
          ...prev,
          status: 'FAILED',
          stepPhase: 'completed-step',
          errorMessage: `Step ${scene.sceneNumber} (${scene.title}) post-check failed: ${check.detail}`,
          assertionLogs: [
            ...prev.assertionLogs.filter((l) => l.sceneId !== scene.sceneId),
            logEntry,
          ],
        }));
        return;
      }

      // Record verified snapshot while KEEPING the spoken caption visible until narration truly finishes!
      setPlayback((prev) => {
        const nextLogs = [...prev.assertionLogs.filter((l) => l.sceneId !== scene.sceneId), logEntry];
        return {
          ...prev,
          assertionLogs: nextLogs,
          completedSnapshots: { ...prev.completedSnapshots, [sceneIndex]: finalState },
        };
      });

      // CRITICAL: Wait strictly for actual narration completion (never truncate with a fixed short timer!)
      const narrationResult = await narrationPromise;
      if (token.cancelled) return;
      if (!(await waitWhilePaused(token))) return;

      // Mark step completed ONLY after spoken narration finished completely
      setPlayback((prev) => ({ ...prev, stepPhase: 'completed-step' }));

      // If narration was muted/captions-only, provide a comfortable reading beat;
      // if spoken audio just completed (already includes 380–420ms trailing breath pause), keep a brief 180ms visual settle.
      const postWaitMs =
        narrationResult.reason === 'muted'
          ? isInteractiveUiScene
            ? computePacedDurationMs(Math.max(680, Math.round(scene.durationMs * 0.3)), speed)
            : computePacedDurationMs(scene.durationMs, speed)
          : 180;

      if (!(await waitMs(postWaitMs, token))) return;
      if (!(await waitWhilePaused(token))) return;

      runningStepKeyRef.current = null;

      // Decide next step index according to filter & learningMode
      const pbNow = playbackRef.current;
      const matching = getFilteredSceneIndices(scenario, pbNow.filterMode, pbNow.learningMode);
      const nextIdx = matching.find((idx) => idx > sceneIndex);

      if (options?.returnToPracticeAfter) {
        isShowingMeRef.current = false;
        if (nextIdx === undefined) {
          setCursor((prev) => ({ ...prev, visible: false }));
          setPlayback((prev) => ({ ...prev, status: 'COMPLETED' }));
          setSummaryOpen(true);
          return;
        }
        let bridgeState = stateRef.current;
        const checkpoints = { ...pbNow.checkpoints };
        const completedSnapshots = { ...pbNow.completedSnapshots, [sceneIndex]: bridgeState };
        for (let i = sceneIndex + 1; i < nextIdx; i += 1) {
          checkpoints[i] = bridgeState;
          bridgeState = scenario.scenes[i].execute(bridgeState);
          completedSnapshots[i] = bridgeState;
        }
        checkpoints[nextIdx] = bridgeState;
        const nextSceneDef = scenario.scenes[nextIdx];
        const preparedNext = nextSceneDef.prepareView ? nextSceneDef.prepareView(bridgeState) : bridgeState;
        replaceEntireState(preparedNext);
        setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
        setPlayback((prev) => ({
          ...prev,
          status: 'WAITING_FOR_USER',
          activeSceneIndex: nextIdx,
          stepPhase: 'explaining',
          practiceFeedback: 'Step demonstrated! Now try the next highlighted step yourself.',
          checkpoints,
          completedSnapshots,
        }));
        return;
      }

      if (options?.singleStepOnly) {
        setPlayback((prev) => ({ ...prev, status: 'PAUSED' }));
        return;
      }

      if (nextIdx === undefined) {
        let bridgeState = stateRef.current;
        for (let i = sceneIndex + 1; i < scenario.scenes.length; i += 1) {
          bridgeState = scenario.scenes[i].execute(bridgeState);
        }
        if (bridgeState !== stateRef.current) {
          replaceEntireState(bridgeState);
        }
        setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
        setPlayback((prev) => ({ ...prev, status: 'COMPLETED' }));
        setSummaryOpen(true);
        return;
      }

      // Sync any skipped scenes between sceneIndex and nextIdx (e.g., Executive Demo or AI-Only filter)
      let bridgeState = stateRef.current;
      const nextCheckpoints = { ...pbNow.checkpoints };
      const nextCompleted = { ...pbNow.completedSnapshots, [sceneIndex]: bridgeState };
      const bridgeLogs = [...pbNow.assertionLogs];

      for (let i = sceneIndex + 1; i < nextIdx; i += 1) {
        nextCheckpoints[i] = bridgeState;
        const skipped = scenario.scenes[i];
        bridgeState = skipped.execute(bridgeState);
        nextCompleted[i] = bridgeState;
        const skippedCheck = skipped.validate(bridgeState);
        const sLog: DemoRunAssertionLog = {
          sceneId: skipped.sceneId,
          sceneNumber: skipped.sceneNumber,
          title: skipped.title,
          role: skipped.role,
          actorKind: skipped.actorKind,
          passed: skippedCheck.passed,
          detail: skippedCheck.detail,
          expectedMutation: skipped.expectedMutation,
          executedAt: new Date().toISOString(),
        };
        const pos = bridgeLogs.findIndex((x) => x.sceneId === skipped.sceneId);
        if (pos >= 0) bridgeLogs[pos] = sLog;
        else bridgeLogs.push(sLog);
      }

      nextCheckpoints[nextIdx] = bridgeState;
      const upcoming = scenario.scenes[nextIdx];
      const aligned = upcoming.prepareView ? upcoming.prepareView(bridgeState) : bridgeState;
      if (aligned !== stateRef.current) {
        replaceEntireState(aligned);
      }

      setPlayback((prev) => ({
        ...prev,
        activeSceneIndex: nextIdx,
        stepPhase: 'explaining',
        checkpoints: nextCheckpoints,
        completedSnapshots: nextCompleted,
        assertionLogs: bridgeLogs,
      }));
    },
    [controller, replaceEntireState, waitWhilePaused]
  );

  // Trigger live step runner when PLAYING on a new step (does NOT cancel on Pause/Resume!)
  useEffect(() => {
    if (playback.status !== 'PLAYING' || !activeScenario || !activeScene) return;
    if (isShowingMeRef.current) return;

    const desiredKey = `${activeScenario.id}:${playback.activeSceneIndex}`;
    // If this exact step is already running (e.g. resumed from PAUSED), do NOT cancel or restart it!
    if (runningStepKeyRef.current === desiredKey) {
      return;
    }

    // Cancel any stale prior run without interrupting freshly completed audio
    runTokenRef.current.cancelled = true;
    runTokenRef.current = { cancelled: false };
    releasePauseGate();
    const token = runTokenRef.current;

    void runStepLive(activeScenario, playback.activeSceneIndex, token);
  }, [
    activeScenario,
    activeScene,
    playback.activeSceneIndex,
    playback.status,
    releasePauseGate,
    runStepLive,
  ]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      runTokenRef.current.cancelled = true;
      controller.cancel('cancelled');
    };
  }, [controller]);

  // Guided Practice mode: listen for authentic user click / input on the highlighted control
  useEffect(() => {
    if (playback.status !== 'WAITING_FOR_USER' || !activeScenario || !activeScene) return;

    const primaryTarget =
      activeScene.uiActions && activeScene.uiActions.length > 0
        ? activeScene.uiActions[activeScene.uiActions.length - 1].target
        : activeScene.visualTarget || null;

    const primaryAction =
      activeScene.uiActions && activeScene.uiActions.length > 0
        ? activeScene.uiActions[0]
        : null;

    const targetList = activeScene.uiActions?.map((a) => a.target) || (primaryTarget ? [primaryTarget] : []);

    const advanceAfterUserAction = () => {
      window.setTimeout(() => {
        const pbNow = playbackRef.current;
        if (pbNow.status !== 'WAITING_FOR_USER') return;
        const sc = activeScenario.scenes[pbNow.activeSceneIndex];
        if (!sc) return;

        let nextSt = stateRef.current;
        let check = sc.validate(nextSt);
        if (!check.passed) {
          nextSt = sc.execute(nextSt);
          replaceEntireState(nextSt);
          check = sc.validate(nextSt);
        }

        const logEntry: DemoRunAssertionLog = {
          sceneId: sc.sceneId,
          sceneNumber: sc.sceneNumber,
          title: sc.title,
          role: sc.role,
          actorKind: sc.actorKind,
          passed: check.passed,
          detail: check.detail,
          expectedMutation: sc.expectedMutation,
          executedAt: new Date().toISOString(),
        };

        const matching = getFilteredSceneIndices(activeScenario, pbNow.filterMode, pbNow.learningMode);
        const nextIdx = matching.find((idx) => idx > pbNow.activeSceneIndex);
        const updatedLogs = [...pbNow.assertionLogs.filter((l) => l.sceneId !== sc.sceneId), logEntry];
        const updatedSnapshots = { ...pbNow.completedSnapshots, [pbNow.activeSceneIndex]: nextSt };

        if (nextIdx === undefined) {
          setPlayback((prev) => ({
            ...prev,
            status: 'COMPLETED',
            practiceFeedback: 'Tutorial completed! Every workflow step verified.',
            assertionLogs: updatedLogs,
            completedSnapshots: updatedSnapshots,
          }));
          setSummaryOpen(true);
          return;
        }

        const nextSceneDef = activeScenario.scenes[nextIdx];
        const checkpoints = { ...pbNow.checkpoints, [nextIdx]: nextSt };
        const aligned = nextSceneDef.prepareView ? nextSceneDef.prepareView(nextSt) : nextSt;
        if (aligned !== stateRef.current) {
          replaceEntireState(aligned);
        }

        setPlayback((prev) => ({
          ...prev,
          status: 'WAITING_FOR_USER',
          activeSceneIndex: nextIdx,
          stepPhase: 'explaining',
          practiceFeedback: `Step ${sc.sceneNumber} completed! Next: ${nextSceneDef.title}`,
          assertionLogs: updatedLogs,
          checkpoints,
          completedSnapshots: updatedSnapshots,
        }));
      }, 220);
    };

    const handleClick = (ev: MouseEvent) => {
      const targetNode = ev.target as HTMLElement | null;
      if (!targetNode) return;
      if (
        targetNode.closest('[data-demo-director-bar="true"]') ||
        targetNode.closest('[data-demo-chapters="true"]') ||
        targetNode.closest('[data-demo-voice-panel="true"]')
      ) {
        return;
      }

      const matched = targetList.some((selectorToken) => {
        const el = findDemoTargetElement(selectorToken);
        return Boolean(el && (el === targetNode || el.contains(targetNode)));
      });

      if (matched) {
        if (
          primaryAction &&
          (primaryAction.kind === 'type' || primaryAction.kind === 'ai-autofill' || primaryAction.kind === 'select')
        ) {
          setPlayback((prev) => ({
            ...prev,
            practiceFeedback: `Great — now enter the value (${primaryAction.value || 'required field'}) to continue.`,
          }));
          return;
        }
        advanceAfterUserAction();
      } else if (targetNode.closest('button, a, input, select')) {
        setPlayback((prev) => ({
          ...prev,
          practiceFeedback: `Try the highlighted amber control: ${
            activeScene.practiceHint || activeScene.caption
          }`,
        }));
      }
    };

    const handleInputOrChange = (ev: Event) => {
      const targetNode = ev.target as HTMLElement | null;
      if (!targetNode) return;
      const matched = targetList.some((selectorToken) => {
        const el = findDemoTargetElement(selectorToken);
        return Boolean(el && (el === targetNode || el.contains(targetNode)));
      });
      if (!matched) return;

      if (targetNode instanceof HTMLInputElement && targetNode.type === 'checkbox') {
        advanceAfterUserAction();
        return;
      }
      if (targetNode instanceof HTMLSelectElement) {
        advanceAfterUserAction();
        return;
      }
      if (targetNode instanceof HTMLInputElement || targetNode instanceof HTMLTextAreaElement) {
        if (targetNode.value.trim().length >= 2) {
          advanceAfterUserAction();
        }
      }
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('change', handleInputOrChange, true);
    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('change', handleInputOrChange, true);
    };
  }, [activeScenario, activeScene, playback.activeSceneIndex, playback.status, replaceEntireState]);

  const startScenario = useCallback(
    (scenarioId: string, options?: StartScenarioOptions) => {
      const scenario = getScenarioById(scenarioId);
      if (!scenario) {
        notify('error', `Tutorial scenario "${scenarioId}" not found.`);
        return;
      }
      if (scenario.status !== 'Ready') {
        notify('warning', `"${scenario.title}" is Planned and not yet available.`);
        return;
      }

      cancelActiveRun(true);
      setCursor(INITIAL_CURSOR);

      if (!isDemoMode) {
        savePreDemoBackup(stateRef.current);
      }

      const sourceBase = loadPreDemoBackup() || stateRef.current;
      const learningMode: DemoLearningMode = options?.learningMode ?? 'watch';
      const startIndex = options?.startIndex ?? 0;
      const effectiveSpeed: DemoSpeed = options?.speed ?? playbackRef.current.speed;
      const firstScene = scenario.scenes[startIndex];

      if (
        learningMode === 'practice' ||
        (options?.autoPlay !== false && hasLiveUiActions(firstScene))
      ) {
        const prep = prepareScenarioBeforeIndex(scenario, sourceBase, {
          startRole: options?.startRole ?? null,
          startIndex,
          learningMode,
          speed: effectiveSpeed,
          filterMode: 'full',
          captionsEnabled: playbackRef.current.captionsEnabled,
          narrationEnabled: options?.narrationEnabled ?? playbackRef.current.narrationEnabled,
          autoPlay: options?.autoPlay ?? true,
        });
        playbackRef.current = prep.nextPlayback;
        replaceEntireState(prep.preStepAppState);
        setPlayback(prep.nextPlayback);
        setExitConfirmOpen(false);
        setSummaryOpen(false);
        notify(
          'info',
          `${learningMode === 'practice' ? 'GUIDED PRACTICE' : learningMode === 'executive' ? 'EXECUTIVE DEMO' : 'WATCH DEMO'}: ${scenario.title}`
        );
        return;
      }

      const result = startScenarioAtIndex(scenario, sourceBase, {
        startRole: options?.startRole ?? null,
        startIndex,
        learningMode,
        speed: effectiveSpeed,
        filterMode: 'full',
        captionsEnabled: playbackRef.current.captionsEnabled,
        narrationEnabled: options?.narrationEnabled ?? playbackRef.current.narrationEnabled,
        autoPlay: options?.autoPlay ?? true,
      });

      playbackRef.current = result.nextPlayback;
      replaceEntireState(result.nextAppState);
      setPlayback(result.nextPlayback);
      setExitConfirmOpen(false);
      setSummaryOpen(result.nextPlayback.status === 'COMPLETED');
      notify('info', `ACADEMY LIVE: ${scenario.title} (${scenario.scenes.length} steps)`);
    },
    [cancelActiveRun, isDemoMode, notify, replaceEntireState]
  );

  const playOrResume = useCallback(() => {
    const current = playbackRef.current;
    if (!current.scenarioId) {
      startScenario(DEMO_DIRECTOR_SCENARIOS[0].id, { autoPlay: true, learningMode: 'watch' });
      return;
    }
    if (current.status === 'COMPLETED' || current.status === 'FAILED') {
      startScenario(current.scenarioId, {
        startRole: current.startedFromRole,
        autoPlay: true,
        learningMode: current.learningMode,
      });
      return;
    }
    if (current.learningMode === 'practice') {
      setPlayback((prev) => ({ ...prev, learningMode: 'watch', status: 'PLAYING' }));
      return;
    }
    // True resume from paused position without truncating or restarting current narration!
    if (current.status === 'PAUSED' && runningStepKeyRef.current === `${current.scenarioId}:${current.activeSceneIndex}`) {
      controller.resume();
      releasePauseGate();
      setPlayback((prev) => ({ ...prev, status: 'PLAYING' }));
      return;
    }
    releasePauseGate();
    setPlayback((prev) => ({ ...prev, status: 'PLAYING' }));
  }, [controller, releasePauseGate, startScenario]);

  const pause = useCallback(() => {
    // True pause: freeze audio at current position and hold step runner cleanly
    pauseGateRef.current.paused = true;
    controller.pause();
    setCursor((prev) => ({ ...prev, clicking: false, typingPreview: null }));
    setPlayback((prev) => (prev.status === 'PLAYING' ? { ...prev, status: 'PAUSED' } : prev));
  }, [controller]);

  const restart = useCallback(() => {
    const current = playbackRef.current;
    if (!current.scenarioId) return;
    startScenario(current.scenarioId, {
      startRole: current.startedFromRole,
      startIndex: 0,
      autoPlay: current.learningMode !== 'practice',
      learningMode: current.learningMode,
    });
  }, [startScenario]);

  const replayCurrentStep = useCallback(() => {
    const current = playbackRef.current;
    const scenario = getScenarioById(current.scenarioId);
    if (!scenario) return;

    cancelActiveRun(true);

    const preState = current.checkpoints[current.activeSceneIndex];
    const scene = scenario.scenes[current.activeSceneIndex];
    if (preState && scene) {
      const aligned = scene.prepareView ? scene.prepareView(preState) : preState;
      replaceEntireState(aligned);
    }

    const token = runTokenRef.current;
    setPlayback((prev) => ({
      ...prev,
      status: 'PLAYING',
      stepPhase: 'explaining',
      errorMessage: null,
    }));
    isShowingMeRef.current = true;
    void runStepLive(scenario, current.activeSceneIndex, token, {
      singleStepOnly: current.learningMode !== 'watch' && current.learningMode !== 'executive',
      returnToPracticeAfter: current.learningMode === 'practice',
    }).finally(() => {
      isShowingMeRef.current = false;
    });
  }, [cancelActiveRun, replaceEntireState, runStepLive]);

  const showMeCurrentStep = useCallback(() => {
    const current = playbackRef.current;
    const scenario = getScenarioById(current.scenarioId);
    if (!scenario) return;

    cancelActiveRun(true);

    const token = runTokenRef.current;
    isShowingMeRef.current = true;
    setPlayback((prev) => ({
      ...prev,
      status: 'PLAYING',
      practiceFeedback: 'Watch closely — EigenH is demonstrating this step for you…',
    }));

    void runStepLive(scenario, current.activeSceneIndex, token, {
      returnToPracticeAfter: true,
    }).finally(() => {
      isShowingMeRef.current = false;
    });
  }, [cancelActiveRun, runStepLive]);

  const nextScene = useCallback(() => {
    cancelActiveRun(true);
    setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
    const pb = playbackRef.current;
    const scenario = getScenarioById(pb.scenarioId);
    if (!scenario) return;

    if (pb.learningMode === 'practice') {
      const completedCurrent = seekScenarioToIndex(pb, stateRef.current, pb.activeSceneIndex);
      if (!completedCurrent) return;
      const nextIdx = Math.min(scenario.scenes.length - 1, pb.activeSceneIndex + 1);
      if (nextIdx === pb.activeSceneIndex) {
        replaceEntireState(completedCurrent.nextAppState);
        setPlayback({ ...completedCurrent.nextPlayback, status: 'COMPLETED' });
        setSummaryOpen(true);
        return;
      }
      const nextDef = scenario.scenes[nextIdx];
      const aligned = nextDef.prepareView
        ? nextDef.prepareView(completedCurrent.nextAppState)
        : completedCurrent.nextAppState;
      replaceEntireState(aligned);
      setPlayback({
        ...completedCurrent.nextPlayback,
        status: 'WAITING_FOR_USER',
        activeSceneIndex: nextIdx,
        stepPhase: 'explaining',
        practiceFeedback: null,
        checkpoints: {
          ...completedCurrent.nextPlayback.checkpoints,
          [nextIdx]: completedCurrent.nextAppState,
        },
      });
      return;
    }

    const result = advanceToNextFilteredScene(pb, stateRef.current);
    if (!result) return;
    replaceEntireState(result.nextAppState);
    setPlayback(result.nextPlayback);
    if (result.nextPlayback.status === 'COMPLETED') {
      setSummaryOpen(true);
    }
  }, [cancelActiveRun, replaceEntireState]);

  const previousScene = useCallback(() => {
    cancelActiveRun(true);
    setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
    const pb = playbackRef.current;
    const result = stepToPreviousFilteredScene(pb, stateRef.current);
    if (!result) return;
    replaceEntireState(result.nextAppState);
    setPlayback({
      ...result.nextPlayback,
      status: pb.learningMode === 'practice' ? 'WAITING_FOR_USER' : 'PAUSED',
    });
    setSummaryOpen(false);
  }, [cancelActiveRun, replaceEntireState]);

  const jumpToScene = useCallback(
    (index: number) => {
      cancelActiveRun(true);
      setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));
      const pb = playbackRef.current;
      const scenario = getScenarioById(pb.scenarioId);
      if (!scenario) return;

      if (pb.learningMode === 'practice') {
        const sourceBase = loadPreDemoBackup() || stateRef.current;
        const prep = prepareScenarioBeforeIndex(scenario, sourceBase, {
          startIndex: index,
          learningMode: 'practice',
          speed: pb.speed,
          filterMode: pb.filterMode,
          captionsEnabled: pb.captionsEnabled,
          narrationEnabled: pb.narrationEnabled,
        });
        replaceEntireState(prep.preStepAppState);
        setPlayback(prep.nextPlayback);
        setSummaryOpen(false);
        return;
      }

      const result = seekScenarioToIndex(pb, stateRef.current, index);
      if (!result) return;
      replaceEntireState(result.nextAppState);
      setPlayback(result.nextPlayback);
      setSummaryOpen(result.nextPlayback.status === 'COMPLETED');
    },
    [cancelActiveRun, replaceEntireState]
  );

  const setSpeed = useCallback((speed: DemoSpeed) => {
    playbackRef.current = { ...playbackRef.current, speed };
    setPlayback((prev) => ({ ...prev, speed }));
  }, []);

  const setFilterMode = useCallback((filterMode: DemoFilterMode) => {
    setPlayback((prev) => ({ ...prev, filterMode }));
  }, []);

  const setLearningMode = useCallback(
    (learningMode: DemoLearningMode) => {
      cancelActiveRun(true);
      setCursor((prev) => ({ ...prev, visible: false, clicking: false, typingPreview: null }));

      const current = playbackRef.current;
      const scenario = getScenarioById(current.scenarioId);
      if (!scenario) {
        setPlayback((prev) => ({ ...prev, learningMode }));
        return;
      }

      if (learningMode === 'practice') {
        const sourceBase = loadPreDemoBackup() || stateRef.current;
        const prep = prepareScenarioBeforeIndex(scenario, sourceBase, {
          startIndex: current.activeSceneIndex,
          learningMode: 'practice',
          speed: current.speed,
          filterMode: current.filterMode,
          captionsEnabled: current.captionsEnabled,
          narrationEnabled: current.narrationEnabled,
        });
        replaceEntireState(prep.preStepAppState);
        setPlayback(prep.nextPlayback);
        return;
      }

      setPlayback((prev) => ({
        ...prev,
        learningMode,
        status: prev.status === 'WAITING_FOR_USER' ? 'PLAYING' : prev.status,
        practiceFeedback: null,
      }));
    },
    [cancelActiveRun, replaceEntireState]
  );

  const toggleCaptions = useCallback(() => {
    setPlayback((prev) => ({ ...prev, captionsEnabled: !prev.captionsEnabled }));
  }, []);

  const toggleNarration = useCallback(() => {
    setPlayback((prev) => {
      const nextVal = !prev.narrationEnabled;
      playbackRef.current = { ...prev, narrationEnabled: nextVal };
      if (!nextVal) {
        controller.cancel('cancelled');
      }
      return { ...prev, narrationEnabled: nextVal };
    });
  }, [controller]);

  const openExitConfirm = useCallback(() => {
    pause();
    setExitConfirmOpen(true);
  }, [pause]);

  const cancelExitConfirm = useCallback(() => {
    setExitConfirmOpen(false);
  }, []);

  const exitDemo = useCallback(
    (choice: 'restore' | 'retain') => {
      cancelActiveRun(true);
      setCursor(INITIAL_CURSOR);
      if (choice === 'restore') {
        const backup = loadPreDemoBackup();
        if (backup) {
          replaceEntireState(backup);
        }
        notify('success', 'Exited Guided Demo Academy and restored pre-demo workspace snapshot.');
      } else {
        notify('info', 'Exited Guided Demo Academy and retained synthetic demo records for exploration.');
      }
      clearPreDemoBackup();
      setExitConfirmOpen(false);
      setSummaryOpen(false);
      setPlayback(createInitialPlaybackState());
    },
    [cancelActiveRun, notify, replaceEntireState]
  );

  const efficiencySummary = useMemo(
    () => computeWorkflowEfficiencyMetrics(state, playback, activeScenario?.patientId || undefined),
    [activeScenario?.patientId, playback, state]
  );

  // Browser verification handle for automated Playwright assertions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>).__eigenhDemo = {
      getStatus: () => ({
        playbackStatus: playbackRef.current.status,
        learningMode: playbackRef.current.learningMode,
        stepPhase: playbackRef.current.stepPhase,
        scenarioId: playbackRef.current.scenarioId,
        activeSceneIndex: playbackRef.current.activeSceneIndex,
        assertionCount: playbackRef.current.assertionLogs.length,
        allPassed: playbackRef.current.assertionLogs.every((a) => a.passed),
        errorMessage: playbackRef.current.errorMessage,
        practiceFeedback: playbackRef.current.practiceFeedback,
        patientCount: stateRef.current.patients.length,
        appointmentCount: stateRef.current.appointments.length,
        orderCount: stateRef.current.orders.length,
        labCount: stateRef.current.labResults.length,
        handoffCount: (stateRef.current.handoffs || []).length,
        currentRole: stateRef.current.currentRole,
        currentNav: stateRef.current.currentNav,
        selectedPatientId: stateRef.current.selectedPatientId,
        selectedPatientTab: stateRef.current.selectedPatientTab,
        narrationEnabled: playbackRef.current.narrationEnabled,
        narrationStatus: controller.getStatus(),
        activeProvider: controller.getActiveProvider(),
        selectedVoiceId: selectedVoiceIdRef.current,
        ttsNeuralConfigured: controller.neuralProvider.isAvailable(),
        activeCaptionText,
      }),
      getNarrationDiagnostics: () => controller.diagnostics.getEntries(),
      jumpToScene,
      startScenario,
      playOrResume,
      pause,
      showMeCurrentStep,
      setLearningMode,
      setSpeed,
      toggleNarration,
      previewVoice,
      restart,
      exitDemo,
    };
  }, [
    activeCaptionText,
    controller,
    exitDemo,
    jumpToScene,
    pause,
    playOrResume,
    previewVoice,
    restart,
    setLearningMode,
    setSpeed,
    showMeCurrentStep,
    startScenario,
    toggleNarration,
  ]);

  return (
    <DemoDirectorContext.Provider
      value={{
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
        narrationDiagnostics,
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
        setFilterMode,
        setLearningMode,
        toggleCaptions,
        toggleNarration,
        exitDemo,
      }}
    >
      {children}
    </DemoDirectorContext.Provider>
  );
};

export function useDemoDirector() {
  const ctx = useContext(DemoDirectorContext);
  if (!ctx) throw new Error('useDemoDirector must be used inside DemoDirectorProvider');
  return ctx;
}
