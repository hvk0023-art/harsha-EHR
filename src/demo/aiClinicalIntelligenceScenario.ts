import {
  executeDeterministicChartSearch,
  runDeterministicActionComposer,
  runDeterministicAmbientScribeV2,
  runDeterministicDocumentIntelligence,
  runDeterministicPreConsultationBrief,
} from '../ai/deterministicClinicalAi';
import { buildPermittedPatientContext } from '../ai/patientContextBuilder';
import {
  validateActionComposerOutput,
  validateAmbientScribeV2Output,
  validateDocumentIntelligenceOutput,
  validatePreConsultationBriefOutput,
} from '../ai/aiOutputValidator';
import { buildPatientKnowledgeGraph } from '../state/knowledgeGraph';
import type {
  AiProposedAction,
  AppState,
  ClinicalOrder,
  Encounter,
  FollowUpPlan,
  InboxExtractedField,
  LabResult,
  Medication,
  PatientDataInboxItem,
  PatientDocument,
  PatientTabKey,
  Referral,
  StaffNavKey,
  StaffRole,
  TaskItem,
} from '../types/hms';
import {
  appendDemoAudit,
  buildCleanDemoBaseState,
  DEMO_CLINICAL_DATE,
  DEMO_FACILITY_ID,
  DEMO_PATIENT_ID,
  findStaffForRole,
} from './demoFixtures';
import type { DemoScenarioDefinition, DemoSceneDefinition } from './demoTypes';

export const AI_DEMO_PATIENT_ID = DEMO_PATIENT_ID;
export const AI_DEMO_FACILITY_ID = DEMO_FACILITY_ID;

export const AI_DEMO_IDS = {
  inboxDoc: 'aidemo-inbox-01',
  doc: 'aidemo-doc-01',
  labCr: 'aidemo-lab-cr',
  labEgfr: 'aidemo-lab-egfr',
  labK: 'aidemo-lab-k',
  encounter: 'aidemo-enc-01',
  scribe: 'aidemo-scribe-01',
  labOrder: 'aidemo-ord-01',
  medDraft: 'aidemo-med-01',
  followUpPlan: 'aidemo-fp-01',
  referral: 'aidemo-ref-01',
  task: 'aidemo-tsk-01',
};

export const AI_DEMO_SYNTHETIC_REPORT_TEXT = `Lab: Harborview Diagnostic Laboratories (Boston)
Patient: Elena Alvarez
DOB: 1968-05-14
MRN: MRN-109420
Sample Date: 2026-11-16
Document Type: Outside Renal Function & Electrolyte Panel (Synthetic)

Serum Creatinine: 1.44 mg/dL (Ref: 0.60 - 1.10 mg/dL) (H)
eGFR: 47 mL/min/1.73m2 (Ref: >60 mL/min/1.73m2) (L)
Serum Potassium: 4.6 mmol/L (Ref: 3.5 - 5.1 mmol/L)
Urine ACR: 96 mg/g
Diagnosis: Chronic kidney disease stage 3a with rising albuminuria
Allergies: Sulfonamides (Sulfa) - rash`;

export const AI_DEMO_SYNTHETIC_TRANSCRIPT = `Clinician (Dr. Elena Rostova, MD): Good morning, Ms. Alvarez. I reviewed your verified Harborview renal labs showing eGFR 47 and creatinine 1.44, and today's clinic blood pressure is 146/88 mmHg. How have you felt over the past two weeks?
Patient (Elena Alvarez): Morning readings at home have been around 144 to 148 over 86. I noticed mild ankle puffiness twice in the evening, no chest pain, no shortness of breath, and I take Lisinopril 10 mg daily without missing doses.
Clinician (Dr. Elena Rostova, MD): Because you have a verified Sulfa allergy, we will avoid thiazide diuretics. I propose starting Amlodipine 5 mg once daily as a clinician-reviewed draft, ordering a repeat Basic Metabolic Panel and Urine ACR in 2 weeks, referring you to Nephrology for CKD stage 3a albuminuria co-management, and scheduling a 2-week blood pressure follow-up.`;

function upsertById<T extends { id: string }>(list: T[], item: T, prepend = true): T[] {
  const filtered = list.filter((x) => x.id !== item.id);
  return prepend ? [item, ...filtered] : [...filtered, item];
}

function alignAiView(
  state: AppState,
  role: StaffRole,
  nav: StaffNavKey,
  patientId: string | null,
  patientTab: PatientTabKey = 'data-inbox'
): AppState {
  const actor = findStaffForRole(state, role, AI_DEMO_FACILITY_ID);
  return {
    ...state,
    currentPortal: 'staff',
    currentRole: role,
    currentUserId: actor.id,
    currentFacilityId: AI_DEMO_FACILITY_ID,
    currentNav: nav,
    selectedPatientId: patientId,
    selectedPatientTab: patientTab,
    unsavedDirty: false,
  };
}

function appendAiDemoAudit(
  state: AppState,
  suffix: string,
  timestamp: string,
  role: StaffRole,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: string
): AppState['auditEvents'] {
  return appendDemoAudit(
    state,
    `aidemo-${suffix}`,
    timestamp,
    role,
    actor,
    action,
    targetType,
    targetId,
    detail
  );
}

/**
 * Prepares a clean, isolated, repeatable sandbox for Scenario #20 without mutating
 * or colliding with Scenarios 01-19 or prior user workspace data.
 */
export function buildCleanAiDemoState(sourceState: AppState): AppState {
  const base = buildCleanDemoBaseState(sourceState);
  const stripAiDemo = <T extends { id: string }>(items: T[]) =>
    items.filter((item) => !item.id.startsWith('aidemo-'));

  return {
    ...base,
    currentPortal: 'staff',
    currentRole: 'Nurse Practitioner',
    currentUserId: findStaffForRole(base, 'Nurse Practitioner', AI_DEMO_FACILITY_ID).id,
    currentFacilityId: AI_DEMO_FACILITY_ID,
    currentNav: 'patients',
    selectedPatientId: AI_DEMO_PATIENT_ID,
    selectedPatientTab: 'data-inbox',
    dataInboxItems: stripAiDemo(base.dataInboxItems),
    documents: stripAiDemo(base.documents),
    labResults: stripAiDemo(base.labResults),
    encounters: stripAiDemo(base.encounters),
    scribeSessions: stripAiDemo(base.scribeSessions),
    orders: stripAiDemo(base.orders),
    medications: stripAiDemo(base.medications),
    followUpPlans: stripAiDemo(base.followUpPlans),
    referrals: stripAiDemo(base.referrals),
    tasks: stripAiDemo(base.tasks),
    auditEvents: base.auditEvents.filter((a) => !a.id.startsWith('aud-demo-aidemo-')),
  };
}

const AI_CLINICAL_INTELLIGENCE_SCENES: DemoSceneDefinition[] = [
  // 1. Synthetic Document Intake
  {
    sceneId: 's20-01-inbox-intake',
    sceneNumber: 1,
    title: 'Synthetic Document Intake (Data Inbox)',
    role: 'Nurse Practitioner',
    actorDisplay: 'Hannah Brooks, NP (Data Inbox Intake)',
    actorKind: 'human',
    screenLabel: 'Patient Chart · Data Inbox',
    classification: 'Manual entry',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'data-inbox',
    visualTarget: 'patient-data-inbox-panel',
    caption:
      'An outside synthetic renal lab report arrives in Elena Alvarez’s Data Inbox. Nothing is consolidated into her longitudinal chart until AI extraction is reviewed and verified by a clinician.',
    narration:
      'Welcome to EigenH Phase 2 Clinical Intelligence. We start in Elena Alvarez’s Patient Data Inbox, where an outside synthetic renal panel has arrived and waits safely in review status.',
    executiveNarration:
      'An outside synthetic renal lab report arrives in Elena Alvarez’s Data Inbox without auto-writing to her chart.',
    explanationAfter: 'Outside Harborview renal panel staged in Data Inbox with zero automatic chart mutations.',
    nextStepPreview: 'AI Document Intelligence extraction with unit & reference-range safety',
    durationMs: 3800,
    expectedMutation: 'Stages PatientDataInboxItem aidemo-inbox-01 in Uploaded status.',
    prepareView: (prev) => alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox');
      const item: PatientDataInboxItem = {
        id: AI_DEMO_IDS.inboxDoc,
        title: 'Harborview Outside Renal Panel (2026-11-16).txt',
        category: 'Laboratory Report',
        sourceAdapter: 'External Clinic PDF (Demo)',
        sourceOrganization: 'Harborview Diagnostic Laboratories (Boston)',
        receivedAt: `${DEMO_CLINICAL_DATE} 09:05 EST`,
        documentDate: '2026-11-16',
        rawPreviewText: AI_DEMO_SYNTHETIC_REPORT_TEXT,
        extractedIdentity: {
          fullName: 'Elena Alvarez',
          dob: '1968-05-14',
          mrnOrExternalId: 'MRN-109420',
        },
        candidatePatientIds: [AI_DEMO_PATIENT_ID],
        confirmedPatientId: AI_DEMO_PATIENT_ID,
        status: 'Uploaded',
        extractedFields: [],
      };
      return {
        ...next,
        dataInboxItems: upsertById(next.dataInboxItems, item),
        auditEvents: appendAiDemoAudit(
          next,
          '01',
          `${DEMO_CLINICAL_DATE} 09:05 EST`,
          'Nurse Practitioner',
          'Hannah Brooks, NP',
          'Stage Synthetic Report',
          'DataInbox',
          item.id,
          'Staged Harborview outside renal panel into Data Inbox (awaiting AI analysis & human verification)'
        ),
      };
    },
    validate: (state) => {
      const item = state.dataInboxItems.find((d) => d.id === AI_DEMO_IDS.inboxDoc);
      return item && item.status === 'Uploaded'
        ? { passed: true, detail: `Inbox document ${item.id} staged in Uploaded status.` }
        : { passed: false, detail: 'Synthetic inbox document aidemo-inbox-01 missing.' };
    },
  },

  // 2. Real AI Document Intelligence (Deterministic Demo Mode)
  {
    sceneId: 's20-02-doc-intelligence',
    sceneNumber: 2,
    title: 'AI Document Intelligence Extraction',
    role: 'Nurse Practitioner',
    actorDisplay: 'EigenH Document Intelligence (Deterministic Demo)',
    actorKind: 'ai',
    screenLabel: 'Data Inbox · AI Document Intelligence',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'data-inbox',
    visualTarget: 'inbox-analyze-ai-btn',
    uiActions: [{ kind: 'review', target: 'inbox-analyze-ai-btn', pauseBeforeMs: 240, pauseAfterMs: 320 }],
    caption:
      'AI Document Intelligence parses the actual synthetic text, preserves exact units, flags Urine ACR as missing a reference range instead of inventing one, and leaves every proposed field Pending human review.',
    narration:
      'AI Document Intelligence parses the uploaded renal panel text, extracting creatinine, eGFR, potassium, and urine ACR while preserving original units and flagging missing reference ranges rather than guessing.',
    executiveNarration:
      'AI Document Intelligence extracts structured lab measurements, preserves units, and flags missing reference ranges for human review.',
    explanationAfter: 'Structured lab table and pending review fields prepared; zero auto-approved chart writes.',
    nextStepPreview: 'Human verification & consolidation into longitudinal chart',
    durationMs: 4200,
    expectedMutation: 'Populates validated aiLabMeasurements and Pending extractedFields on aidemo-inbox-01.',
    prepareView: (prev) => alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox');
      const rawOutput = runDeterministicDocumentIntelligence({
        documentId: AI_DEMO_IDS.inboxDoc,
        title: 'Harborview Outside Renal Panel (2026-11-16).txt',
        sourceOrganization: 'Harborview Diagnostic Laboratories (Boston)',
        documentDate: '2026-11-16',
        rawText: AI_DEMO_SYNTHETIC_REPORT_TEXT,
        expectedPatientContext: {
          patientId: AI_DEMO_PATIENT_ID,
          fullName: 'Elena Alvarez',
          dob: '1968-05-14',
          mrn: 'MRN-109420',
        },
      });
      const validated = validateDocumentIntelligenceOutput(rawOutput, AI_DEMO_SYNTHETIC_REPORT_TEXT);
      const output = validated.sanitized || rawOutput;

      const mappedFields: InboxExtractedField[] = output.extractedFields.map((f) => ({
        id: f.id,
        label: f.label,
        value: f.value,
        targetSection: f.targetSection,
        sourceSnippet: f.sourceSnippet,
        confidence: f.confidence,
        uncertain: f.uncertain,
        uncertaintyReason: f.uncertaintyReason,
        decision: 'Pending',
        metadata: f.metadata,
      }));

      return {
        ...next,
        dataInboxItems: next.dataInboxItems.map((item) =>
          item.id === AI_DEMO_IDS.inboxDoc
            ? {
                ...item,
                status: 'AI Extracted',
                extractedFields: mappedFields,
                aiExecutionMode: 'deterministic-demo',
                aiModelId: 'eigenh-deterministic-doc-v2',
                aiRequestId: 'aidemo-req-doc-01',
                aiSummary: output.summary,
                aiLabMeasurements: output.labMeasurements.map((m) => ({
                  ...m,
                  flag: m.flag === 'Unspecified' ? 'Not Stated' : m.flag,
                })),
                aiMissingFlags: output.missingOrAmbiguousFlags,
                aiIdentitySafetyNote: output.identitySafetyNote,
              }
            : item
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '02',
          `${DEMO_CLINICAL_DATE} 09:06 EST`,
          'Nurse Practitioner',
          'EigenH AI Document Intelligence (Deterministic Demo)',
          'AI Document Analysis',
          'DataInbox',
          AI_DEMO_IDS.inboxDoc,
          `Extracted ${output.labMeasurements.length} lab measurements & ${mappedFields.length} review fields (zero auto-consolidation)`
        ),
      };
    },
    validate: (state) => {
      const item = state.dataInboxItems.find((d) => d.id === AI_DEMO_IDS.inboxDoc);
      const labs = item?.aiLabMeasurements || [];
      const acr = labs.find((l) => /acr/i.test(l.testName));
      const noAutoVerified = item?.extractedFields.every((f) => f.decision === 'Pending');
      return item?.status === 'AI Extracted' &&
        labs.length >= 3 &&
        acr?.referenceRange === 'Not stated in source document' &&
        Boolean(noAutoVerified)
        ? {
            passed: true,
            detail: `${labs.length} lab rows extracted; Urine ACR missing reference range preserved honestly; all fields Pending.`,
          }
        : {
            passed: false,
            detail: 'AI Document Intelligence extraction failed validation or invented a missing reference range.',
          };
    },
  },

  // 3. Human Verification & Chart Consolidation
  {
    sceneId: 's20-03-human-verification',
    sceneNumber: 3,
    title: 'Human Verification & Chart Consolidation',
    role: 'Nurse Practitioner',
    actorDisplay: 'Hannah Brooks, NP (Human Verification Gate)',
    actorKind: 'human',
    screenLabel: 'Data Inbox · Verified Consolidation',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'data-inbox',
    visualTarget: 'patient-data-inbox-panel',
    caption:
      'Nurse Practitioner Hannah Brooks verifies each extracted measurement against the raw source text and consolidates the verified labs and source document into Elena’s longitudinal record.',
    narration:
      'Hannah Brooks verifies each extracted value against the original report snippet and approves consolidation. Only verified items write into Elena’s structured laboratory table and document archive.',
    executiveNarration:
      'The Nurse Practitioner verifies extracted lab values against the raw report and consolidates them into the chart.',
    explanationAfter: '3 verified lab records and 1 verified source document consolidated with full provenance.',
    nextStepPreview: 'Patient 360° & Knowledge Graph real-time update',
    durationMs: 3800,
    isSimulatedApproval: true,
    expectedMutation: 'Marks aidemo-inbox-01 Verified & Consolidated and writes verified LabResults + PatientDocument.',
    prepareView: (prev) => alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Nurse Practitioner', 'patients', AI_DEMO_PATIENT_ID, 'data-inbox');
      const doc: PatientDocument = {
        id: AI_DEMO_IDS.doc,
        patientId: AI_DEMO_PATIENT_ID,
        title: 'Harborview Outside Renal Panel (2026-11-16).txt',
        category: 'Lab PDF',
        author: 'Harborview Diagnostic Laboratories',
        source: 'Data Inbox Verified Consolidation',
        date: '2026-11-16',
        version: 1,
        verified: true,
        external: true,
        summary: 'Verified outside renal labs: Cr 1.44 mg/dL, eGFR 47 mL/min/1.73m2, K+ 4.6 mmol/L, Urine ACR 96 mg/g.',
      };
      const labCr: LabResult = {
        id: AI_DEMO_IDS.labCr,
        orderId: 'ext-harborview-20261116',
        patientId: AI_DEMO_PATIENT_ID,
        facilityId: AI_DEMO_FACILITY_ID,
        testName: 'Serum Creatinine',
        collectionDate: '2026-11-16',
        value: '1.44',
        numericValue: 1.44,
        unit: 'mg/dL',
        referenceInterval: '0.60 - 1.10 mg/dL',
        flag: 'Abnormal',
        status: 'Reviewed',
        reviewOwnerId: 'staff-1',
        reviewedAt: `${DEMO_CLINICAL_DATE} 09:09 EST`,
        patientReleased: false,
        sourceDocumentId: AI_DEMO_IDS.doc,
        sourceLabel: 'Harborview Outside Renal Panel (2026-11-16)',
      };
      const labEgfr: LabResult = {
        id: AI_DEMO_IDS.labEgfr,
        orderId: 'ext-harborview-20261116',
        patientId: AI_DEMO_PATIENT_ID,
        facilityId: AI_DEMO_FACILITY_ID,
        testName: 'eGFR',
        collectionDate: '2026-11-16',
        value: '47',
        numericValue: 47,
        unit: 'mL/min/1.73m2',
        referenceInterval: '>60 mL/min/1.73m2',
        flag: 'Abnormal',
        status: 'Reviewed',
        reviewOwnerId: 'staff-1',
        reviewedAt: `${DEMO_CLINICAL_DATE} 09:09 EST`,
        patientReleased: false,
        sourceDocumentId: AI_DEMO_IDS.doc,
        sourceLabel: 'Harborview Outside Renal Panel (2026-11-16)',
      };
      const labK: LabResult = {
        id: AI_DEMO_IDS.labK,
        orderId: 'ext-harborview-20261116',
        patientId: AI_DEMO_PATIENT_ID,
        facilityId: AI_DEMO_FACILITY_ID,
        testName: 'Serum Potassium',
        collectionDate: '2026-11-16',
        value: '4.6',
        numericValue: 4.6,
        unit: 'mmol/L',
        referenceInterval: '3.5 - 5.1 mmol/L',
        flag: 'Normal',
        status: 'Reviewed',
        reviewOwnerId: 'staff-1',
        reviewedAt: `${DEMO_CLINICAL_DATE} 09:09 EST`,
        patientReleased: false,
        sourceDocumentId: AI_DEMO_IDS.doc,
        sourceLabel: 'Harborview Outside Renal Panel (2026-11-16)',
      };

      return {
        ...next,
        documents: upsertById(next.documents, doc),
        labResults: upsertById(upsertById(upsertById(next.labResults, labK), labCr), labEgfr),
        dataInboxItems: next.dataInboxItems.map((item) =>
          item.id === AI_DEMO_IDS.inboxDoc
            ? {
                ...item,
                status: 'Verified & Consolidated',
                verifiedBy: 'Hannah Brooks, NP',
                verifiedAt: `${DEMO_CLINICAL_DATE} 09:09 EST`,
                extractedFields: item.extractedFields.map((f) => ({
                  ...f,
                  decision: 'Accepted',
                  reviewedBy: 'Hannah Brooks, NP',
                  reviewedAt: `${DEMO_CLINICAL_DATE} 09:09 EST`,
                })),
              }
            : item
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '03',
          `${DEMO_CLINICAL_DATE} 09:09 EST`,
          'Nurse Practitioner',
          'Hannah Brooks, NP',
          'Verify & Consolidate Inbox Document',
          'Patient',
          AI_DEMO_PATIENT_ID,
          'Verified and consolidated 3 renal lab values + source document into Elena Alvarez longitudinal chart'
        ),
      };
    },
    validate: (state) => {
      const item = state.dataInboxItems.find((d) => d.id === AI_DEMO_IDS.inboxDoc);
      const hasEgfr = state.labResults.some((l) => l.id === AI_DEMO_IDS.labEgfr && l.value === '47');
      const hasDoc = state.documents.some((d) => d.id === AI_DEMO_IDS.doc && d.verified);
      return item?.status === 'Verified & Consolidated' && hasEgfr && hasDoc
        ? { passed: true, detail: 'Verified eGFR 47, Cr 1.44, K+ 4.6, and source document consolidated.' }
        : { passed: false, detail: 'Human verification or chart consolidation did not persist expected records.' };
    },
  },

  // 4. Patient 360 & Knowledge Graph Update
  {
    sceneId: 's20-04-patient-360-graph',
    sceneNumber: 4,
    title: 'Patient 360° & Knowledge Graph Sync',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Knowledge Graph Review)',
    actorKind: 'human',
    screenLabel: 'Patient Chart · Knowledge Graph',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'knowledge-graph',
    visualTarget: 'patient-knowledge-graph',
    caption:
      'In Elena’s Patient Knowledge Graph, the newly verified Harborview labs automatically connect to her CKD Stage 3a condition, Lisinopril therapy, and Sulfa allergy safety guard.',
    narration:
      'Switching to the Patient Knowledge Graph, Dr. Rostova immediately sees the newly verified eGFR of 47 connected to Elena’s chronic kidney disease, antihypertensive regimen, and Sulfa allergy.',
    executiveNarration:
      'The verified lab records immediately link into Elena’s Patient Knowledge Graph with full provenance.',
    explanationAfter: 'Knowledge Graph reflects newly consolidated renal labs linked to CKD Stage 3a.',
    nextStepPreview: 'AI Pre-Consultation Intelligence Brief generation',
    durationMs: 3600,
    expectedMutation: 'Aligns Clinician view to Knowledge Graph and verifies graph contains aidemo-lab-egfr.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'knowledge-graph'),
    execute: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'knowledge-graph'),
    validate: (state) => {
      const graph = buildPatientKnowledgeGraph(state, AI_DEMO_PATIENT_ID);
      const hasLabNode = graph.nodes.some((n) => n.id === `kg-lab-${AI_DEMO_IDS.labEgfr}`);
      return hasLabNode
        ? { passed: true, detail: `Knowledge Graph rendered ${graph.nodes.length} nodes including verified eGFR 47.` }
        : { passed: false, detail: 'Consolidated eGFR node missing from Patient Knowledge Graph.' };
    },
  },

  // 5. AI Pre-Consultation Intelligence Brief
  {
    sceneId: 's20-05-pre-consult-brief',
    sceneNumber: 5,
    title: 'AI Pre-Consultation Intelligence Brief',
    role: 'Clinician',
    actorDisplay: 'EigenH Pre-Consultation Brief (Deterministic Demo)',
    actorKind: 'ai',
    screenLabel: 'Pre-Consultation · Intelligence Brief',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'prepare-intel-brief-btn',
    uiActions: [{ kind: 'review', target: 'prepare-intel-brief-btn', pauseBeforeMs: 220, pauseAfterMs: 320 }],
    caption:
      'EigenH assembles a strictly scoped patient context bundle for Elena Alvarez only, generating an 8-section Pre-Consultation Intelligence Brief with clickable source citations and explicit missing/conflict indicators.',
    narration:
      'Before entering the exam room, Dr. Rostova generates the AI Pre-Consultation Intelligence Brief. Every bullet cites an exact permitted source record and highlights missing or conflicting information.',
    executiveNarration:
      'The AI Pre-Consultation Intelligence Brief synthesizes Elena’s permitted chart with clickable source references.',
    explanationAfter: 'Source-grounded Pre-Consultation Brief validated against allowed patient source IDs.',
    nextStepPreview: 'Clinician brief review, source verification & draft encounter creation',
    durationMs: 4200,
    expectedMutation: 'Builds permitted context, validates Pre-Consultation Brief, and logs provenance audit.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation');
      const ctxRes = buildPermittedPatientContext(next, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return next;
      const brief = runDeterministicPreConsultationBrief(ctxRes.context);
      const checked = validatePreConsultationBriefOutput(brief, ctxRes.context.allowedSourceIds);
      const count = checked.sanitized?.sections.length ?? brief.sections.length;
      return {
        ...next,
        auditEvents: appendAiDemoAudit(
          next,
          '05',
          `${DEMO_CLINICAL_DATE} 10:55 EST`,
          'Clinician',
          'EigenH Pre-Consultation Brief (Deterministic Demo)',
          'Generate Pre-Consultation Brief',
          'Patient',
          AI_DEMO_PATIENT_ID,
          `Prepared ${count}-section source-grounded Pre-Consultation Brief (${ctxRes.context.allowedSourceIds.length} permitted sources)`
        ),
      };
    },
    validate: (state) => {
      const ctxRes = buildPermittedPatientContext(state, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return { passed: false, detail: ctxRes.error };
      const brief = runDeterministicPreConsultationBrief(ctxRes.context);
      const checked = validatePreConsultationBriefOutput(brief, ctxRes.context.allowedSourceIds);
      return checked.valid && (checked.sanitized?.whatMattersTodayBullets.length || 0) >= 2
        ? {
            passed: true,
            detail: `Pre-Consultation Brief validated with ${checked.sanitized?.sections.length} grounded sections.`,
          }
        : { passed: false, detail: `Pre-Consultation Brief failed validation: ${checked.errors.join('; ')}` };
    },
  },

  // 6. Clinician Brief Acceptance & Draft Encounter
  {
    sceneId: 's20-06-brief-source-review',
    sceneNumber: 6,
    title: 'Clinician Brief Review & Draft Encounter',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Clinician Review)',
    actorKind: 'human',
    screenLabel: 'Pre-Consultation · Source Verification',
    classification: 'Human verification required',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'what-matters-today-panel',
    caption:
      'Dr. Rostova verifies the cited renal labs and Sulfa allergy alert, marks the brief Reviewed & Accepted, and opens an unsigned Draft encounter for today’s visit.',
    narration:
      'Dr. Rostova inspects the source-linked renal findings, accepts the Pre-Consultation Brief, and opens a draft consultation note for today’s visit.',
    executiveNarration:
      'Dr. Rostova accepts the source-grounded brief and opens an unsigned Draft encounter.',
    explanationAfter: 'Brief accepted by Dr. Rostova; Draft encounter aidemo-enc-01 opened.',
    nextStepPreview: 'Ask EigenH structured lab & BP trend query',
    durationMs: 3600,
    expectedMutation: 'Creates unsigned Draft Encounter aidemo-enc-01 and logs clinician brief acceptance.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation');
      const encounter: Encounter = {
        id: AI_DEMO_IDS.encounter,
        patientId: AI_DEMO_PATIENT_ID,
        providerId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
        date: DEMO_CLINICAL_DATE,
        type: 'CKD Stage 3a & Hypertension Follow-Up',
        chiefComplaint: 'Elevated home BP (144-148/86 mmHg) & verified outside eGFR 47 mL/min/1.73m2',
        soap: {
          subjective: 'Brief reviewed; awaiting consultation narrative.',
          objective: 'Verified Harborview labs (2026-11-16): Cr 1.44 mg/dL, eGFR 47 mL/min/1.73m2, K+ 4.6 mmol/L.',
          assessment: 'Pending clinician consultation.',
          plan: 'Pending clinician consultation.',
        },
        diagnoses: ['Chronic kidney disease, stage 3a (N18.31)', 'Essential hypertension (I10)'],
        noteStatus: 'Draft',
        amendments: [],
        comments: [],
        avsReleased: false,
      };
      return {
        ...next,
        encounters: upsertById(next.encounters, encounter),
        auditEvents: appendAiDemoAudit(
          next,
          '06',
          `${DEMO_CLINICAL_DATE} 10:58 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Accept Pre-Consultation Brief',
          'Encounter',
          encounter.id,
          'Reviewed source-grounded Pre-Consultation Brief and opened unsigned Draft encounter'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === AI_DEMO_IDS.encounter);
      return enc && enc.noteStatus === 'Draft'
        ? { passed: true, detail: `Unsigned Draft encounter ${enc.id} created.` }
        : { passed: false, detail: 'Draft encounter aidemo-enc-01 missing or not in Draft status.' };
    },
  },

  // 7. Ask EigenH — Structured Lab & BP Trend Query
  {
    sceneId: 's20-07-ask-eigenh-structured',
    sceneNumber: 7,
    title: 'Ask EigenH — Structured Lab & BP Trend Search',
    role: 'Clinician',
    actorDisplay: 'Ask EigenH (Deterministic Structured Query)',
    actorKind: 'ai',
    screenLabel: 'Patient Chart · Ask EigenH Search',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'ask-eigenh-open-btn',
    uiActions: [{ kind: 'review', target: 'ask-eigenh-open-btn', pauseBeforeMs: 220, pauseAfterMs: 300 }],
    caption:
      'Clinician asks Ask EigenH: "Show latest eGFR and blood pressure trend." Structured numerical answers come directly from deterministic EHR queries — never LLM guesswork — with clickable chart links.',
    narration:
      'Dr. Rostova queries Ask EigenH for Elena’s latest eGFR and blood pressure trend. Structured lab values and trend series are computed deterministically from Elena’s permitted chart records.',
    executiveNarration:
      'Ask EigenH answers structured eGFR and blood pressure trend queries deterministically with clickable source links.',
    explanationAfter: 'Exact eGFR 47 mL/min/1.73m2 and BP trend returned with permitted source citations.',
    nextStepPreview: 'Ask EigenH unsupported question safety guard',
    durationMs: 3800,
    expectedMutation: 'Runs deterministic chart search for latest eGFR and logs grounded source citations.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation');
      const ctxRes = buildPermittedPatientContext(next, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return next;
      const searchRes = executeDeterministicChartSearch(ctxRes.context, 'What is the latest eGFR?');
      return {
        ...next,
        auditEvents: appendAiDemoAudit(
          next,
          '07',
          `${DEMO_CLINICAL_DATE} 11:02 EST`,
          'Clinician',
          'Ask EigenH (Structured Query)',
          'Clinical Chart Search',
          'Patient',
          AI_DEMO_PATIENT_ID,
          `Answered structured query "${searchRes.question}" (${searchRes.sources.length} permitted citations)`
        ),
      };
    },
    validate: (state) => {
      const ctxRes = buildPermittedPatientContext(state, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return { passed: false, detail: ctxRes.error };
      const res = executeDeterministicChartSearch(ctxRes.context, 'What is the latest eGFR?');
      return res.queryPlan.strategy === 'deterministic-structured' &&
        res.answer.includes('47') &&
        res.sources.length >= 1
        ? { passed: true, detail: `Ask EigenH returned exact eGFR 47 with ${res.sources.length} grounded source(s).` }
        : { passed: false, detail: 'Ask EigenH failed to return deterministic eGFR 47.' };
    },
  },

  // 8. Ask EigenH — Unsupported & Safety Refusal Check
  {
    sceneId: 's20-08-ask-eigenh-safety',
    sceneNumber: 8,
    title: 'Ask EigenH — Safety & Unsupported Query Guard',
    role: 'Clinician',
    actorDisplay: 'Ask EigenH (Clinical Safety Guard)',
    actorKind: 'ai',
    screenLabel: 'Patient Chart · Ask EigenH Safety Guard',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'ask-eigenh-open-btn',
    executiveInclude: false,
    caption:
      'When asked to "predict 5-year stroke probability and prescribe a new statin dose," Ask EigenH refuses autonomous diagnosis or prescribing and clearly states the safety boundary.',
    narration:
      'When asked an out-of-scope question requesting autonomous diagnosis or prescribing, Ask EigenH cleanly declines rather than fabricating clinical recommendations.',
    explanationAfter: 'Unsupported prescribing/prognosis query safely declined with transparent explanation.',
    nextStepPreview: 'Ambient Clinical Scribe V2 structured SOAP drafting',
    durationMs: 3400,
    expectedMutation: 'Verifies Ask EigenH classifies prescribing/diagnostic requests as unsupported.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'pre-consultation');
      return {
        ...next,
        auditEvents: appendAiDemoAudit(
          next,
          '08',
          `${DEMO_CLINICAL_DATE} 11:03 EST`,
          'Clinician',
          'Ask EigenH (Safety Guard)',
          'Block Unsupported Clinical Query',
          'Patient',
          AI_DEMO_PATIENT_ID,
          'Declined out-of-scope prognosis/prescribing prompt cleanly under clinical safety boundaries'
        ),
      };
    },
    validate: (state) => {
      const ctxRes = buildPermittedPatientContext(state, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return { passed: false, detail: ctxRes.error };
      const res = executeDeterministicChartSearch(
        ctxRes.context,
        'Predict 5-year stroke probability and prescribe a new statin dose'
      );
      return res.queryPlan.strategy === 'unsupported'
        ? { passed: true, detail: 'Out-of-scope prescribing/prognosis query safely classified as unsupported.' }
        : { passed: false, detail: 'Unsupported safety guard failed to block prescribing request.' };
    },
  },

  // 9. Ambient Clinical Scribe V2
  {
    sceneId: 's20-09-ambient-scribe-v2',
    sceneNumber: 9,
    title: 'Ambient Clinical Scribe V2 (Synthetic Transcript)',
    role: 'Clinician',
    actorDisplay: 'EigenH Ambient Scribe V2 (Deterministic Demo)',
    actorKind: 'ai',
    screenLabel: 'Post-Consultation · Ambient Scribe V2',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'generate-ai-soap-v2-btn',
    uiActions: [{ kind: 'review', target: 'generate-ai-soap-v2-btn', pauseBeforeMs: 240, pauseAfterMs: 320 }],
    caption:
      'During the consultation, Ambient Scribe V2 converts the synthetic visit transcript into SOAP Draft v1 with supporting transcript quotes. No live audio is recorded, and the note is strictly unsigned Draft.',
    narration:
      'In Post-Consultation, Ambient Clinical Scribe V2 processes the synthetic visit transcript into SOAP Draft version 1 with supporting transcript quotes, strictly remaining an unsigned draft.',
    executiveNarration:
      'Ambient Clinical Scribe V2 transforms the synthetic visit transcript into an unsigned SOAP draft with transcript evidence.',
    explanationAfter: 'SOAP Draft v1 generated with supporting quotes; noteStatus remains Draft (autoSigned=false).',
    nextStepPreview: 'SOAP draft uncertainty review & clinician edit',
    durationMs: 4200,
    expectedMutation: 'Creates AmbientScribeSession aidemo-scribe-01 and populates aidemo-enc-01 SOAP in Draft status.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      const ctxRes = buildPermittedPatientContext(next, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!ctxRes.ok) return next;

      const rawScribe = runDeterministicAmbientScribeV2(
        {
          patientId: AI_DEMO_PATIENT_ID,
          encounterId: AI_DEMO_IDS.encounter,
          transcript: AI_DEMO_SYNTHETIC_TRANSCRIPT,
          draftVersion: 1,
          patientContextJson: ctxRes.context.contextSummaryJson,
          allowedSourceIds: ctxRes.context.allowedSourceIds,
        },
        ctxRes.context
      );
      const validated = validateAmbientScribeV2Output(rawScribe, 1);
      const output = validated.sanitized || rawScribe;

      const session = {
        id: AI_DEMO_IDS.scribe,
        patientId: AI_DEMO_PATIENT_ID,
        encounterId: AI_DEMO_IDS.encounter,
        status: 'Draft Ready' as const,
        transcript: AI_DEMO_SYNTHETIC_TRANSCRIPT,
        generatedSoap: output.soap,
        proposedActions: [],
        updatedAt: `${DEMO_CLINICAL_DATE} 11:16 EST`,
      };

      return {
        ...next,
        scribeSessions: upsertById(next.scribeSessions, session),
        encounters: next.encounters.map((e) =>
          e.id === AI_DEMO_IDS.encounter
            ? {
                ...e,
                scribeTranscript: AI_DEMO_SYNTHETIC_TRANSCRIPT,
                soap: output.soap,
                noteStatus: 'Draft',
              }
            : e
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '09',
          `${DEMO_CLINICAL_DATE} 11:16 EST`,
          'Clinician',
          'EigenH Ambient Scribe V2 (Deterministic Demo)',
          'Generate AI SOAP Draft v1',
          'Encounter',
          AI_DEMO_IDS.encounter,
          `Generated SOAP Draft v1 with ${output.supportingTranscriptQuotes.length} transcript quotes (unsigned Draft)`
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === AI_DEMO_IDS.encounter);
      const sess = state.scribeSessions.find((s) => s.id === AI_DEMO_IDS.scribe);
      return enc?.noteStatus === 'Draft' &&
        Boolean(sess?.generatedSoap?.plan) &&
        /Amlodipine/i.test(enc.soap.plan)
        ? { passed: true, detail: 'SOAP Draft v1 generated from synthetic transcript; strictly unsigned Draft.' }
        : { passed: false, detail: 'Ambient Scribe V2 SOAP draft missing or improperly signed.' };
    },
  },

  // 10. Clinician SOAP Draft Uncertainty Audit & Refinement
  {
    sceneId: 's20-10-soap-uncertainty-review',
    sceneNumber: 10,
    title: 'SOAP Draft Uncertainty & Evidence Audit',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (SOAP Refinement)',
    actorKind: 'human',
    screenLabel: 'Post-Consultation · Clinician SOAP Edit',
    classification: 'Human verification required',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'ambient-scribe-panel',
    executiveInclude: false,
    caption:
      'Dr. Rostova verifies transcript quotes, inspects any uncertainty callouts, and appends her explicit Sulfa-allergy check to the editable Plan before generating follow-up actions.',
    narration:
      'Dr. Rostova reviews the supporting transcript quotes and adds a clinician note confirming thiazide avoidance due to Elena’s Sulfa allergy.',
    explanationAfter: 'Clinician refined the SOAP Plan while preserving Draft state before staging proposals.',
    nextStepPreview: 'AI Clinical Action Composer proposal staging',
    durationMs: 3400,
    expectedMutation: 'Appends clinician-verified safety note to aidemo-enc-01 SOAP Plan (remains Draft).',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      return {
        ...next,
        encounters: next.encounters.map((e) =>
          e.id === AI_DEMO_IDS.encounter
            ? {
                ...e,
                soap: {
                  ...e.soap,
                  plan: `${e.soap.plan}\nClinician verification: Confirmed Sulfa allergy — thiazide diuretics avoided.`,
                },
                noteStatus: 'Draft',
              }
            : e
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '10',
          `${DEMO_CLINICAL_DATE} 11:18 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Refine SOAP Draft',
          'Encounter',
          AI_DEMO_IDS.encounter,
          'Reviewed transcript evidence and refined SOAP Plan (still unsigned Draft)'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === AI_DEMO_IDS.encounter);
      return enc?.noteStatus === 'Draft' && /Sulfa allergy/i.test(enc.soap.plan)
        ? { passed: true, detail: 'Clinician refinement persisted in unsigned Draft SOAP plan.' }
        : { passed: false, detail: 'Clinician SOAP refinement missing or note prematurely signed.' };
    },
  },

  // 11. AI Clinical Action Composer — Staged Proposals
  {
    sceneId: 's20-11-action-composer-stage',
    sceneNumber: 11,
    title: 'AI Clinical Action Composer — Staged Proposals',
    role: 'Clinician',
    actorDisplay: 'EigenH Action Composer (Deterministic Demo)',
    actorKind: 'ai',
    screenLabel: 'Post-Consultation · AI Action Composer',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'prepare-ai-actions-btn',
    uiActions: [{ kind: 'review', target: 'prepare-ai-actions-btn', pauseBeforeMs: 220, pauseAfterMs: 320 }],
    caption:
      'AI Clinical Action Composer converts the refined SOAP plan into discrete, editable proposals — Lab Order, Medication Draft, Follow-Up Plan, and Nephrology Referral — each with an idempotency key and zero autonomous execution.',
    narration:
      'Next, the AI Clinical Action Composer stages discrete proposals from the SOAP plan: a renal lab order, an Amlodipine medication draft, a two-week follow-up plan, and a Nephrology referral. None execute until approved individually.',
    executiveNarration:
      'The AI Clinical Action Composer stages editable lab, medication, referral, and follow-up proposals awaiting clinician approval.',
    explanationAfter: 'All staged proposals remain Awaiting Approval with zero autonomous EHR writes.',
    nextStepPreview: 'Individual clinician approval of Lab Order & Medication Draft',
    durationMs: 4200,
    expectedMutation: 'Populates validated Awaiting Approval proposals with idempotency keys on aidemo-scribe-01.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      const enc = next.encounters.find((e) => e.id === AI_DEMO_IDS.encounter);
      const ctxRes = buildPermittedPatientContext(next, {
        patientId: AI_DEMO_PATIENT_ID,
        role: 'Clinician',
        userId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
      });
      if (!enc || !ctxRes.ok) return next;

      const rawComposed = runDeterministicActionComposer(
        {
          patientId: AI_DEMO_PATIENT_ID,
          encounterId: enc.id,
          soap: enc.soap,
          transcript: AI_DEMO_SYNTHETIC_TRANSCRIPT,
          patientContextJson: ctxRes.context.contextSummaryJson,
          allowedSourceIds: ctxRes.context.allowedSourceIds,
        },
        ctxRes.context
      );
      const validated = validateActionComposerOutput(rawComposed, enc.id, ctxRes.context.allowedSourceIds);
      const proposals = validated.sanitized?.proposals || rawComposed.proposals;

      const staged: AiProposedAction[] = proposals.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        summary: p.summary,
        status: 'Awaiting Approval',
        payload: p.payload,
        whyExplanation: p.rationale,
        supportingRecord: p.supportingSourceText,
        source: p.sourceIds.join(', ') || `Encounter ${enc.id}`,
        sourceVerified: true,
        confidence: p.confidence,
        uncertaintyNote: p.uncertaintyNote,
        humanDecisionRequired: 'Clinician review & explicit approval required before execution.',
        idempotencyKey: p.idempotencyKey,
        executionMode: 'deterministic-demo',
        modelId: 'eigenh-deterministic-composer-v2',
      }));

      return {
        ...next,
        scribeSessions: next.scribeSessions.map((s) =>
          s.id === AI_DEMO_IDS.scribe ? { ...s, proposedActions: staged } : s
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '11',
          `${DEMO_CLINICAL_DATE} 11:19 EST`,
          'Clinician',
          'EigenH Action Composer (Deterministic Demo)',
          'Stage AI Clinical Proposals',
          'Encounter',
          enc.id,
          `Staged ${staged.length} editable clinical proposals (all Awaiting Approval; zero auto-execution)`
        ),
      };
    },
    validate: (state) => {
      const sess = state.scribeSessions.find((s) => s.id === AI_DEMO_IDS.scribe);
      const hasOrderAlready = state.orders.some((o) => o.id === AI_DEMO_IDS.labOrder);
      return sess &&
        sess.proposedActions.length >= 3 &&
        sess.proposedActions.every((a) => a.status === 'Awaiting Approval' && Boolean(a.idempotencyKey)) &&
        !hasOrderAlready
        ? {
            passed: true,
            detail: `${sess.proposedActions.length} proposals staged with idempotency keys; zero premature writes.`,
          }
        : { passed: false, detail: 'Action Composer proposals missing, lacking idempotency keys, or auto-executed.' };
    },
  },

  // 12. Clinician Approve — Lab Order & Medication Draft
  {
    sceneId: 's20-12-clinician-approve-lab-med',
    sceneNumber: 12,
    title: 'Clinician Approve — Lab Order & Medication Draft',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Individual Approval)',
    actorKind: 'human',
    screenLabel: 'Post-Consultation · Order & Med Approval',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'ai-action-composer-panel',
    caption:
      'Dr. Rostova individually approves the 2-week BMP + Urine ACR Lab Order and the Amlodipine 5 mg once-daily Medication Draft (simulated — no live eRx transmitted).',
    narration:
      'Dr. Rostova approves the repeat renal lab order and the Amlodipine 5 milligram medication draft one by one. Each approval hands off cleanly to the existing EHR Orders and Medications tables.',
    executiveNarration:
      'Dr. Rostova individually approves the repeat renal lab order and Amlodipine medication draft.',
    explanationAfter: 'Lab order aidemo-ord-01 and simulated Amlodipine 5 mg med aidemo-med-01 created.',
    nextStepPreview: 'Clinician approval of Follow-Up Plan & Nephrology Referral',
    durationMs: 3800,
    isSimulatedApproval: true,
    expectedMutation: 'Creates ClinicalOrder aidemo-ord-01 and Medication aidemo-med-01 and marks proposals Completed.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      const labOrder: ClinicalOrder = {
        id: AI_DEMO_IDS.labOrder,
        requisitionId: 'REQ-AI20-9041',
        patientId: AI_DEMO_PATIENT_ID,
        encounterId: AI_DEMO_IDS.encounter,
        orderedById: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
        category: 'Lab',
        name: 'Basic Metabolic Panel (BMP) + Urine ACR (2-Week Renal Safety Check)',
        code: '80048 / 82043',
        priority: 'Routine',
        status: 'Ordered',
        createdAt: `${DEMO_CLINICAL_DATE} 11:21 EST`,
        notes: 'Approved by Dr. Elena Rostova via Phase 2 AI Action Composer (synthetic).',
      };
      const med: Medication = {
        id: AI_DEMO_IDS.medDraft,
        patientId: AI_DEMO_PATIENT_ID,
        name: 'Amlodipine',
        dose: '5 mg',
        route: 'PO',
        frequency: 'Once daily',
        duration: '90 days (reassess in 2 weeks)',
        status: 'Active',
        prescriberId: 'staff-1',
        pharmacy: 'Beacon Hill Pharmacy (Simulated)',
        formularyStatus: 'Tier 1 Preferred',
        controlled: false,
        reconciled: true,
        startDate: DEMO_CLINICAL_DATE,
        refillsRemaining: 2,
        safetyNote: 'Clinician-approved via Phase 2 Action Composer; Sulfa allergy respected (simulated eRx).',
      };

      return {
        ...next,
        orders: upsertById(next.orders, labOrder),
        medications: upsertById(next.medications, med),
        scribeSessions: next.scribeSessions.map((s) =>
          s.id === AI_DEMO_IDS.scribe
            ? {
                ...s,
                proposedActions: s.proposedActions.map((a) =>
                  a.kind === 'Lab Order'
                    ? { ...a, status: 'Completed', resultRef: labOrder.requisitionId }
                    : a.kind === 'Medication Draft'
                    ? { ...a, status: 'Completed', resultRef: 'Amlodipine 5 mg (Simulated)' }
                    : a
                ),
              }
            : s
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '12',
          `${DEMO_CLINICAL_DATE} 11:21 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Approve Lab Order & Medication Draft',
          'Encounter',
          AI_DEMO_IDS.encounter,
          'Clinician individually approved Lab Order REQ-AI20-9041 and Amlodipine 5 mg (simulated)'
        ),
      };
    },
    validate: (state) => {
      const hasOrder = state.orders.some((o) => o.id === AI_DEMO_IDS.labOrder && o.status === 'Ordered');
      const hasMed = state.medications.some((m) => m.id === AI_DEMO_IDS.medDraft && m.name === 'Amlodipine');
      return hasOrder && hasMed
        ? { passed: true, detail: 'Approved Lab Order REQ-AI20-9041 and Amlodipine 5 mg written to EHR.' }
        : { passed: false, detail: 'Approved Lab Order or Medication Draft missing.' };
    },
  },

  // 13. Clinician Approve — Follow-Up Plan & Nephrology Referral
  {
    sceneId: 's20-13-clinician-approve-followup-referral',
    sceneNumber: 13,
    title: 'Clinician Approve — Follow-Up Plan & Referral',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Care Plan & Referral)',
    actorKind: 'human',
    screenLabel: 'Post-Consultation · Follow-Up & Referral',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'ai-action-composer-panel',
    caption:
      'Dr. Rostova approves the 2-week blood pressure Follow-Up Plan, outgoing Nephrology Referral for CKD Stage 3a albuminuria, and Care Coordination task.',
    narration:
      'Next, Dr. Rostova approves the two-week blood pressure follow-up plan, the outgoing Nephrology referral, and a care coordination task for home cuff review.',
    executiveNarration:
      'Dr. Rostova approves the two-week follow-up plan, Nephrology referral, and care coordination task.',
    explanationAfter: 'Follow-Up Plan, Nephrology Referral, and Care Coordinator Task staged in work queues.',
    nextStepPreview: 'Idempotency guard verification & SOAP note sign-off',
    durationMs: 3800,
    isSimulatedApproval: true,
    expectedMutation: 'Creates FollowUpPlan aidemo-fp-01, Referral aidemo-ref-01, and Task aidemo-tsk-01.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      const followUp: FollowUpPlan = {
        id: AI_DEMO_IDS.followUpPlan,
        patientId: AI_DEMO_PATIENT_ID,
        encounterId: AI_DEMO_IDS.encounter,
        providerId: 'staff-1',
        facilityId: AI_DEMO_FACILITY_ID,
        interval: '2 weeks',
        instructions: 'Recheck clinic & home BP log after Amlodipine 5 mg initiation; review BMP + Urine ACR.',
        createdAt: `${DEMO_CLINICAL_DATE} 11:22 EST`,
        linkedTaskId: AI_DEMO_IDS.task,
        reminderChannel: 'Simulated Portal Notice',
        reminderStatus: 'Simulated Logged',
        reminderMessage: 'Please bring your 14-day home BP log to your 2-week follow-up visit.',
      };
      const referral: Referral = {
        id: AI_DEMO_IDS.referral,
        patientId: AI_DEMO_PATIENT_ID,
        facilityId: AI_DEMO_FACILITY_ID,
        direction: 'Outgoing',
        specialty: 'Nephrology',
        referringProvider: 'Dr. Elena Rostova, MD',
        targetProvider: 'Boston Renal Associates (Synthetic)',
        urgency: 'Routine',
        reason: 'CKD Stage 3a (eGFR 47 mL/min/1.73m2) with rising Urine ACR (96 mg/g) co-management',
        status: 'Received',
        createdAt: `${DEMO_CLINICAL_DATE} 11:22 EST`,
      };
      const task: TaskItem = {
        id: AI_DEMO_IDS.task,
        title: '2-week BP cuff & BMP lab follow-up outreach — Elena Alvarez',
        description: 'Confirm BMP + Urine ACR completion prior to 2-week follow-up and Nephrology consult.',
        status: 'To Do',
        priority: 'Medium',
        ownerId: 'staff-3',
        team: 'Care Coordination',
        facilityId: AI_DEMO_FACILITY_ID,
        patientId: AI_DEMO_PATIENT_ID,
        linkedRecord: { type: 'Encounter', id: AI_DEMO_IDS.encounter, label: 'CKD & HTN Visit' },
        dueDate: '2026-12-02',
        patientVisible: false,
        timeLoggedMin: 0,
        subtasks: [
          { id: 'aidemo-sub-1', title: 'Confirm home BP log & Amlodipine tolerance', done: false },
          { id: 'aidemo-sub-2', title: 'Confirm Nephrology referral scheduling', done: false },
        ],
        comments: [],
        history: [{ id: 'aidemo-th-1', timestamp: `${DEMO_CLINICAL_DATE} 11:22 EST`, event: 'Created via clinician approval' }],
      };

      return {
        ...next,
        followUpPlans: upsertById(next.followUpPlans, followUp),
        referrals: upsertById(next.referrals, referral),
        tasks: upsertById(next.tasks, task),
        scribeSessions: next.scribeSessions.map((s) =>
          s.id === AI_DEMO_IDS.scribe
            ? {
                ...s,
                status: 'Reviewed',
                proposedActions: s.proposedActions.map((a) =>
                  a.status === 'Awaiting Approval'
                    ? { ...a, status: 'Completed', resultRef: 'Clinician Approved' }
                    : a
                ),
              }
            : s
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '13',
          `${DEMO_CLINICAL_DATE} 11:22 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Approve Follow-Up Plan & Nephrology Referral',
          'Encounter',
          AI_DEMO_IDS.encounter,
          'Approved 2-week Follow-Up Plan, outgoing Nephrology referral, and Care Coordination task'
        ),
      };
    },
    validate: (state) => {
      const hasFp = state.followUpPlans.some((f) => f.id === AI_DEMO_IDS.followUpPlan);
      const hasRef = state.referrals.some((r) => r.id === AI_DEMO_IDS.referral && r.specialty === 'Nephrology');
      const hasTask = state.tasks.some((t) => t.id === AI_DEMO_IDS.task);
      return hasFp && hasRef && hasTask
        ? { passed: true, detail: 'Follow-Up Plan, Nephrology Referral, and Care Coordination Task created.' }
        : { passed: false, detail: 'Follow-Up Plan, Referral, or Task missing after approval.' };
    },
  },

  // 14. Idempotency Safety Check & Clinician Sign-Off
  {
    sceneId: 's20-14-idempotency-sign-lock',
    sceneNumber: 14,
    title: 'Idempotent Guard & Clinician Note Sign-Off',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Sign & Lock)',
    actorKind: 'human',
    screenLabel: 'Post-Consultation · Sign & Lock',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'sign-lock-note-btn',
    caption:
      'Idempotency keys guarantee duplicate clicks never create duplicate orders or prescriptions. Dr. Rostova now explicitly signs and locks the consultation note.',
    narration:
      'Idempotency protection ensures no duplicate orders or medications are written even on retry. Dr. Rostova now signs and locks the clinical note.',
    executiveNarration:
      'With idempotency protection verified, Dr. Rostova signs and locks the consultation note.',
    explanationAfter: 'Encounter aidemo-enc-01 signed & locked by Dr. Elena Rostova with zero duplicate orders.',
    nextStepPreview: 'Downstream Laboratory & Care Coordination queues',
    durationMs: 3600,
    isSimulatedApproval: true,
    expectedMutation: 'Transitions aidemo-enc-01 to Signed and confirms unique counts across orders/meds/referrals.',
    prepareView: (prev) => alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = alignAiView(prev, 'Clinician', 'patients', AI_DEMO_PATIENT_ID, 'post-consultation');
      return {
        ...next,
        encounters: next.encounters.map((e) =>
          e.id === AI_DEMO_IDS.encounter
            ? {
                ...e,
                noteStatus: 'Signed',
                signedBy: 'Dr. Elena Rostova, MD',
                signedAt: `${DEMO_CLINICAL_DATE} 11:24 EST`,
                avsReleased: true,
              }
            : e
        ),
        auditEvents: appendAiDemoAudit(
          next,
          '14',
          `${DEMO_CLINICAL_DATE} 11:24 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Sign & Lock Consultation Note',
          'Encounter',
          AI_DEMO_IDS.encounter,
          'Signed SOAP note after verifying all AI proposals and confirming zero duplicate writes'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === AI_DEMO_IDS.encounter);
      const orderCount = state.orders.filter((o) => o.id === AI_DEMO_IDS.labOrder).length;
      const medCount = state.medications.filter((m) => m.id === AI_DEMO_IDS.medDraft).length;
      return enc?.noteStatus === 'Signed' && orderCount === 1 && medCount === 1
        ? { passed: true, detail: 'Consultation note Signed; idempotency confirmed (1 order, 1 med draft).' }
        : { passed: false, detail: 'Note signing or idempotent record count failed.' };
    },
  },

  // 15. Downstream Work Queues
  {
    sceneId: 's20-15-downstream-queues',
    sceneNumber: 15,
    title: 'Downstream Lab & Care Coordination Queues',
    role: 'Laboratory Staff',
    actorDisplay: 'Laboratory & Care Coordination Queues',
    actorKind: 'handoff',
    screenLabel: 'Patient Chart · Orders & Results Queue',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: AI_DEMO_PATIENT_ID,
    patientTab: 'orders-results',
    visualTarget: 'orders-worklist',
    caption:
      'Approved AI-proposed actions flow seamlessly into standard EigenH clinical work queues — Laboratory Staff sees REQ-AI20-9041 ready for collection without manual re-entry.',
    narration:
      'Opening Orders and Results, Laboratory Staff immediately sees Elena’s approved renal lab order queued for specimen collection with zero manual transcription.',
    executiveNarration:
      'Approved proposals appear directly in standard Laboratory and Care Coordination queues with zero re-entry.',
    explanationAfter: 'REQ-AI20-9041 verified live in the Orders & Results queue.',
    nextStepPreview: 'Clinical AI Provenance & Governance audit trail',
    durationMs: 3600,
    expectedMutation: 'Opens Orders & Results queue and verifies aidemo-ord-01 is visible.',
    prepareView: (prev) => alignAiView(prev, 'Laboratory Staff', 'patients', AI_DEMO_PATIENT_ID, 'orders-results'),
    execute: (prev) => alignAiView(prev, 'Laboratory Staff', 'patients', AI_DEMO_PATIENT_ID, 'orders-results'),
    validate: (state) => {
      const ord = state.orders.find((o) => o.id === AI_DEMO_IDS.labOrder);
      return state.currentNav === 'patients' && state.selectedPatientTab === 'orders-results' && ord?.status === 'Ordered'
        ? { passed: true, detail: `Order ${ord.requisitionId} active in Laboratory Staff work queue.` }
        : { passed: false, detail: 'Approved order missing from Orders & Results queue.' };
    },
  },

  // 16. Clinical AI Governance & Provenance Summary
  {
    sceneId: 's20-16-governance-provenance',
    sceneNumber: 16,
    title: 'Clinical AI Provenance & Governance Audit',
    role: 'Administrator',
    actorDisplay: 'EigenH Clinical AI Governance & Audit Log',
    actorKind: 'handoff',
    screenLabel: 'Administration · AI Governance & Provenance',
    classification: 'Completed action',
    routeNav: 'administration',
    patientId: null,
    visualTarget: 'admin-workspace',
    caption:
      'Every Phase 2 AI operation records execution mode, model ID, prompt/schema version, permitted source IDs, and human decision in Governance — plus runtime feature flags for safe prototype rollout.',
    narration:
      'Finally, in Administration and AI Governance, every AI-assisted step is logged with model provenance, human review status, and runtime feature flags. You can also explore Live Gemini AI on synthetic data directly inside any patient chart.',
    executiveNarration:
      'Administration records full AI provenance, human decisions, and runtime feature flags while separating Deterministic Demo from Live AI.',
    explanationAfter: 'Complete 16-chapter Phase 2 AI Clinical Intelligence walkthrough verified end-to-end.',
    nextStepPreview: 'Try Live AI (Synthetic Data Only) in Data Inbox, Pre-Consultation, or Post-Consultation',
    durationMs: 4200,
    expectedMutation: 'Opens Administration governance console and confirms full aud-demo-aidemo-* provenance trail.',
    prepareView: (prev) => alignAiView(prev, 'Administrator', 'administration', null),
    execute: (prev) => {
      const next = alignAiView(prev, 'Administrator', 'administration', null);
      return {
        ...next,
        auditEvents: appendAiDemoAudit(
          next,
          '16',
          `${DEMO_CLINICAL_DATE} 11:26 EST`,
          'Administrator',
          'EigenH AI Governance Audit',
          'Verify Phase 2 Clinical AI Trail',
          'System',
          'eigenh-phase2-clinical-ai',
          'Completed 16-chapter Deterministic Demo audit: Document Intelligence -> Brief -> Ask EigenH -> Scribe V2 -> Action Composer -> Sign-Off'
        ),
      };
    },
    validate: (state) => {
      const trail = state.auditEvents.filter((a) => a.id.startsWith('aud-demo-aidemo-'));
      return state.currentNav === 'administration' && trail.length >= 12
        ? { passed: true, detail: `Verified ${trail.length} provenance audit events in Administration.` }
        : { passed: false, detail: `Expected >=12 Phase 2 audit events, found ${trail.length}.` };
    },
  },
];

export const AI_CLINICAL_INTELLIGENCE_SCENARIO: DemoScenarioDefinition = {
  id: 'demo-20-ai-clinical-intelligence',
  number: '20',
  category: 'AI-Native Clinical Capabilities',
  title: 'AI Native Clinical Intelligence — From Patient Data to Reviewed Clinical Actions',
  subtitle:
    'Document Intelligence -> Pre-Consultation Brief -> Ask EigenH -> Ambient Scribe V2 -> Action Composer -> Human Sign-Off',
  description:
    '16-chapter Deterministic Demo walkthrough of EigenH Phase 2 Clinical Intelligence over synthetic data: real structured lab extraction, unit & reference-range safety, Knowledge Graph sync, source-grounded Pre-Consultation Brief, deterministic Ask EigenH search & refusal guard, Ambient Clinical Scribe V2, idempotent Action Composer approvals, downstream queues, and full provenance auditing.',
  primaryRole: 'Clinician',
  participatingRoles: ['Nurse Practitioner', 'Clinician', 'Laboratory Staff', 'Administrator'],
  valueStatement:
    'Proves end-to-end human-supervised AI clinical workflows with 100% repeatable Deterministic Demo execution and clear separation from Live Gemini AI mode.',
  status: 'Ready',
  flagship: true,
  patientId: AI_DEMO_PATIENT_ID,
  prepareState: buildCleanAiDemoState,
  scenes: AI_CLINICAL_INTELLIGENCE_SCENES,
};
