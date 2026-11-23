import type { AppState, StaffRole } from '../types/hms';
import { DEMO_PATIENT_ID } from './demoFixtures';
import { getScenarioById } from './demoScenarios';
import type {
  DemoEfficiencySummary,
  DemoFilterMode,
  DemoLearningMode,
  DemoPlaybackState,
  DemoRunAssertionLog,
  DemoScenarioDefinition,
  DemoSceneDefinition,
  DemoSpeed,
} from './demoTypes';

export const PRE_DEMO_BACKUP_KEY = 'eigenh_demo_pre_backup_v1';

export function createInitialPlaybackState(): DemoPlaybackState {
  return {
    status: 'IDLE',
    scenarioId: null,
    activeSceneIndex: 0,
    learningMode: 'watch',
    filterMode: 'full',
    speed: 1,
    captionsEnabled: true,
    narrationEnabled: false,
    errorMessage: null,
    practiceFeedback: null,
    stepPhase: 'explaining',
    assertionLogs: [],
    checkpoints: {},
    completedSnapshots: {},
    startedFromRole: null,
    baselineAuditCount: 0,
  };
}

/**
 * Computes paced scene delay in milliseconds. Speed affects ONLY presentation pacing,
 * never clinical timestamps or audit timestamps.
 */
export function computePacedDurationMs(baseDurationMs: number, speed: DemoSpeed): number {
  const safeSpeed = speed > 0 ? speed : 1;
  return Math.max(700, Math.round(baseDurationMs / safeSpeed));
}

export function matchesDemoFilter(
  scene: DemoSceneDefinition,
  filter: DemoFilterMode,
  learningMode: DemoLearningMode = 'watch'
): boolean {
  if (learningMode === 'executive' && scene.executiveInclude === false) {
    return false;
  }
  if (filter === 'full') return true;
  if (filter === 'ai-only') return scene.actorKind === 'ai';
  if (filter === 'human-only') return scene.actorKind === 'human';
  if (filter === 'handoffs') return scene.actorKind === 'handoff';
  return true;
}

export function getFilteredSceneIndices(
  scenario: DemoScenarioDefinition,
  filter: DemoFilterMode,
  learningMode: DemoLearningMode = 'watch'
): number[] {
  const indices: number[] = [];
  scenario.scenes.forEach((scene, idx) => {
    if (matchesDemoFilter(scene, filter, learningMode)) {
      indices.push(idx);
    }
  });
  return indices.length > 0 ? indices : scenario.scenes.map((_, i) => i);
}

export function findFirstSceneIndexForRole(
  scenario: DemoScenarioDefinition,
  role: StaffRole
): number {
  const idx = scenario.scenes.findIndex((s) => s.role === role);
  return idx >= 0 ? idx : 0;
}

export interface StepExecutionResult {
  nextAppState: AppState;
  nextPlayback: DemoPlaybackState;
  assertion: DemoRunAssertionLog;
}

/**
 * Prepares the deterministic pre-step state BEFORE `targetIndex` executes,
 * so the interactive browser UI engine can visibly operate real buttons/inputs
 * for `targetIndex` and then validate the resulting state.
 */
export function prepareScenarioBeforeIndex(
  scenario: DemoScenarioDefinition,
  currentAppState: AppState,
  options?: {
    startIndex?: number;
    startRole?: StaffRole | null;
    learningMode?: DemoLearningMode;
    speed?: DemoSpeed;
    filterMode?: DemoFilterMode;
    captionsEnabled?: boolean;
    narrationEnabled?: boolean;
    autoPlay?: boolean;
  }
): {
  preStepAppState: AppState;
  nextPlayback: DemoPlaybackState;
} {
  const preparedBase = scenario.prepareState(currentAppState);
  const baselineAuditCount = preparedBase.auditEvents.length;
  const learningMode = options?.learningMode ?? 'watch';
  const filterMode = options?.filterMode ?? 'full';

  let targetIndex = options?.startIndex ?? 0;
  if (options?.startRole) {
    targetIndex = findFirstSceneIndexForRole(scenario, options.startRole);
  }
  targetIndex = Math.max(0, Math.min(targetIndex, scenario.scenes.length - 1));

  const checkpoints: Record<number, AppState> = {};
  const completedSnapshots: Record<number, AppState> = {};
  const assertionLogs: DemoRunAssertionLog[] = [];

  let cursorState = preparedBase;
  for (let i = 0; i < targetIndex; i += 1) {
    checkpoints[i] = cursorState;
    const scene = scenario.scenes[i];
    const mutated = scene.execute(cursorState);
    const check = scene.validate(mutated);
    completedSnapshots[i] = mutated;
    assertionLogs.push({
      sceneId: scene.sceneId,
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      role: scene.role,
      actorKind: scene.actorKind,
      passed: check.passed,
      detail: check.detail,
      expectedMutation: scene.expectedMutation,
      executedAt: new Date().toISOString(),
    });
    cursorState = mutated;
  }

  checkpoints[targetIndex] = cursorState;
  const activeScene = scenario.scenes[targetIndex];
  const viewPrepared = activeScene.prepareView ? activeScene.prepareView(cursorState) : cursorState;

  const nextStatus =
    learningMode === 'practice'
      ? 'WAITING_FOR_USER'
      : options?.autoPlay === false
      ? 'PAUSED'
      : 'PLAYING';

  return {
    preStepAppState: viewPrepared,
    nextPlayback: {
      status: nextStatus,
      scenarioId: scenario.id,
      activeSceneIndex: targetIndex,
      learningMode,
      filterMode,
      speed: options?.speed ?? 1,
      captionsEnabled: options?.captionsEnabled ?? true,
      narrationEnabled: options?.narrationEnabled ?? false,
      errorMessage: null,
      practiceFeedback: null,
      stepPhase: 'explaining',
      assertionLogs,
      checkpoints,
      completedSnapshots,
      startedFromRole: options?.startRole ?? null,
      baselineAuditCount,
    },
  };
}

/**
 * Prepares a scenario cleanly and builds deterministic pre-execution checkpoints up to `startIndex`.
 * Executes scene `startIndex` immediately and validates its post-conditions.
 */
export function startScenarioAtIndex(
  scenario: DemoScenarioDefinition,
  currentAppState: AppState,
  options?: {
    startIndex?: number;
    startRole?: StaffRole | null;
    learningMode?: DemoLearningMode;
    speed?: DemoSpeed;
    filterMode?: DemoFilterMode;
    captionsEnabled?: boolean;
    narrationEnabled?: boolean;
    autoPlay?: boolean;
  }
): StepExecutionResult {
  const preparedBase = scenario.prepareState(currentAppState);
  const baselineAuditCount = preparedBase.auditEvents.length;
  const learningMode = options?.learningMode ?? 'watch';
  const filterMode = options?.filterMode ?? 'full';

  let targetIndex = options?.startIndex ?? 0;
  if (options?.startRole) {
    targetIndex = findFirstSceneIndexForRole(scenario, options.startRole);
  }
  targetIndex = Math.max(0, Math.min(targetIndex, scenario.scenes.length - 1));

  const checkpoints: Record<number, AppState> = {};
  const completedSnapshots: Record<number, AppState> = {};
  const assertionLogs: DemoRunAssertionLog[] = [];

  let cursorState = preparedBase;
  for (let i = 0; i <= targetIndex; i += 1) {
    checkpoints[i] = cursorState;
    const scene = scenario.scenes[i];
    const mutated = scene.execute(cursorState);
    const check = scene.validate(mutated);
    completedSnapshots[i] = mutated;
    assertionLogs.push({
      sceneId: scene.sceneId,
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      role: scene.role,
      actorKind: scene.actorKind,
      passed: check.passed,
      detail: check.detail,
      expectedMutation: scene.expectedMutation,
      executedAt: new Date().toISOString(),
    });
    cursorState = mutated;
    if (!check.passed) {
      return {
        nextAppState: cursorState,
        nextPlayback: {
          status: 'FAILED',
          scenarioId: scenario.id,
          activeSceneIndex: i,
          learningMode,
          filterMode,
          speed: options?.speed ?? 1,
          captionsEnabled: options?.captionsEnabled ?? true,
          narrationEnabled: options?.narrationEnabled ?? false,
          errorMessage: `Step ${scene.sceneNumber} (${scene.title}) validation failed: ${check.detail}`,
          practiceFeedback: null,
          stepPhase: 'completed-step',
          assertionLogs,
          checkpoints,
          completedSnapshots,
          startedFromRole: options?.startRole ?? null,
          baselineAuditCount,
        },
        assertion: assertionLogs[assertionLogs.length - 1],
      };
    }
  }

  const isLastScene = targetIndex === scenario.scenes.length - 1;
  const allPassed = assertionLogs.every((a) => a.passed);

  return {
    nextAppState: cursorState,
    nextPlayback: {
      status: isLastScene && allPassed ? 'COMPLETED' : options?.autoPlay === false ? 'PAUSED' : 'PLAYING',
      scenarioId: scenario.id,
      activeSceneIndex: targetIndex,
      learningMode,
      filterMode,
      speed: options?.speed ?? 1,
      captionsEnabled: options?.captionsEnabled ?? true,
      narrationEnabled: options?.narrationEnabled ?? false,
      errorMessage: null,
      practiceFeedback: null,
      stepPhase: 'completed-step',
      assertionLogs,
      checkpoints,
      completedSnapshots,
      startedFromRole: options?.startRole ?? null,
      baselineAuditCount,
    },
    assertion: assertionLogs[assertionLogs.length - 1],
  };
}

/**
 * Deterministic seek/step to any scene index `targetIndex` within the active scenario.
 * Uses saved checkpoints when seeking backward (never attempting fragile inverse mutations),
 * and executes real scenes sequentially when moving forward.
 */
export function seekScenarioToIndex(
  playback: DemoPlaybackState,
  currentAppState: AppState,
  targetIndex: number,
  options?: { keepStatus?: boolean }
): StepExecutionResult | null {
  const scenario = getScenarioById(playback.scenarioId);
  if (!scenario) return null;

  const clamped = Math.max(0, Math.min(targetIndex, scenario.scenes.length - 1));
  const checkpoints = { ...playback.checkpoints };
  const completedSnapshots = { ...playback.completedSnapshots };

  let seedIndex = clamped;
  while (seedIndex > 0 && !checkpoints[seedIndex] && !completedSnapshots[seedIndex - 1]) {
    seedIndex -= 1;
  }

  let cursorState: AppState;
  if (checkpoints[seedIndex]) {
    cursorState = checkpoints[seedIndex];
  } else if (seedIndex > 0 && completedSnapshots[seedIndex - 1]) {
    cursorState = completedSnapshots[seedIndex - 1];
  } else {
    cursorState = scenario.prepareState(currentAppState);
    seedIndex = 0;
  }

  const nextLogs = playback.assertionLogs.filter((l) => l.sceneNumber < seedIndex + 1);

  for (let i = seedIndex; i <= clamped; i += 1) {
    checkpoints[i] = cursorState;
    const scene = scenario.scenes[i];
    const mutated = scene.execute(cursorState);
    const check = scene.validate(mutated);
    completedSnapshots[i] = mutated;

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

    const existingPos = nextLogs.findIndex((x) => x.sceneId === scene.sceneId);
    if (existingPos >= 0) nextLogs[existingPos] = logEntry;
    else nextLogs.push(logEntry);

    cursorState = mutated;
    if (!check.passed) {
      return {
        nextAppState: cursorState,
        nextPlayback: {
          ...playback,
          status: 'FAILED',
          activeSceneIndex: i,
          errorMessage: `Step ${scene.sceneNumber} (${scene.title}) failed assertion: ${check.detail}`,
          practiceFeedback: null,
          stepPhase: 'completed-step',
          assertionLogs: nextLogs,
          checkpoints,
          completedSnapshots,
        },
        assertion: logEntry,
      };
    }
  }

  const prunedLogs = nextLogs.filter((l) => l.sceneNumber <= clamped + 1);
  const isLastScene = clamped === scenario.scenes.length - 1;
  const allRunPassed = prunedLogs.length === scenario.scenes.length && prunedLogs.every((l) => l.passed);

  let nextStatus = playback.status;
  if (isLastScene && allRunPassed) {
    nextStatus = 'COMPLETED';
  } else if (!options?.keepStatus && playback.status === 'COMPLETED') {
    nextStatus = 'PAUSED';
  } else if (playback.status === 'FAILED') {
    nextStatus = 'PAUSED';
  }

  return {
    nextAppState: cursorState,
    nextPlayback: {
      ...playback,
      status: nextStatus,
      activeSceneIndex: clamped,
      errorMessage: null,
      practiceFeedback: null,
      stepPhase: 'completed-step',
      assertionLogs: prunedLogs,
      checkpoints,
      completedSnapshots,
    },
    assertion: prunedLogs[prunedLogs.length - 1],
  };
}

/**
 * Advances to the next scene matching the active filter & learning mode.
 * Intermediate skipped scenes are STILL executed deterministically so real state stays consistent.
 */
export function advanceToNextFilteredScene(
  playback: DemoPlaybackState,
  currentAppState: AppState
): StepExecutionResult | null {
  const scenario = getScenarioById(playback.scenarioId);
  if (!scenario) return null;

  const matching = getFilteredSceneIndices(scenario, playback.filterMode, playback.learningMode);
  const nextMatching = matching.find((idx) => idx > playback.activeSceneIndex);
  if (nextMatching === undefined) {
    if (playback.activeSceneIndex < scenario.scenes.length - 1) {
      return seekScenarioToIndex(playback, currentAppState, scenario.scenes.length - 1, { keepStatus: true });
    }
    return {
      nextAppState: currentAppState,
      nextPlayback: {
        ...playback,
        status: playback.assertionLogs.every((l) => l.passed) ? 'COMPLETED' : 'FAILED',
      },
      assertion: playback.assertionLogs[playback.assertionLogs.length - 1],
    };
  }

  return seekScenarioToIndex(playback, currentAppState, nextMatching, { keepStatus: true });
}

export function stepToPreviousFilteredScene(
  playback: DemoPlaybackState,
  currentAppState: AppState
): StepExecutionResult | null {
  const scenario = getScenarioById(playback.scenarioId);
  if (!scenario) return null;

  const matching = getFilteredSceneIndices(scenario, playback.filterMode, playback.learningMode);
  const prevCandidates = matching.filter((idx) => idx < playback.activeSceneIndex);
  const target = prevCandidates.length > 0 ? prevCandidates[prevCandidates.length - 1] : 0;

  return seekScenarioToIndex(
    { ...playback, status: playback.status === 'PLAYING' ? 'PAUSED' : playback.status },
    currentAppState,
    target
  );
}

/**
 * Executes an entire scenario synchronously from scene 0 to the last scene.
 * Useful for automated verification and replay idempotency testing.
 */
export function runEntireScenarioSync(
  scenario: DemoScenarioDefinition,
  baseState: AppState
): StepExecutionResult {
  return startScenarioAtIndex(scenario, baseState, {
    startIndex: scenario.scenes.length - 1,
    autoPlay: false,
  });
}

/**
 * Measures concrete, verifiable workflow counts from the actual resulting EHR state.
 * Never fabricates productivity percentages or unmeasured time-savings numbers.
 */
export function computeWorkflowEfficiencyMetrics(
  state: AppState,
  playback: DemoPlaybackState,
  patientId = DEMO_PATIENT_ID
): DemoEfficiencySummary {
  const intakes = (state.preVisitIntakes || []).filter((i) => i.patientId === patientId);
  const extracted = intakes.flatMap((i) => i.extractedItems);
  const verifiedIntakeItems = extracted.filter((x) => x.verified).length;
  const handoffs = (state.handoffs || []).filter((h) => h.patientId === patientId);
  const scribeSessions = (state.scribeSessions || []).filter((s) => s.patientId === patientId);
  const approvedActions = scribeSessions
    .flatMap((s) => s.proposedActions)
    .filter((a) => a.status === 'Completed').length;

  const demoAudits = state.auditEvents.filter((a) => a.id.startsWith('aud-demo-')).length;

  return {
    totalScenesExecuted: playback.assertionLogs.length,
    passedAssertions: playback.assertionLogs.filter((l) => l.passed).length,
    aiDraftSteps: playback.assertionLogs.filter((l) => l.actorKind === 'ai').length,
    humanVerifiedSteps: playback.assertionLogs.filter((l) => l.actorKind === 'human').length,
    roleHandoffsRecorded: handoffs.length,
    prePopulatedIntakeItems: extracted.length,
    verifiedIntakeItems,
    approvedClinicalActions: approvedActions,
    auditEventsGenerated: demoAudits,
    manualReEntryFieldsEliminated: verifiedIntakeItems + approvedActions,
    methodologyNote:
      'All counts are directly measured from actual synthetic records created or verified during this demo run. No unmeasured time-savings percentages are claimed.',
  };
}

// LocalStorage backup/restore helpers for clean isolated Demo Workspace
export function savePreDemoBackup(state: AppState): void {
  try {
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(PRE_DEMO_BACKUP_KEY)) {
      localStorage.setItem(PRE_DEMO_BACKUP_KEY, JSON.stringify({ ...state, unsavedDirty: false }));
    }
  } catch {
    // ignore storage errors
  }
}

export function loadPreDemoBackup(): AppState | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PRE_DEMO_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (parsed && Array.isArray(parsed.patients)) return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function clearPreDemoBackup(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PRE_DEMO_BACKUP_KEY);
    }
  } catch {
    // ignore
  }
}
