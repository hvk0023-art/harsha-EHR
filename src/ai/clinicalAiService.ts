import type { AppState, StaffRole } from '../types/hms';
import {
  CLINICAL_AI_PROMPT_VERSION,
  CLINICAL_AI_SAFETY_BOUNDARIES,
  CLINICAL_AI_SCHEMA_VERSION,
  DEFAULT_CLINICAL_AI_FLAGS,
  type AIProvenanceRecord,
  type ActionComposerInput,
  type ActionComposerOutput,
  type AmbientScribeV2Input,
  type AmbientScribeV2Output,
  type ChartSearchOutput,
  type ClinicalAIExecutionMode,
  type ClinicalAIFeatureFlags,
  type ClinicalAIOperation,
  type ClinicalAIResponse,
  type ClinicalAIStatus,
  type DocumentIntelligenceInput,
  type DocumentIntelligenceOutput,
  type PreConsultationBriefOutput,
} from './clinicalAiTypes';
import {
  executeDeterministicChartSearch,
  planChartQuery,
  runDeterministicActionComposer,
  runDeterministicAmbientScribeV2,
  runDeterministicDocumentIntelligence,
  runDeterministicPreConsultationBrief,
} from './deterministicClinicalAi';
import { buildPermittedPatientContext, resolveGroundedSources } from './patientContextBuilder';

const FLAGS_STORAGE_KEY = 'eigenh_clinical_ai_flags_v1';
const PROVENANCE_STORAGE_KEY = 'eigenh_clinical_ai_provenance_v1';

export function loadClinicalAiFeatureFlags(): ClinicalAIFeatureFlags {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_CLINICAL_AI_FLAGS;
    const raw = localStorage.getItem(FLAGS_STORAGE_KEY);
    if (!raw) return DEFAULT_CLINICAL_AI_FLAGS;
    const parsed = JSON.parse(raw) as Partial<ClinicalAIFeatureFlags>;
    return {
      executionMode:
        parsed.executionMode === 'live-ai' || parsed.executionMode === 'deterministic-demo'
          ? parsed.executionMode
          : DEFAULT_CLINICAL_AI_FLAGS.executionMode,
      documentIntelligence:
        typeof parsed.documentIntelligence === 'boolean' ? parsed.documentIntelligence : true,
      preConsultationBrief:
        typeof parsed.preConsultationBrief === 'boolean' ? parsed.preConsultationBrief : true,
      chartSearch: typeof parsed.chartSearch === 'boolean' ? parsed.chartSearch : true,
      ambientScribeV2: typeof parsed.ambientScribeV2 === 'boolean' ? parsed.ambientScribeV2 : true,
      actionComposer: typeof parsed.actionComposer === 'boolean' ? parsed.actionComposer : true,
    };
  } catch {
    return DEFAULT_CLINICAL_AI_FLAGS;
  }
}

export function saveClinicalAiFeatureFlags(flags: ClinicalAIFeatureFlags): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FLAGS_STORAGE_KEY, JSON.stringify(flags));
    }
  } catch {
    // ignore storage errors
  }
}

export function isOperationEnabled(flags: ClinicalAIFeatureFlags, op: ClinicalAIOperation): boolean {
  switch (op) {
    case 'document-intelligence':
      return flags.documentIntelligence;
    case 'pre-consultation-brief':
      return flags.preConsultationBrief;
    case 'chart-search':
      return flags.chartSearch;
    case 'ambient-scribe-v2':
      return flags.ambientScribeV2;
    case 'action-composer':
      return flags.actionComposer;
  }
}

/**
 * Lightweight in-memory + localStorage AIActionAuditService storing structured
 * Phase 2 provenance records without bloating AppState persistence.
 */
class ClinicalAiProvenanceStore {
  private records: AIProvenanceRecord[] = [];
  private executedIdempotencyKeys = new Set<string>();
  private listeners = new Set<() => void>();

  constructor() {
    this.hydrate();
  }

  private hydrate(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(PROVENANCE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.records = parsed.slice(0, 80);
      }
    } catch {
      // ignore
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PROVENANCE_STORAGE_KEY, JSON.stringify(this.records.slice(0, 80)));
      }
    } catch {
      // ignore
    }
    for (const l of this.listeners) l();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  list(patientId?: string): AIProvenanceRecord[] {
    if (!patientId) return this.records;
    return this.records.filter((r) => !r.patientId || r.patientId === patientId);
  }

  record(entry: AIProvenanceRecord): void {
    this.records = [entry, ...this.records.filter((r) => r.requestId !== entry.requestId)].slice(0, 80);
    this.persist();
  }

  updateReview(
    requestId: string,
    patch: Partial<Pick<AIProvenanceRecord, 'reviewState' | 'humanReviewDecision' | 'resultingRecordIds'>>
  ): void {
    this.records = this.records.map((r) =>
      r.requestId === requestId
        ? {
            ...r,
            ...patch,
            resultingRecordIds: patch.resultingRecordIds
              ? Array.from(new Set([...r.resultingRecordIds, ...patch.resultingRecordIds]))
              : r.resultingRecordIds,
          }
        : r
    );
    this.persist();
  }

  hasCommittedIdempotencyKey(key: string): boolean {
    return this.executedIdempotencyKeys.has(key);
  }

  markCommittedIdempotencyKey(key: string): void {
    this.executedIdempotencyKeys.add(key);
  }

  reset(): void {
    this.records = [];
    this.executedIdempotencyKeys.clear();
    this.persist();
  }
}

export const clinicalAiAuditService = new ClinicalAiProvenanceStore();

let cachedStatus: ClinicalAIStatus | null = null;

export async function fetchClinicalAiStatus(forceRefresh = false): Promise<ClinicalAIStatus> {
  if (cachedStatus && !forceRefresh) return cachedStatus;
  try {
    const res = await fetch('/api/clinical-ai/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ClinicalAIStatus;
    cachedStatus = data;
    return data;
  } catch {
    return {
      configured: false,
      provider: 'none',
      model: 'gemini-4-hydrogen',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      syntheticOnly: true,
      supportedOperations: [
        'document-intelligence',
        'pre-consultation-brief',
        'chart-search',
        'ambient-scribe-v2',
        'action-composer',
      ],
      missingReason: 'Clinical AI status endpoint unreachable; Deterministic Demo mode remains available.',
    };
  }
}

function makeRequestId(op: ClinicalAIOperation): string {
  return `cai-${op}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function disabledResponse<T>(
  op: ClinicalAIOperation,
  mode: ClinicalAIExecutionMode,
  requestId: string,
  idempotencyKey: string
): ClinicalAIResponse<T> {
  return {
    ok: false,
    requestId,
    idempotencyKey,
    operation: op,
    executionMode: mode,
    modelId: mode === 'live-ai' ? 'gemini-4-hydrogen' : 'eigenh-deterministic-rules-v2',
    promptVersion: CLINICAL_AI_PROMPT_VERSION,
    schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
    status: 'Unavailable',
    latencyMs: 0,
    timestamp: new Date().toISOString(),
    safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
    humanReviewState: 'Draft — Review Required',
    inputSourceIds: [],
    warnings: [],
    error: {
      code: 'FEATURE_DISABLED',
      message: `Clinical AI capability "${op}" is currently disabled by runtime feature flag.`,
      retryable: false,
    },
  };
}

function accessDeniedResponse<T>(
  op: ClinicalAIOperation,
  mode: ClinicalAIExecutionMode,
  requestId: string,
  idempotencyKey: string,
  message: string
): ClinicalAIResponse<T> {
  return {
    ok: false,
    requestId,
    idempotencyKey,
    operation: op,
    executionMode: mode,
    modelId: mode === 'live-ai' ? 'gemini-4-hydrogen' : 'eigenh-deterministic-rules-v2',
    promptVersion: CLINICAL_AI_PROMPT_VERSION,
    schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
    status: 'Access Denied',
    latencyMs: 0,
    timestamp: new Date().toISOString(),
    safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
    humanReviewState: 'Draft — Review Required',
    inputSourceIds: [],
    warnings: [],
    error: {
      code: 'ACCESS_DENIED',
      message,
      retryable: false,
    },
  };
}

async function postLiveClinicalAi<T>(payload: {
  requestId: string;
  idempotencyKey: string;
  operation: ClinicalAIOperation;
  input: Record<string, unknown>;
}): Promise<ClinicalAIResponse<T>> {
  const startedAt = Date.now();
  try {
    const res = await fetch('/api/clinical-ai/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: payload.requestId,
        idempotencyKey: payload.idempotencyKey,
        operation: payload.operation,
        syntheticOnly: true,
        input: payload.input,
      }),
    });
    const parsed = (await res.json()) as ClinicalAIResponse<T>;
    return parsed;
  } catch (err) {
    return {
      ok: false,
      requestId: payload.requestId,
      idempotencyKey: payload.idempotencyKey,
      operation: payload.operation,
      executionMode: 'live-ai',
      modelId: 'gemini-4-hydrogen',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Unavailable',
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: [],
      warnings: [],
      error: {
        code: 'LIVE_AI_ERROR',
        message:
          err instanceof Error
            ? `Unable to reach Clinical AI server endpoint: ${err.message}`
            : 'Unable to reach Clinical AI server endpoint.',
        retryable: true,
      },
    };
  }
}

function logProvenance(
  state: AppState,
  response: ClinicalAIResponse<unknown>,
  params: { patientId?: string; encounterId?: string }
): void {
  const actor = state.staff.find((s) => s.id === state.currentUserId)?.name || 'Prototype User';
  clinicalAiAuditService.record({
    id: `prov-${response.requestId}`,
    requestId: response.requestId,
    idempotencyKey: response.idempotencyKey,
    operation: response.operation,
    executionMode: response.executionMode,
    patientId: params.patientId,
    encounterId: params.encounterId,
    facilityId: state.currentFacilityId,
    actorRole: state.currentRole,
    actorName: actor,
    inputSourceIds: response.inputSourceIds,
    modelId: response.modelId,
    promptVersion: response.promptVersion,
    schemaVersion: response.schemaVersion,
    timestamp: response.timestamp,
    latencyMs: response.latencyMs,
    reviewState: response.humanReviewState,
    resultingRecordIds: [],
    errorCode: response.error?.code,
    errorMessage: response.error?.message,
  });
}

// ============================================================================
// PUBLIC REUSABLE CLINICAL AI OPERATIONS
// ============================================================================

export async function analyzeDocumentWithClinicalAi(
  state: AppState,
  input: DocumentIntelligenceInput,
  options?: { modeOverride?: ClinicalAIExecutionMode; flags?: ClinicalAIFeatureFlags }
): Promise<ClinicalAIResponse<DocumentIntelligenceOutput>> {
  const flags = options?.flags || loadClinicalAiFeatureFlags();
  const mode = options?.modeOverride || flags.executionMode;
  const requestId = makeRequestId('document-intelligence');
  const idempotencyKey = `doc-intel:${input.documentId}:${mode}`;

  if (!isOperationEnabled(flags, 'document-intelligence')) {
    return disabledResponse('document-intelligence', mode, requestId, idempotencyKey);
  }

  if (mode === 'deterministic-demo') {
    const started = Date.now();
    const data = runDeterministicDocumentIntelligence(input);
    const resp: ClinicalAIResponse<DocumentIntelligenceOutput> = {
      ok: true,
      requestId,
      idempotencyKey,
      operation: 'document-intelligence',
      executionMode: 'deterministic-demo',
      modelId: 'eigenh-deterministic-rules-v2',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Draft Ready',
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: [input.documentId],
      warnings: [],
      data,
    };
    logProvenance(state, resp, { patientId: input.expectedPatientContext?.patientId });
    return resp;
  }

  const resp = await postLiveClinicalAi<DocumentIntelligenceOutput>({
    requestId,
    idempotencyKey,
    operation: 'document-intelligence',
    input: {
      documentId: input.documentId,
      title: input.title,
      sourceOrganization: input.sourceOrganization,
      documentDate: input.documentDate,
      rawText: input.rawText,
    },
  });
  logProvenance(state, resp, { patientId: input.expectedPatientContext?.patientId });
  return resp;
}

export async function preparePreConsultationBriefWithClinicalAi(
  state: AppState,
  patientId: string,
  options?: { modeOverride?: ClinicalAIExecutionMode; flags?: ClinicalAIFeatureFlags }
): Promise<ClinicalAIResponse<PreConsultationBriefOutput>> {
  const flags = options?.flags || loadClinicalAiFeatureFlags();
  const mode = options?.modeOverride || flags.executionMode;
  const requestId = makeRequestId('pre-consultation-brief');
  const idempotencyKey = `pre-brief:${patientId}:${mode}`;

  if (!isOperationEnabled(flags, 'pre-consultation-brief')) {
    return disabledResponse('pre-consultation-brief', mode, requestId, idempotencyKey);
  }

  const ctxResult = buildPermittedPatientContext(state, {
    patientId,
    role: state.currentRole,
    userId: state.currentUserId,
    facilityId: state.currentFacilityId,
  });

  if (!ctxResult.ok) {
    const denied = accessDeniedResponse<PreConsultationBriefOutput>(
      'pre-consultation-brief',
      mode,
      requestId,
      idempotencyKey,
      ctxResult.error
    );
    logProvenance(state, denied, { patientId });
    return denied;
  }

  const ctx = ctxResult.context;

  if (mode === 'deterministic-demo') {
    const started = Date.now();
    const data = runDeterministicPreConsultationBrief(ctx);
    const resp: ClinicalAIResponse<PreConsultationBriefOutput> = {
      ok: true,
      requestId,
      idempotencyKey,
      operation: 'pre-consultation-brief',
      executionMode: 'deterministic-demo',
      modelId: 'eigenh-deterministic-rules-v2',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Draft Ready',
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: ctx.allowedSourceIds,
      warnings: [],
      data,
    };
    logProvenance(state, resp, { patientId });
    return resp;
  }

  const resp = await postLiveClinicalAi<PreConsultationBriefOutput>({
    requestId,
    idempotencyKey,
    operation: 'pre-consultation-brief',
    input: {
      patientId,
      patientContextJson: ctx.contextSummaryJson,
      allowedSourceIds: ctx.allowedSourceIds,
      hasRecordedAllergies: ctx.patient.allergies.length > 0,
    },
  });
  logProvenance(state, resp, { patientId });
  return resp;
}

export async function askEigenHChartSearch(
  state: AppState,
  patientId: string,
  question: string,
  options?: {
    modeOverride?: ClinicalAIExecutionMode;
    flags?: ClinicalAIFeatureFlags;
    actorOverride?: { role: StaffRole; userId: string; facilityId: string };
  }
): Promise<ClinicalAIResponse<ChartSearchOutput>> {
  const flags = options?.flags || loadClinicalAiFeatureFlags();
  const mode = options?.modeOverride || flags.executionMode;
  const requestId = makeRequestId('chart-search');
  const idempotencyKey = `chart-search:${patientId}:${question.trim().toLowerCase().slice(0, 60)}`;

  if (!isOperationEnabled(flags, 'chart-search')) {
    return disabledResponse('chart-search', mode, requestId, idempotencyKey);
  }

  const ctxResult = buildPermittedPatientContext(state, {
    patientId,
    role: options?.actorOverride?.role || state.currentRole,
    userId: options?.actorOverride?.userId || state.currentUserId,
    facilityId: options?.actorOverride?.facilityId || state.currentFacilityId,
  });

  if (!ctxResult.ok) {
    const denied = accessDeniedResponse<ChartSearchOutput>(
      'chart-search',
      mode,
      requestId,
      idempotencyKey,
      ctxResult.error
    );
    logProvenance(state, denied, { patientId });
    return denied;
  }

  const ctx = ctxResult.context;
  const plan = planChartQuery(question);
  const started = Date.now();

  // Structured queries & unsupported queries ALWAYS execute deterministically from EHR state
  // so numerical clinical values are NEVER invented by an LLM.
  if (plan.strategy !== 'grounded-narrative' || mode === 'deterministic-demo') {
    const data = executeDeterministicChartSearch(ctx, question);
    const resp: ClinicalAIResponse<ChartSearchOutput> = {
      ok: true,
      requestId,
      idempotencyKey,
      operation: 'chart-search',
      executionMode: mode === 'live-ai' && plan.strategy === 'deterministic-structured' ? 'deterministic-demo' : mode,
      modelId:
        plan.strategy === 'deterministic-structured'
          ? 'eigenh-deterministic-query-engine-v2'
          : 'eigenh-deterministic-rules-v2',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Draft Ready',
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: data.sources.map((s) => s.sourceId),
      warnings:
        plan.strategy === 'deterministic-structured'
          ? ['Structured numerical chart values computed deterministically from permitted EHR records (no LLM numeric fabrication).']
          : [],
      data,
    };
    logProvenance(state, resp, { patientId });
    return resp;
  }

  // Narrative question in Live AI mode -> call server Gemini with strict source grounding
  const liveResp = await postLiveClinicalAi<{
    answer: string;
    sourceIds: string[];
    incompleteOrMissingNote?: string;
  }>({
    requestId,
    idempotencyKey,
    operation: 'chart-search',
    input: {
      patientId,
      question,
      patientContextJson: ctx.contextSummaryJson,
      allowedSourceIds: ctx.allowedSourceIds,
    },
  });

  if (!liveResp.ok || !liveResp.data) {
    const failedResp: ClinicalAIResponse<ChartSearchOutput> = {
      ...liveResp,
      data: undefined,
    };
    logProvenance(state, failedResp, { patientId });
    return failedResp;
  }

  const { resolved, ungroundedIds } = resolveGroundedSources(liveResp.data.sourceIds, ctx.sourceCatalog);
  const deterministicTable = executeDeterministicChartSearch(ctx, question).table;
  const output: ChartSearchOutput = {
    question,
    queryPlan: plan,
    answer: liveResp.data.answer,
    incompleteOrMissingNote: liveResp.data.incompleteOrMissingNote,
    sources: resolved.length > 0 ? resolved : [ctx.sourceCatalog[ctx.patient.id]].filter(Boolean),
    table: deterministicTable,
    narrativeGroundedByModel: true,
  };

  const finalResp: ClinicalAIResponse<ChartSearchOutput> = {
    ...liveResp,
    warnings: [
      ...liveResp.warnings,
      ...ungroundedIds.map((id) => `Dropped ungrounded source reference "${id}".`),
    ],
    inputSourceIds: output.sources.map((s) => s.sourceId),
    data: output,
  };
  logProvenance(state, finalResp, { patientId });
  return finalResp;
}

export async function generateAmbientScribeV2WithClinicalAi(
  state: AppState,
  params: { patientId: string; encounterId: string; transcript: string; draftVersion: number },
  options?: { modeOverride?: ClinicalAIExecutionMode; flags?: ClinicalAIFeatureFlags }
): Promise<ClinicalAIResponse<AmbientScribeV2Output>> {
  const flags = options?.flags || loadClinicalAiFeatureFlags();
  const mode = options?.modeOverride || flags.executionMode;
  const requestId = makeRequestId('ambient-scribe-v2');
  const idempotencyKey = `scribe-v2:${params.encounterId}:v${params.draftVersion}:${mode}`;

  if (!isOperationEnabled(flags, 'ambient-scribe-v2')) {
    return disabledResponse('ambient-scribe-v2', mode, requestId, idempotencyKey);
  }

  const ctxResult = buildPermittedPatientContext(state, {
    patientId: params.patientId,
    role: state.currentRole,
    userId: state.currentUserId,
    facilityId: state.currentFacilityId,
  });

  if (!ctxResult.ok) {
    const denied = accessDeniedResponse<AmbientScribeV2Output>(
      'ambient-scribe-v2',
      mode,
      requestId,
      idempotencyKey,
      ctxResult.error
    );
    logProvenance(state, denied, { patientId: params.patientId, encounterId: params.encounterId });
    return denied;
  }

  const ctx = ctxResult.context;
  const input: AmbientScribeV2Input = {
    patientId: params.patientId,
    encounterId: params.encounterId,
    transcript: params.transcript,
    draftVersion: params.draftVersion,
    patientContextJson: ctx.contextSummaryJson,
    allowedSourceIds: ctx.allowedSourceIds,
  };

  if (mode === 'deterministic-demo') {
    const started = Date.now();
    const data = runDeterministicAmbientScribeV2(input, ctx);
    const resp: ClinicalAIResponse<AmbientScribeV2Output> = {
      ok: true,
      requestId,
      idempotencyKey,
      operation: 'ambient-scribe-v2',
      executionMode: 'deterministic-demo',
      modelId: 'eigenh-deterministic-rules-v2',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Draft Ready',
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: [params.encounterId, params.patientId],
      warnings: [],
      data,
    };
    logProvenance(state, resp, { patientId: params.patientId, encounterId: params.encounterId });
    return resp;
  }

  const resp = await postLiveClinicalAi<AmbientScribeV2Output>({
    requestId,
    idempotencyKey,
    operation: 'ambient-scribe-v2',
    input: {
      patientId: input.patientId,
      encounterId: input.encounterId,
      transcript: input.transcript,
      draftVersion: input.draftVersion,
      patientContextJson: input.patientContextJson,
      allowedSourceIds: input.allowedSourceIds,
    },
  });
  logProvenance(state, resp, { patientId: params.patientId, encounterId: params.encounterId });
  return resp;
}

export async function prepareClinicalActionsWithClinicalAi(
  state: AppState,
  params: {
    patientId: string;
    encounterId: string;
    soap: ActionComposerInput['soap'];
    transcript?: string;
  },
  options?: { modeOverride?: ClinicalAIExecutionMode; flags?: ClinicalAIFeatureFlags }
): Promise<ClinicalAIResponse<ActionComposerOutput>> {
  const flags = options?.flags || loadClinicalAiFeatureFlags();
  const mode = options?.modeOverride || flags.executionMode;
  const requestId = makeRequestId('action-composer');
  const idempotencyKey = `action-composer:${params.encounterId}:${mode}`;

  if (!isOperationEnabled(flags, 'action-composer')) {
    return disabledResponse('action-composer', mode, requestId, idempotencyKey);
  }

  const ctxResult = buildPermittedPatientContext(state, {
    patientId: params.patientId,
    role: state.currentRole,
    userId: state.currentUserId,
    facilityId: state.currentFacilityId,
  });

  if (!ctxResult.ok) {
    const denied = accessDeniedResponse<ActionComposerOutput>(
      'action-composer',
      mode,
      requestId,
      idempotencyKey,
      ctxResult.error
    );
    logProvenance(state, denied, { patientId: params.patientId, encounterId: params.encounterId });
    return denied;
  }

  const ctx = ctxResult.context;
  const input: ActionComposerInput = {
    patientId: params.patientId,
    encounterId: params.encounterId,
    soap: params.soap,
    transcript: params.transcript,
    patientContextJson: ctx.contextSummaryJson,
    allowedSourceIds: ctx.allowedSourceIds,
  };

  if (mode === 'deterministic-demo') {
    const started = Date.now();
    const data = runDeterministicActionComposer(input, ctx);
    const resp: ClinicalAIResponse<ActionComposerOutput> = {
      ok: true,
      requestId,
      idempotencyKey,
      operation: 'action-composer',
      executionMode: 'deterministic-demo',
      modelId: 'eigenh-deterministic-rules-v2',
      promptVersion: CLINICAL_AI_PROMPT_VERSION,
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      status: 'Draft Ready',
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
      safetyBoundaries: CLINICAL_AI_SAFETY_BOUNDARIES,
      humanReviewState: 'Draft — Review Required',
      inputSourceIds: [params.encounterId, params.patientId],
      warnings: [],
      data,
    };
    logProvenance(state, resp, { patientId: params.patientId, encounterId: params.encounterId });
    return resp;
  }

  const resp = await postLiveClinicalAi<ActionComposerOutput>({
    requestId,
    idempotencyKey,
    operation: 'action-composer',
    input: {
      patientId: input.patientId,
      encounterId: input.encounterId,
      soap: input.soap,
      patientContextJson: input.patientContextJson,
      allowedSourceIds: input.allowedSourceIds,
    },
  });
  logProvenance(state, resp, { patientId: params.patientId, encounterId: params.encounterId });
  return resp;
}
