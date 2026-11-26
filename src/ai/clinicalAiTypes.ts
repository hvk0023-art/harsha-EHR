import type { PatientTabKey, StaffRole } from '../types/hms';

export type ClinicalAIExecutionMode = 'live-ai' | 'deterministic-demo';

export type ClinicalAIOperation =
  | 'document-intelligence'
  | 'pre-consultation-brief'
  | 'chart-search'
  | 'ambient-scribe-v2'
  | 'action-composer';

export type HumanReviewState =
  | 'Draft — Review Required'
  | 'In Review'
  | 'Verified & Approved'
  | 'Edited & Approved'
  | 'Rejected';

export interface ClinicalAIFeatureFlags {
  executionMode: ClinicalAIExecutionMode;
  documentIntelligence: boolean;
  preConsultationBrief: boolean;
  chartSearch: boolean;
  ambientScribeV2: boolean;
  actionComposer: boolean;
}

export const DEFAULT_CLINICAL_AI_FLAGS: ClinicalAIFeatureFlags = {
  executionMode: 'live-ai',
  documentIntelligence: true,
  preConsultationBrief: true,
  chartSearch: true,
  ambientScribeV2: true,
  actionComposer: true,
};

export const CLINICAL_AI_PROMPT_VERSION = 'eigenh-clinical-prompts-v2.0';
export const CLINICAL_AI_SCHEMA_VERSION = 'eigenh-clinical-schema-v2.0';
export const CLINICAL_AI_SAFETY_BOUNDARIES: readonly string[] = [
  'Prototype using synthetic clinical data only — never real PHI.',
  'AI proposes structured drafts; authorized clinicians decide and sign.',
  'No autonomous diagnosis, prescribing, order placement, or uncertain identity merging.',
  'Every factual claim must reference a permitted patient source record.',
];

export interface ClinicalSourceReference {
  sourceId: string;
  sourceType:
    | 'Patient'
    | 'LabResult'
    | 'VitalObservation'
    | 'Medication'
    | 'Allergy'
    | 'Condition'
    | 'Encounter'
    | 'Document'
    | 'DataInbox'
    | 'ImagingReport'
    | 'Task'
    | 'Appointment'
    | 'Referral'
    | 'Transcript';
  label: string;
  date?: string;
  excerpt: string;
  targetTab: PatientTabKey;
}

export interface AIProvenanceRecord {
  id: string;
  requestId: string;
  idempotencyKey: string;
  operation: ClinicalAIOperation;
  executionMode: ClinicalAIExecutionMode;
  patientId?: string;
  encounterId?: string;
  facilityId: string;
  actorRole: StaffRole;
  actorName: string;
  inputSourceIds: string[];
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  timestamp: string;
  latencyMs: number;
  reviewState: HumanReviewState;
  humanReviewDecision?: string;
  resultingRecordIds: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface ClinicalAIRequest<TInput = unknown> {
  requestId: string;
  idempotencyKey: string;
  operation: ClinicalAIOperation;
  executionMode: ClinicalAIExecutionMode;
  syntheticOnly: true;
  context: {
    patientId?: string;
    encounterId?: string;
    facilityId: string;
    role: StaffRole;
    userId: string;
  };
  input: TInput;
}

export interface ClinicalAIModelAttempt {
  modelId: string;
  attempt: number;
  httpStatus?: number;
  outcome: 'success' | 'transient-error' | 'non-retryable-error' | 'timeout' | 'empty-response';
  latencyMs: number;
  retryDelayMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ClinicalAIResponse<TOutput = unknown> {
  ok: boolean;
  requestId: string;
  idempotencyKey: string;
  operation: ClinicalAIOperation;
  executionMode: ClinicalAIExecutionMode;
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  status: 'Draft Ready' | 'Unavailable' | 'Validation Failed' | 'Access Denied' | 'Error';
  latencyMs: number;
  timestamp: string;
  safetyBoundaries: readonly string[];
  humanReviewState: HumanReviewState;
  inputSourceIds: string[];
  warnings: string[];
  fallbackAttempted?: boolean;
  attemptTrace?: ClinicalAIModelAttempt[];
  data?: TOutput;
  error?: {
    code:
      | 'LIVE_AI_UNCONFIGURED'
      | 'LIVE_AI_TIMEOUT'
      | 'LIVE_AI_MODEL_UNSUPPORTED'
      | 'LIVE_AI_AUTH_ERROR'
      | 'LIVE_AI_RATE_LIMITED'
      | 'LIVE_AI_CAPACITY_UNAVAILABLE'
      | 'LIVE_AI_ERROR'
      | 'INVALID_REQUEST'
      | 'SCHEMA_VALIDATION_FAILED'
      | 'ACCESS_DENIED'
      | 'FEATURE_DISABLED';
    message: string;
    retryable: boolean;
    httpStatus?: number;
  };
}

// ============================================================================
// OPERATION 1 — REAL AI DOCUMENT INTELLIGENCE
// ============================================================================

export type SupportedDocumentType =
  | 'Laboratory Report'
  | 'Discharge Summary'
  | 'Prescription Document'
  | 'Imaging Report'
  | 'Clinical Consultation Note'
  | 'Other Medical Document';

export interface DocumentIntelligenceInput {
  documentId: string;
  title: string;
  sourceOrganization: string;
  documentDate?: string;
  rawText: string;
  expectedPatientContext?: {
    patientId: string;
    fullName: string;
    dob: string;
    mrn: string;
  };
}

export interface ExtractedLabMeasurement {
  testName: string;
  originalValue: string;
  originalUnit: string;
  referenceRange: string; // Never invented — "Not stated in source document" if absent
  sampleOrResultDate: string;
  laboratoryIdentity: string;
  flag?: 'Normal' | 'Abnormal' | 'Critical' | 'Unspecified';
  sourceSnippet: string;
  uncertain: boolean;
  uncertaintyReason?: string;
}

export interface DocumentExtractedFieldProposal {
  id: string;
  label: string;
  value: string;
  originalUnit?: string;
  referenceRange?: string;
  targetSection: 'Condition' | 'Lab' | 'Imaging' | 'Medication' | 'Allergy' | 'History' | 'Demographics';
  sourceLocation: string;
  sourceSnippet: string;
  confidence: 'High' | 'Medium' | 'Low';
  uncertain: boolean;
  uncertaintyReason?: string;
  metadata?: Record<string, string>;
}

export interface DocumentIntelligenceOutput {
  documentType: SupportedDocumentType;
  documentDate: string;
  laboratoryOrFacilityIdentity: string;
  extractedPatientIdentity: {
    fullName: string;
    dob?: string;
    phone?: string;
    mrnOrExternalId?: string;
    abhaOptional?: string;
  };
  summary: string;
  labMeasurements: ExtractedLabMeasurement[];
  extractedFields: DocumentExtractedFieldProposal[];
  missingOrAmbiguousFlags: string[];
  identitySafetyNote: string;
}

// ============================================================================
// OPERATION 2 — AI PRE-CONSULTATION INTELLIGENCE BRIEF
// ============================================================================

export interface PreConsultationBriefInput {
  patientId: string;
  patientContextJson: string;
  allowedSourceIds: string[];
}

export interface PreConsultationBriefClaim {
  id: string;
  section:
    | 'Reason for Visit'
    | 'Relevant Medical History'
    | 'Recent Clinical Events'
    | 'Medications & Allergies'
    | 'Laboratory Trends'
    | 'Significant Prior Reports'
    | 'Unreviewed Information'
    | 'Outstanding Actions';
  headline: string;
  detail: string;
  sourceIds: string[];
  evidenceType: 'Source-Grounded Fact' | 'AI Synthesis (Review Required)' | 'Missing / Conflict Alert';
  uncertain?: boolean;
}

export interface PreConsultationBriefOutput {
  whatMattersTodayHeadline: string;
  whatMattersTodayBullets: {
    text: string;
    sourceIds: string[];
  }[];
  sections: PreConsultationBriefClaim[];
  missingClinicalData: string[];
  conflictingInformation: string[];
  uncertaintyIndicators: string[];
  disclaimer: string;
}

// ============================================================================
// OPERATION 3 — ASK EIGENH: CLINICAL CHART SEARCH
// ============================================================================

export type ChartQueryIntent =
  | 'latest-labs'
  | 'egfr-lookup'
  | 'bp-trend'
  | 'active-medications'
  | 'pending-documents'
  | 'open-tasks'
  | 'encounter-summary'
  | 'allergies-conditions'
  | 'narrative-question'
  | 'unsupported';

export interface ChartQueryPlan {
  intent: ChartQueryIntent;
  strategy: 'deterministic-structured' | 'grounded-narrative' | 'unsupported';
  targetRecordTypes: string[];
  rationale: string;
}

export interface ChartSearchInput {
  patientId: string;
  question: string;
  patientContextJson?: string;
  allowedSourceIds?: string[];
}

export interface ChartSearchTable {
  title: string;
  columns: string[];
  rows: string[][];
}

export interface ChartSearchTrendSeries {
  title: string;
  unit: string;
  color: string;
  points: { label: string; value: number; secondaryValue?: number; note?: string }[];
}

export interface ChartSearchOutput {
  question: string;
  queryPlan: ChartQueryPlan;
  answer: string;
  incompleteOrMissingNote?: string;
  sources: ClinicalSourceReference[];
  table?: ChartSearchTable;
  trendSeries?: ChartSearchTrendSeries;
  narrativeGroundedByModel: boolean;
}

// ============================================================================
// OPERATION 4 — AMBIENT CLINICAL SCRIBE V2
// ============================================================================

export interface AmbientScribeV2Input {
  patientId: string;
  encounterId: string;
  transcript: string;
  draftVersion: number;
  patientContextJson: string;
  allowedSourceIds: string[];
}

export interface ScribeUncertaintyFlag {
  section: 'subjective' | 'objective' | 'assessment' | 'plan';
  statement: string;
  reason: string;
}

export interface AmbientScribeV2Output {
  draftVersion: number;
  draftStatus: 'Draft';
  autoSigned: false;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  supportingTranscriptQuotes: {
    section: 'subjective' | 'objective' | 'assessment' | 'plan';
    quote: string;
  }[];
  unsupportedOrUncertainStatements: ScribeUncertaintyFlag[];
  medicationsMentionedAsProposalsOnly: string[];
  clinicianSignOffNotice: string;
}

// ============================================================================
// OPERATION 5 — AI CLINICAL ACTION COMPOSER
// ============================================================================

export type ComposerProposalKind =
  | 'Lab Order'
  | 'Medication Draft'
  | 'Task'
  | 'Follow-Up Plan'
  | 'Patient Message'
  | 'Referral';

export interface ActionComposerInput {
  patientId: string;
  encounterId: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  transcript?: string;
  patientContextJson: string;
  allowedSourceIds: string[];
}

export interface ComposedClinicalActionProposal {
  id: string;
  idempotencyKey: string;
  kind: ComposerProposalKind;
  title: string;
  summary: string;
  supportingSourceText: string;
  sourceIds: string[];
  rationale: string;
  confidence: 'High' | 'Medium' | 'Low';
  uncertaintyNote?: string;
  requiresClinicianAuthorization: true;
  payload: Record<string, string>;
}

export interface ActionComposerOutput {
  encounterId: string;
  proposals: ComposedClinicalActionProposal[];
  safetyBoundaryNote: string;
}

export interface ClinicalAIStatus {
  configured: boolean;
  provider: 'gemini' | 'none';
  model: string;
  fallbackModel?: string;
  promptVersion: string;
  schemaVersion: string;
  syntheticOnly: boolean;
  supportedOperations: ClinicalAIOperation[];
  missingReason?: string;
}

export interface ClinicalAIProvider {
  getStatus(): Promise<ClinicalAIStatus>;
  execute<TInput, TOutput>(request: ClinicalAIRequest<TInput>): Promise<ClinicalAIResponse<TOutput>>;
}
