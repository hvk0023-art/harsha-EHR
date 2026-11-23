import type { AppState, PatientTabKey, StaffNavKey, StaffRole } from '../types/hms';

export type PlaybackStatus =
  | 'IDLE'
  | 'PREPARING'
  | 'PLAYING'
  | 'PAUSED'
  | 'WAITING_FOR_USER'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type DemoSpeed = 0.5 | 1 | 1.5 | 2;

export type DemoLearningMode = 'watch' | 'practice' | 'executive';

export type DemoFilterMode = 'full' | 'ai-only' | 'human-only' | 'handoffs';

export type DemoCategory =
  | 'Complete Patient Journeys'
  | 'Role-Based Workflows'
  | 'AI-Native Clinical Capabilities'
  | 'Safety and Exception Scenarios';

export type DemoActorKind = 'ai' | 'human' | 'handoff';

export type WorkClassification =
  | 'Manual entry'
  | 'AI-prepared'
  | 'Human verification required'
  | 'Human approved'
  | 'Simulated action'
  | 'Completed action';

export type DemoUiActionKind = 'click' | 'type' | 'ai-autofill' | 'select' | 'review';

export interface DemoUiAction {
  kind: DemoUiActionKind;
  /** Matches [data-demo-target="..."] if plain token, or CSS selector if starting with # . [ */
  target: string;
  /** Value for 'type', 'ai-autofill', or 'select' */
  value?: string;
  /** If true, append value to existing field text instead of replacing */
  append?: boolean;
  /** Source label displayed during AI-prepared autofill */
  sourceLabel?: string;
  /** Delay before clicking/typing after cursor arrives (ms at 1x) */
  pauseBeforeMs?: number;
  /** Delay after action executes (ms at 1x) */
  pauseAfterMs?: number;
  /** If true, halts with an honest diagnostic error if target DOM node is missing */
  requiredTarget?: boolean;
}

export interface DemoSceneAssertionResult {
  passed: boolean;
  detail: string;
}

export interface DemoSceneDefinition {
  sceneId: string;
  sceneNumber: number;
  title: string;
  role: StaffRole;
  screenLabel?: string;
  actorDisplay: string;
  actorKind: DemoActorKind;
  classification?: WorkClassification;
  routeNav: StaffNavKey;
  patientId: string | null;
  patientTab?: PatientTabKey;
  /** Primary visual element to glide tutorial cursor to and highlight */
  visualTarget?: string;
  /** Declarative real-DOM interactions executed in browser Watch/Executive/Show-Me modes */
  uiActions?: DemoUiAction[];
  /** Trainer explanation displayed before / during the step */
  caption: string;
  /** Authoritative spoken trainer narration script (captions synchronize with this text) */
  narration: string;
  /** Concise natural script for Executive Demo mode (avoids unnatural audio speed-up) */
  executiveNarration?: string;
  /** Explanation of what happened right after the control was operated */
  explanationAfter?: string;
  /** Short preview of the next step shown in the trainer console */
  nextStepPreview?: string;
  /** Specific hint shown to the learner in Guided Practice mode */
  practiceHint?: string;
  /** Whether Executive Demo mode includes this step directly (false = fast checkpoint sync) */
  executiveInclude?: boolean;
  durationMs: number;
  expectedMutation: string;
  isSimulatedApproval?: boolean;
  /** Optional pre-step navigation/role alignment before executing real UI actions */
  prepareView?: (state: AppState) => AppState;
  /** Deterministic state execution / synchronization for unit tests, seeking, and checkpoints */
  execute: (state: AppState) => AppState;
  validate: (state: AppState) => DemoSceneAssertionResult;
}

export interface DemoScenarioDefinition {
  id: string;
  number: string;
  category: DemoCategory;
  title: string;
  subtitle: string;
  description: string;
  primaryRole: StaffRole;
  participatingRoles: StaffRole[];
  valueStatement: string;
  status: 'Ready' | 'Planned';
  flagship?: boolean;
  isRoleTutorial?: boolean;
  patientId: string | null;
  prepareState: (baseState: AppState) => AppState;
  scenes: DemoSceneDefinition[];
}

export interface RoleTutorialMeta {
  roleKey: string;
  scenarioId: string;
  roleTitle: string;
  staffRole: StaffRole;
  actorExample: string;
  whatTheyDo: string;
  whereWorkStarts: string;
  mainSteps: string[];
  aiAssistsWith: string;
  humanDecisionsRequired: string;
  afterFinish: string;
  readiness: 'Verified working' | 'Implemented' | 'Planned';
  referenceTutorial?: boolean;
  highlightBadge?: string;
}

export interface DemoRunAssertionLog {
  sceneId: string;
  sceneNumber: number;
  title: string;
  role: StaffRole;
  actorKind: DemoActorKind;
  passed: boolean;
  detail: string;
  expectedMutation: string;
  executedAt: string;
}

export interface DemoEfficiencySummary {
  totalScenesExecuted: number;
  passedAssertions: number;
  aiDraftSteps: number;
  humanVerifiedSteps: number;
  roleHandoffsRecorded: number;
  prePopulatedIntakeItems: number;
  verifiedIntakeItems: number;
  approvedClinicalActions: number;
  auditEventsGenerated: number;
  manualReEntryFieldsEliminated: number;
  methodologyNote: string;
}

export interface CursorOverlayState {
  visible: boolean;
  x: number;
  y: number;
  clicking: boolean;
  clickSeq: number;
  label: string;
  classification: WorkClassification | null;
  activeTargetSelector: string | null;
  isAiAutofill: boolean;
  typingPreview: string | null;
}

export interface DemoPlaybackState {
  status: PlaybackStatus;
  scenarioId: string | null;
  activeSceneIndex: number;
  learningMode: DemoLearningMode;
  filterMode: DemoFilterMode;
  speed: DemoSpeed;
  captionsEnabled: boolean;
  narrationEnabled: boolean;
  errorMessage: string | null;
  practiceFeedback: string | null;
  stepPhase: 'explaining' | 'acting' | 'completed-step';
  assertionLogs: DemoRunAssertionLog[];
  checkpoints: Record<number, AppState>;
  completedSnapshots: Record<number, AppState>;
  startedFromRole: StaffRole | null;
  baselineAuditCount: number;
}
