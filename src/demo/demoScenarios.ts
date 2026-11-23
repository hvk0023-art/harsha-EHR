import {
  buildConsultationActionProposals,
  buildClinicalSafetyRadar,
  buildPreVisitReadiness,
} from '../state/clinicalIntelligence';
import { generateScribeSoapFromTranscript, hasAppointmentConflict } from '../state/domainLogic';
import { executeAuthorizedFhirExport } from '../state/fhirExport';
import type {
  AppState,
  ClinicalHandoffRecord,
  PatientTabKey,
  PreVisitIntakeSubmission,
  StaffNavKey,
  StaffRole,
} from '../types/hms';
import {
  appendDemoAudit,
  buildCleanDemoBaseState,
  DEMO_AMBIENT_TRANSCRIPT,
  DEMO_CLINICAL_DATE,
  DEMO_FACILITY_ID,
  DEMO_IDS,
  DEMO_PATIENT_ID,
  findStaffForRole,
} from './demoFixtures';
import type { DemoScenarioDefinition, DemoSceneDefinition, WorkClassification } from './demoTypes';
import { buildRoleTutorialScenarios } from './roleWorkflowRegistry';

function switchView(
  state: AppState,
  role: StaffRole,
  nav: StaffNavKey,
  patientId: string | null,
  patientTab: PatientTabKey = 'pre-consultation'
): AppState {
  const actor = findStaffForRole(state, role);
  return {
    ...state,
    currentPortal: 'staff',
    currentRole: role,
    currentUserId: actor.id,
    currentFacilityId: DEMO_FACILITY_ID,
    currentNav: nav,
    selectedPatientId: patientId,
    selectedPatientTab: patientTab,
    unsavedDirty: false,
  };
}

function upsertById<T extends { id: string }>(list: T[], item: T, prepend = true): T[] {
  const filtered = list.filter((x) => x.id !== item.id);
  return prepend ? [item, ...filtered] : [...filtered, item];
}

// ============================================================================
// SCENARIO 01 — COMPLETE SCHEDULED PATIENT JOURNEY (14 SCENES, FLAGSHIP)
// ============================================================================

const SCHEDULED_JOURNEY_SCENES: DemoSceneDefinition[] = [
  {
    sceneId: 's01-01-scheduling',
    sceneNumber: 1,
    title: 'Appointment Scheduling',
    role: 'Front Desk',
    actorDisplay: 'Nadia Patel (Front Desk)',
    actorKind: 'human',
    screenLabel: 'Clinic Schedule',
    classification: 'Manual entry',
    routeNav: 'schedule',
    patientId: null,
    visualTarget: 'schedule-calendar',
    caption:
      'Front Desk schedules Elena Alvarez (MRN-109420) for a 30-minute CKD & Hypertension consultation with Dr. Elena Rostova at 11:00 EST.',
    narration:
      "Let's begin at the clinic schedule. Front Desk checks Dr. Elena Rostova's availability and books Elena Alvarez for an eleven o'clock follow-up visit for chronic kidney disease and hypertension.",
    executiveNarration:
      "Front Desk verifies Dr. Rostova's schedule and books Elena Alvarez for an eleven o'clock follow-up visit.",
    explanationAfter: 'Conflict-checked 11:00 EST slot confirmed for Elena Alvarez with Dr. Elena Rostova.',
    nextStepPreview: 'Pre-Visit Information Collection',
    durationMs: 4000,
    expectedMutation: 'Creates conflict-checked Appointment apt-demo-01 (Scheduled) and logs audit event.',
    execute: (prev) => {
      const next = switchView(prev, 'Front Desk', 'schedule', null);
      const candidate = {
        patientId: DEMO_PATIENT_ID,
        providerId: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        date: DEMO_CLINICAL_DATE,
        startTime: '11:00',
        durationMin: 30,
        room: 'Exam 3',
      };
      const conflict = hasAppointmentConflict(
        next.appointments.filter((a) => a.id !== DEMO_IDS.appointment),
        candidate
      );
      const startTime = conflict.conflict ? '14:30' : '11:00';
      const appt = {
        id: DEMO_IDS.appointment,
        patientId: DEMO_PATIENT_ID,
        providerId: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        date: DEMO_CLINICAL_DATE,
        startTime,
        durationMin: 30,
        type: 'CKD & Hypertension Follow-Up',
        subtype: 'Scheduled Visit' as const,
        status: 'Scheduled' as const,
        room: 'Exam 3',
        reason: 'Elevated home BP readings and CKD stage 3a lab follow-up',
        reminderSent: false,
        reminderStatus: 'Not Sent' as const,
        calendarSynced: true,
        coPayAmount: 25,
        coPayCollected: false,
      };
      return {
        ...next,
        appointments: upsertById(next.appointments, appt, false),
        auditEvents: appendDemoAudit(
          next,
          's01-01',
          `${DEMO_CLINICAL_DATE} 08:10 EST`,
          'Front Desk',
          'Nadia Patel',
          'Book Appointment',
          'Appointment',
          appt.id,
          `Scheduled ${appt.type} for Elena Alvarez at ${appt.startTime} EST (conflict-checked)`
        ),
      };
    },
    validate: (state) => {
      const appt = state.appointments.find((a) => a.id === DEMO_IDS.appointment);
      return appt && appt.status === 'Scheduled'
        ? { passed: true, detail: `Appointment ${appt.id} scheduled at ${appt.startTime} EST.` }
        : { passed: false, detail: 'Scheduled appointment apt-demo-01 not found.' };
    },
  },
  {
    sceneId: 's01-02-pre-visit-intake',
    sceneNumber: 2,
    title: 'Pre-Visit Information Collection',
    role: 'Front Desk',
    actorDisplay: 'Elena Alvarez (Simulated Secure Intake Link)',
    actorKind: 'human',
    screenLabel: 'Patient Chart · Pre-Visit Intake',
    classification: 'Manual entry',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'pre-visit-intake',
    visualTarget: 'pre-visit-intake-panel',
    uiActions: [
      {
        kind: 'type',
        target: '#intake-reason',
        value: 'Home blood pressure trending 142-148/86 mmHg; CKD Stage 3a review',
        requiredTarget: true,
        pauseBeforeMs: 280,
        pauseAfterMs: 180,
      },
      {
        kind: 'type',
        target: '#intake-symptoms',
        value: 'Mild evening ankle puffiness twice last week; no chest pain, dyspnea, or dizziness.',
        requiredTarget: true,
        pauseBeforeMs: 200,
        pauseAfterMs: 180,
      },
      {
        kind: 'click',
        target: 'intake-submit-btn',
        requiredTarget: true,
        pauseBeforeMs: 260,
        pauseAfterMs: 320,
      },
    ],
    caption:
      'Watch Elena complete the simulated pre-visit intake form: typing her home BP trend and symptoms, attaching her outside renal lab PDF, and submitting directly into her chart.',
    narration:
      "Before arriving at the clinic, Elena completes her simulated pre-visit intake form. She enters her recent home blood pressure trend, describes her mild evening ankle swelling, and uploads an outside renal lab report directly into her chart.",
    executiveNarration:
      'Before arriving, Elena submits her pre-visit intake form with home blood pressure readings and an outside renal lab report.',
    explanationAfter: 'Pre-visit intake submitted with 2 attached synthetic documents; visit marked Pre-Registered.',
    nextStepPreview: 'AI Intake Intelligence extraction',
    durationMs: 4200,
    expectedMutation:
      'Populates PreVisitIntakeSubmission intake-demo-01 and files source-linked outside PDF doc-demo-01 into the same patient record.',
    prepareView: (prev) => switchView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-visit-intake'),
    execute: (prev) => {
      const next = switchView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-visit-intake');
      const submission: PreVisitIntakeSubmission = {
        id: DEMO_IDS.intake,
        patientId: DEMO_PATIENT_ID,
        appointmentId: DEMO_IDS.appointment,
        submittedAt: `${DEMO_CLINICAL_DATE} 08:25 EST`,
        status: 'Submitted',
        reasonForVisit: 'Home blood pressure trending 142-148/86 mmHg; CKD Stage 3a review',
        symptomsSummary: 'Mild evening ankle puffiness twice last week; no chest pain, dyspnea, or dizziness.',
        reportedMedications: ['Lisinopril 10 mg once daily (verified taking consistently)'],
        reportedAllergies: ['Sulfonamides (Sulfa) — rash'],
        insurancePayer: 'Blue Cross Blue Shield MA',
        insuranceMemberId: 'BCBS-9921048',
        insuranceStatus: 'Pending Manual Verification',
        uploadedDocuments: [
          {
            id: 'updoc-demo-1',
            title: 'Harborview Outside Renal Panel (2026-11-12).pdf',
            type: 'Lab PDF',
            snippet: 'Creatinine 1.38 mg/dL, eGFR 48 mL/min/1.73m2, Serum Potassium 4.5 mmol/L, Urine ACR 92 mg/g.',
            date: '2026-11-12',
          },
          {
            id: 'updoc-demo-2',
            title: 'Home BP 14-Day Log Summary.pdf',
            type: 'External Summary',
            snippet: '14-day average morning BP 144/86 mmHg; evening BP 146/88 mmHg; pulse 70-74 bpm.',
            date: '2026-11-17',
          },
        ],
        extractedItems: [],
      };
      const uploadedDoc = {
        id: DEMO_IDS.outsideDoc,
        patientId: DEMO_PATIENT_ID,
        title: 'Harborview Outside Renal Panel (2026-11-12).pdf',
        category: 'Lab PDF' as const,
        author: 'Patient Pre-Visit Upload (Simulated)',
        source: 'Pre-Visit Intake Upload',
        date: '2026-11-12',
        version: 1,
        verified: false,
        external: true,
        summary: 'Outside creatinine 1.38 mg/dL, eGFR 48 mL/min/1.73m2, K+ 4.5 mmol/L, Urine ACR 92 mg/g.',
      };
      // Deduplicate any live-submitted intake/document rows for Elena before upserting canonical IDs
      const dedupedIntakes = (next.preVisitIntakes || []).filter((i) => i.patientId !== DEMO_PATIENT_ID);
      const dedupedDocs = next.documents.filter(
        (d) => !(d.patientId === DEMO_PATIENT_ID && d.source === 'Pre-Visit Intake Upload')
      );
      return {
        ...next,
        preVisitIntakes: upsertById(dedupedIntakes, submission),
        documents: upsertById(dedupedDocs, uploadedDoc),
        appointments: next.appointments.map((a) =>
          a.id === DEMO_IDS.appointment ? { ...a, status: 'Pre-Registered' as const } : a
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-02',
          `${DEMO_CLINICAL_DATE} 08:25 EST`,
          'Front Desk',
          'Elena Alvarez (Simulated Intake)',
          'Pre-Visit Intake Submitted',
          'Patient',
          DEMO_PATIENT_ID,
          'Submitted pre-visit intake form with 2 synthetic uploaded documents; appointment marked Pre-Registered'
        ),
      };
    },
    validate: (state) => {
      const intake = (state.preVisitIntakes || []).find((i) => i.id === DEMO_IDS.intake);
      const doc = state.documents.find((d) => d.id === DEMO_IDS.outsideDoc);
      return intake && doc && intake.uploadedDocuments.length === 2
        ? { passed: true, detail: `Intake ${intake.id} submitted with 2 source documents.` }
        : { passed: false, detail: 'Pre-visit intake submission or uploaded doc missing.' };
    },
  },
  {
    sceneId: 's01-03-ai-intake-intelligence',
    sceneNumber: 3,
    title: 'AI Intake Intelligence',
    role: 'Front Desk',
    actorDisplay: 'EigenH AI Intake Intelligence (Draft Extraction)',
    actorKind: 'ai',
    screenLabel: 'Pre-Consultation · AI Intake Intelligence',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'ai-doc-to-chart-panel',
    uiActions: [
      { kind: 'click', target: 'extract-intake-btn', requiredTarget: false, pauseBeforeMs: 340, pauseAfterMs: 320 },
      { kind: 'review', target: 'ai-doc-to-chart-panel', pauseBeforeMs: 260, pauseAfterMs: 380 },
    ],
    caption:
      'AI parses uploaded documents into structured draft fields with source snippets and confidence tags, clearly flagging every item as "AI-prepared — review required" until staff review.',
    narration:
      'Next, AI Intake Intelligence reviews the uploaded documents and prepares structured draft entries for kidney function, home blood pressure, and medication adherence. Every item links back to its source document and remains marked for staff review.',
    executiveNarration:
      'AI Intake Intelligence extracts structured lab and blood pressure drafts from the uploaded files and flags every item for human review.',
    explanationAfter: '4 AI-prepared items staged with source snippets; zero items auto-verified.',
    nextStepPreview: 'Front Desk arrival verification & handoff',
    durationMs: 4200,
    expectedMutation: 'Populates 4 source-linked IntakeExtractedItems on intake-demo-01 (all verified=false until human review).',
    prepareView: (prev) => switchView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = switchView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
      const extractedItems = [
        {
          id: 'ext-demo-1',
          field: 'Outside eGFR & Creatinine',
          value: 'eGFR 48 mL/min/1.73m2 · Creatinine 1.38 mg/dL (2026-11-12)',
          sourceDocument: 'Harborview Outside Renal Panel (2026-11-12).pdf',
          sourceSnippet: 'Creatinine 1.38 mg/dL, eGFR 48 mL/min/1.73m2, Serum Potassium 4.5 mmol/L',
          confidence: 'High' as const,
          verified: false,
          targetCategory: 'Lab' as const,
        },
        {
          id: 'ext-demo-2',
          field: 'Home Blood Pressure 14-Day Trend',
          value: 'Average 144/86 AM · 146/88 PM mmHg',
          sourceDocument: 'Home BP 14-Day Log Summary.pdf',
          sourceSnippet: '14-day average morning BP 144/86 mmHg; evening BP 146/88 mmHg',
          confidence: 'High' as const,
          verified: false,
          targetCategory: 'History' as const,
        },
        {
          id: 'ext-demo-3',
          field: 'Current Antihypertensive Adherence',
          value: 'Lisinopril 10 mg PO daily (patient-reported adherent)',
          sourceDocument: 'Pre-Visit Intake Questionnaire',
          sourceSnippet: 'Lisinopril 10 mg once daily (verified taking consistently)',
          confidence: 'High' as const,
          verified: false,
          targetCategory: 'Medication' as const,
        },
        {
          id: 'ext-demo-4',
          field: 'Symptom Signal — Mild Evening Ankle Puffiness',
          value: 'Twice in past week; severity needs clinician exam',
          sourceDocument: 'Pre-Visit Intake Questionnaire',
          sourceSnippet: 'Mild evening ankle puffiness twice last week; no chest pain or dyspnea',
          confidence: 'Medium' as const,
          uncertaintyNote: 'Patient-reported self-assessment without physical exam confirmation.',
          verified: false,
          targetCategory: 'Condition' as const,
        },
      ];
      return {
        ...next,
        preVisitIntakes: (next.preVisitIntakes || []).map((i) =>
          i.id === DEMO_IDS.intake
            ? { ...i, status: 'AI Extracted' as const, extractedItems }
            : i
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-03',
          `${DEMO_CLINICAL_DATE} 08:26 EST`,
          'Front Desk',
          'AI Intake Intelligence (Draft)',
          'AI Intake Extraction',
          'Patient',
          DEMO_PATIENT_ID,
          'Extracted 4 source-linked draft clinical items from intake upload (verification required)'
        ),
      };
    },
    validate: (state) => {
      const intake = (state.preVisitIntakes || []).find((i) => i.id === DEMO_IDS.intake);
      return intake && intake.extractedItems.length === 4 && intake.extractedItems.every((x) => !x.verified)
        ? { passed: true, detail: '4 AI-extracted items staged with source snippets (none auto-verified).' }
        : { passed: false, detail: 'AI intake extraction items missing or improperly auto-verified.' };
    },
  },
  {
    sceneId: 's01-04-front-desk-verification',
    sceneNumber: 4,
    title: 'Front Desk Verification & Handoff',
    role: 'Front Desk',
    actorDisplay: 'Nadia Patel (Front Desk)',
    actorKind: 'handoff',
    screenLabel: 'Front Desk · Arrival Queue',
    classification: 'Human verification required',
    routeNav: 'front-desk',
    patientId: null,
    visualTarget: 'front-desk-row-elena',
    uiActions: [
      { kind: 'review', target: 'front-desk-row-elena', pauseBeforeMs: 320, pauseAfterMs: 420 },
    ],
    caption:
      "The patient's registration is complete. We're now ready to begin the Medical Assistant workflow.",
    narration:
      "When Elena arrives at the clinic, Front Desk confirms her pre-registration and checks her in. The patient's registration is complete. We're now ready to begin the Medical Assistant workflow.",
    executiveNarration:
      "The patient's registration is complete. We're now ready to begin the Medical Assistant workflow.",
    explanationAfter: 'Elena Alvarez marked Checked In; structured handoff sent to Maya Patel, CMA.',
    nextStepPreview: 'Medical Assistant rooming & live vitals entry',
    durationMs: 3800,
    expectedMutation: 'Updates apt-demo-01 status to Checked In, marks intakeFormsComplete, and logs handoff to Medical Assistant.',
    prepareView: (prev) => switchView(prev, 'Front Desk', 'front-desk', null),
    execute: (prev) => {
      const next = switchView(prev, 'Front Desk', 'front-desk', null);
      const handoff: ClinicalHandoffRecord = {
        id: 'ho-demo-fd-ma',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 10:48 EST`,
        fromRole: 'Front Desk',
        fromActor: 'Nadia Patel',
        toRole: 'Medical Assistant',
        toOwnerName: 'Maya Patel, CMA',
        reason: 'Patient checked in for 11:00 CKD/HTN visit; pre-visit intake and 2 outside PDFs ready for rooming prep.',
        linkedRecordRef: `Appointment ${DEMO_IDS.appointment}`,
        status: 'Pending',
      };
      return {
        ...next,
        patients: next.patients.map((p) =>
          p.id === DEMO_PATIENT_ID ? { ...p, intakeFormsComplete: true } : p
        ),
        appointments: next.appointments.map((a) =>
          a.id === DEMO_IDS.appointment ? { ...a, status: 'Checked In' as const, coPayCollected: true } : a
        ),
        handoffs: upsertById(next.handoffs || [], handoff),
        auditEvents: appendDemoAudit(
          next,
          's01-04',
          `${DEMO_CLINICAL_DATE} 10:48 EST`,
          'Front Desk',
          'Nadia Patel',
          'Check-In & Handoff',
          'Appointment',
          DEMO_IDS.appointment,
          'Verified arrival, collected $25 copay (sim), set Checked In, handed off to Maya Patel, CMA'
        ),
      };
    },
    validate: (state) => {
      const appt = state.appointments.find((a) => a.id === DEMO_IDS.appointment);
      const ho = (state.handoffs || []).find((h) => h.id === 'ho-demo-fd-ma');
      return appt?.status === 'Checked In' && Boolean(ho)
        ? { passed: true, detail: 'Appointment Checked In and handoff to Medical Assistant recorded.' }
        : { passed: false, detail: 'Check-in status or Front Desk -> MA handoff missing.' };
    },
  },
  {
    sceneId: 's01-05-medical-assistant-prep',
    sceneNumber: 5,
    title: 'Medical Assistant Preparation',
    role: 'Medical Assistant',
    actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
    actorKind: 'human',
    screenLabel: 'Medical Assistant · Clinical Intake & Vitals',
    classification: 'Manual entry',
    routeNav: 'front-desk',
    patientId: null,
    visualTarget: 'fd-checkin-btn-elena',
    uiActions: [
      { kind: 'click', target: 'fd-checkin-btn-elena', requiredTarget: true, pauseBeforeMs: 300, pauseAfterMs: 260 },
      { kind: 'click', target: 'fd-modal-demo-checkbox', requiredTarget: true, pauseBeforeMs: 220, pauseAfterMs: 180 },
      { kind: 'click', target: 'fd-modal-verify-coverage-btn', requiredTarget: true, pauseBeforeMs: 220, pauseAfterMs: 220 },
      { kind: 'type', target: 'fd-vital-sys', value: '146', requiredTarget: true, pauseBeforeMs: 200, pauseAfterMs: 150 },
      { kind: 'type', target: 'fd-vital-dia', value: '88', requiredTarget: true, pauseBeforeMs: 180, pauseAfterMs: 150 },
      { kind: 'type', target: 'fd-vital-hr', value: '74', requiredTarget: true, pauseBeforeMs: 180, pauseAfterMs: 150 },
      { kind: 'type', target: 'fd-vital-spo2', value: '99', requiredTarget: true, pauseBeforeMs: 180, pauseAfterMs: 180 },
      { kind: 'click', target: 'fd-modal-submit-btn', requiredTarget: true, pauseBeforeMs: 260, pauseAfterMs: 300 },
    ],
    caption:
      'Watch Medical Assistant Maya Patel open Elena’s clinical intake modal, verify simulated coverage, visibly enter vitals (BP 146/88 mmHg, HR 74 bpm, SpO2 99%), and room her in Exam 3.',
    narration:
      "Medical Assistant Maya Patel opens Elena's intake form, verifies her simulated insurance eligibility, and records today's vital signs, including a blood pressure of 146 over 88. Once saved, Elena is roomed in Exam 3 and ready for clinical preparation.",
    executiveNarration:
      "The Medical Assistant confirms simulated coverage, records Elena's blood pressure of 146 over 88, and rooms her in Exam 3.",
    explanationAfter: 'Vitals BP 146/88 mmHg recorded, Lisinopril reconciled, Elena roomed in Exam 3.',
    nextStepPreview: 'Nurse Practitioner verification of AI-extracted items',
    durationMs: 4200,
    expectedMutation:
      'Records vit-demo-01, creates simulated Active insurance policy pol-demo-01, reconciles Lisinopril, updates appointment to In Room, and hands off to Nurse Practitioner.',
    prepareView: (prev) => switchView(prev, 'Medical Assistant', 'front-desk', null),
    execute: (prev) => {
      const next = switchView(prev, 'Medical Assistant', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
      const vital = {
        id: DEMO_IDS.vitals,
        patientId: DEMO_PATIENT_ID,
        recordedAt: `${DEMO_CLINICAL_DATE} 10:53 EST`,
        bpSystolic: 146,
        bpDiastolic: 88,
        heartRate: 74,
        tempF: 98.5,
        spo2: 99,
        weightKg: 68.2,
        heightCm: 164,
        painScore: 0,
        source: 'Clinic Intake' as const,
        recordedBy: 'Maya Patel, CMA',
      };
      const policy = {
        id: DEMO_IDS.policy,
        patientId: DEMO_PATIENT_ID,
        payerName: 'Blue Cross Blue Shield MA',
        payerCategory: 'Commercial' as const,
        planName: 'PPO Choice Plus (Simulated)',
        memberId: 'BCBS-9921048',
        groupNumber: 'GRP-44021',
        isPrimary: true,
        status: 'Active' as const,
        eligibilityCheckedAt: `${DEMO_CLINICAL_DATE} 10:52 EST`,
        eligibilitySummary: {
          preventiveServices: 'Covered 100% in-network (simulated)',
          nonCoveredNote: 'Simulated eligibility verification — no live clearinghouse call.',
          deductibleTotal: 1000,
          deductibleMet: 750,
          coinsurancePct: 20,
          copay: 25,
        },
      };
      const handoff: ClinicalHandoffRecord = {
        id: 'ho-demo-ma-np',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 10:55 EST`,
        fromRole: 'Medical Assistant',
        fromActor: 'Maya Patel, CMA',
        toRole: 'Nurse Practitioner',
        toOwnerName: 'Hannah Brooks, NP',
        reason: 'Roomed in Exam 3; BP 146/88 mmHg (+12 systolic vs Aug), Sulfa allergy verified, Lisinopril reconciled.',
        linkedRecordRef: `Vitals ${DEMO_IDS.vitals}`,
        status: 'Pending',
      };
      // Deduplicate live-submitted intake vital/policy before writing canonical IDs
      const dedupedVitals = next.vitals.filter(
        (v) => !(v.patientId === DEMO_PATIENT_ID && v.bpSystolic === 146 && v.id !== DEMO_IDS.vitals)
      );
      const dedupedPolicies = next.policies.filter(
        (p) => !(p.patientId === DEMO_PATIENT_ID && p.memberId === 'BCBS-9921048' && p.id !== DEMO_IDS.policy)
      );
      return {
        ...next,
        vitals: upsertById(dedupedVitals, vital),
        policies: upsertById(dedupedPolicies, policy),
        medications: next.medications.map((m) =>
          m.patientId === DEMO_PATIENT_ID ? { ...m, reconciled: true } : m
        ),
        appointments: next.appointments.map((a) =>
          a.id === DEMO_IDS.appointment ? { ...a, status: 'In Room' as const, room: 'Exam 3' } : a
        ),
        preVisitIntakes: (next.preVisitIntakes || []).map((i) =>
          i.id === DEMO_IDS.intake
            ? { ...i, insuranceStatus: 'Simulated Verified' as const }
            : i
        ),
        handoffs: upsertById(
          (next.handoffs || []).map((h) => (h.id === 'ho-demo-fd-ma' ? { ...h, status: 'Completed' as const } : h)),
          handoff
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-05',
          `${DEMO_CLINICAL_DATE} 10:55 EST`,
          'Medical Assistant',
          'Maya Patel, CMA',
          'Rooming & Intake Prep',
          'Patient',
          DEMO_PATIENT_ID,
          'Recorded vitals BP 146/88 mmHg, verified simulated coverage, reconciled meds, handed off to NP'
        ),
      };
    },
    validate: (state) => {
      const vit = state.vitals.find((v) => v.id === DEMO_IDS.vitals);
      const appt = state.appointments.find((a) => a.id === DEMO_IDS.appointment);
      const pol = state.policies.find((p) => p.id === DEMO_IDS.policy);
      return vit && appt?.status === 'In Room' && pol?.status === 'Active'
        ? { passed: true, detail: `Vitals BP ${vit.bpSystolic}/${vit.bpDiastolic}, In Room, Active simulated coverage.` }
        : { passed: false, detail: 'MA vitals, In Room status, or simulated coverage missing.' };
    },
  },
  {
    sceneId: 's01-06-np-clinical-prep',
    sceneNumber: 6,
    title: 'Clinical Preparation & Verification',
    role: 'Nurse Practitioner',
    actorDisplay: 'Hannah Brooks, NP (Nurse Practitioner)',
    actorKind: 'handoff',
    screenLabel: 'Pre-Consultation · Clinical Verification',
    classification: 'Human verification required',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'ai-doc-to-chart-panel',
    uiActions: [
      { kind: 'click', target: 'verify-intake-btn-0', requiredTarget: false, pauseBeforeMs: 320, pauseAfterMs: 240 },
      { kind: 'click', target: 'verify-intake-btn-1', requiredTarget: false, pauseBeforeMs: 240, pauseAfterMs: 240 },
      { kind: 'review', target: 'pre-visit-readiness-panel', pauseBeforeMs: 240, pauseAfterMs: 340 },
    ],
    caption:
      'Watch Nurse Practitioner Hannah Brooks verify the AI-extracted pre-visit fields against source snippets, confirm the outside renal PDF, open the Draft encounter, and hand off to Dr. Rostova.',
    narration:
      'Nurse Practitioner Hannah Brooks reviews the AI-prepared intake items against their original source snippets and verifies the outside renal lab report. She then opens a draft encounter so Dr. Elena Rostova has a verified chart ready.',
    executiveNarration:
      'The Nurse Practitioner verifies the AI-prepared intake items against their source files and opens a draft encounter for Dr. Rostova.',
    explanationAfter: 'All 4 AI intake items verified by NP; Draft encounter opened for Dr. Elena Rostova.',
    nextStepPreview: 'Clinician Pre-Consultation Summary',
    durationMs: 4200,
    expectedMutation:
      'Marks all 4 IntakeExtractedItems verified by Hannah Brooks, NP, verifies doc-demo-01, creates Draft encounter enc-demo-01, and logs handoff to Clinician.',
    prepareView: (prev) => switchView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = switchView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
      const encounter = {
        id: DEMO_IDS.encounter,
        patientId: DEMO_PATIENT_ID,
        appointmentId: DEMO_IDS.appointment,
        providerId: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        date: DEMO_CLINICAL_DATE,
        type: 'CKD & Hypertension Follow-Up',
        chiefComplaint: 'Elevated home blood pressure (144-146/88 mmHg) and CKD stage 3a follow-up',
        soap: {
          subjective: 'Pre-visit intake verified by NP: home BP trending 142-148/86 mmHg on Lisinopril 10 mg daily; mild evening ankle puffiness x2.',
          objective: 'Clinic BP 146/88 mmHg, HR 74 bpm, SpO2 99%, Wt 68.2 kg. Outside 2026-11-12 labs verified: Cr 1.38 mg/dL, eGFR 48 mL/min, K+ 4.5 mmol/L.',
          assessment: 'Awaiting provider consultation.',
          plan: 'Awaiting provider consultation.',
        },
        diagnoses: ['Chronic kidney disease, stage 3a (N18.31)', 'Essential hypertension (I10)'],
        noteStatus: 'Draft' as const,
        amendments: [],
        comments: [],
        avsReleased: false,
      };
      const handoff: ClinicalHandoffRecord = {
        id: 'ho-demo-np-md',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 10:58 EST`,
        fromRole: 'Nurse Practitioner',
        fromActor: 'Hannah Brooks, NP',
        toRole: 'Clinician',
        toOwnerName: 'Dr. Elena Rostova, MD',
        reason: 'Pre-visit intake & outside renal labs verified; note opened in Draft; ready for provider consult in Exam 3.',
        linkedRecordRef: `Encounter ${DEMO_IDS.encounter}`,
        status: 'Pending',
      };
      return {
        ...next,
        encounters: upsertById(next.encounters, encounter),
        documents: next.documents.map((d) => (d.id === DEMO_IDS.outsideDoc ? { ...d, verified: true } : d)),
        preVisitIntakes: (next.preVisitIntakes || []).map((i) =>
          i.id === DEMO_IDS.intake
            ? {
                ...i,
                status: 'Verified' as const,
                extractedItems: i.extractedItems.map((item) => ({
                  ...item,
                  verified: true,
                  verifiedBy: 'Hannah Brooks, NP',
                  verifiedAt: `${DEMO_CLINICAL_DATE} 10:57 EST`,
                })),
              }
            : i
        ),
        handoffs: upsertById(
          (next.handoffs || []).map((h) => (h.id === 'ho-demo-ma-np' ? { ...h, status: 'Completed' as const } : h)),
          handoff
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-06',
          `${DEMO_CLINICAL_DATE} 10:58 EST`,
          'Nurse Practitioner',
          'Hannah Brooks, NP',
          'Verify Pre-Visit Prep',
          'Encounter',
          DEMO_IDS.encounter,
          'Verified 4 AI intake extractions & outside lab PDF; opened Draft encounter and handed off to Dr. Rostova'
        ),
      };
    },
    validate: (state) => {
      const intake = (state.preVisitIntakes || []).find((i) => i.id === DEMO_IDS.intake);
      const enc = state.encounters.find((e) => e.id === DEMO_IDS.encounter);
      const readiness = buildPreVisitReadiness(state, DEMO_PATIENT_ID);
      return intake?.status === 'Verified' && Boolean(enc) && readiness.completedCount === readiness.totalCount
        ? {
            passed: true,
            detail: `Pre-visit readiness ${readiness.completedCount}/${readiness.totalCount} complete; Draft encounter ready.`,
          }
        : { passed: false, detail: 'NP verification or Draft encounter creation incomplete.' };
    },
  },
  {
    sceneId: 's01-07-pre-consultation-summary',
    sceneNumber: 7,
    title: 'Pre-Consultation Summary',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Clinician)',
    actorKind: 'ai',
    screenLabel: 'Clinician · Pre-Consultation Summary',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'what-matters-today-panel',
    uiActions: [
      { kind: 'review', target: 'clinical-safety-radar-panel', pauseBeforeMs: 280, pauseAfterMs: 320 },
      { kind: 'review', target: 'what-matters-today-panel', pauseBeforeMs: 260, pauseAfterMs: 360 },
    ],
    caption:
      "The patient's clinical history has been prepared for review. Let's open the Pre-Consultation Summary.",
    narration:
      "The patient's clinical history has been prepared for review. Let's open the Pre-Consultation Summary. Dr. Rostova immediately sees Elena's rising blood pressure trend, verified kidney labs, and Sulfa allergy alert in one calm view.",
    executiveNarration:
      "The patient's clinical history has been prepared for review. Let's open the Pre-Consultation Summary.",
    explanationAfter: 'Clinician accepted NP handoff and reviewed Safety Radar + What Matters Today.',
    nextStepPreview: 'Simulated Ambient AI Scribe SOAP draft',
    durationMs: 4200,
    expectedMutation: 'Clinician accepts NP handoff and opens verified Pre-Consultation Summary.',
    prepareView: (prev) => switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
      return {
        ...next,
        handoffs: (next.handoffs || []).map((h) =>
          h.id === 'ho-demo-np-md' ? { ...h, status: 'Accepted' as const } : h
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-07',
          `${DEMO_CLINICAL_DATE} 11:01 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Review Pre-Consultation Summary',
          'Patient',
          DEMO_PATIENT_ID,
          'Accepted NP handoff and reviewed What Matters Today + Clinical Safety Radar'
        ),
      };
    },
    validate: (state) => {
      const ho = (state.handoffs || []).find((h) => h.id === 'ho-demo-np-md');
      return state.selectedPatientTab === 'pre-consultation' && ho?.status === 'Accepted'
        ? { passed: true, detail: 'Clinician opened Pre-Consultation Summary and accepted NP handoff.' }
        : { passed: false, detail: 'Pre-Consultation view or handoff acceptance failed.' };
    },
  },
  {
    sceneId: 's01-08-ambient-ai-scribe',
    sceneNumber: 8,
    title: 'Ambient AI Scribe (Simulated)',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD + AI Scribe (Simulated Transcript)',
    actorKind: 'ai',
    screenLabel: 'Post-Consultation · Ambient AI Scribe (Simulated)',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'ambient-scribe-panel',
    uiActions: [
      { kind: 'click', target: 'start-sim-scribe-btn', requiredTarget: false, pauseBeforeMs: 300, pauseAfterMs: 340 },
      { kind: 'click', target: 'stop-gen-soap-btn', requiredTarget: false, pauseBeforeMs: 300, pauseAfterMs: 340 },
      { kind: 'review', target: 'ambient-scribe-panel', pauseBeforeMs: 220, pauseAfterMs: 300 },
    ],
    caption:
      'Watch the Simulated Ambient AI Scribe start and convert the synthetic consultation transcript (no live audio captured) into an editable SOAP note draft marked Review Required.',
    narration:
      'During the consultation, Dr. Rostova runs the simulated Ambient AI Scribe using a synthetic visit transcript. No live microphone audio is captured, and the generated SOAP note stays in draft status until the clinician reviews and signs it.',
    executiveNarration:
      'The simulated Ambient AI Scribe converts the synthetic consultation transcript into an editable SOAP note draft awaiting clinician review.',
    explanationAfter: 'Structured SOAP draft populated; note remains unsigned Draft awaiting clinician review.',
    nextStepPreview: 'AI Clinical Action Composer proposals',
    durationMs: 4200,
    expectedMutation:
      'Creates AmbientScribeSession scribe-demo-01 (Draft Ready) and updates enc-demo-01 SOAP draft while keeping noteStatus=Draft.',
    prepareView: (prev) => switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation');
      const pat = next.patients.find((p) => p.id === DEMO_PATIENT_ID)!;
      const latestVital = next.vitals.find((v) => v.patientId === DEMO_PATIENT_ID);
      const generated = generateScribeSoapFromTranscript(DEMO_AMBIENT_TRANSCRIPT, {
        chiefComplaint: 'Hypertension & Type 2 Diabetes Follow-Up',
        latestVitalsSummary: latestVital
          ? `BP ${latestVital.bpSystolic}/${latestVital.bpDiastolic} mmHg, HR ${latestVital.heartRate} bpm, SpO2 ${latestVital.spo2}%`
          : undefined,
        allergySummary:
          pat.allergies.length > 0
            ? pat.allergies.map((a) => `${a.substance} (${a.severity})`).join(', ')
            : 'NKDA',
      });
      const soap = generated.soap;
      const session = {
        id: DEMO_IDS.scribe,
        patientId: DEMO_PATIENT_ID,
        encounterId: DEMO_IDS.encounter,
        status: 'Draft Ready' as const,
        transcript: DEMO_AMBIENT_TRANSCRIPT,
        generatedSoap: soap,
        proposedActions: [],
        updatedAt: `${DEMO_CLINICAL_DATE} 11:18 EST`,
      };
      const dedupedSessions = (next.scribeSessions || []).filter((s) => s.patientId !== DEMO_PATIENT_ID);
      return {
        ...next,
        scribeSessions: upsertById(dedupedSessions, session),
        encounters: next.encounters.map((e) =>
          e.id === DEMO_IDS.encounter
            ? {
                ...e,
                scribeTranscript: DEMO_AMBIENT_TRANSCRIPT,
                soap,
                noteStatus: 'Draft' as const,
              }
            : e
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-08',
          `${DEMO_CLINICAL_DATE} 11:18 EST`,
          'Clinician',
          'Ambient AI Scribe (Simulated)',
          'Generate SOAP Draft',
          'Encounter',
          DEMO_IDS.encounter,
          'Generated structured SOAP draft from synthetic transcript (no live audio; clinician review required)'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === DEMO_IDS.encounter);
      const session = (state.scribeSessions || []).find((s) => s.id === DEMO_IDS.scribe);
      return Boolean(enc?.scribeTranscript) && enc?.noteStatus === 'Draft' && session?.status === 'Draft Ready'
        ? { passed: true, detail: 'SOAP draft populated from simulated transcript; note remains unsigned Draft.' }
        : { passed: false, detail: 'Simulated SOAP draft failed or bypassed Draft state.' };
    },
  },
  {
    sceneId: 's01-09-ai-action-composer',
    sceneNumber: 9,
    title: 'AI Clinical Action Composer',
    role: 'Clinician',
    actorDisplay: 'EigenH AI Action Composer (Proposals Awaiting Approval)',
    actorKind: 'ai',
    screenLabel: 'Post-Consultation · AI Clinical Action Composer',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'ai-action-composer-panel',
    caption:
      'AI Clinical Action Composer stages 5 discrete proposals — Lab Order, Amlodipine 5 mg Draft, 2-Week Follow-Up Plan, Patient Instructions, and Care Coordinator Handoff — each with "Why?" evidence and zero autonomous execution.',
    narration:
      'From the consultation draft, the AI Clinical Action Composer prepares five follow-up proposals, including a renal lab panel, a blood pressure medication draft, and a two-week follow-up plan. Nothing is ordered or sent without individual clinician approval.',
    executiveNarration:
      'The AI Action Composer stages five evidence-linked follow-up proposals with zero autonomous execution.',
    explanationAfter: '5 explainable proposals staged as Awaiting Approval; zero autonomous clinical writes.',
    nextStepPreview: 'Clinician SOAP refinement, individual approvals & sign-off',
    durationMs: 4200,
    expectedMutation:
      'Populates 5 Awaiting Approval proposals with Why? explainability on scribe-demo-01 without executing any order/med yet.',
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation');
      const pat = next.patients.find((p) => p.id === DEMO_PATIENT_ID)!;
      const enc = next.encounters.find((e) => e.id === DEMO_IDS.encounter);
      const proposals = buildConsultationActionProposals(DEMO_AMBIENT_TRANSCRIPT, pat, enc);
      return {
        ...next,
        scribeSessions: (next.scribeSessions || []).map((s) =>
          s.id === DEMO_IDS.scribe ? { ...s, proposedActions: proposals } : s
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-09',
          `${DEMO_CLINICAL_DATE} 11:19 EST`,
          'Clinician',
          'AI Action Composer (Draft)',
          'Stage Clinical Proposals',
          'Encounter',
          DEMO_IDS.encounter,
          `Staged ${proposals.length} explainable clinical actions (all Awaiting Approval; zero auto-execution)`
        ),
      };
    },
    validate: (state) => {
      const session = (state.scribeSessions || []).find((s) => s.id === DEMO_IDS.scribe);
      const hasOrderAlready = state.orders.some((o) => o.id === DEMO_IDS.labOrder);
      return (
        session &&
        session.proposedActions.length === 5 &&
        session.proposedActions.every((a) => a.status === 'Awaiting Approval' && Boolean(a.whyExplanation)) &&
        !hasOrderAlready
      )
        ? { passed: true, detail: '5 explainable proposals staged as Awaiting Approval; zero autonomous writes.' }
        : { passed: false, detail: 'Proposals missing or executed prematurely without approval.' };
    },
  },
  {
    sceneId: 's01-10-post-consultation-review',
    sceneNumber: 10,
    title: 'Post-Consultation Review & Clinician Approval',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Simulated Clinician Approval)',
    actorKind: 'human',
    screenLabel: 'Post-Consultation · Clinician Approval & Sign-Off',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'post-consultation',
    visualTarget: 'post-consult-approval-bar',
    uiActions: [
      {
        kind: 'type',
        target: '#post-soap-plan',
        value: ' Verified Sulfa allergy avoided; bring home BP log in 2 weeks.',
        append: true,
        requiredTarget: false,
        pauseBeforeMs: 260,
        pauseAfterMs: 220,
      },
      { kind: 'click', target: 'composer-why-btn-0', requiredTarget: false, pauseBeforeMs: 260, pauseAfterMs: 320 },
      { kind: 'click', target: 'composer-approve-btn-0', requiredTarget: false, pauseBeforeMs: 280, pauseAfterMs: 260 },
      { kind: 'click', target: 'sign-lock-note-btn', requiredTarget: false, pauseBeforeMs: 280, pauseAfterMs: 320 },
    ],
    caption:
      'The clinician has approved the proposed actions. These tasks will now appear in the appropriate staff work queues.',
    narration:
      'Dr. Rostova refines the treatment plan, checks the supporting evidence, and signs the clinical note. The clinician has approved the proposed actions. These tasks will now appear in the appropriate staff work queues.',
    executiveNarration:
      'The clinician has approved the proposed actions. These tasks will now appear in the appropriate staff work queues.',
    explanationAfter: 'SOAP note signed and locked; approved lab order, Amlodipine 5 mg (sim), follow-up plan, and Care Coordinator handoff created.',
    nextStepPreview: 'Care Coordinator accepts post-visit handoff',
    durationMs: 4400,
    isSimulatedApproval: true,
    expectedMutation:
      'Signs enc-demo-01, creates Ordered lab ord-demo-01, Active (simulated) Amlodipine med-demo-01, FollowUpPlan fp-demo-01, Patient Message msg-demo-01, Task tsk-demo-01, and Handoff to Care Coordinator.',
    prepareView: (prev) => switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation'),
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation');
      const labOrder = {
        id: DEMO_IDS.labOrder,
        requisitionId: 'REQ-88940',
        patientId: DEMO_PATIENT_ID,
        encounterId: DEMO_IDS.encounter,
        orderedById: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        category: 'Lab' as const,
        name: 'Renal Function & Serum Potassium Panel',
        code: '80048',
        priority: 'Routine' as const,
        status: 'Ordered' as const,
        createdAt: DEMO_CLINICAL_DATE,
        notes: 'Approved in Post-Consultation Review (Demo Playback)',
      };
      const newMed = {
        id: DEMO_IDS.medDraft,
        patientId: DEMO_PATIENT_ID,
        name: 'Amlodipine Besylate',
        dose: '5 mg',
        route: 'Oral',
        frequency: 'Once daily',
        duration: '30 days',
        status: 'Active' as const,
        prescriberId: 'staff-1',
        pharmacy: 'CVS Boylston #0412',
        formularyStatus: 'Tier 1 Preferred' as const,
        controlled: false,
        reconciled: true,
        startDate: DEMO_CLINICAL_DATE,
        refillsRemaining: 2,
        safetyNote: 'Clinician approved synthetic entry (not transmitted externally); monitor mild ankle edema.',
      };
      const followUpPlan = {
        id: DEMO_IDS.followUpPlan,
        patientId: DEMO_PATIENT_ID,
        encounterId: DEMO_IDS.encounter,
        providerId: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        interval: '2 weeks',
        instructions:
          'Complete Renal Function & Serum Potassium Panel within 5 days and bring home BP log to 2-week follow-up visit.',
        createdAt: DEMO_CLINICAL_DATE,
        linkedTaskId: DEMO_IDS.handoffTask,
        reminderChannel: 'Simulated SMS' as const,
        reminderStatus: 'Not Scheduled' as const,
      };
      const patientMsg = {
        id: DEMO_IDS.messageThread,
        patientId: DEMO_PATIENT_ID,
        subject: 'After-Visit Summary & Next Steps',
        channel: 'In-App' as const,
        ownerId: 'staff-1',
        priority: 'Normal' as const,
        status: 'Open' as const,
        tags: ['After-Visit Summary', 'Clinician Approved'],
        participants: ['Elena Alvarez', 'Dr. Elena Rostova, MD'],
        messages: [
          {
            id: 'm-demo-avs-1',
            sender: 'Dr. Elena Rostova, MD',
            isPatient: false,
            isInternalNote: false,
            channel: 'In-App' as const,
            timestamp: `${DEMO_CLINICAL_DATE} 11:22 EST`,
            body: 'Thank you for visiting EigenH Boston Medical Center. Please complete your Renal & Potassium blood draw within 5 days, track morning and evening blood pressure, and call if you experience dizziness or worsening ankle swelling.',
            deliveryStatus: 'Simulated' as const,
          },
        ],
      };
      const coordTask = {
        id: DEMO_IDS.handoffTask,
        title: 'Track Renal/Potassium lab completion & book 2-week BP follow-up',
        description: 'Approved in Post-Consultation Review by Dr. Elena Rostova, MD.',
        status: 'To Do' as const,
        priority: 'High' as const,
        ownerId: 'staff-2',
        team: 'Care Coordination',
        facilityId: DEMO_FACILITY_ID,
        patientId: DEMO_PATIENT_ID,
        linkedRecord: { type: 'Order', id: DEMO_IDS.labOrder, label: 'REQ-88940 Renal/Potassium' },
        dueDate: '2026-11-23',
        patientVisible: false,
        timeLoggedMin: 0,
        subtasks: [
          { id: 'st-demo-1', title: 'Confirm lab specimen result received', done: false },
          { id: 'st-demo-2', title: 'Book 2-week follow-up slot & log simulated reminder', done: false },
        ],
        comments: [],
        history: [
          {
            id: 'th-demo-1',
            timestamp: `${DEMO_CLINICAL_DATE} 11:22 EST`,
            event: 'Created via clinician-approved Post-Consultation Action Composer',
          },
        ],
      };
      const handoff: ClinicalHandoffRecord = {
        id: 'ho-demo-md-coord',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 11:23 EST`,
        fromRole: 'Clinician',
        fromActor: 'Dr. Elena Rostova, MD',
        toRole: 'Nurse / Care Coordinator',
        toOwnerName: 'Jordan Lee, RN',
        reason: 'Note signed; REQ-88940 Renal/K+ ordered; Amlodipine 5 mg approved (sim); coordinate lab & 2-week visit.',
        linkedRecordRef: `Order ${DEMO_IDS.labOrder} · Plan ${DEMO_IDS.followUpPlan}`,
        status: 'Pending',
      };
      return {
        ...next,
        encounters: next.encounters.map((e) =>
          e.id === DEMO_IDS.encounter
            ? {
                ...e,
                noteStatus: 'Signed' as const,
                signedBy: 'Dr. Elena Rostova, MD',
                signedAt: `${DEMO_CLINICAL_DATE} 11:22 EST`,
                avsReleased: true,
              }
            : e
        ),
        appointments: next.appointments.map((a) =>
          a.id === DEMO_IDS.appointment ? { ...a, status: 'Completed' as const } : a
        ),
        orders: upsertById(
          next.orders.filter(
            (o) => !(o.patientId === DEMO_PATIENT_ID && o.encounterId === DEMO_IDS.encounter && o.id !== DEMO_IDS.labOrder)
          ),
          labOrder
        ),
        medications: upsertById(
          next.medications.filter(
            (m) => !(m.patientId === DEMO_PATIENT_ID && m.name.toLowerCase().includes('amlodipine') && m.id !== DEMO_IDS.medDraft)
          ),
          newMed
        ),
        followUpPlans: upsertById(
          (next.followUpPlans || []).filter(
            (f) => !(f.patientId === DEMO_PATIENT_ID && f.id !== DEMO_IDS.followUpPlan)
          ),
          followUpPlan
        ),
        messages: upsertById(next.messages, patientMsg),
        tasks: upsertById(next.tasks, coordTask),
        scribeSessions: (next.scribeSessions || []).map((s) =>
          s.id === DEMO_IDS.scribe
            ? {
                ...s,
                status: 'Reviewed' as const,
                proposedActions: s.proposedActions.map((a) => ({
                  ...a,
                  status: 'Completed' as const,
                  resultRef: 'Approved (Simulated Clinician Sign-Off)',
                })),
              }
            : s
        ),
        handoffs: upsertById(
          (next.handoffs || []).map((h) => (h.id === 'ho-demo-np-md' ? { ...h, status: 'Completed' as const } : h)),
          handoff
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-10',
          `${DEMO_CLINICAL_DATE} 11:23 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Sign Note & Approve Actions',
          'Encounter',
          DEMO_IDS.encounter,
          'Signed SOAP note and individually approved Lab Order REQ-88940, Amlodipine 5 mg (sim), Follow-Up Plan, AVS, and Handoff'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === DEMO_IDS.encounter);
      const ord = state.orders.find((o) => o.id === DEMO_IDS.labOrder);
      const med = state.medications.find((m) => m.id === DEMO_IDS.medDraft);
      const fp = (state.followUpPlans || []).find((f) => f.id === DEMO_IDS.followUpPlan);
      return enc?.noteStatus === 'Signed' && ord?.status === 'Ordered' && med?.status === 'Active' && Boolean(fp)
        ? { passed: true, detail: 'Note signed; Lab Order REQ-88940, Amlodipine 5 mg (sim), and Follow-Up Plan created.' }
        : { passed: false, detail: 'Post-consultation clinician sign-off or approved records incomplete.' };
    },
  },
  {
    sceneId: 's01-11-clinical-handoff',
    sceneNumber: 11,
    title: 'Clinical Handoff to Care Coordinator',
    role: 'Nurse / Care Coordinator',
    actorDisplay: 'Jordan Lee, RN (Care Coordinator)',
    actorKind: 'handoff',
    screenLabel: 'Care Coordination · Work Queue',
    classification: 'Completed action',
    routeNav: 'tasks',
    patientId: null,
    visualTarget: 'tasks-work-queue',
    uiActions: [
      {
        kind: 'select',
        target: 'task-status-select-demo',
        value: 'In Progress',
        requiredTarget: false,
        pauseBeforeMs: 320,
        pauseAfterMs: 300,
      },
      { kind: 'review', target: 'tasks-work-queue', pauseBeforeMs: 220, pauseAfterMs: 320 },
    ],
    caption:
      'Watch Care Coordinator Jordan Lee update the linked post-visit task status to In Progress, directing Elena to Laboratory Staff with requisition REQ-88940.',
    narration:
      "In the Care Coordination work queue, Jordan Lee picks up the clinician-approved follow-up task right away. He moves it to In Progress and coordinates Elena's lab draw under requisition 88940.",
    executiveNarration:
      "Care Coordinator Jordan Lee moves the approved follow-up task to In Progress and routes Elena for lab requisition 88940.",
    explanationAfter: 'Care Coordination task In Progress; handoff sent to Laboratory Staff.',
    nextStepPreview: 'Laboratory specimen collection & result entry',
    durationMs: 3800,
    expectedMutation: 'Care Coordinator accepts handoff ho-demo-md-coord and moves tsk-demo-01 to In Progress.',
    prepareView: (prev) => switchView(prev, 'Nurse / Care Coordinator', 'tasks', null),
    execute: (prev) => {
      const next = switchView(prev, 'Nurse / Care Coordinator', 'tasks', null);
      const labHandoff: ClinicalHandoffRecord = {
        id: 'ho-demo-coord-lab',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 11:28 EST`,
        fromRole: 'Nurse / Care Coordinator',
        fromActor: 'Jordan Lee, RN',
        toRole: 'Laboratory Staff',
        toOwnerName: 'Victor Alvarez, MLS',
        reason: 'Patient directed to on-site phlebotomy for authorized Renal Function & Serum Potassium Panel (REQ-88940).',
        linkedRecordRef: `Order ${DEMO_IDS.labOrder}`,
        status: 'Pending',
      };
      return {
        ...next,
        tasks: next.tasks.map((t) =>
          t.id === DEMO_IDS.handoffTask ? { ...t, status: 'In Progress' as const } : t
        ),
        handoffs: upsertById(
          (next.handoffs || []).map((h) => (h.id === 'ho-demo-md-coord' ? { ...h, status: 'Accepted' as const } : h)),
          labHandoff
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-11',
          `${DEMO_CLINICAL_DATE} 11:28 EST`,
          'Nurse / Care Coordinator',
          'Jordan Lee, RN',
          'Accept Clinical Handoff',
          'Task',
          DEMO_IDS.handoffTask,
          'Accepted post-visit handoff; moved task to In Progress and routed patient to Laboratory'
        ),
      };
    },
    validate: (state) => {
      const task = state.tasks.find((t) => t.id === DEMO_IDS.handoffTask);
      const ho = (state.handoffs || []).find((h) => h.id === 'ho-demo-coord-lab');
      return task?.status === 'In Progress' && Boolean(ho)
        ? { passed: true, detail: 'Care Coordinator task In Progress and handoff to Laboratory Staff logged.' }
        : { passed: false, detail: 'Care Coordinator handoff update missing.' };
    },
  },
  {
    sceneId: 's01-12-lab-workflow',
    sceneNumber: 12,
    title: 'Laboratory Specimen & Result Entry',
    role: 'Laboratory Staff',
    actorDisplay: 'Victor Alvarez, MLS (Laboratory Staff)',
    actorKind: 'human',
    screenLabel: 'Laboratory · Orders & Results',
    classification: 'Manual entry',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'orders-results',
    visualTarget: 'orders-results-panel',
    uiActions: [
      { kind: 'click', target: 'lab-collect-btn', requiredTarget: false, pauseBeforeMs: 300, pauseAfterMs: 280 },
      { kind: 'type', target: 'lab-result-value-input', value: '4.7', requiredTarget: false, pauseBeforeMs: 240, pauseAfterMs: 200 },
      { kind: 'click', target: 'lab-post-result-btn', requiredTarget: false, pauseBeforeMs: 260, pauseAfterMs: 320 },
    ],
    caption:
      'Watch Laboratory Staff Victor Alvarez click Collect Specimen on REQ-88940, visibly type the synthetic result value, and post it directly into Elena’s chart for clinician acknowledgement.',
    narration:
      "In the laboratory workflow, Victor Alvarez records specimen collection for requisition 88940 and enters the synthetic potassium and kidney panel result. Posting the final result routes it immediately to Dr. Rostova for review.",
    executiveNarration:
      "Laboratory Staff collects the specimen for requisition 88940 and posts the final synthetic result back to Elena's chart.",
    explanationAfter: 'REQ-88940 marked Resulted; Final lab result posted and handed off to Dr. Rostova.',
    nextStepPreview: 'Clinician acknowledges result & closes follow-up loop',
    durationMs: 4200,
    expectedMutation:
      'Marks ord-demo-01 Resulted, creates Final lab result lab-demo-01 (4.7 mmol/L K+ / eGFR 49), and hands off result review to Clinician.',
    prepareView: (prev) => switchView(prev, 'Laboratory Staff', 'patients', DEMO_PATIENT_ID, 'orders-results'),
    execute: (prev) => {
      const next = switchView(prev, 'Laboratory Staff', 'patients', DEMO_PATIENT_ID, 'orders-results');
      const labResult = {
        id: DEMO_IDS.labResult,
        orderId: DEMO_IDS.labOrder,
        patientId: DEMO_PATIENT_ID,
        facilityId: DEMO_FACILITY_ID,
        testName: 'Renal Function & Serum Potassium Panel',
        collectionDate: DEMO_CLINICAL_DATE,
        value: 'K+ 4.7 · eGFR 49',
        numericValue: 49,
        unit: 'mmol/L | mL/min',
        referenceInterval: 'K+ 3.5–5.1 | eGFR >= 60',
        flag: 'Abnormal' as const,
        status: 'Final' as const,
        reviewOwnerId: 'staff-1',
        patientReleased: false,
      };
      const handoff: ClinicalHandoffRecord = {
        id: 'ho-demo-lab-md',
        patientId: DEMO_PATIENT_ID,
        timestamp: `${DEMO_CLINICAL_DATE} 13:45 EST`,
        fromRole: 'Laboratory Staff',
        fromActor: 'Victor Alvarez, MLS',
        toRole: 'Clinician',
        toOwnerName: 'Dr. Elena Rostova, MD',
        reason: 'Synthetic lab result finalized for REQ-88940 (K+ 4.7 normal, eGFR 49 stable Abnormal) — clinician acknowledgement requested.',
        linkedRecordRef: `LabResult ${DEMO_IDS.labResult}`,
        status: 'Pending',
      };
      const dedupedLabs = next.labResults.filter(
        (l) => !(l.orderId === DEMO_IDS.labOrder && l.id !== DEMO_IDS.labResult)
      );
      return {
        ...next,
        orders: next.orders.map((o) => (o.id === DEMO_IDS.labOrder ? { ...o, status: 'Resulted' as const } : o)),
        labResults: upsertById(dedupedLabs, labResult),
        tasks: next.tasks.map((t) =>
          t.id === DEMO_IDS.handoffTask
            ? { ...t, subtasks: t.subtasks.map((s) => (s.id === 'st-demo-1' ? { ...s, done: true } : s)) }
            : t
        ),
        handoffs: upsertById(
          (next.handoffs || []).map((h) => (h.id === 'ho-demo-coord-lab' ? { ...h, status: 'Completed' as const } : h)),
          handoff
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-12',
          `${DEMO_CLINICAL_DATE} 13:45 EST`,
          'Laboratory Staff',
          'Victor Alvarez, MLS',
          'Record Synthetic Lab Result',
          'LabResult',
          DEMO_IDS.labResult,
          'Processed REQ-88940: K+ 4.7 mmol/L (Normal) · eGFR 49 mL/min (Abnormal) posted to chart'
        ),
      };
    },
    validate: (state) => {
      const ord = state.orders.find((o) => o.id === DEMO_IDS.labOrder);
      const lab = state.labResults.find((l) => l.id === DEMO_IDS.labResult);
      return ord?.status === 'Resulted' && lab?.status === 'Final'
        ? { passed: true, detail: `Order REQ-88940 Resulted; LabResult ${lab.id} posted (${lab.value}).` }
        : { passed: false, detail: 'Lab order progression or result entry failed.' };
    },
  },
  {
    sceneId: 's01-13-results-review-followup',
    sceneNumber: 13,
    title: 'Results Review, Follow-Up & Reminder',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD & Jordan Lee, RN',
    actorKind: 'human',
    screenLabel: 'Clinician · Lab Acknowledgement & Care Plan',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'care-plan',
    visualTarget: 'care-plan-followup-panel',
    uiActions: [
      { kind: 'click', target: 'seg-tab-labs', requiredTarget: false, pauseBeforeMs: 280, pauseAfterMs: 240 },
      { kind: 'click', target: 'lab-ack-btn', requiredTarget: false, pauseBeforeMs: 280, pauseAfterMs: 280 },
      { kind: 'click', target: 'patient-tab-care-plan', requiredTarget: false, pauseBeforeMs: 260, pauseAfterMs: 320 },
    ],
    caption:
      'Watch Dr. Rostova open Lab Results, acknowledge the stable potassium & eGFR panel, book the 2-week follow-up appointment (2026-12-02 10:30 EST), log a "Simulated Logged" reminder, and close the handoff task.',
    narration:
      'Dr. Rostova opens Lab Results and acknowledges the stable potassium and kidney panel. The two-week follow-up visit is booked for December second, a simulated patient reminder is logged, and the care coordination task is completed.',
    executiveNarration:
      'Dr. Rostova acknowledges the lab result, the two-week follow-up visit is booked, and a simulated reminder closes the care loop.',
    explanationAfter: 'Lab acknowledged, 2-week follow-up booked, Simulated Logged reminder saved, and task completed.',
    nextStepPreview: 'Longitudinal Timeline & Complete Journey Verification',
    durationMs: 4200,
    isSimulatedApproval: true,
    expectedMutation:
      'Marks lab-demo-01 Reviewed & released, books apt-demo-followup (2026-12-02 10:30), marks fp-demo-01 Simulated Logged, and completes tsk-demo-01.',
    prepareView: (prev) => switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'orders-results'),
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'care-plan');
      const followUpAppt = {
        id: DEMO_IDS.followUpAppointment,
        patientId: DEMO_PATIENT_ID,
        providerId: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        date: '2026-12-02',
        startTime: '10:30',
        durationMin: 30,
        type: '2-Week BP & Renal Lab Follow-Up',
        subtype: 'Scheduled Visit' as const,
        status: 'Scheduled' as const,
        room: 'Exam 3',
        reason: 'Recheck BP response to Amlodipine 5 mg and review renal labs',
        reminderSent: true,
        reminderStatus: 'Simulated Logged' as const,
        calendarSynced: true,
        coPayAmount: 25,
        coPayCollected: false,
      };
      const reminderThread = {
        id: DEMO_IDS.reminderThread,
        patientId: DEMO_PATIENT_ID,
        subject: 'Follow-Up Reminder (Simulated SMS — Simulated Logged)',
        channel: 'Text' as const,
        ownerId: 'staff-2',
        priority: 'Normal' as const,
        status: 'Resolved' as const,
        tags: ['Follow-Up Reminder', 'Simulated Logged'],
        participants: ['Elena Alvarez', 'Jordan Lee, RN'],
        messages: [
          {
            id: 'm-demo-rem-1',
            sender: 'Jordan Lee, RN',
            isPatient: false,
            isInternalNote: false,
            channel: 'Text' as const,
            timestamp: `${DEMO_CLINICAL_DATE} 14:15 EST`,
            body: 'Reminder: Your 2-week BP & Renal Follow-Up with Dr. Rostova is booked for 2026-12-02 at 10:30 EST. [Status: Simulated Logged — no external SMS sent]',
            deliveryStatus: 'Simulated' as const,
          },
        ],
      };
      return {
        ...next,
        labResults: next.labResults.map((l) =>
          l.id === DEMO_IDS.labResult
            ? { ...l, status: 'Reviewed' as const, reviewedAt: DEMO_CLINICAL_DATE, patientReleased: true }
            : l
        ),
        appointments: upsertById(next.appointments, followUpAppt, false),
        followUpPlans: (next.followUpPlans || []).map((fp) =>
          fp.id === DEMO_IDS.followUpPlan
            ? {
                ...fp,
                linkedAppointmentId: DEMO_IDS.followUpAppointment,
                reminderStatus: 'Simulated Logged' as const,
                reminderMessage: '2-week follow-up reminder logged for 2026-12-02 10:30 EST.',
              }
            : fp
        ),
        messages: upsertById(next.messages, reminderThread),
        tasks: next.tasks.map((t) =>
          t.id === DEMO_IDS.handoffTask
            ? {
                ...t,
                status: 'Complete' as const,
                subtasks: t.subtasks.map((s) => ({ ...s, done: true })),
              }
            : t
        ),
        handoffs: (next.handoffs || []).map((h) =>
          h.patientId === DEMO_PATIENT_ID ? { ...h, status: 'Completed' as const } : h
        ),
        auditEvents: appendDemoAudit(
          next,
          's01-13',
          `${DEMO_CLINICAL_DATE} 14:15 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Acknowledge Result & Close Loop',
          'FollowUpPlan',
          DEMO_IDS.followUpPlan,
          'Acknowledged lab-demo-01, booked 2026-12-02 10:30 follow-up, logged Simulated SMS reminder, closed task'
        ),
      };
    },
    validate: (state) => {
      const lab = state.labResults.find((l) => l.id === DEMO_IDS.labResult);
      const fu = state.appointments.find((a) => a.id === DEMO_IDS.followUpAppointment);
      const fp = (state.followUpPlans || []).find((f) => f.id === DEMO_IDS.followUpPlan);
      const task = state.tasks.find((t) => t.id === DEMO_IDS.handoffTask);
      return (
        lab?.status === 'Reviewed' &&
        Boolean(fu) &&
        fp?.reminderStatus === 'Simulated Logged' &&
        task?.status === 'Complete'
      )
        ? { passed: true, detail: 'Lab acknowledged, 2026-12-02 follow-up booked, Simulated Logged reminder recorded, task closed.' }
        : { passed: false, detail: 'Follow-up closure or lab acknowledgement incomplete.' };
    },
  },
  {
    sceneId: 's01-14-completed-journey',
    sceneNumber: 14,
    title: 'Completed Patient Journey Summary',
    role: 'Clinician',
    actorDisplay: 'EigenH Journey Verification',
    actorKind: 'human',
    screenLabel: 'Patient Chart · Longitudinal Timeline',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'timeline',
    visualTarget: 'patient-timeline-panel',
    uiActions: [
      { kind: 'review', target: 'patient-timeline-panel', pauseBeforeMs: 320, pauseAfterMs: 420 },
    ],
    caption:
      "That completes the Scheduled Patient Journey. Let's review the clinical timeline and the actions performed by each role.",
    narration:
      "Every step from appointment scheduling through laboratory review and follow-up booking is now recorded in Elena's longitudinal chart. That completes the Scheduled Patient Journey. Let's review the clinical timeline and the actions performed by each role.",
    executiveNarration:
      "That completes the Scheduled Patient Journey. Let's review the clinical timeline and the actions performed by each role.",
    explanationAfter: 'All 14 chapters verified with signed note, acknowledged lab, booked follow-up, and completed handoffs.',
    nextStepPreview: 'View Consolidated Summary & 8-Role Journey Timeline',
    durationMs: 3800,
    expectedMutation: 'Verifies complete end-to-end integrity across appointments, encounter, lab, medication, follow-up, handoffs, and audit log.',
    prepareView: (prev) => switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'timeline'),
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'timeline');
      return {
        ...next,
        auditEvents: appendDemoAudit(
          next,
          's01-14',
          `${DEMO_CLINICAL_DATE} 14:16 EST`,
          'Clinician',
          'EigenH Demo Director',
          'Complete Scheduled Journey',
          'Patient',
          DEMO_PATIENT_ID,
          'Verified all 14 scenes of Scheduled Patient Journey with full source-linked clinical state'
        ),
      };
    },
    validate: (state) => {
      const enc = state.encounters.find((e) => e.id === DEMO_IDS.encounter);
      const lab = state.labResults.find((l) => l.id === DEMO_IDS.labResult);
      const fu = state.appointments.find((a) => a.id === DEMO_IDS.followUpAppointment);
      const handoffs = (state.handoffs || []).filter((h) => h.patientId === DEMO_PATIENT_ID);
      const ok =
        enc?.noteStatus === 'Signed' &&
        lab?.status === 'Reviewed' &&
        Boolean(fu) &&
        handoffs.length >= 4 &&
        handoffs.every((h) => h.status === 'Completed');
      return ok
        ? {
            passed: true,
            detail: `Journey verified: signed note, reviewed lab, follow-up booked, ${handoffs.length} completed role handoffs.`,
          }
        : { passed: false, detail: 'One or more final journey integrity checks failed.' };
    },
  },
];

/**
 * Helper to build deterministic starting state for role chapters (Scenarios 02–07)
 * by executing the prerequisite prefix of Scenario 01 purely and synchronously.
 */
function prepareFromJourneyPrefix(baseState: AppState, prefixSceneCount: number): AppState {
  let state = buildCleanDemoBaseState(baseState);
  for (let i = 0; i < prefixSceneCount && i < SCHEDULED_JOURNEY_SCENES.length; i += 1) {
    state = SCHEDULED_JOURNEY_SCENES[i].execute(state);
  }
  return state;
}

function sliceRoleChapter(
  startIdx: number,
  endIdxExclusive: number
): DemoSceneDefinition[] {
  return SCHEDULED_JOURNEY_SCENES.slice(startIdx, endIdxExclusive).map((scene, idx) => ({
    ...scene,
    sceneNumber: idx + 1,
  }));
}

// ============================================================================
// SCENARIO 08 — ADMINISTRATOR & INTEROPERABILITY (HL7 FHIR R4 EXPORT)
// ============================================================================

const ADMIN_FHIR_SCENES: DemoSceneDefinition[] = [
  {
    sceneId: 's08-01-permission-boundary',
    sceneNumber: 1,
    title: 'Permission Boundary Check (Non-Admin Blocked)',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Clinician — Blocked)',
    actorKind: 'human',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'overview',
    visualTarget: 'role-preview-switcher',
    caption:
      'Demonstrating governance: Clinician role is strictly denied access to Administration and HL7 FHIR R4 patient export, and unauthorized attempts are audited.',
    narration:
      'Scene 1. First, we verify the authorization boundary. Under the Clinician role, HL7 FHIR R4 export is strictly blocked and logged.',
    durationMs: 3800,
    expectedMutation: 'Verifies executeAuthorizedFhirExport denies Clinician role and writes Denied FHIR Export audit record.',
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'overview');
      const blocked = executeAuthorizedFhirExport(next, {
        role: 'Clinician',
        actorName: 'Dr. Elena Rostova, MD',
        patientId: DEMO_PATIENT_ID,
        mode: 'masked',
      });
      return {
        ...next,
        auditEvents: appendDemoAudit(
          next,
          's08-01',
          `${DEMO_CLINICAL_DATE} 14:20 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Denied FHIR Export Attempt',
          'Patient',
          DEMO_PATIENT_ID,
          blocked.error || 'Access denied: FHIR export is Administrator-only'
        ),
      };
    },
    validate: (state) => {
      const blocked = executeAuthorizedFhirExport(state, {
        role: 'Clinician',
        actorName: 'Dr. Elena Rostova, MD',
        patientId: DEMO_PATIENT_ID,
        mode: 'masked',
      });
      return !blocked.ok
        ? { passed: true, detail: 'Clinician FHIR R4 export request properly blocked.' }
        : { passed: false, detail: 'Clinician was unexpectedly allowed to export FHIR.' };
    },
  },
  {
    sceneId: 's08-02-admin-fhir-export',
    sceneNumber: 2,
    title: 'Administrator Authorized HL7 FHIR R4 Masked Export',
    role: 'Administrator',
    actorDisplay: 'Sonia Verma (Administrator)',
    actorKind: 'human',
    routeNav: 'administration',
    patientId: null,
    visualTarget: 'admin-fhir-export-panel',
    caption:
      'Switching to Administrator Sonia Verma unlocks Administration and generates a masked/pseudonymized HL7 FHIR R4 Bundle with 100% structural & reference integrity validation.',
    narration:
      'Scene 2. Switching to Administrator Sonia Verma unlocks the authorized HL7 FHIR R4 export panel, generating a PII-masked FHIR bundle with full structural validation and audit logging.',
    durationMs: 4600,
    expectedMutation: 'Executes Administrator-authorized masked HL7 FHIR R4 export with zero validation errors and logs audit event.',
    execute: (prev) => {
      const next = switchView(prev, 'Administrator', 'administration', null);
      const outcome = executeAuthorizedFhirExport(next, {
        role: 'Administrator',
        actorName: 'Sonia Verma',
        patientId: DEMO_PATIENT_ID,
        mode: 'masked',
      });
      return {
        ...next,
        auditEvents: appendDemoAudit(
          next,
          's08-02',
          `${DEMO_CLINICAL_DATE} 14:22 EST`,
          'Administrator',
          'Sonia Verma',
          'Export FHIR R4 Bundle (Masked)',
          'Patient',
          DEMO_PATIENT_ID,
          `Validated ${outcome.bundle?.entry.length || 0} FHIR R4 resources (0 structural errors; PII masked)`
        ),
      };
    },
    validate: (state) => {
      const outcome = executeAuthorizedFhirExport(state, {
        role: 'Administrator',
        actorName: 'Sonia Verma',
        patientId: DEMO_PATIENT_ID,
        mode: 'masked',
      });
      return outcome.ok && Boolean(outcome.validation?.valid) && (outcome.bundle?.entry.length || 0) >= 5
        ? {
            passed: true,
            detail: `Authorized FHIR R4 masked bundle valid (${outcome.bundle?.entry.length} resources, 0 errors).`,
          }
        : { passed: false, detail: 'Administrator FHIR R4 export validation failed.' };
    },
  },
];

// ============================================================================
// SCENARIO 09 — CLINICAL SAFETY EXCEPTION (CRITICAL POTASSIUM)
// ============================================================================

const SAFETY_EXCEPTION_SCENES: DemoSceneDefinition[] = [
  {
    sceneId: 's09-01-critical-lab-arrival',
    sceneNumber: 1,
    title: 'Critical Laboratory Value Detection',
    role: 'Laboratory Staff',
    actorDisplay: 'Victor Alvarez, MLS (Laboratory Staff)',
    actorKind: 'human',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'pre-consultation',
    visualTarget: 'clinical-safety-radar-panel',
    caption:
      'A synthetic STAT Serum Potassium result of 6.1 mmol/L (Critical) arrives. Clinical Safety Radar elevates an immediate Critical Alert and surfaces it in the timeline Critical Events filter.',
    narration:
      'Scene 1. A synthetic critical serum potassium of 6.1 millimoles per liter arrives from the laboratory. Clinical Safety Radar immediately elevates a critical alert.',
    durationMs: 4400,
    expectedMutation: 'Records Critical lab-demo-crit-09 (K+ 6.1 mmol/L) and triggers Critical Safety Radar alert.',
    execute: (prev) => {
      const next = switchView(prev, 'Laboratory Staff', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
      const critOrder = {
        id: DEMO_IDS.criticalLabOrder,
        requisitionId: 'REQ-89109',
        patientId: DEMO_PATIENT_ID,
        orderedById: 'staff-1',
        facilityId: DEMO_FACILITY_ID,
        category: 'Lab' as const,
        name: 'Serum Potassium (STAT)',
        code: '84132',
        priority: 'STAT' as const,
        status: 'Resulted' as const,
        createdAt: DEMO_CLINICAL_DATE,
      };
      const critLab = {
        id: DEMO_IDS.criticalLabResult,
        orderId: DEMO_IDS.criticalLabOrder,
        patientId: DEMO_PATIENT_ID,
        facilityId: DEMO_FACILITY_ID,
        testName: 'Serum Potassium (STAT)',
        collectionDate: DEMO_CLINICAL_DATE,
        value: '6.1',
        numericValue: 6.1,
        unit: 'mmol/L',
        referenceInterval: '3.5–5.1',
        flag: 'Critical' as const,
        status: 'Final' as const,
        reviewOwnerId: 'staff-1',
        patientReleased: false,
      };
      return {
        ...next,
        orders: upsertById(next.orders, critOrder),
        labResults: upsertById(next.labResults, critLab),
        auditEvents: appendDemoAudit(
          next,
          's09-01',
          `${DEMO_CLINICAL_DATE} 15:02 EST`,
          'Laboratory Staff',
          'Victor Alvarez, MLS',
          'Critical Lab Alert',
          'LabResult',
          DEMO_IDS.criticalLabResult,
          'Posted synthetic Critical Serum Potassium 6.1 mmol/L (ref 3.5-5.1)'
        ),
      };
    },
    validate: (state) => {
      const radar = buildClinicalSafetyRadar(state, DEMO_PATIENT_ID);
      const hasCrit = radar.some((r) => r.category === 'Critical Lab Result' && r.severity === 'Critical');
      return hasCrit
        ? { passed: true, detail: 'Critical Serum Potassium 6.1 mmol/L surfaced in Clinical Safety Radar.' }
        : { passed: false, detail: 'Critical Safety Radar alert was not raised.' };
    },
  },
  {
    sceneId: 's09-02-clinician-acknowledge-escalate',
    sceneNumber: 2,
    title: 'Clinician Review, Acknowledgement & Urgent Escalation',
    role: 'Clinician',
    actorDisplay: 'Dr. Elena Rostova, MD (Simulated Clinician Review)',
    actorKind: 'human',
    routeNav: 'patients',
    patientId: DEMO_PATIENT_ID,
    patientTab: 'orders-results',
    visualTarget: 'orders-results-panel',
    caption:
      'Clinician reviews the critical hyperkalemia warning, acknowledges the result, creates an Urgent patient-outreach & repeat-lab task, and records a complete audit trail.',
    narration:
      'Scene 2. Dr. Elena Rostova reviews the critical potassium alert, acknowledges the lab result, and creates an urgent follow-up task for same-day patient outreach and repeat testing.',
    durationMs: 4500,
    isSimulatedApproval: true,
    expectedMutation: 'Marks lab-demo-crit-09 Reviewed, creates Urgent task tsk-demo-crit-09, and logs audit event.',
    execute: (prev) => {
      const next = switchView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'orders-results');
      const urgentTask = {
        id: DEMO_IDS.criticalTask,
        title: 'URGENT: Call Elena Alvarez re Critical K+ 6.1 mmol/L — hold ACEi & repeat STAT BMP',
        status: 'To Do' as const,
        priority: 'Urgent' as const,
        ownerId: 'staff-2',
        team: 'Clinical Review',
        facilityId: DEMO_FACILITY_ID,
        patientId: DEMO_PATIENT_ID,
        linkedRecord: { type: 'Lab Result', id: DEMO_IDS.criticalLabResult, label: 'K+ 6.1 mmol/L (Critical)' },
        dueDate: DEMO_CLINICAL_DATE,
        patientVisible: false,
        timeLoggedMin: 0,
        subtasks: [],
        comments: [],
        history: [
          {
            id: 'th-demo-crit',
            timestamp: `${DEMO_CLINICAL_DATE} 15:06 EST`,
            event: 'Escalated during Clinician Critical Result acknowledgement',
          },
        ],
      };
      return {
        ...next,
        labResults: next.labResults.map((l) =>
          l.id === DEMO_IDS.criticalLabResult
            ? { ...l, status: 'Reviewed' as const, reviewedAt: DEMO_CLINICAL_DATE, patientReleased: true }
            : l
        ),
        tasks: upsertById(next.tasks, urgentTask),
        auditEvents: appendDemoAudit(
          next,
          's09-02',
          `${DEMO_CLINICAL_DATE} 15:06 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Acknowledge Critical Lab',
          'LabResult',
          DEMO_IDS.criticalLabResult,
          'Acknowledged Critical K+ 6.1 mmol/L and assigned Urgent outreach task to Jordan Lee, RN'
        ),
      };
    },
    validate: (state) => {
      const lab = state.labResults.find((l) => l.id === DEMO_IDS.criticalLabResult);
      const task = state.tasks.find((t) => t.id === DEMO_IDS.criticalTask);
      return lab?.status === 'Reviewed' && task?.priority === 'Urgent'
        ? { passed: true, detail: 'Critical result acknowledged and Urgent follow-up task queued.' }
        : { passed: false, detail: 'Critical lab acknowledgement or urgent task missing.' };
    },
  },
];

// ============================================================================
// SCENARIO 10 — EXTERNAL DOCUMENT RECONCILIATION (UNCERTAIN MATCH)
// ============================================================================

const EXTERNAL_RECONCILIATION_SCENES: DemoSceneDefinition[] = [
  {
    sceneId: 's10-01-uncertain-match-review',
    sceneNumber: 1,
    title: 'Uncertain Outside Document Detected (Never Auto-Merged)',
    role: 'Nurse Practitioner',
    actorDisplay: 'Hannah Brooks, NP (Review Queue)',
    actorKind: 'ai',
    routeNav: 'patients',
    patientId: 'pat-1',
    patientTab: 'documents-forms',
    visualTarget: 'external-reconciliation-panel',
    caption:
      'Outside PDF from Harborview Diagnostics lists only "E. Vance" without MRN. AI flags the match as Uncertain, presents candidate charts side-by-side, and blocks auto-merging.',
    narration:
      'Scene 1. An outside renal lab report arrives with only the initial E. Vance and no medical record number. Because identity is uncertain, EigenH refuses to auto-merge and queues it for human verification.',
    durationMs: 4400,
    expectedMutation: 'Displays extdoc-1 in Pending Human Verification state with candidate patient list and uncertainty reason.',
    execute: (prev) => {
      const next = switchView(prev, 'Nurse Practitioner', 'patients', 'pat-1', 'documents-forms');
      return {
        ...next,
        auditEvents: appendDemoAudit(
          next,
          's10-01',
          `${DEMO_CLINICAL_DATE} 15:20 EST`,
          'Nurse Practitioner',
          'AI Reconciliation Guard',
          'Flag Uncertain Document Match',
          'ExternalDoc',
          DEMO_IDS.reconcileDoc,
          'Blocked auto-merge for "E. Vance" outside PDF; queued for human identity confirmation'
        ),
      };
    },
    validate: (state) => {
      const ext = (state.externalDocQueue || []).find((d) => d.id === DEMO_IDS.reconcileDoc);
      return ext?.status === 'Pending Human Verification' && !ext.filedPatientId
        ? { passed: true, detail: 'Uncertain outside document held in Pending Human Verification (no auto-merge).' }
        : { passed: false, detail: 'External document not in pending verification state.' };
    },
  },
  {
    sceneId: 's10-02-human-verify-and-file',
    sceneNumber: 2,
    title: 'Human Verification & Source-Linked Filing',
    role: 'Nurse Practitioner',
    actorDisplay: 'Hannah Brooks, NP (Human Verification)',
    actorKind: 'human',
    routeNav: 'patients',
    patientId: 'pat-1',
    patientTab: 'documents-forms',
    visualTarget: 'external-reconciliation-panel',
    caption:
      'Hannah Brooks, NP confirms DOB 1958-04-12 and active Lisinopril therapy match Eleanor Vance (MRN-104821), then explicitly files the verified source-linked PDF into her chart.',
    narration:
      'Scene 2. After comparing date of birth and medication history, Hannah Brooks verifies the match to Eleanor Vance and files the source-linked document into her chart with full provenance.',
    durationMs: 4400,
    isSimulatedApproval: true,
    expectedMutation: 'Marks extdoc-1 Verified & Filed into pat-1 and adds verified source-linked document doc-demo-ext-reconciled.',
    execute: (prev) => {
      const next = switchView(prev, 'Nurse Practitioner', 'patients', 'pat-1', 'documents-forms');
      const ext = (next.externalDocQueue || []).find((d) => d.id === DEMO_IDS.reconcileDoc);
      const filedDoc = {
        id: 'doc-demo-ext-reconciled',
        patientId: 'pat-1',
        title: ext?.title || 'Outside Renal Panel & Nephrology Consult Summary (PDF)',
        category: 'Lab PDF' as const,
        author: 'Verified by Hannah Brooks, NP',
        source: ext?.sourceOrganization || 'Harborview Community Diagnostics',
        date: DEMO_CLINICAL_DATE,
        version: 1,
        verified: true,
        external: true,
        summary: ext?.extractedSummary || 'Verified outside renal lab summary filed after identity match.',
      };
      return {
        ...next,
        externalDocQueue: (next.externalDocQueue || []).map((d) =>
          d.id === DEMO_IDS.reconcileDoc
            ? {
                ...d,
                status: 'Verified & Filed' as const,
                filedPatientId: 'pat-1',
                verifiedBy: 'Hannah Brooks, NP',
                verifiedAt: `${DEMO_CLINICAL_DATE} 15:24 EST`,
              }
            : d
        ),
        documents: upsertById(next.documents, filedDoc),
        auditEvents: appendDemoAudit(
          next,
          's10-02',
          `${DEMO_CLINICAL_DATE} 15:24 EST`,
          'Nurse Practitioner',
          'Hannah Brooks, NP',
          'Verify & File External Document',
          'Patient',
          'pat-1',
          'Human-verified identity match for "E. Vance" (DOB 1958-04-12) and filed source-linked PDF into MRN-104821'
        ),
      };
    },
    validate: (state) => {
      const ext = (state.externalDocQueue || []).find((d) => d.id === DEMO_IDS.reconcileDoc);
      const doc = state.documents.find((d) => d.id === 'doc-demo-ext-reconciled');
      return ext?.status === 'Verified & Filed' && ext.filedPatientId === 'pat-1' && Boolean(doc?.verified)
        ? { passed: true, detail: 'External PDF human-verified and filed with provenance into Eleanor Vance (pat-1).' }
        : { passed: false, detail: 'External document reconciliation failed.' };
    },
  },
];

// ============================================================================
// MASTER SCENARIO REGISTRY (SCENARIOS 01 – 10)
// ============================================================================

export const DEMO_DIRECTOR_SCENARIOS: DemoScenarioDefinition[] = [
  {
    id: 'demo-01-scheduled-journey',
    number: '01',
    category: 'Complete Patient Journeys',
    title: 'Complete Scheduled Patient Journey',
    subtitle: 'Flagship End-to-End AI-Native EHR Demonstration (14 Scenes)',
    description:
      'Follows synthetic patient Elena Alvarez (MRN-109420) from appointment booking and pre-visit intake through AI extraction, Front Desk check-in, Medical Assistant prep, NP verification, Pre-Consultation Summary, simulated Ambient AI Scribe, AI Action Composer, Clinician approval, Care Coordinator handoff, Lab processing, and closed-loop follow-up.',
    primaryRole: 'Clinician',
    participatingRoles: [
      'Front Desk',
      'Medical Assistant',
      'Nurse Practitioner',
      'Clinician',
      'Nurse / Care Coordinator',
      'Laboratory Staff',
    ],
    valueStatement:
      'Demonstrates real shared-state orchestration across 6 roles with human-in-the-loop AI governance and zero duplicate records on replay.',
    status: 'Ready',
    flagship: true,
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => buildCleanDemoBaseState(base),
    scenes: SCHEDULED_JOURNEY_SCENES,
  },
  {
    id: 'demo-02-front-desk',
    number: '02',
    category: 'Role-Based Workflows',
    title: 'Front Desk Automation & Arrival Handoff',
    subtitle: 'Scheduling, Pre-Registration Verification & Rooming Handoff',
    description:
      'Conflict-checked appointment booking, pre-visit readiness review, arrival check-in, simulated copay collection, and structured handoff to the Medical Assistant.',
    primaryRole: 'Front Desk',
    participatingRoles: ['Front Desk', 'Medical Assistant'],
    valueStatement: 'Eliminates manual intake re-entry and passes arrival readiness directly into the MA rooming queue.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => buildCleanDemoBaseState(base),
    scenes: [
      { ...SCHEDULED_JOURNEY_SCENES[0], sceneNumber: 1 },
      { ...SCHEDULED_JOURNEY_SCENES[3], sceneNumber: 2 },
    ],
  },
  {
    id: 'demo-03-patient-intake',
    number: '03',
    category: 'Role-Based Workflows',
    title: 'Patient Pre-Visit Intake & AI Document Extraction',
    subtitle: 'Simulated Secure Intake Link + Source-Linked AI Parsing',
    description:
      'Shows the simulated pre-visit intake submission with uploaded synthetic lab and home BP documents, followed by AI Intake Intelligence extracting verifiable draft fields.',
    primaryRole: 'Front Desk',
    participatingRoles: ['Front Desk', 'Medical Assistant'],
    valueStatement: 'Converts pre-visit forms and outside PDFs into source-linked, staff-verifiable chart drafts before arrival.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 1),
    scenes: sliceRoleChapter(1, 3),
  },
  {
    id: 'demo-04-medical-assistant',
    number: '04',
    category: 'Role-Based Workflows',
    title: 'Medical Assistant Rooming & Clinical Prep',
    subtitle: 'Vitals Capture, Simulated Coverage Check & NP Handoff',
    description:
      'Starts cleanly at patient check-in: MA verifies simulated eligibility, captures baseline vitals (BP 146/88), reconciles active medications, and hands off to Nurse Practitioner.',
    primaryRole: 'Medical Assistant',
    participatingRoles: ['Medical Assistant', 'Nurse Practitioner'],
    valueStatement: 'Makes pre-visit readiness explicit via documented clinical criteria rather than opaque checklist hunting.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 4),
    scenes: sliceRoleChapter(4, 6),
  },
  {
    id: 'demo-05-clinician-copilot',
    number: '05',
    category: 'AI-Native Clinical Capabilities',
    title: 'Clinician AI Copilot (Pre-Consult -> Scribe -> Post-Consult)',
    subtitle: 'What Matters Today, Simulated Ambient Scribe & Explainable Action Composer',
    description:
      'Focused clinician showcase: opens Pre-Consultation Summary, runs simulated Ambient AI Scribe to draft SOAP, stages 5 explainable clinical actions with "Why?" evidence, and executes authorized clinician approval.',
    primaryRole: 'Clinician',
    participatingRoles: ['Clinician'],
    valueStatement: 'Demonstrates AI-native clinical compression while preserving strict human-in-the-loop signing and order approval.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 6),
    scenes: sliceRoleChapter(6, 10),
  },
  {
    id: 'demo-06-laboratory',
    number: '06',
    category: 'Role-Based Workflows',
    title: 'Laboratory Workflow & Result Lifecycle',
    subtitle: 'Authorized Requisition -> Specimen Collection -> Chart Result',
    description:
      'Starts with clinician-approved requisition REQ-88940: Lab Staff processes specimen collection, posts synthetic potassium/eGFR results into the same chart, and routes review to the ordering clinician.',
    primaryRole: 'Laboratory Staff',
    participatingRoles: ['Laboratory Staff', 'Clinician'],
    valueStatement: 'Connects approved provider orders directly to lab execution and closed-loop clinician result review.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 11),
    scenes: sliceRoleChapter(11, 13),
  },
  {
    id: 'demo-07-care-coordinator',
    number: '07',
    category: 'Role-Based Workflows',
    title: 'Care Coordinator Post-Visit Handoff & Follow-Up',
    subtitle: 'Smart Role Handoff -> Lab Tracking -> 2-Week Booking & Simulated Reminder',
    description:
      'Starts at post-consultation sign-off: Care Coordinator picks up the structured handoff queue, coordinates lab completion, books the 2-week follow-up, and logs a simulated reminder.',
    primaryRole: 'Nurse / Care Coordinator',
    participatingRoles: ['Nurse / Care Coordinator', 'Laboratory Staff', 'Clinician'],
    valueStatement: 'Prevents dropped post-visit orders and closes the follow-up loop with auditable handoff history.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 10),
    scenes: sliceRoleChapter(10, 14),
  },
  {
    id: 'demo-08-admin-fhir',
    number: '08',
    category: 'AI-Native Clinical Capabilities',
    title: 'Administrator Governance & HL7 FHIR R4 Export',
    subtitle: 'Strict Permission Boundary + Masked FHIR R4 Bundle Validation',
    description:
      'Verifies that Clinicians are blocked from FHIR R4 export, then switches to Administrator to generate and structurally validate a PII-masked HL7 FHIR R4 Bundle.',
    primaryRole: 'Administrator',
    participatingRoles: ['Clinician', 'Administrator'],
    valueStatement: 'Proves role-enforced interoperability governance with PII-masked default exports and 0 structural errors.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 13),
    scenes: ADMIN_FHIR_SCENES,
  },
  {
    id: 'demo-09-safety-exception',
    number: '09',
    category: 'Safety and Exception Scenarios',
    title: 'Clinical Safety Exception (Critical Hyperkalemia)',
    subtitle: 'Critical Lab Warning -> Clinician Acknowledgement -> Urgent Escalation',
    description:
      'Simulates a critical STAT Potassium (6.1 mmol/L) arriving into the chart, raising an immediate Clinical Safety Radar alert, clinician acknowledgement, urgent outreach task, and audit trail.',
    primaryRole: 'Clinician',
    participatingRoles: ['Laboratory Staff', 'Clinician', 'Nurse / Care Coordinator'],
    valueStatement: 'Demonstrates non-inflated critical event escalation with explicit clinician review and urgent task routing.',
    status: 'Ready',
    patientId: DEMO_PATIENT_ID,
    prepareState: (base) => prepareFromJourneyPrefix(base, 10),
    scenes: SAFETY_EXCEPTION_SCENES,
  },
  {
    id: 'demo-10-external-reconciliation',
    number: '10',
    category: 'Safety and Exception Scenarios',
    title: 'External Document Reconciliation (Uncertain Match)',
    subtitle: 'Uncertain Identity Guard -> Candidate Comparison -> Human Filing',
    description:
      'Demonstrates an outside diagnostic PDF with incomplete patient identity ("E. Vance"). EigenH highlights uncertainty, prevents automatic chart merging, and requires human verification before filing.',
    primaryRole: 'Nurse Practitioner',
    participatingRoles: ['Nurse Practitioner'],
    valueStatement: 'Protects patient safety by refusing autonomous merges whenever external record identity is uncertain.',
    status: 'Ready',
    patientId: 'pat-1',
    prepareState: (base) => buildCleanDemoBaseState(base),
    scenes: EXTERNAL_RECONCILIATION_SCENES,
  },
];

// ============================================================================
// ENRICHMENT HELPER FOR V2 TRAINER METADATA ON COMPLETE JOURNEY & LIBRARY SCENES
// ============================================================================

const JOURNEY_EXECUTIVE_IDS = new Set([
  's01-01-scheduling',
  's01-03-ai-intake-intelligence',
  's01-04-front-desk-verification',
  's01-05-medical-assistant-prep',
  's01-07-pre-consultation-summary',
  's01-08-ambient-ai-scribe',
  's01-09-ai-action-composer',
  's01-10-post-consultation-review',
  's01-12-laboratory-workflow',
  's01-14-journey-summary',
]);

function defaultClassificationForScene(scene: DemoSceneDefinition): WorkClassification {
  if (scene.classification) return scene.classification;
  if (scene.isSimulatedApproval) return 'Human approved';
  if (scene.actorKind === 'ai') return 'AI-prepared';
  if (scene.actorKind === 'handoff') return 'Completed action';
  return 'Manual entry';
}

function enrichSceneList(scenes: DemoSceneDefinition[]): DemoSceneDefinition[] {
  return scenes.map((sc, idx) => {
    const next = scenes[idx + 1];
    return {
      ...sc,
      screenLabel:
        sc.screenLabel ||
        (sc.patientTab
          ? `Patient Chart -> ${sc.patientTab.replace(/-/g, ' ')}`
          : `${sc.routeNav.replace(/-/g, ' ')} workspace`),
      classification: defaultClassificationForScene(sc),
      nextStepPreview:
        sc.nextStepPreview ||
        (next ? `${next.role}: ${next.title}` : 'Journey complete — inspect timeline or launch a role tutorial'),
      practiceHint:
        sc.practiceHint ||
        `Review the highlighted ${sc.visualTarget ? sc.visualTarget.replace(/-/g, ' ') : 'workspace panel'} and click it or click "Show Me" to confirm this step.`,
      executiveInclude:
        sc.executiveInclude !== undefined
          ? sc.executiveInclude
          : sc.sceneId.startsWith('s01-')
          ? JOURNEY_EXECUTIVE_IDS.has(sc.sceneId)
          : true,
    };
  });
}

// Apply V2 trainer metadata cleanly to every scenario in DEMO_DIRECTOR_SCENARIOS
for (const scen of DEMO_DIRECTOR_SCENARIOS) {
  scen.scenes = enrichSceneList(scen.scenes);
}

// Build all 8 dedicated Role Workflow Tutorials on the exact same flagship patient journey
export const ROLE_TUTORIAL_SCENARIOS: DemoScenarioDefinition[] = buildRoleTutorialScenarios(
  prepareFromJourneyPrefix
).map((scen) => ({
  ...scen,
  scenes: enrichSceneList(scen.scenes),
}));

export const ALL_ACADEMY_SCENARIOS: DemoScenarioDefinition[] = [
  ...DEMO_DIRECTOR_SCENARIOS,
  ...ROLE_TUTORIAL_SCENARIOS,
];

export function getScenarioById(id: string | null): DemoScenarioDefinition | undefined {
  if (!id) return undefined;
  return ALL_ACADEMY_SCENARIOS.find((s) => s.id === id);
}

export function getEstimatedDurationSeconds(scenario: DemoScenarioDefinition): number {
  return Math.round(scenario.scenes.reduce((sum, s) => sum + s.durationMs, 0) / 1000);
}
