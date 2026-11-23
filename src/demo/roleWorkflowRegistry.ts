import { executeAuthorizedFhirExport } from '../state/fhirExport';
import type { AppState, PatientTabKey, StaffNavKey, StaffRole } from '../types/hms';
import {
  appendDemoAudit,
  DEMO_CLINICAL_DATE,
  DEMO_FACILITY_ID,
  DEMO_IDS,
  DEMO_PATIENT_ID,
  findStaffForRole,
} from './demoFixtures';
import type { DemoScenarioDefinition, DemoSceneDefinition, RoleTutorialMeta } from './demoTypes';

function switchRoleView(
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

/**
 * Metadata for all 8 dedicated Role Workflow Academy cards on "Explore Workflows by Role".
 * Every card launches a granular, real-DOM-driven tutorial on the exact same flagship
 * synthetic patient journey (Elena Alvarez · MRN-109420).
 */
export const ROLE_TUTORIAL_CARDS: RoleTutorialMeta[] = [
  {
    roleKey: 'front-desk',
    scenarioId: 'role-front-desk',
    roleTitle: 'Front Desk',
    staffRole: 'Front Desk',
    actorExample: 'Nadia Patel · Patient Access',
    whatTheyDo:
      'Manages patient arrival, verifies demographics and consent, runs simulated insurance eligibility, checks patients in, and hands off to the Medical Assistant.',
    whereWorkStarts: 'Front Desk & Patient Access -> Arrival & Waiting Queue',
    mainSteps: [
      'Locate Elena Alvarez in Today’s Arrival Queue',
      'Open Check-In & Intake modal via real button click',
      'Confirm demographics & intake consent checkbox',
      'Run simulated coverage eligibility verification',
      'Complete check-in and hand off to Medical Assistant',
    ],
    aiAssistsWith: 'Flags pre-visit intake completion and surfaces insurance details from submitted intake.',
    humanDecisionsRequired: 'Identity verification, consent confirmation, simulated copay & room check-in.',
    afterFinish: 'Elena moves to arrived/roomed status and enters the Medical Assistant clinical prep workflow.',
    readiness: 'Verified working',
    referenceTutorial: true,
    highlightBadge: 'Reference Tutorial · 10 Steps',
  },
  {
    roleKey: 'patient-intake',
    scenarioId: 'role-patient-intake',
    roleTitle: 'Patient Pre-Visit Intake',
    staffRole: 'Front Desk',
    actorExample: 'Elena Alvarez · Simulated Intake Link',
    whatTheyDo:
      'Completes pre-visit questionnaire, reports symptoms and current medications, attaches outside lab PDFs, and submits directly into the EHR chart.',
    whereWorkStarts: 'Patient Chart -> Pre-Visit Intake (Simulated Secure Link)',
    mainSteps: [
      'Visibly type reason for visit, symptoms, and medications',
      'Confirm allergies, insurance details, and synthetic PDF attachments',
      'Submit pre-visit intake directly into Elena’s chart',
      'Trigger AI Intake Intelligence document extraction',
      'Review AI-prepared fields marked for human verification',
    ],
    aiAssistsWith: 'Extracts structured eGFR, creatinine, home BP, and medication status with source snippets.',
    humanDecisionsRequired: 'Patient confirms submission; staff must verify every AI-extracted item before chart promotion.',
    afterFinish: 'Structured unverified drafts appear in Pre-Consultation Summary and Pre-Visit Readiness.',
    readiness: 'Verified working',
    highlightBadge: 'Visible Typing + AI Extraction',
  },
  {
    roleKey: 'medical-assistant',
    scenarioId: 'role-medical-assistant',
    roleTitle: 'Medical Assistant',
    staffRole: 'Medical Assistant',
    actorExample: 'Maya Patel, CMA · Clinical Intake',
    whatTheyDo:
      'Performs clinical rooming (distinct from Front Desk admin check-in): checks intake status, enters live vitals, screens allergies, and prepares the chart.',
    whereWorkStarts: 'Medical Assistant Scope -> Arrival Queue & Clinical Intake Modal',
    mainSteps: [
      'Contrast MA clinical prep vs Front Desk arrival check-in',
      'Open Check-In & Intake modal and verify intake status',
      'Visibly enter BP 146/88 mmHg, HR 74 bpm, and SpO2 99%',
      'Screen documented Sulfa allergy and assign Exam 3',
      'Save vitals to chart and hand off to clinical review',
    ],
    aiAssistsWith: 'Compares newly entered vitals against prior visit (134/82 -> 146/88) automatically.',
    humanDecisionsRequired: 'Accurate vital sign measurement, allergy screening, and rooming confirmation.',
    afterFinish: 'Baseline vitals populate Pre-Consultation Summary and structured handoff routes to NP / Clinician.',
    readiness: 'Verified working',
    highlightBadge: 'Visible Vitals Typing',
  },
  {
    roleKey: 'np-support',
    scenarioId: 'role-np-support',
    roleTitle: 'Nurse Practitioner / Clinical Support',
    staffRole: 'Nurse Practitioner',
    actorExample: 'Hannah Brooks, NP · Clinical Prep',
    whatTheyDo:
      'Clinic-configured clinical prep role: verifies AI-extracted outside records against source snippets, reconciles medications, and confirms clinician readiness.',
    whereWorkStarts: 'Patient Chart -> Pre-Consultation Summary & Clinical Safety Radar',
    mainSteps: [
      'Inspect Clinical Safety Radar alerts for unverified items',
      'Compare AI-prepared outside lab drafts against source PDF snippets',
      'Click Verify into Chart to promote drafts to recorded facts',
      'Reconcile active Lisinopril 10 mg in Medications tab',
      'Log structured handoff to attending Clinician',
    ],
    aiAssistsWith: 'Highlights source snippets, confidence tags, and remaining readiness criteria gaps.',
    humanDecisionsRequired: 'Explicit human verification of each AI-prepared field and medication reconciliation.',
    afterFinish: 'Pre-Visit Readiness turns green and Dr. Elena Rostova receives a verified Pre-Consultation brief.',
    readiness: 'Verified working',
    highlightBadge: 'AI Verification + Handoff',
  },
  {
    roleKey: 'clinician',
    scenarioId: 'role-clinician',
    roleTitle: 'Clinician / Provider',
    staffRole: 'Clinician',
    actorExample: 'Dr. Elena Rostova, MD · Attending',
    whatTheyDo:
      'Reviews Pre-Consultation Summary, runs simulated Ambient AI Scribe, edits SOAP note, evaluates AI Clinical Action Composer "Why?" evidence, approves orders, and signs.',
    whereWorkStarts: 'Clinician Home Dashboard -> Today’s Patients -> Pre-Consultation Summary',
    mainSteps: [
      'Review What Matters Today, BP/eGFR trends & Safety Radar',
      'Start and stop Simulated Ambient AI Scribe (synthetic transcript)',
      'Edit AI-prepared Draft SOAP note (never auto-signed)',
      'Inspect "Why?" provenance & individually approve orders/meds',
      'Sign & lock clinical note and dispatch downstream handoffs',
    ],
    aiAssistsWith: 'Synthesizes Pre-Consult brief, drafts SOAP sections, and proposes explainable actions.',
    humanDecisionsRequired: 'Editing/signing clinical note and individually approving every order, prescription, and follow-up.',
    afterFinish: 'Signed encounter updates Journey Time Machine; authorized lab order routes to Lab and follow-up to Care Coordinator.',
    readiness: 'Verified working',
    highlightBadge: 'Flagship Clinician AI Copilot',
  },
  {
    roleKey: 'laboratory',
    scenarioId: 'role-laboratory',
    roleTitle: 'Laboratory Staff',
    staffRole: 'Laboratory Staff',
    actorExample: 'Devon Brooks, MLS · Clinical Lab',
    whatTheyDo:
      'Processes only clinician-authorized lab requisitions, records specimen collection, enters synthetic test results, and delivers results to clinician review.',
    whereWorkStarts: 'Orders & Results -> Authorized Requisition REQ-88940',
    mainSteps: [
      'Inspect clinician-authorized requisition REQ-88940',
      'Click Collect Specimen to advance order lifecycle',
      'Visibly enter synthetic Serum Potassium value (4.6 mmol/L)',
      'Post result into Elena’s chart and verify reference interval',
      'Confirm closed-loop clinician acknowledgement',
    ],
    aiAssistsWith: 'Automatically evaluates reference intervals and flags abnormal or critical results.',
    humanDecisionsRequired: 'Specimen verification, accurate bench result entry, and clinician acknowledgement.',
    afterFinish: 'Result posts to Lab Results & Trends and routes to ordering clinician for review and patient release.',
    readiness: 'Verified working',
    highlightBadge: 'Visible Bench Result Entry',
  },
  {
    roleKey: 'care-coordinator',
    scenarioId: 'role-care-coordinator',
    roleTitle: 'Care Coordinator',
    staffRole: 'Nurse / Care Coordinator',
    actorExample: 'Marcus Vance, RN · Care Coordination',
    whatTheyDo:
      'Picks up post-consultation handoff tasks, coordinates approved follow-up bookings, logs simulated patient reminders, and verifies longitudinal continuity.',
    whereWorkStarts: 'Tasks & Worklists -> Assigned Care Coordination Queue',
    mainSteps: [
      'Review clinician-assigned post-visit handoff task',
      'Inspect approved 2-week follow-up plan in Care Plan',
      'Confirm follow-up booking and simulated patient reminder',
      'Mark coordination task Complete in real Tasks worklist',
      'Verify Patient Timeline continuity & Critical Events filter',
    ],
    aiAssistsWith: 'Routes structured handoff tasks with linked encounter context so follow-ups are never dropped.',
    humanDecisionsRequired: 'Confirming patient follow-up booking, outreach logging, and task completion.',
    afterFinish: 'Follow-up loop closes cleanly in Patient Timeline without inflating Critical Events.',
    readiness: 'Verified working',
    highlightBadge: 'Closed-Loop Follow-Up',
  },
  {
    roleKey: 'administrator',
    scenarioId: 'role-administrator',
    roleTitle: 'Administrator',
    staffRole: 'Administrator',
    actorExample: 'Priya Nair, MHA · System Governance',
    whatTheyDo:
      'Enforces RBAC boundaries, oversees multi-facility configuration, executes Administrator-only PII-masked HL7 FHIR R4 exports, and audits system activity.',
    whereWorkStarts: 'Administration, Interoperability & Audit',
    mainSteps: [
      'Demonstrate Clinician access is blocked from Administration',
      'Switch to Administrator and inspect multi-facility context',
      'Review Configuration (M36) feature & critical-lab rules',
      'Generate & structurally validate PII-masked HL7 FHIR R4 bundle',
      'Inspect .fhir.json download & immutable Audit Trail (M37)',
    ],
    aiAssistsWith: 'Runs structural FHIR R4 reference integrity checks and logs governance audit events.',
    humanDecisionsRequired: 'Privacy mode confirmation (masked default) and administrative governance oversight.',
    afterFinish: 'Validated masked FHIR R4 JSON bundle is ready for download with complete audit trail.',
    readiness: 'Verified working',
    highlightBadge: 'RBAC + Masked FHIR R4',
  },
];

/**
 * Builds all 8 granular, real-DOM-driven Role Tutorials using deterministic checkpoints
 * derived from the shared Flagship Scheduled Patient Journey (Elena Alvarez · MRN-109420).
 */
export function buildRoleTutorialScenarios(
  prepareFromJourneyPrefix: (base: AppState, prefixCount: number) => AppState
): DemoScenarioDefinition[] {
  // --------------------------------------------------------------------------
  // 1. FRONT DESK REFERENCE TUTORIAL (10 REAL-UI STEPS)
  // --------------------------------------------------------------------------
  const frontDeskScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'fd-01-open-queue',
      sceneNumber: 1,
      title: 'Open Front Desk Arrival Queue',
      role: 'Front Desk',
      screenLabel: 'Front Desk & Patient Access',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'front-desk-arrivals',
      uiActions: [{ kind: 'review', target: 'front-desk-arrivals', pauseBeforeMs: 400 }],
      caption:
        'Front Desk starts in Arrival & Waiting Queue. Front Desk handles administrative check-in, identity, consent, and simulated insurance — separate from Medical Assistant clinical vitals.',
      narration:
        'Step 1. Welcome to the Front Desk tutorial. Nadia Patel opens Today’s Arrival Queue. Notice how Front Desk focuses on arrival check-in, demographics, consent, and insurance — while clinical vitals and room prep belong to the Medical Assistant.',
      explanationAfter: 'Front Desk arrival queue is open and filtered to today’s Boston clinic visits.',
      nextStepPreview: 'Locate Elena Alvarez in the arrival table',
      practiceHint: 'Review the Arrival & Waiting Queue table, then click Next or click Elena’s row.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Opens Front Desk workspace in Front Desk role.',
      prepareView: (prev) => switchRoleView(prev, 'Front Desk', 'front-desk', null),
      execute: (prev) => switchRoleView(prev, 'Front Desk', 'front-desk', null),
      validate: (st) =>
        st.currentNav === 'front-desk' && st.currentRole === 'Front Desk'
          ? { passed: true, detail: 'Front Desk Arrival Queue active.' }
          : { passed: false, detail: 'Expected Front Desk view.' },
    },
    {
      sceneId: 'fd-02-locate-patient',
      sceneNumber: 2,
      title: 'Locate Scheduled Patient Elena Alvarez',
      role: 'Front Desk',
      screenLabel: 'Front Desk · Arrival Queue',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'front-desk-row-elena',
      uiActions: [{ kind: 'review', target: 'front-desk-row-elena', pauseBeforeMs: 350 }],
      caption:
        'Elena Alvarez (MRN-109420) has arrived for her 11:00 CKD & Hypertension Follow-Up. Her row shows Pre-Registered status because she submitted pre-visit intake.',
      narration:
        'Step 2. We locate Elena Alvarez at 11:00 AM. Notice her status is Pre-Registered because her pre-visit intake arrived, and her estimated copay is 25 dollars.',
      explanationAfter: 'Elena Alvarez’s scheduled slot and intake readiness status are confirmed.',
      nextStepPreview: 'Click Check-In & Intake to open the check-in workflow',
      practiceHint: 'Locate Elena Alvarez’s row in the arrival queue.',
      executiveInclude: false,
      durationMs: 3200,
      expectedMutation: 'Identifies Elena Alvarez row (apt-demo-01) in Front Desk queue.',
      prepareView: (prev) => switchRoleView(prev, 'Front Desk', 'front-desk', null),
      execute: (prev) => switchRoleView(prev, 'Front Desk', 'front-desk', null),
      validate: (st) =>
        st.appointments.some((a) => a.id === DEMO_IDS.appointment)
          ? { passed: true, detail: 'Elena Alvarez appointment visible in queue.' }
          : { passed: false, detail: 'Elena Alvarez appointment missing.' },
    },
    {
      sceneId: 'fd-03-open-checkin-modal',
      sceneNumber: 3,
      title: 'Click Check-In & Intake Button',
      role: 'Front Desk',
      screenLabel: 'Front Desk · Arrival Queue',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-checkin-btn-elena',
      uiActions: [{ kind: 'click', target: 'fd-checkin-btn-elena', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 350 }],
      caption:
        'Click the real "Check-In & Intake" button on Elena’s row to open the structured check-in workflow.',
      narration:
        'Step 3. Watch the cursor move to the Check-In and Intake button on Elena’s row and click it to open the live check-in modal.',
      explanationAfter: 'The Check-In & Clinical Intake modal opened directly for Elena Alvarez.',
      nextStepPreview: 'Review demographics & emergency contact',
      practiceHint: 'Click the blue "Check-In & Intake" button on Elena Alvarez’s row.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Opens real Check-In & Clinical Intake modal for Elena Alvarez.',
      execute: (prev) => switchRoleView(prev, 'Front Desk', 'front-desk', null),
      validate: (st) =>
        st.currentNav === 'front-desk'
          ? { passed: true, detail: 'Check-In modal opened via real click.' }
          : { passed: false, detail: 'Front Desk not active.' },
    },
    {
      sceneId: 'fd-04-review-demographics',
      sceneNumber: 4,
      title: 'Inspect Patient Demographics & Contact',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-demographics',
      uiActions: [{ kind: 'review', target: 'fd-modal-demographics', pauseBeforeMs: 350 }],
      caption:
        'Front Desk verbally verifies DOB (1965-07-19), phone, address, and emergency contact (Mateo Alvarez, Spouse) against the patient’s ID.',
      narration:
        'Step 4. Inside section 1, Front Desk confirms Elena’s date of birth, phone number, Boston address, and emergency contact Mateo Alvarez before checking the verification box.',
      explanationAfter: 'Demographics and emergency contact details reviewed against patient ID.',
      nextStepPreview: 'Check Demographics & Consent Verified box',
      practiceHint: 'Inspect section 1 demographics before checking the verification box.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Reviews demographic fields in open modal.',
      execute: (prev) => prev,
      validate: (st) =>
        st.patients.some((p) => p.id === DEMO_PATIENT_ID && p.dob === '1965-07-19')
          ? { passed: true, detail: 'Elena Alvarez demographics confirmed.' }
          : { passed: false, detail: 'Patient record missing.' },
    },
    {
      sceneId: 'fd-05-verify-demographics-checkbox',
      sceneNumber: 5,
      title: 'Confirm Demographics & Intake Consent',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Human approved',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-demo-checkbox',
      uiActions: [{ kind: 'click', target: 'fd-modal-demo-checkbox', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 300 }],
      caption:
        'Click the real "Demographics, identity, and intake consent verified" checkbox to record human verification.',
      narration:
        'Step 5. Nadia checks the Demographics, identity, and intake consent verified checkbox. Human confirmation is always required here.',
      explanationAfter: 'Identity and consent verification checkbox is now checked.',
      nextStepPreview: 'Inspect Simulated Coverage Verification',
      practiceHint: 'Click the "Demographics, identity, and intake consent verified" checkbox.',
      executiveInclude: true,
      durationMs: 2800,
      expectedMutation: 'Checks demographics verification checkbox inside Check-In modal.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Demographics verification confirmed.' }),
    },
    {
      sceneId: 'fd-06-inspect-coverage',
      sceneNumber: 6,
      title: 'Inspect Coverage Verification Notice',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-coverage-panel',
      uiActions: [{ kind: 'review', target: 'fd-modal-coverage-panel', pauseBeforeMs: 350 }],
      caption:
        'Section 2 displays insurance status with an explicit prototype disclosure: Simulated — no live clearinghouse connection.',
      narration:
        'Step 6. Next is Coverage Verification. EigenH clearly discloses that eligibility checks in this prototype are simulated, with no live clearinghouse call.',
      explanationAfter: 'Coverage verification boundary confirmed.',
      nextStepPreview: 'Click Verify Coverage (Simulated)',
      practiceHint: 'Review the Simulated Coverage Verification banner.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Displays coverage verification section.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Coverage verification section reviewed.' }),
    },
    {
      sceneId: 'fd-07-verify-coverage-click',
      sceneNumber: 7,
      title: 'Run Simulated Coverage Eligibility Check',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-verify-coverage-btn',
      uiActions: [{ kind: 'click', target: 'fd-modal-verify-coverage-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 400 }],
      caption:
        'Click "Verify Coverage (Simulated)" to execute the real React eligibility check handler and record active simulated coverage.',
      narration:
        'Step 7. Watch the cursor click Verify Coverage Simulated. The application immediately creates and verifies Elena’s active simulated Blue Cross policy in shared state.',
      explanationAfter: 'Active simulated insurance policy is now attached and stamped with today’s check.',
      nextStepPreview: 'Confirm assigned exam room',
      practiceHint: 'Click the "Verify Coverage (Simulated)" button.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Creates or updates active simulated insurance policy for Elena Alvarez.',
      execute: (prev) => {
        const hasPol = prev.policies.some((p) => p.patientId === DEMO_PATIENT_ID && p.isPrimary);
        if (hasPol) return prev;
        return {
          ...prev,
          policies: upsertById(prev.policies, {
            id: DEMO_IDS.policy,
            patientId: DEMO_PATIENT_ID,
            payerName: 'Blue Cross Blue Shield MA (Simulated)',
            payerCategory: 'Commercial',
            planName: 'PPO Gold',
            memberId: 'BCBS-9921048',
            groupNumber: 'GRP-4402',
            isPrimary: true,
            status: 'Active',
            eligibilityCheckedAt: `${DEMO_CLINICAL_DATE} 10:42 EST (Simulated)`,
            eligibilitySummary: {
              preventiveServices: 'Covered 100% in-network (simulated)',
              nonCoveredNote: 'Prototype simulation only — no live clearinghouse',
              deductibleTotal: 1000,
              deductibleMet: 750,
              coinsurancePct: 10,
              copay: 25,
            },
          }),
        };
      },
      validate: (st) =>
        st.policies.some((p) => p.patientId === DEMO_PATIENT_ID && p.status === 'Active')
          ? { passed: true, detail: 'Active simulated coverage verified on Elena’s chart.' }
          : { passed: false, detail: 'Expected active simulated insurance policy.' },
    },
    {
      sceneId: 'fd-08-select-room',
      sceneNumber: 8,
      title: 'Confirm Exam Room Assignment',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-room-select',
      uiActions: [{ kind: 'select', target: 'fd-modal-room-select', value: 'Exam 3', pauseBeforeMs: 350, pauseAfterMs: 300 }],
      caption:
        'Confirm Exam 3 as the destination room for Dr. Elena Rostova’s clinic lane. Clinical vitals adjustments will be completed by the Medical Assistant.',
      narration:
        'Step 8. We confirm Exam 3 as Elena’s assigned exam room so the Medical Assistant knows exactly where to complete clinical rooming.',
      explanationAfter: 'Exam 3 is selected for Elena Alvarez.',
      nextStepPreview: 'Click Complete Check-In & Room Patient',
      practiceHint: 'Select "Exam 3" in the Assign Exam Room dropdown.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Selects Exam 3 for Elena Alvarez.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Exam 3 selected.' }),
    },
    {
      sceneId: 'fd-09-submit-checkin',
      sceneNumber: 9,
      title: 'Complete Check-In & Submit Form',
      role: 'Front Desk',
      screenLabel: 'Check-In & Intake Modal',
      actorDisplay: 'Nadia Patel (Front Desk)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-submit-btn',
      uiActions: [{ kind: 'click', target: 'fd-modal-submit-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Complete Check-In & Room Patient" to validate inputs, mark intake complete, record simulated $25 copay, and update the arrival queue.',
      narration:
        'Step 9. Clicking Complete Check-In and Room Patient runs real form validation, marks Elena’s intake forms complete, logs the simulated 25 dollar copay, and updates her appointment status.',
      explanationAfter: 'Check-in succeeded and the modal closed cleanly.',
      nextStepPreview: 'Verify queue update & Medical Assistant handoff',
      practiceHint: 'Click the blue "Complete Check-In & Room Patient" button.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Updates appointment apt-demo-01 status to In Room, coPayCollected=true, intakeFormsComplete=true.',
      execute: (prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === DEMO_PATIENT_ID ? { ...p, intakeFormsComplete: true } : p
        ),
        appointments: prev.appointments.map((a) =>
          a.id === DEMO_IDS.appointment
            ? { ...a, status: 'In Room' as const, room: 'Exam 3', coPayCollected: true }
            : a
        ),
        auditEvents: appendDemoAudit(
          prev,
          'fd-09',
          `${DEMO_CLINICAL_DATE} 10:44 EST`,
          'Front Desk',
          'Nadia Patel',
          'Check-In Completed',
          'Appointment',
          DEMO_IDS.appointment,
          'Front Desk verified demographics, simulated coverage, copay ($25), and roomed Elena Alvarez in Exam 3'
        ),
      }),
      validate: (st) => {
        const appt = st.appointments.find((a) => a.id === DEMO_IDS.appointment);
        const pat = st.patients.find((p) => p.id === DEMO_PATIENT_ID);
        return appt && (appt.status === 'In Room' || appt.status === 'Checked In') && pat?.intakeFormsComplete
          ? { passed: true, detail: `Appointment ${appt.status} in ${appt.room}; intakeFormsComplete=true.` }
          : { passed: false, detail: 'Expected checked-in/roomed appointment and intakeFormsComplete=true.' };
      },
    },
    {
      sceneId: 'fd-10-handoff-ma',
      sceneNumber: 10,
      title: 'Confirm Queue Update & Handoff to Medical Assistant',
      role: 'Front Desk',
      screenLabel: 'Front Desk · Arrival Queue',
      actorDisplay: 'Front Desk -> Medical Assistant (Handoff)',
      actorKind: 'handoff',
      classification: 'Completed action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'front-desk-row-elena',
      uiActions: [{ kind: 'review', target: 'front-desk-row-elena', pauseBeforeMs: 400 }],
      caption:
        'Elena’s row now displays Intake Complete, $25 Collected, Exam 3, and In Room. Next owner: Maya Patel, CMA (Medical Assistant) for clinical vitals & prep.',
      narration:
        'Step 10. Front Desk work is complete! Notice Elena’s row now reads Intake Complete, Copay Collected, and Exam 3. Her chart is now handed off to Medical Assistant Maya Patel for clinical vitals and medication review.',
      explanationAfter: 'Structured handoff to Medical Assistant recorded in shared EHR state.',
      nextStepPreview: 'Tutorial complete — try Practice Mode or continue to Medical Assistant',
      practiceHint: 'Confirm Elena’s updated status badges in the Arrival Queue.',
      executiveInclude: true,
      durationMs: 3800,
      expectedMutation: 'Records Front Desk -> Medical Assistant handoff for Elena Alvarez.',
      execute: (prev) => ({
        ...prev,
        handoffs: upsertById(prev.handoffs || [], {
          id: 'ho-demo-fd-ma',
          patientId: DEMO_PATIENT_ID,
          timestamp: `${DEMO_CLINICAL_DATE} 10:45 EST`,
          fromRole: 'Front Desk',
          fromActor: 'Nadia Patel',
          toRole: 'Medical Assistant',
          toOwnerName: 'Maya Patel, CMA',
          reason: 'Arrival check-in, demographics, consent, and simulated eligibility complete; patient in Exam 3.',
          linkedRecordRef: DEMO_IDS.appointment,
          status: 'Accepted',
        }),
      }),
      validate: (st) =>
        (st.handoffs || []).some((h) => h.patientId === DEMO_PATIENT_ID && h.toRole === 'Medical Assistant')
          ? { passed: true, detail: 'Front Desk -> Medical Assistant handoff recorded.' }
          : { passed: false, detail: 'Handoff to Medical Assistant missing.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 2. PATIENT PRE-VISIT INTAKE TUTORIAL (10 REAL-UI STEPS WITH VISIBLE TYPING)
  // --------------------------------------------------------------------------
  const patientIntakeScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'pi-01-open-link',
      sceneNumber: 1,
      title: 'Open Simulated Pre-Visit Intake Link',
      role: 'Front Desk',
      screenLabel: 'Patient Pre-Visit Intake (Simulated)',
      actorDisplay: 'Elena Alvarez (Simulated Secure Link)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: 'pre-visit-intake-panel',
      uiActions: [{ kind: 'review', target: 'pre-visit-intake-panel', pauseBeforeMs: 350 }],
      caption:
        'Before arriving at the clinic, Elena opens her simulated pre-visit intake link. Notice the prototype disclosure: no real external SMS or email is sent.',
      narration:
        'Step 1. Welcome to the Patient Pre-Visit Intake tutorial. Elena opens her simulated pre-visit questionnaire, which writes directly into her EHR chart so staff never re-type paper forms.',
      explanationAfter: 'Pre-Visit Intake form is ready for patient entry.',
      nextStepPreview: 'Visibly enter Reason for Visit',
      practiceHint: 'Review the Simulated Pre-Visit Patient Intake form.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Opens Pre-Visit Intake tab for Elena Alvarez.',
      prepareView: (prev) => switchRoleView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-visit-intake'),
      execute: (prev) => switchRoleView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-visit-intake'),
      validate: (st) =>
        st.selectedPatientId === DEMO_PATIENT_ID && st.selectedPatientTab === 'pre-visit-intake'
          ? { passed: true, detail: 'Pre-Visit Intake screen open for Elena Alvarez.' }
          : { passed: false, detail: 'Expected Pre-Visit Intake tab.' },
    },
    {
      sceneId: 'pi-02-type-reason',
      sceneNumber: 2,
      title: 'Enter Reason for Visit',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Questionnaire',
      actorDisplay: 'Elena Alvarez (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: '#intake-reason',
      uiActions: [
        {
          kind: 'type',
          target: '#intake-reason',
          value: 'Home blood pressure trending 142-148/86 mmHg; CKD Stage 3a review',
          requiredTarget: true,
          pauseBeforeMs: 300,
          pauseAfterMs: 300,
        },
      ],
      caption:
        'Watch the patient visibly type their reason for visit into the real controlled Reason for Visit input field.',
      narration:
        'Step 2. Elena types her reason for visit directly into the form: home blood pressure trending 142 to 148 over 86 and CKD stage 3a review.',
      explanationAfter: 'Reason for Visit updated via live controlled input.',
      nextStepPreview: 'Enter recent symptoms & home readings',
      practiceHint: 'Click inside the "Reason for Visit" field and confirm or edit the text.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Populates #intake-reason form input.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Reason for Visit entered.' }),
    },
    {
      sceneId: 'pi-03-type-symptoms',
      sceneNumber: 3,
      title: 'Enter Recent Symptoms & Home Readings',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Questionnaire',
      actorDisplay: 'Elena Alvarez (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: '#intake-symptoms',
      uiActions: [
        {
          kind: 'type',
          target: '#intake-symptoms',
          value: 'Mild evening ankle puffiness twice last week; no chest pain, dyspnea, or dizziness.',
          requiredTarget: true,
          pauseBeforeMs: 250,
          pauseAfterMs: 300,
        },
      ],
      caption:
        'Patient reports mild evening ankle puffiness and explicitly denies red-flag symptoms (no chest pain, shortness of breath, or dizziness).',
      narration:
        'Step 3. Next, Elena types her symptom summary: mild evening ankle puffiness twice last week, with no chest pain, shortness of breath, or dizziness.',
      explanationAfter: 'Symptom summary entered for clinician pre-visit synthesis.',
      nextStepPreview: 'Confirm current medications',
      practiceHint: 'Type or confirm Elena’s symptoms in the "Recent Symptoms & Home Readings" field.',
      executiveInclude: false,
      durationMs: 3400,
      expectedMutation: 'Populates #intake-symptoms textarea.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Symptoms summary entered.' }),
    },
    {
      sceneId: 'pi-04-type-meds',
      sceneNumber: 4,
      title: 'Confirm Current Medications',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Medications',
      actorDisplay: 'Elena Alvarez (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: '#intake-meds',
      uiActions: [
        {
          kind: 'type',
          target: '#intake-meds',
          value: 'Lisinopril 10 mg once daily (taking consistently)',
          requiredTarget: true,
          pauseBeforeMs: 250,
          pauseAfterMs: 250,
        },
      ],
      caption:
        'Elena confirms she is taking Lisinopril 10 mg once daily consistently. This will still require clinical medication reconciliation by staff.',
      narration:
        'Step 4. Elena confirms her active medication, Lisinopril 10 milligrams once daily. Patient-reported medications remain flagged until staff reconcile them.',
      explanationAfter: 'Current medication list entered.',
      nextStepPreview: 'Review allergies & simulated insurance details',
      practiceHint: 'Verify the "Current Medications" field.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Populates #intake-meds input.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Medications entered.' }),
    },
    {
      sceneId: 'pi-05-confirm-allergies-insurance',
      sceneNumber: 5,
      title: 'Verify Documented Allergies & Payer Info',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Insurance & Allergies',
      actorDisplay: 'Elena Alvarez (Manual Entry)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: '#intake-payer',
      uiActions: [{ kind: 'review', target: '#intake-payer', pauseBeforeMs: 300 }],
      caption:
        'Sulfa allergy (Maculopapular rash) and Blue Cross Blue Shield MA (BCBS-9921048) are confirmed for Front Desk eligibility review.',
      narration:
        'Step 5. Elena reviews her documented Sulfa allergy and enters Blue Cross Blue Shield Massachusetts with member ID BCBS-9921048.',
      explanationAfter: 'Allergy and insurance fields verified.',
      nextStepPreview: 'Review synthetic outside document attachments',
      practiceHint: 'Check the Insurance Payer field.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Confirms allergy and payer inputs.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Allergy & payer info confirmed.' }),
    },
    {
      sceneId: 'pi-06-attachments',
      sceneNumber: 6,
      title: 'Attach Outside Renal Panel & Home BP Log PDFs',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Documents',
      actorDisplay: 'Elena Alvarez (Synthetic Upload)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: 'intake-doc-lab-checkbox',
      uiActions: [{ kind: 'review', target: 'intake-doc-lab-checkbox', pauseBeforeMs: 350 }],
      caption:
        'Two synthetic PDFs are attached: Harborview Outside Renal Panel (Cr 1.38, eGFR 48, K+ 4.5) and Home BP 14-Day Log Summary.',
      narration:
        'Step 6. Elena attaches two synthetic outside documents: her Harborview outside renal lab panel and her 14-day home blood pressure log.',
      explanationAfter: 'Both synthetic attachments are checked and ready to submit.',
      nextStepPreview: 'Click Submit Simulated Pre-Visit Intake',
      practiceHint: 'Confirm both synthetic attachment checkboxes are selected.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Confirms 2 synthetic PDF attachments.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Synthetic attachments ready.' }),
    },
    {
      sceneId: 'pi-07-submit-intake',
      sceneNumber: 7,
      title: 'Submit Pre-Visit Intake Into EHR Chart',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake · Submit',
      actorDisplay: 'Elena Alvarez (Submit)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: 'intake-submit-btn',
      uiActions: [{ kind: 'click', target: 'intake-submit-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Submit Simulated Pre-Visit Intake" to write the submission and attached documents directly into Elena’s shared EHR chart.',
      narration:
        'Step 7. Watch the cursor click Submit Simulated Pre-Visit Intake. This writes directly into Elena’s chart and marks her appointment Pre-Registered.',
      explanationAfter: 'Pre-visit intake submission is now saved and visible in Latest Submission Summary.',
      nextStepPreview: 'Click Run AI Extraction & Review',
      practiceHint: 'Click the blue "Submit Simulated Pre-Visit Intake" button.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Creates PreVisitIntakeSubmission in AppState for Elena Alvarez.',
      execute: (prev) => {
        const exists = (prev.preVisitIntakes || []).some((i) => i.patientId === DEMO_PATIENT_ID);
        if (exists) return prev;
        return {
          ...prev,
          preVisitIntakes: upsertById(prev.preVisitIntakes || [], {
            id: DEMO_IDS.intake,
            patientId: DEMO_PATIENT_ID,
            appointmentId: DEMO_IDS.appointment,
            submittedAt: `${DEMO_CLINICAL_DATE} 08:25 EST`,
            status: 'Submitted',
            reasonForVisit: 'Home blood pressure trending 142-148/86 mmHg; CKD Stage 3a review',
            symptomsSummary: 'Mild evening ankle puffiness twice last week; no chest pain, dyspnea, or dizziness.',
            reportedMedications: ['Lisinopril 10 mg once daily (taking consistently)'],
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
          }),
          appointments: prev.appointments.map((a) =>
            a.id === DEMO_IDS.appointment ? { ...a, status: 'Pre-Registered' as const } : a
          ),
        };
      },
      validate: (st) =>
        (st.preVisitIntakes || []).some((i) => i.patientId === DEMO_PATIENT_ID)
          ? { passed: true, detail: 'Pre-visit intake submission written to Elena’s chart.' }
          : { passed: false, detail: 'Pre-visit intake submission not found.' },
    },
    {
      sceneId: 'pi-08-run-ai-extraction',
      sceneNumber: 8,
      title: 'Run AI Intake Intelligence Extraction',
      role: 'Front Desk',
      screenLabel: 'Pre-Visit Intake -> AI Extraction',
      actorDisplay: 'EigenH AI Intake Intelligence',
      actorKind: 'ai',
      classification: 'AI-prepared',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-visit-intake',
      visualTarget: 'intake-run-ai-btn',
      uiActions: [{ kind: 'click', target: 'intake-run-ai-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Run AI Extraction & Review" so AI parses the uploaded PDFs into structured draft fields and opens the Pre-Consultation Summary.',
      narration:
        'Step 8. Now watch AI Intake Intelligence go to work. Clicking Run AI Extraction parses the uploaded PDFs into structured fields and navigates to Pre-Consultation Summary.',
      explanationAfter: 'AI extracted structured lab values, home BP averages, and medication adherence as unverified drafts.',
      nextStepPreview: 'Inspect AI-prepared — review required fields',
      practiceHint: 'Click the "Run AI Extraction & Review" button in the top bar.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Populates extractedItems on PreVisitIntakeSubmission (all verified=false) and opens Pre-Consultation tab.',
      execute: (prev) => {
        const next = switchRoleView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
        return {
          ...next,
          preVisitIntakes: (next.preVisitIntakes || []).map((i) =>
            i.patientId === DEMO_PATIENT_ID && i.extractedItems.length === 0
              ? {
                  ...i,
                  status: 'AI Extracted' as const,
                  extractedItems: [
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
                      field: 'Home Blood Pressure 14-Day Average',
                      value: 'AM 144/86 mmHg · PM 146/88 mmHg (elevated vs target <130/80)',
                      sourceDocument: 'Home BP 14-Day Log Summary.pdf',
                      sourceSnippet: '14-day average morning BP 144/86 mmHg; evening BP 146/88 mmHg',
                      confidence: 'High' as const,
                      verified: false,
                      targetCategory: 'History' as const,
                    },
                    {
                      id: 'ext-demo-3',
                      field: 'Medication Adherence',
                      value: 'Lisinopril 10 mg once daily — reported taking consistently',
                      sourceDocument: 'Pre-Visit Intake Questionnaire',
                      sourceSnippet: 'Lisinopril 10 mg once daily (taking consistently)',
                      confidence: 'Medium' as const,
                      verified: false,
                      uncertaintyNote: 'Patient self-report; requires clinical medication reconciliation.',
                      targetCategory: 'Medication' as const,
                    },
                  ],
                }
              : i
          ),
        };
      },
      validate: (st) => {
        const intake = (st.preVisitIntakes || []).find((i) => i.patientId === DEMO_PATIENT_ID);
        return intake && intake.extractedItems.length >= 2 && intake.extractedItems.every((x) => !x.verified)
          ? { passed: true, detail: `${intake.extractedItems.length} AI-prepared items staged (all unverified).` }
          : { passed: false, detail: 'Expected unverified AI-extracted items.' };
      },
    },
    {
      sceneId: 'pi-09-inspect-ai-prepared',
      sceneNumber: 9,
      title: 'Inspect AI-Prepared Fields (Review Required)',
      role: 'Front Desk',
      screenLabel: 'Pre-Consultation · Document-to-Chart',
      actorDisplay: 'EigenH AI Intake Intelligence',
      actorKind: 'ai',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'ai-doc-to-chart-panel',
      uiActions: [{ kind: 'review', target: 'ai-doc-to-chart-panel', pauseBeforeMs: 400 }],
      caption:
        'Every AI-extracted field displays its source document quote, confidence level, and an amber "AI-prepared — review required" badge. AI never writes unverified facts directly to the final chart.',
      narration:
        'Step 9. Notice how every extracted value is clearly labeled AI-prepared, review required, with an exact quote from the source PDF. Nothing becomes an official chart fact until staff verify it.',
      explanationAfter: 'Source-linked AI extraction boundary verified.',
      nextStepPreview: 'Confirm intake status in Pre-Visit Readiness',
      practiceHint: 'Review the "AI-prepared — review required" badges and source snippets.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Displays Intelligent Document-to-Chart panel with unverified AI items.',
      execute: (prev) => switchRoleView(prev, 'Front Desk', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      validate: (st) =>
        st.selectedPatientTab === 'pre-consultation'
          ? { passed: true, detail: 'Pre-Consultation AI Document-to-Chart visible.' }
          : { passed: false, detail: 'Expected Pre-Consultation tab.' },
    },
    {
      sceneId: 'pi-10-confirm-readiness',
      sceneNumber: 10,
      title: 'Confirm Pre-Visit Readiness & Care Team Handoff',
      role: 'Front Desk',
      screenLabel: 'Pre-Consultation · Readiness',
      actorDisplay: 'Pre-Visit Intake -> Clinic Team',
      actorKind: 'handoff',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'pre-visit-readiness-panel',
      uiActions: [{ kind: 'review', target: 'pre-visit-readiness-panel', pauseBeforeMs: 400 }],
      caption:
        'Pre-Visit Readiness updates automatically using explicit clinical criteria. Front Desk and Medical Assistant can now verify and room Elena without re-keying paper forms.',
      narration:
        'Step 10. Patient Pre-Visit Intake is complete. Elena’s data and outside documents have arrived inside the EHR, updating Pre-Visit Readiness for Front Desk and the Medical Assistant.',
      explanationAfter: 'Pre-Visit Intake workflow verified end-to-end.',
      nextStepPreview: 'Tutorial complete — continue to Front Desk or Medical Assistant',
      practiceHint: 'Inspect the Pre-Visit Readiness criteria card on the right.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Confirms intake reflected in Pre-Visit Readiness.',
      execute: (prev) => prev,
      validate: (st) =>
        (st.preVisitIntakes || []).some((i) => i.patientId === DEMO_PATIENT_ID)
          ? { passed: true, detail: 'Pre-visit intake active in chart readiness.' }
          : { passed: false, detail: 'Intake record missing.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 3. MEDICAL ASSISTANT TUTORIAL (10 REAL-UI STEPS WITH VISIBLE VITALS TYPING)
  // --------------------------------------------------------------------------
  const medicalAssistantScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'ma-01-role-scope',
      sceneNumber: 1,
      title: 'Start in Medical Assistant Clinical Scope',
      role: 'Medical Assistant',
      screenLabel: 'Medical Assistant · Arrival & Rooming',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'role-preview-switcher',
      uiActions: [{ kind: 'review', target: 'role-preview-switcher', pauseBeforeMs: 350 }],
      caption:
        'Maya Patel, CMA signs in under Medical Assistant scope. Unlike Front Desk arrival registration, the MA captures live vitals, screens allergies, and prepares clinical rooming.',
      narration:
        'Welcome to the Medical Assistant workflow. Maya Patel signs in under Medical Assistant scope, where she captures vital signs, confirms allergies, and prepares Elena Alvarez for her visit.',
      executiveNarration:
        'Maya Patel opens the Medical Assistant workspace to prepare Elena Alvarez for her visit.',
      explanationAfter: 'Medical Assistant role and arrival queue are active.',
      nextStepPreview: 'Open Check-In & Intake for Elena Alvarez',
      practiceHint: 'Observe the Role Preview switcher set to Medical Assistant.',
      executiveInclude: true,
      durationMs: 3500,
      expectedMutation: 'Sets active role to Medical Assistant on Front Desk / Rooming queue.',
      prepareView: (prev) => switchRoleView(prev, 'Medical Assistant', 'front-desk', null),
      execute: (prev) => switchRoleView(prev, 'Medical Assistant', 'front-desk', null),
      validate: (st) =>
        st.currentRole === 'Medical Assistant' && st.currentNav === 'front-desk'
          ? { passed: true, detail: 'Medical Assistant workspace active.' }
          : { passed: false, detail: 'Expected Medical Assistant role.' },
    },
    {
      sceneId: 'ma-02-open-intake',
      sceneNumber: 2,
      title: 'Open Clinical Intake Modal for Elena Alvarez',
      role: 'Medical Assistant',
      screenLabel: 'Medical Assistant · Rooming Queue',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-checkin-btn-elena',
      uiActions: [{ kind: 'click', target: 'fd-checkin-btn-elena', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 350 }],
      caption:
        'Click "Check-In & Intake" on Elena Alvarez’s row to open her live vitals and allergy intake form.',
      narration:
        'First, Maya locates Elena Alvarez in the arrival queue and clicks Check-In and Intake to open her clinical rooming form.',
      executiveNarration:
        'Maya opens Elena Alvarez’s clinical intake form from the arrival queue.',
      explanationAfter: 'Clinical Intake modal opened for Elena Alvarez.',
      nextStepPreview: 'Confirm demographics & consent checkbox',
      practiceHint: 'Click the blue "Check-In & Intake" button on Elena’s row.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Opens Check-In & Clinical Intake modal.',
      execute: (prev) => switchRoleView(prev, 'Medical Assistant', 'front-desk', null),
      validate: () => ({ passed: true, detail: 'Intake modal open.' }),
    },
    {
      sceneId: 'ma-03-confirm-demo',
      sceneNumber: 3,
      title: 'Verify Identity & Intake Consent',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake Modal',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-demo-checkbox',
      uiActions: [{ kind: 'click', target: 'fd-modal-demo-checkbox', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 250 }],
      caption:
        'Double-check two patient identifiers (Full Name + DOB 1965-07-19) and check the verification box.',
      narration:
        'Before recording any vitals, Maya confirms two patient identifiers and checks the verification box.',
      explanationAfter: 'Two-identifier check confirmed.',
      nextStepPreview: 'Verify simulated insurance eligibility',
      practiceHint: 'Check the "Demographics, identity, and intake consent verified" checkbox.',
      executiveInclude: false,
      durationMs: 2600,
      expectedMutation: 'Checks verification checkbox.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Identifiers verified.' }),
    },
    {
      sceneId: 'ma-04-verify-coverage',
      sceneNumber: 4,
      title: 'Confirm Simulated Coverage Status',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake Modal',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-verify-coverage-btn',
      uiActions: [{ kind: 'click', target: 'fd-modal-verify-coverage-btn', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 300 }],
      caption:
        'Click "Verify Coverage (Simulated)" to ensure eligibility status is stamped active prior to lab orders.',
      narration:
        'Next, Maya refreshes Elena’s simulated insurance eligibility so coverage is confirmed before any orders are placed.',
      explanationAfter: 'Simulated eligibility verified.',
      nextStepPreview: 'Visibly type BP Systolic (146 mmHg)',
      practiceHint: 'Click "Verify Coverage (Simulated)".',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Verifies simulated insurance eligibility.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Coverage verified.' }),
    },
    {
      sceneId: 'ma-05-type-sys',
      sceneNumber: 5,
      title: 'Enter Blood Pressure Systolic (146 mmHg)',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake · Vitals',
      actorDisplay: 'Maya Patel, CMA (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-vital-sys',
      uiActions: [{ kind: 'type', target: 'fd-vital-sys', value: '146', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 250 }],
      caption:
        'Watch Maya visibly type BP Systolic 146 mmHg into the real validated numeric input (elevated compared to Elena’s prior 134 mmHg).',
      narration:
        'Now Maya enters Elena’s systolic blood pressure of 146 directly into the vitals field. Notice that this reading is higher than her prior visit reading of 134.',
      executiveNarration:
        'Maya enters Elena’s elevated systolic blood pressure of 146 into the vitals form.',
      explanationAfter: 'BP Systolic 146 mmHg entered.',
      nextStepPreview: 'Visibly type BP Diastolic (88 mmHg)',
      practiceHint: 'Type 146 into the BP Systolic (mmHg) field.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Sets #in-sys to 146.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Systolic 146 entered.' }),
    },
    {
      sceneId: 'ma-06-type-dia',
      sceneNumber: 6,
      title: 'Enter Blood Pressure Diastolic (88 mmHg)',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake · Vitals',
      actorDisplay: 'Maya Patel, CMA (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-vital-dia',
      uiActions: [{ kind: 'type', target: 'fd-vital-dia', value: '88', requiredTarget: true, pauseBeforeMs: 300, pauseAfterMs: 250 }],
      caption: 'Enter BP Diastolic 88 mmHg into the controlled vitals field.',
      narration:
        'She follows by entering Elena’s diastolic blood pressure of 88, completing the blood pressure reading at 146 over 88.',
      explanationAfter: 'BP 146/88 mmHg captured.',
      nextStepPreview: 'Enter Heart Rate (74 bpm) and SpO2 (99%)',
      practiceHint: 'Type 88 into the BP Diastolic (mmHg) field.',
      executiveInclude: true,
      durationMs: 2600,
      expectedMutation: 'Sets #in-dia to 88.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Diastolic 88 entered.' }),
    },
    {
      sceneId: 'ma-07-type-hr-spo2',
      sceneNumber: 7,
      title: 'Enter Heart Rate (74 bpm) & SpO2 (99%)',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake · Vitals',
      actorDisplay: 'Maya Patel, CMA (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-vital-hr',
      uiActions: [
        { kind: 'type', target: 'fd-vital-hr', value: '74', requiredTarget: true, pauseBeforeMs: 250, pauseAfterMs: 200 },
        { kind: 'type', target: 'fd-vital-spo2', value: '99', requiredTarget: true, pauseBeforeMs: 250, pauseAfterMs: 250 },
      ],
      caption: 'Enter Heart Rate 74 bpm and pulse oximetry SpO2 99% into the physiological range-checked inputs.',
      narration:
        'Maya also enters a heart rate of 74 beats per minute and an oxygen saturation of 99 percent, with built-in range checks validating every entry.',
      explanationAfter: 'Complete vital signs set entered.',
      nextStepPreview: 'Screen documented Sulfa allergy & room',
      practiceHint: 'Enter Heart Rate 74 and SpO2 99.',
      executiveInclude: false,
      durationMs: 3200,
      expectedMutation: 'Sets #in-hr to 74 and #in-spo2 to 99.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'HR 74 and SpO2 99 entered.' }),
    },
    {
      sceneId: 'ma-08-screen-allergies',
      sceneNumber: 8,
      title: 'Screen Documented Allergies & Exam Room',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake · Allergy Safety',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-allergy-section',
      uiActions: [{ kind: 'review', target: 'fd-modal-allergy-section', pauseBeforeMs: 350 }],
      caption:
        'Confirm Sulfonamides (Sulfa — Maculopapular rash) is visibly flagged in red and Exam 3 is assigned.',
      narration:
        'Before saving, Maya reviews Elena’s documented Sulfa allergy highlighted in red so the clinician safely avoids sulfonamide medications.',
      explanationAfter: 'Allergy safety confirmed before saving vitals.',
      nextStepPreview: 'Save vitals & room Elena in Exam 3',
      practiceHint: 'Verify the documented Sulfa allergy section.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Confirms allergy display and Exam 3.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Sulfa allergy verified.' }),
    },
    {
      sceneId: 'ma-09-save-vitals-room',
      sceneNumber: 9,
      title: 'Save Vitals & Complete Rooming',
      role: 'Medical Assistant',
      screenLabel: 'Clinical Intake · Submit',
      actorDisplay: 'Maya Patel, CMA (Medical Assistant)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'front-desk',
      patientId: null,
      visualTarget: 'fd-modal-submit-btn',
      uiActions: [{ kind: 'click', target: 'fd-modal-submit-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 450 }],
      caption:
        'Click "Complete Check-In & Room Patient" to save BP 146/88, HR 74, SpO2 99 into Elena’s longitudinal chart and room her in Exam 3.',
      narration:
        'Once everything is confirmed, Maya clicks Complete Check-In and Room Patient. Elena’s vital signs are saved directly to her chart and her room status updates to Exam 3.',
      executiveNarration:
        'Maya saves today’s vital signs and rooms Elena in Exam 3.',
      explanationAfter: 'Vitals saved and Elena is roomed in Exam 3.',
      nextStepPreview: 'Verify updated chart & log clinical handoff',
      practiceHint: 'Click "Complete Check-In & Room Patient".',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Records new vitals (146/88, HR 74, SpO2 99) and rooms Elena Alvarez.',
      execute: (prev) => {
        const hasTodayBp = prev.vitals.some((v) => v.patientId === DEMO_PATIENT_ID && v.bpSystolic === 146);
        return {
          ...prev,
          patients: prev.patients.map((p) =>
            p.id === DEMO_PATIENT_ID ? { ...p, intakeFormsComplete: true } : p
          ),
          appointments: prev.appointments.map((a) =>
            a.id === DEMO_IDS.appointment ? { ...a, status: 'In Room' as const, room: 'Exam 3', coPayCollected: true } : a
          ),
          vitals: hasTodayBp
            ? prev.vitals
            : upsertById(prev.vitals, {
                id: DEMO_IDS.vitals,
                patientId: DEMO_PATIENT_ID,
                recordedAt: `${DEMO_CLINICAL_DATE} 10:48 EST`,
                bpSystolic: 146,
                bpDiastolic: 88,
                heartRate: 74,
                tempF: 98.6,
                spo2: 99,
                weightKg: 68.4,
                heightCm: 164,
                painScore: 0,
                source: 'Clinic Intake',
                recordedBy: 'Maya Patel, CMA',
              }),
        };
      },
      validate: (st) =>
        st.vitals.some((v) => v.patientId === DEMO_PATIENT_ID && v.bpSystolic === 146 && v.bpDiastolic === 88)
          ? { passed: true, detail: 'BP 146/88 mmHg recorded in Elena’s chart.' }
          : { passed: false, detail: 'Expected BP 146/88 vitals record.' },
    },
    {
      sceneId: 'ma-10-open-preconsult-handoff',
      sceneNumber: 10,
      title: 'Confirm Vitals Trend & Handoff to NP / Clinician',
      role: 'Medical Assistant',
      screenLabel: 'Pre-Consultation · Smart Handoffs',
      actorDisplay: 'Medical Assistant -> Nurse Practitioner / Clinician',
      actorKind: 'handoff',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'log-handoff-btn',
      uiActions: [
        { kind: 'review', target: 'ai-doc-to-chart-panel', pauseBeforeMs: 320, pauseAfterMs: 360 },
        { kind: 'click', target: 'log-handoff-btn', requiredTarget: true, pauseBeforeMs: 380, pauseAfterMs: 380 },
      ],
      caption:
        'Open Elena’s Pre-Consultation Summary to confirm her AI-prepared intake items (with source snippets flagged for review) alongside today’s BP 146/88 vs prior 134/82, then click "+ Log Handoff" to route the work item to Hannah Brooks, NP and Dr. Elena Rostova.',
      narration:
        "Finally, Maya opens the Pre-Consultation Summary to confirm Elena's AI-prepared pre-visit intake data alongside today's new blood pressure, then logs the clinical handoff. The Medical Assistant has completed the patient's intake. All required information is now ready for the clinician to review.",
      executiveNarration:
        "The Medical Assistant has completed the patient's intake. All required information is now ready for the clinician to review.",
      explanationAfter: 'AI-prepared intake context verified alongside new vitals; structured MA -> NP clinical handoff logged.',
      nextStepPreview: 'Tutorial complete — continue to Nurse Practitioner or Clinician',
      practiceHint: 'Click "+ Log Handoff" inside the Smart Role Handoffs card.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Opens Pre-Consultation Summary, highlights AI-prepared intake with source, and logs MA -> NP handoff.',
      prepareView: (prev) => switchRoleView(prev, 'Medical Assistant', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      execute: (prev) => {
        const next = switchRoleView(prev, 'Medical Assistant', 'patients', DEMO_PATIENT_ID, 'pre-consultation');
        const exists = (next.handoffs || []).some(
          (h) => h.patientId === DEMO_PATIENT_ID && h.fromRole === 'Medical Assistant'
        );
        if (exists) return next;
        return {
          ...next,
          handoffs: upsertById(next.handoffs || [], {
            id: 'ho-demo-ma-np',
            patientId: DEMO_PATIENT_ID,
            timestamp: `${DEMO_CLINICAL_DATE} 10:50 EST`,
            fromRole: 'Medical Assistant',
            fromActor: 'Maya Patel, CMA',
            toRole: 'Nurse Practitioner',
            toOwnerName: 'Hannah Brooks, NP',
            reason: 'Vitals captured (BP 146/88, HR 74, SpO2 99), Sulfa allergy verified, patient roomed in Exam 3.',
            linkedRecordRef: DEMO_IDS.vitals,
            status: 'Pending',
          }),
        };
      },
      validate: (st) =>
        (st.handoffs || []).some((h) => h.patientId === DEMO_PATIENT_ID && h.fromRole === 'Medical Assistant')
          ? { passed: true, detail: 'MA -> NP handoff logged and visible in Pre-Consultation.' }
          : { passed: false, detail: 'MA handoff missing.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 4. NURSE PRACTITIONER / CLINICAL SUPPORT TUTORIAL (8 REAL-UI STEPS)
  // --------------------------------------------------------------------------
  const npSupportScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'np-01-open-prep',
      sceneNumber: 1,
      title: 'Open Pre-Consultation Summary as Nurse Practitioner',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Clinical Prep',
      actorDisplay: 'Hannah Brooks, NP (Clinical Support)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'pre-visit-readiness-panel',
      uiActions: [{ kind: 'review', target: 'pre-visit-readiness-panel', pauseBeforeMs: 350 }],
      caption:
        'Hannah Brooks, NP picks up the MA handoff. Depending on clinic workflow, an NP or clinical support clinician verifies AI-extracted records and reconciles medications before the attending enters.',
      narration:
        'Step 1. Welcome to the Nurse Practitioner clinical preparation tutorial. Hannah Brooks opens Elena Alvarez’s Pre-Consultation Summary and checks the explicit Pre-Visit Readiness criteria.',
      explanationAfter: 'Pre-Visit Readiness highlights remaining unverified items.',
      nextStepPreview: 'Review Clinical Safety Radar alerts',
      practiceHint: 'Inspect the Pre-Visit Readiness panel on the right.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Opens Pre-Consultation Summary in Nurse Practitioner role.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      execute: (prev) => switchRoleView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      validate: (st) =>
        st.currentRole === 'Nurse Practitioner' && st.selectedPatientTab === 'pre-consultation'
          ? { passed: true, detail: 'NP Pre-Consultation view active.' }
          : { passed: false, detail: 'Expected Nurse Practitioner Pre-Consultation tab.' },
    },
    {
      sceneId: 'np-02-safety-radar',
      sceneNumber: 2,
      title: 'Inspect Clinical Safety Radar',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Safety Radar',
      actorDisplay: 'Hannah Brooks, NP',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'clinical-safety-radar-panel',
      uiActions: [{ kind: 'review', target: 'clinical-safety-radar-panel', pauseBeforeMs: 350 }],
      caption:
        'Clinical Safety Radar flags Elena’s Sulfa allergy, unverified AI intake items, and unreconciled Lisinopril 10 mg so nothing is missed.',
      narration:
        'Step 2. Clinical Safety Radar surfaces active safety signals: Elena’s Sulfa allergy, unverified AI-extracted intake fields, and an unreconciled medication.',
      explanationAfter: 'Active safety items prioritized for verification.',
      nextStepPreview: 'Inspect AI-prepared outside lab draft',
      practiceHint: 'Review the Clinical Safety Radar alerts at the top.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Highlights Clinical Safety Radar.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Safety Radar inspected.' }),
    },
    {
      sceneId: 'np-03-review-ai-draft',
      sceneNumber: 3,
      title: 'Compare AI-Prepared Extraction to Source Quote',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Document-to-Chart',
      actorDisplay: 'EigenH AI Intake -> Human Review',
      actorKind: 'ai',
      classification: 'AI-prepared',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'ai-doc-to-chart-panel',
      uiActions: [{ kind: 'review', target: 'ai-doc-to-chart-panel', pauseBeforeMs: 400 }],
      caption:
        'Each item shows "AI-prepared — review required" alongside the exact quoted line from Harborview Outside Renal Panel (Cr 1.38, eGFR 48, K+ 4.5).',
      narration:
        'Step 3. Before clicking verify, Hannah compares the AI-prepared eGFR and creatinine values directly against the quoted snippet from Elena’s uploaded Harborview PDF.',
      explanationAfter: 'Source snippet verified accurate.',
      nextStepPreview: 'Click Verify into Chart on item #1',
      practiceHint: 'Compare the AI-prepared value to the quoted PDF source.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Reviews source-linked AI extraction items.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'AI draft compared against source.' }),
    },
    {
      sceneId: 'np-04-verify-first-item',
      sceneNumber: 4,
      title: 'Verify Outside Renal Panel Into Chart',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Verification',
      actorDisplay: 'Hannah Brooks, NP (Human Verification)',
      actorKind: 'human',
      classification: 'Human approved',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'verify-intake-btn-0',
      uiActions: [{ kind: 'click', target: 'verify-intake-btn-0', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 350 }],
      caption:
        'Click the real "Verify into Chart" button to promote the outside renal lab value from AI Suggestion to a human-verified Recorded Fact.',
      narration:
        'Step 4. Watch the cursor click Verify into Chart. The badge immediately changes from Simulated AI Suggestion to Recorded Fact with Hannah Brooks stamped as verifier.',
      explanationAfter: 'Outside renal lab extraction promoted to verified Recorded Fact.',
      nextStepPreview: 'Verify remaining AI-prepared intake fields',
      practiceHint: 'Click the blue "Verify into Chart" button on the first extracted item.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Marks first extracted intake item verified=true.',
      execute: (prev) => ({
        ...prev,
        preVisitIntakes: (prev.preVisitIntakes || []).map((i) =>
          i.patientId === DEMO_PATIENT_ID
            ? {
                ...i,
                extractedItems: i.extractedItems.map((item, idx) =>
                  idx === 0
                    ? { ...item, verified: true, verifiedBy: 'Hannah Brooks, NP', verifiedAt: `${DEMO_CLINICAL_DATE} 10:52 EST` }
                    : item
                ),
              }
            : i
        ),
      }),
      validate: (st) => {
        const intake = (st.preVisitIntakes || []).find((i) => i.patientId === DEMO_PATIENT_ID);
        return intake?.extractedItems[0]?.verified
          ? { passed: true, detail: 'First AI intake item verified by Hannah Brooks, NP.' }
          : { passed: false, detail: 'Expected first AI intake item to be verified.' };
      },
    },
    {
      sceneId: 'np-05-verify-remaining',
      sceneNumber: 5,
      title: 'Verify Remaining AI-Prepared Intake Fields',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Verification',
      actorDisplay: 'Hannah Brooks, NP (Human Verification)',
      actorKind: 'human',
      classification: 'Human approved',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'verify-intake-btn-1',
      uiActions: [
        { kind: 'click', target: 'verify-intake-btn-1', pauseBeforeMs: 300, pauseAfterMs: 250 },
        { kind: 'click', target: 'verify-intake-btn-2', pauseBeforeMs: 300, pauseAfterMs: 250 },
        { kind: 'click', target: 'verify-intake-btn-3', pauseBeforeMs: 250, pauseAfterMs: 250 },
      ],
      caption:
        'Click "Verify into Chart" on the remaining AI-prepared home BP and medication adherence items so the entire intake record is human-verified.',
      narration:
        'Step 5. Hannah verifies the remaining AI-prepared items: home blood pressure averages, medication adherence, and allergy status. All items are now human-verified.',
      explanationAfter: '100% of pre-visit AI extractions verified into Elena’s chart.',
      nextStepPreview: 'Open Medications tab & reconcile Lisinopril',
      practiceHint: 'Click "Verify into Chart" on the next unverified item.',
      executiveInclude: false,
      durationMs: 3400,
      expectedMutation: 'Marks all extracted intake items verified=true and intake status Verified.',
      execute: (prev) => ({
        ...prev,
        preVisitIntakes: (prev.preVisitIntakes || []).map((i) =>
          i.patientId === DEMO_PATIENT_ID
            ? {
                ...i,
                status: 'Verified' as const,
                extractedItems: i.extractedItems.map((item) => ({
                  ...item,
                  verified: true,
                  verifiedBy: item.verifiedBy || 'Hannah Brooks, NP',
                  verifiedAt: item.verifiedAt || `${DEMO_CLINICAL_DATE} 10:53 EST`,
                })),
              }
            : i
        ),
      }),
      validate: (st) => {
        const intake = (st.preVisitIntakes || []).find((i) => i.patientId === DEMO_PATIENT_ID);
        return intake && intake.extractedItems.every((x) => x.verified)
          ? { passed: true, detail: 'All AI-extracted intake items verified.' }
          : { passed: false, detail: 'Unverified intake items remain.' };
      },
    },
    {
      sceneId: 'np-06-reconcile-med',
      sceneNumber: 6,
      title: 'Reconcile Active Medication (Lisinopril 10 mg)',
      role: 'Nurse Practitioner',
      screenLabel: 'Patient Chart · Medications',
      actorDisplay: 'Hannah Brooks, NP (Medication Reconciliation)',
      actorKind: 'human',
      classification: 'Human approved',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'medications',
      visualTarget: 'reconcile-med-btn',
      uiActions: [
        { kind: 'click', target: 'patient-tab-medications', pauseBeforeMs: 300, pauseAfterMs: 350 },
        { kind: 'click', target: 'reconcile-med-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 350 },
      ],
      caption:
        'Open the Medications tab and click "Mark Reconciled" on Lisinopril 10 mg once daily to clear the medication reconciliation warning.',
      narration:
        'Step 6. Next, Hannah clicks the Medications tab and clicks Mark Reconciled on Lisinopril 10 milligrams, confirming Elena’s active regimen.',
      explanationAfter: 'Lisinopril 10 mg is now marked Reconciled.',
      nextStepPreview: 'Return to Pre-Consultation Readiness',
      practiceHint: 'Click "Mark Reconciled" on Lisinopril 10 mg.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Sets reconciled=true on Elena’s Lisinopril medication.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'medications'),
      execute: (prev) => {
        const next = switchRoleView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'medications');
        return {
          ...next,
          medications: next.medications.map((m) =>
            m.patientId === DEMO_PATIENT_ID ? { ...m, reconciled: true } : m
          ),
        };
      },
      validate: (st) =>
        st.medications.filter((m) => m.patientId === DEMO_PATIENT_ID).every((m) => m.reconciled)
          ? { passed: true, detail: 'All active medications reconciled.' }
          : { passed: false, detail: 'Unreconciled medication remains.' },
    },
    {
      sceneId: 'np-07-return-readiness',
      sceneNumber: 7,
      title: 'Confirm Pre-Visit Readiness Criteria',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Readiness',
      actorDisplay: 'Hannah Brooks, NP',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'patient-tab-pre-consultation',
      uiActions: [{ kind: 'click', target: 'patient-tab-pre-consultation', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 350 }],
      caption:
        'Return to Pre-Consultation Summary and confirm all documented readiness criteria are complete before notifying Dr. Elena Rostova.',
      narration:
        'Step 7. Returning to Pre-Consultation Summary, Pre-Visit Readiness shows Elena’s chart is verified and ready for physician review.',
      explanationAfter: 'Pre-Visit Readiness criteria confirmed complete.',
      nextStepPreview: 'Log structured handoff to Attending Clinician',
      practiceHint: 'Click the "Pre-Consultation" chart tab.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Navigates back to Pre-Consultation tab.',
      execute: (prev) => switchRoleView(prev, 'Nurse Practitioner', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      validate: (st) =>
        st.selectedPatientTab === 'pre-consultation'
          ? { passed: true, detail: 'Pre-Consultation tab active.' }
          : { passed: false, detail: 'Expected Pre-Consultation tab.' },
    },
    {
      sceneId: 'np-08-handoff-clinician',
      sceneNumber: 8,
      title: 'Log Handoff to Attending Clinician',
      role: 'Nurse Practitioner',
      screenLabel: 'Pre-Consultation · Smart Handoffs',
      actorDisplay: 'Nurse Practitioner -> Clinician (Handoff)',
      actorKind: 'handoff',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'log-handoff-btn',
      uiActions: [{ kind: 'click', target: 'log-handoff-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 400 }],
      caption:
        'Click "+ Log Handoff" to route Elena’s verified chart directly to Dr. Elena Rostova, MD in Exam 3.',
      narration:
        'Step 8. Hannah clicks Log Handoff, creating an auditable Nurse Practitioner to Clinician handoff. Dr. Elena Rostova now has a verified, source-linked Pre-Consultation Summary.',
      explanationAfter: 'NP -> Clinician handoff recorded; Elena is ready for consultation.',
      nextStepPreview: 'Tutorial complete — launch Clinician / Provider workflow next',
      practiceHint: 'Click "+ Log Handoff" in Smart Role Handoffs.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Records NP -> Clinician handoff.',
      execute: (prev) => {
        const exists = (prev.handoffs || []).some(
          (h) => h.patientId === DEMO_PATIENT_ID && h.fromRole === 'Nurse Practitioner' && h.toRole === 'Clinician'
        );
        if (exists) return prev;
        return {
          ...prev,
          handoffs: upsertById(prev.handoffs || [], {
            id: 'ho-demo-np-doc',
            patientId: DEMO_PATIENT_ID,
            timestamp: `${DEMO_CLINICAL_DATE} 10:55 EST`,
            fromRole: 'Nurse Practitioner',
            fromActor: 'Hannah Brooks, NP',
            toRole: 'Clinician',
            toOwnerName: 'Dr. Elena Rostova, MD',
            reason: 'Outside renal labs verified, Lisinopril reconciled, BP 146/88 flagged — ready in Exam 3.',
            linkedRecordRef: `Patient ${DEMO_PATIENT_ID}`,
            status: 'Pending',
          }),
        };
      },
      validate: (st) =>
        (st.handoffs || []).some((h) => h.patientId === DEMO_PATIENT_ID && h.toRole === 'Clinician')
          ? { passed: true, detail: 'NP -> Clinician handoff recorded.' }
          : { passed: false, detail: 'Clinician handoff missing.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 5. CLINICIAN / PROVIDER SHOWCASE TUTORIAL (12 REAL-UI STEPS — STRONGEST)
  // --------------------------------------------------------------------------
  const clinicianScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'cl-01-dashboard',
      sceneNumber: 1,
      title: 'Start on Clinician Dashboard',
      role: 'Clinician',
      screenLabel: 'Clinician Home · Today’s Patients',
      actorDisplay: 'Dr. Elena Rostova, MD (Clinician)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'home',
      patientId: null,
      visualTarget: 'home-todays-patients',
      uiActions: [{ kind: 'review', target: 'home-todays-patients', pauseBeforeMs: 400 }],
      caption:
        'Dr. Elena Rostova starts on her Clinician Dashboard. Elena Alvarez appears in Today’s Patients as In Room (Exam 3) with prep completed.',
      narration:
        "Welcome to the Clinician workflow. Dr. Elena Rostova begins on her home dashboard, where Elena Alvarez appears in Today's Patients already roomed in Exam 3.",
      executiveNarration:
        "Dr. Elena Rostova begins on her dashboard and sees Elena Alvarez ready in Exam 3.",
      explanationAfter: 'Clinician schedule shows Elena Alvarez ready for consultation.',
      nextStepPreview: 'Click Open Chart to launch Pre-Consultation Summary',
      practiceHint: 'Locate Elena Alvarez in Today’s Patients.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Opens Clinician Home Dashboard.',
      prepareView: (prev) => switchRoleView(prev, 'Clinician', 'home', null),
      execute: (prev) => switchRoleView(prev, 'Clinician', 'home', null),
      validate: (st) =>
        st.currentRole === 'Clinician' && st.currentNav === 'home'
          ? { passed: true, detail: 'Clinician Dashboard active.' }
          : { passed: false, detail: 'Expected Clinician Home Dashboard.' },
    },
    {
      sceneId: 'cl-02-open-chart',
      sceneNumber: 2,
      title: 'Open Elena Alvarez’s Chart',
      role: 'Clinician',
      screenLabel: 'Clinician Home -> Patient Chart',
      actorDisplay: 'Dr. Elena Rostova, MD (Clinician)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'home',
      patientId: null,
      visualTarget: 'home-open-elena-btn',
      uiActions: [{ kind: 'click', target: 'home-open-elena-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 400 }],
      caption:
        'Click "Open Chart" on Elena Alvarez’s row to land directly on the AI-native Pre-Consultation Clinical Summary.',
      narration:
        "The patient's clinical history has been prepared for review. Let's open the Pre-Consultation Summary.",
      executiveNarration:
        "The patient's clinical history has been prepared for review. Let's open the Pre-Consultation Summary.",
      explanationAfter: 'Elena Alvarez’s chart opened on Pre-Consultation Summary.',
      nextStepPreview: 'Review What Matters Today & clinical trends',
      practiceHint: 'Click "Open Chart" next to Elena Alvarez.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Opens Elena Alvarez on pre-consultation tab.',
      execute: (prev) => switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      validate: (st) =>
        st.selectedPatientId === DEMO_PATIENT_ID && st.selectedPatientTab === 'pre-consultation'
          ? { passed: true, detail: 'Elena Alvarez Pre-Consultation Summary open.' }
          : { passed: false, detail: 'Expected Pre-Consultation tab.' },
    },
    {
      sceneId: 'cl-03-what-matters',
      sceneNumber: 3,
      title: 'Review What Matters Today & Source Links',
      role: 'Clinician',
      screenLabel: 'Pre-Consultation · What Matters Today',
      actorDisplay: 'EigenH Pre-Consult Intelligence',
      actorKind: 'ai',
      classification: 'AI-prepared',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'what-matters-today-panel',
      uiActions: [{ kind: 'review', target: 'what-matters-today-panel', pauseBeforeMs: 450 }],
      caption:
        'In 15 seconds, the clinician sees BP rising 134/82 -> 146/88 mmHg, outside eGFR dipping 51 -> 48, verified Lisinopril 10 mg, and clickable source links to every underlying chart tab.',
      narration:
        "Before entering the exam room, Dr. Rostova scans What Matters Today. She immediately sees blood pressure trending upward from 134 over 82 to 146 over 88, an outside estimated kidney filtration rate of 48, and direct links to every underlying source record.",
      executiveNarration:
        "What Matters Today highlights Elena's rising blood pressure and kidney lab trend with direct source links.",
      explanationAfter: 'Pre-consultation synthesis reviewed with zero chart hunting.',
      nextStepPreview: 'Inspect Clinical Safety Radar',
      practiceHint: 'Scan the What Matters Today synthesis and source links.',
      executiveInclude: true,
      durationMs: 3800,
      expectedMutation: 'Displays What Matters Today clinical synthesis.',
      execute: (prev) => switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'pre-consultation'),
      validate: (st) =>
        st.selectedPatientTab === 'pre-consultation'
          ? { passed: true, detail: 'What Matters Today visible.' }
          : { passed: false, detail: 'Expected Pre-Consultation tab.' },
    },
    {
      sceneId: 'cl-04-safety-radar',
      sceneNumber: 4,
      title: 'Confirm Clinical Safety Radar (Sulfa Guard)',
      role: 'Clinician',
      screenLabel: 'Pre-Consultation · Safety Radar',
      actorDisplay: 'Dr. Elena Rostova, MD',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'clinical-safety-radar-panel',
      uiActions: [{ kind: 'review', target: 'clinical-safety-radar-panel', pauseBeforeMs: 350 }],
      caption:
        'Clinical Safety Radar and the sticky red header highlight Elena’s Sulfonamides (Sulfa) allergy before any prescription is considered.',
      narration:
        "Next, the Clinical Safety Radar keeps Elena's Sulfa allergy clearly visible so thiazide and sulfonamide medications are safely avoided.",
      explanationAfter: 'Allergy safety guard confirmed.',
      nextStepPreview: 'Click Start Consultation & Scribe',
      practiceHint: 'Review the Clinical Safety Radar banner.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Confirms safety radar display.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Safety Radar verified.' }),
    },
    {
      sceneId: 'cl-05-open-post-consult',
      sceneNumber: 5,
      title: 'Start Consultation & Ambient Scribe Workspace',
      role: 'Clinician',
      screenLabel: 'Pre-Consultation -> Post-Consultation',
      actorDisplay: 'Dr. Elena Rostova, MD',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'pre-consultation',
      visualTarget: 'start-consult-scribe-btn',
      uiActions: [{ kind: 'click', target: 'start-consult-scribe-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 350 }],
      caption:
        'Click "Start Consultation & Scribe" to transition into the Post-Consultation Summary and Simulated Ambient AI Scribe.',
      narration:
        'When ready to begin the visit, Dr. Rostova clicks Start Consultation and Scribe to open the consultation documentation workspace.',
      executiveNarration:
        'Dr. Rostova opens the consultation and simulated Ambient Scribe workspace.',
      explanationAfter: 'Post-Consultation & Simulated Ambient Scribe workspace open.',
      nextStepPreview: 'Start Simulated Ambient Scribe',
      practiceHint: 'Click the blue "Start Consultation & Scribe" button.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Switches to post-consultation tab.',
      execute: (prev) => switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation'),
      validate: (st) =>
        st.selectedPatientTab === 'post-consultation'
          ? { passed: true, detail: 'Post-Consultation tab active.' }
          : { passed: false, detail: 'Expected post-consultation tab.' },
    },
    {
      sceneId: 'cl-06-start-scribe',
      sceneNumber: 6,
      title: 'Start Simulated Ambient AI Scribe',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · Ambient Scribe',
      actorDisplay: 'Dr. Elena Rostova, MD (Simulated Scribe)',
      actorKind: 'ai',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: 'start-sim-scribe-btn',
      uiActions: [{ kind: 'click', target: 'start-sim-scribe-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 400 }],
      caption:
        'Click "Start Simulated Scribe". Notice the explicit disclosure: uses synthetic consultation transcripts — no live microphone audio is captured or transmitted.',
      narration:
        'Dr. Rostova starts the simulated Ambient AI Scribe. As noted on screen, this prototype uses a synthetic consultation transcript and does not capture live microphone audio.',
      executiveNarration:
        'Dr. Rostova starts the simulated Ambient Scribe using a synthetic visit transcript.',
      explanationAfter: 'Simulated Ambient Scribe session is active and a Draft encounter is created.',
      nextStepPreview: 'Review synthetic consultation transcript',
      practiceHint: 'Click the blue "Start Simulated Scribe" button.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Creates Draft encounter and activates simulated scribe mode.',
      execute: (prev) => {
        const hasEnc = prev.encounters.some((e) => e.patientId === DEMO_PATIENT_ID);
        if (hasEnc) return switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation');
        return {
          ...switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'post-consultation'),
          encounters: upsertById(prev.encounters, {
            id: DEMO_IDS.encounter,
            patientId: DEMO_PATIENT_ID,
            providerId: 'staff-1',
            facilityId: DEMO_FACILITY_ID,
            date: DEMO_CLINICAL_DATE,
            type: 'Outpatient Consultation',
            chiefComplaint: 'Elevated home BP and CKD stage 3a follow-up',
            soap: { subjective: '', objective: '', assessment: '', plan: '' },
            diagnoses: ['Chronic kidney disease, stage 3a (N18.31)', 'Essential hypertension (I10)'],
            noteStatus: 'Draft',
            amendments: [],
            comments: [],
            avsReleased: false,
          }),
        };
      },
      validate: (st) =>
        st.encounters.some((e) => e.patientId === DEMO_PATIENT_ID && e.noteStatus === 'Draft')
          ? { passed: true, detail: 'Draft encounter active for ambient scribe.' }
          : { passed: false, detail: 'Draft encounter missing.' },
    },
    {
      sceneId: 'cl-07-review-transcript',
      sceneNumber: 7,
      title: 'Inspect Synthetic Consultation Transcript',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · Transcript',
      actorDisplay: 'EigenH Simulated Ambient Scribe',
      actorKind: 'ai',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: '#ambient-transcript',
      uiActions: [{ kind: 'review', target: '#ambient-transcript', pauseBeforeMs: 400 }],
      caption:
        'The synthetic transcript captures home BP 142-148/86, mild ankle puffiness, Sulfa avoidance, low-dose Amlodipine 5 mg draft, Renal/Potassium lab panel, and 2-week follow-up.',
      narration:
        'The synthetic visit transcript captures the key clinical discussion, including elevated home blood pressure, Sulfa allergy avoidance, a low-dose Amlodipine draft, a kidney and potassium lab check, and a two-week follow-up.',
      explanationAfter: 'Transcript ready for structured SOAP and action drafting.',
      nextStepPreview: 'Click Stop & Generate Draft SOAP',
      practiceHint: 'Review the synthetic consultation transcript.',
      executiveInclude: false,
      durationMs: 3200,
      expectedMutation: 'Reviews editable consultation transcript.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Transcript reviewed.' }),
    },
    {
      sceneId: 'cl-08-stop-generate-soap',
      sceneNumber: 8,
      title: 'Stop Scribe & Generate AI-Prepared SOAP Draft',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · SOAP & Composer',
      actorDisplay: 'EigenH Ambient AI Scribe (Draft Only)',
      actorKind: 'ai',
      classification: 'AI-prepared',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: 'stop-gen-soap-btn',
      uiActions: [{ kind: 'click', target: 'stop-gen-soap-btn', requiredTarget: false, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Stop & Generate Draft SOAP". AI drafts Subjective, Objective, Assessment, and Plan AND stages reviewable clinical actions — but NEVER signs the note or places orders autonomously.',
      narration:
        'Clicking Stop and Generate Draft SOAP populates all four sections of the clinical note and stages reviewable follow-up actions on the right. The note stays in draft status until the clinician verifies and signs it.',
      executiveNarration:
        'EigenH drafts the SOAP note and stages reviewable follow-up actions while keeping everything in draft status.',
      explanationAfter: 'AI-prepared Draft SOAP and explainable Action Composer populated.',
      nextStepPreview: 'Visibly edit the SOAP Plan as the clinician',
      practiceHint: 'Click the red "Stop & Generate Draft SOAP" button (or "Generate Draft from Transcript").',
      executiveInclude: true,
      durationMs: 3800,
      expectedMutation: 'Populates Draft SOAP and AI Clinical Action Composer (all Awaiting Approval).',
      execute: (prev) => {
        const hasSession = (prev.scribeSessions || []).some((s) => s.patientId === DEMO_PATIENT_ID);
        if (hasSession) return prev;
        // Fallback deterministic sync if executed synchronously in node:test
        return {
          ...prev,
          encounters: prev.encounters.map((e) =>
            e.patientId === DEMO_PATIENT_ID
              ? {
                  ...e,
                  noteStatus: 'Draft' as const,
                  soap: {
                    subjective: '61F CKD stage 3a and HTN. Home BP 142-148/86 mmHg on Lisinopril 10 mg daily. Mild evening ankle puffiness x2. Denies CP/SOB/dizziness.',
                    objective: 'BP 146/88 mmHg, HR 74 bpm, SpO2 99%. Outside renal panel (2026-11-12): Cr 1.38 mg/dL, eGFR 48, K+ 4.5 mmol/L.',
                    assessment: '1. Essential hypertension (I10) — above target (<130/80).\n2. CKD Stage 3a (N18.31) — mild eGFR decline 51 -> 48; Sulfa allergy noted.',
                    plan: '1. Stage Amlodipine 5 mg daily draft (avoiding sulfa/thiazides).\n2. Order Renal Function & Serum Potassium Panel in 5 days.\n3. Schedule 2-week Care Coordinator BP & lab follow-up.',
                  },
                }
              : e
          ),
          scribeSessions: upsertById(prev.scribeSessions || [], {
            id: DEMO_IDS.scribe,
            patientId: DEMO_PATIENT_ID,
            encounterId: DEMO_IDS.encounter,
            status: 'Draft Ready',
            transcript: 'Synthetic consultation transcript processed.',
            generatedSoap: {
              subjective: '61F CKD stage 3a and HTN.',
              objective: 'BP 146/88 mmHg, HR 74 bpm, SpO2 99%.',
              assessment: 'HTN above target; CKD Stage 3a; Sulfa allergy.',
              plan: 'Amlodipine 5 mg draft; Renal/K+ panel; 2-week follow-up.',
            },
            updatedAt: `${DEMO_CLINICAL_DATE} 11:16 EST`,
            proposedActions: [
              {
                id: 'act-demo-lab',
                kind: 'Lab Order',
                title: 'Order Renal Function & Serum Potassium Panel',
                summary: 'Recheck Cr, eGFR, and Serum K+ within 5 days.',
                status: 'Awaiting Approval',
                confidence: 'High',
                source: 'Simulated Ambient Scribe',
                sourceVerified: true,
                supportingRecord: 'Harborview Outside Renal Panel (eGFR 48)',
                whyExplanation: 'Outside eGFR declined from 51 to 48 mL/min; electrolyte recheck required before and after antihypertensive adjustment.',
                humanDecisionRequired: 'Clinician must individually approve order before lab requisition is authorized.',
                payload: { code: '80053', name: 'Renal Function & Serum Potassium Panel' },
              },
              {
                id: 'act-demo-med',
                kind: 'Medication Draft',
                title: 'Draft Amlodipine Besylate 5 mg Oral Daily',
                summary: 'Sulfa-free CCB add-on for elevated home BP 146/88 mmHg.',
                status: 'Awaiting Approval',
                confidence: 'High',
                source: 'Simulated Ambient Scribe',
                sourceVerified: true,
                supportingRecord: 'Allergy Guard: Sulfonamides (Sulfa) rash',
                whyExplanation: 'Calcium channel blocker avoids documented Sulfa allergy while addressing persistent Stage 2 systolic readings.',
                humanDecisionRequired: 'Clinician review and approval required; simulated draft only.',
                payload: { drug: 'Amlodipine Besylate', dose: '5 mg', frequency: 'Once daily' },
              },
            ],
          }),
        };
      },
      validate: (st) => {
        const enc = st.encounters.find((e) => e.patientId === DEMO_PATIENT_ID);
        const sess = (st.scribeSessions || []).find((s) => s.patientId === DEMO_PATIENT_ID);
        return enc && enc.noteStatus === 'Draft' && sess && sess.proposedActions.length >= 2
          ? { passed: true, detail: `Draft SOAP + ${sess.proposedActions.length} AI proposals awaiting clinician approval.` }
          : { passed: false, detail: 'Expected Draft SOAP and AI proposed actions.' };
      },
    },
    {
      sceneId: 'cl-09-edit-soap',
      sceneNumber: 9,
      title: 'Clinician Reviews & Edits Draft SOAP Plan',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · SOAP Editor',
      actorDisplay: 'Dr. Elena Rostova, MD (Manual Edit)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: '#post-soap-plan',
      uiActions: [
        {
          kind: 'type',
          target: '#post-soap-plan',
          value: '\nClinician note: Reinforced <2g sodium diet and home BP cuff log review.',
          append: true,
          requiredTarget: true,
          pauseBeforeMs: 300,
          pauseAfterMs: 300,
        },
      ],
      caption:
        'Clinicians stay in full control of every word. Watch Dr. Rostova visibly append a counseling note directly into the live Plan textarea before signing.',
      narration:
        'Every AI-prepared section remains fully editable. Here, Dr. Rostova adds her own patient counseling note directly into the treatment plan before signing.',
      executiveNarration:
        'Dr. Rostova edits the treatment plan directly to add her counseling note.',
      explanationAfter: 'Clinician edit saved live into Draft SOAP Plan.',
      nextStepPreview: 'Inspect "Why?" provenance in AI Clinical Action Composer',
      practiceHint: 'Click inside the Plan textarea and add or review the clinician note.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Updates Draft SOAP Plan text.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Clinician SOAP edit captured.' }),
    },
    {
      sceneId: 'cl-10-inspect-why',
      sceneNumber: 10,
      title: 'Inspect "Why?" Evidence in AI Action Composer',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · Explainable AI',
      actorDisplay: 'Dr. Elena Rostova, MD (AI Provenance)',
      actorKind: 'ai',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: 'composer-why-btn-0',
      uiActions: [{ kind: 'click', target: 'composer-why-btn-0', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 450 }],
      caption:
        'Click "Why? (Evidence & Provenance)" on the proposed lab order to inspect the clinical rationale, supporting record, and required human decision.',
      narration:
        'Before approving any order, Dr. Rostova clicks Why on the proposed renal and potassium lab panel to inspect the clinical rationale, supporting record, and required human decision.',
      executiveNarration:
        'Dr. Rostova opens the Why drawer to verify the clinical evidence behind the proposed lab order.',
      explanationAfter: 'Explainability drawer opened showing transparent clinical provenance.',
      nextStepPreview: 'Individually approve clinical actions',
      practiceHint: 'Click "Why? (Evidence & Provenance)" on the first proposed action.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Expands Why? provenance card inside AI Clinical Action Composer.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Why? explainability verified.' }),
    },
    {
      sceneId: 'cl-11-approve-actions',
      sceneNumber: 11,
      title: 'Individually Approve Proposed Orders & Medication Draft',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · Action Approval',
      actorDisplay: 'Dr. Elena Rostova, MD (Simulated Demo Approval)',
      actorKind: 'human',
      classification: 'Human approved',
      isSimulatedApproval: true,
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: 'composer-approve-btn-0',
      uiActions: [
        { kind: 'click', target: 'composer-approve-btn-0', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 350 },
        { kind: 'click', target: 'composer-approve-btn-1', pauseBeforeMs: 350, pauseAfterMs: 350 },
      ],
      caption:
        'Click the real "Approve" buttons on proposed orders and medication drafts. Simulated clinician approval during demo playback creates real authorized records in shared state.',
      narration:
        'Now Dr. Rostova individually approves the proposed lab order and the Amlodipine medication draft. The clinician has approved the proposed actions. These tasks will now appear in the appropriate staff work queues.',
      executiveNarration:
        'The clinician has approved the proposed actions. These tasks will now appear in the appropriate staff work queues.',
      explanationAfter: 'Approved lab requisition and medication draft written to Elena’s chart.',
      nextStepPreview: 'Click Sign & Lock Clinical Note',
      practiceHint: 'Click the blue "Approve" button on the proposed action.',
      executiveInclude: true,
      durationMs: 3800,
      expectedMutation: 'Approves AI Composer actions and creates real authorized lab order.',
      execute: (prev) => {
        const hasOrder = prev.orders.some((o) => o.patientId === DEMO_PATIENT_ID);
        return {
          ...prev,
          scribeSessions: (prev.scribeSessions || []).map((s) =>
            s.patientId === DEMO_PATIENT_ID
              ? {
                  ...s,
                  proposedActions: s.proposedActions.map((a, idx) =>
                    idx < 2 ? { ...a, status: 'Completed' as const, resultRef: idx === 0 ? 'REQ-88940' : 'Amlodipine 5 mg Draft' } : a
                  ),
                }
              : s
          ),
          orders: hasOrder
            ? prev.orders
            : upsertById(prev.orders, {
                id: DEMO_IDS.labOrder,
                patientId: DEMO_PATIENT_ID,
                encounterId: DEMO_IDS.encounter,
                orderedById: 'staff-1',
                facilityId: DEMO_FACILITY_ID,
                requisitionId: 'REQ-88940',
                category: 'Lab',
                name: 'Renal Function & Serum Potassium Panel',
                code: '80053',
                priority: 'Routine',
                status: 'Ordered',
                createdAt: `${DEMO_CLINICAL_DATE} 11:18 EST`,
              }),
        };
      },
      validate: (st) =>
        st.orders.some((o) => o.patientId === DEMO_PATIENT_ID && o.status === 'Ordered')
          ? { passed: true, detail: 'Clinician-approved lab order created in Orders & Results.' }
          : { passed: false, detail: 'Expected approved lab order.' },
    },
    {
      sceneId: 'cl-12-sign-lock-note',
      sceneNumber: 12,
      title: 'Sign & Lock Clinical Note + Downstream Handoffs',
      role: 'Clinician',
      screenLabel: 'Post-Consultation · Sign-Off & Time Machine',
      actorDisplay: 'Dr. Elena Rostova, MD (Simulated Demo Sign-Off)',
      actorKind: 'human',
      classification: 'Completed action',
      isSimulatedApproval: true,
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'post-consultation',
      visualTarget: 'sign-lock-note-btn',
      uiActions: [{ kind: 'click', target: 'sign-lock-note-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Sign & Lock Clinical Note" to finalize the encounter, lock the SOAP text, update the Patient Journey Time Machine, and trigger Lab & Care Coordinator handoffs.',
      narration:
        'Finally, Dr. Rostova clicks Sign and Lock Clinical Note. The encounter is locked with her signature timestamp, the clinical timeline updates, and downstream teams receive their assigned tasks.',
      executiveNarration:
        'Dr. Rostova signs and locks the clinical note, completing the consultation workflow.',
      explanationAfter: 'Encounter signed & locked; Care Coordinator and Laboratory Staff notified.',
      nextStepPreview: 'Tutorial complete — continue to Laboratory Staff or Care Coordinator',
      practiceHint: 'Click the dark navy "Sign & Lock Clinical Note" button.',
      executiveInclude: true,
      durationMs: 4000,
      expectedMutation: 'Transitions encounter noteStatus to Signed and records audit event.',
      execute: (prev) => ({
        ...prev,
        encounters: prev.encounters.map((e) =>
          e.patientId === DEMO_PATIENT_ID
            ? { ...e, noteStatus: 'Signed' as const, signedBy: 'Dr. Elena Rostova, MD', signedAt: `${DEMO_CLINICAL_DATE} 11:20 EST`, avsReleased: true }
            : e
        ),
        auditEvents: appendDemoAudit(
          prev,
          'cl-12',
          `${DEMO_CLINICAL_DATE} 11:20 EST`,
          'Clinician',
          'Dr. Elena Rostova, MD',
          'Sign Clinical Note',
          'Encounter',
          DEMO_IDS.encounter,
          'Clinician reviewed AI SOAP draft, approved clinical actions, and signed consultation note'
        ),
      }),
      validate: (st) =>
        st.encounters.some((e) => e.patientId === DEMO_PATIENT_ID && e.noteStatus === 'Signed')
          ? { passed: true, detail: 'Consultation note signed and locked.' }
          : { passed: false, detail: 'Expected Signed encounter.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 6. LABORATORY STAFF TUTORIAL (8 REAL-UI STEPS WITH VISIBLE RESULT ENTRY)
  // --------------------------------------------------------------------------
  const labScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'lab-01-role-boundary',
      sceneNumber: 1,
      title: 'Start in Laboratory Staff Scope',
      role: 'Laboratory Staff',
      screenLabel: 'Laboratory · Authorized Orders',
      actorDisplay: 'Devon Brooks, MLS (Laboratory Staff)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'role-preview-switcher',
      uiActions: [{ kind: 'review', target: 'role-preview-switcher', pauseBeforeMs: 350 }],
      caption:
        'Devon Brooks, MLS operates under Laboratory Staff scope. Lab staff only process clinician-authorized orders and cannot prescribe or modify SOAP notes.',
      narration:
        'Step 1. Welcome to the Laboratory Staff tutorial. Devon Brooks works under Laboratory Staff permissions, handling specimen collection and bench results strictly for clinician-authorized requisitions.',
      explanationAfter: 'Laboratory Staff role active on Elena’s Orders & Results.',
      nextStepPreview: 'Inspect authorized requisition REQ-88940',
      practiceHint: 'Observe the Role Preview switcher set to Laboratory Staff.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Switches to Laboratory Staff on Orders & Results.',
      prepareView: (prev) => switchRoleView(prev, 'Laboratory Staff', 'patients', DEMO_PATIENT_ID, 'orders-results'),
      execute: (prev) => switchRoleView(prev, 'Laboratory Staff', 'patients', DEMO_PATIENT_ID, 'orders-results'),
      validate: (st) =>
        st.currentRole === 'Laboratory Staff' && st.selectedPatientTab === 'orders-results'
          ? { passed: true, detail: 'Laboratory Staff Orders & Results open.' }
          : { passed: false, detail: 'Expected Laboratory Staff on Orders & Results.' },
    },
    {
      sceneId: 'lab-02-inspect-req',
      sceneNumber: 2,
      title: 'Inspect Authorized Lab Requisition REQ-88940',
      role: 'Laboratory Staff',
      screenLabel: 'Orders & Requisitions (M09)',
      actorDisplay: 'Devon Brooks, MLS',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'orders-results-panel',
      uiActions: [{ kind: 'review', target: 'orders-results-panel', pauseBeforeMs: 350 }],
      caption:
        'Requisition REQ-88940 (Renal Function & Serum Potassium Panel, CPT 80053) appears with status Ordered, authorized by Dr. Elena Rostova.',
      narration:
        'Step 2. We inspect requisition REQ-88940 for Elena Alvarez: Renal Function and Serum Potassium Panel, authorized by Dr. Rostova.',
      explanationAfter: 'Authorized requisition verified.',
      nextStepPreview: 'Click Collect Specimen',
      practiceHint: 'Review requisition REQ-88940 in the Orders table.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Displays REQ-88940 in Ordered status.',
      execute: (prev) => prev,
      validate: (st) =>
        st.orders.some((o) => o.patientId === DEMO_PATIENT_ID && o.category === 'Lab')
          ? { passed: true, detail: 'Authorized lab order REQ-88940 present.' }
          : { passed: false, detail: 'Lab order missing.' },
    },
    {
      sceneId: 'lab-03-collect-specimen',
      sceneNumber: 3,
      title: 'Mark Specimen Collected',
      role: 'Laboratory Staff',
      screenLabel: 'Orders & Requisitions (M09)',
      actorDisplay: 'Devon Brooks, MLS',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'lab-collect-btn',
      uiActions: [{ kind: 'click', target: 'lab-collect-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 350 }],
      caption:
        'Click the real "Collect Specimen" button to transition REQ-88940 from Ordered to Specimen Collected.',
      narration:
        'Step 3. Watch the cursor click Collect Specimen. The requisition status immediately updates to Specimen Collected and logs a specimen tracking audit entry.',
      explanationAfter: 'Requisition status transitioned to Specimen Collected.',
      nextStepPreview: 'Visibly enter synthetic Serum Potassium value (4.6)',
      practiceHint: 'Click the "Collect Specimen" button on REQ-88940.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Updates lab order status to Specimen Collected.',
      execute: (prev) => ({
        ...prev,
        orders: prev.orders.map((o) =>
          o.id === DEMO_IDS.labOrder ? { ...o, status: 'Specimen Collected' as const } : o
        ),
      }),
      validate: (st) =>
        st.orders.some((o) => o.patientId === DEMO_PATIENT_ID && (o.status === 'Specimen Collected' || o.status === 'Resulted'))
          ? { passed: true, detail: 'Specimen Collected recorded.' }
          : { passed: false, detail: 'Expected Specimen Collected status.' },
    },
    {
      sceneId: 'lab-04-type-result',
      sceneNumber: 4,
      title: 'Enter Synthetic Serum Potassium Value (4.6 mmol/L)',
      role: 'Laboratory Staff',
      screenLabel: 'Orders & Requisitions · Result Entry',
      actorDisplay: 'Devon Brooks, MLS (Manual Entry)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'lab-result-value-input',
      uiActions: [{ kind: 'type', target: 'lab-result-value-input', value: '4.6', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 300 }],
      caption:
        'Watch Devon visibly type the synthetic Serum Potassium result "4.6" into the bench result input field (within normal reference range 3.5–5.1 mmol/L).',
      narration:
        'Step 4. After processing the specimen, Devon visibly enters the synthetic serum potassium result: 4 point 6 millimoles per liter.',
      explanationAfter: 'Result value 4.6 entered and ready to post.',
      nextStepPreview: 'Click Post Result to publish into chart',
      practiceHint: 'Enter 4.6 into the numeric result field next to Post Result.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Types synthetic lab value 4.6 into result input.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Result value 4.6 entered.' }),
    },
    {
      sceneId: 'lab-05-post-result',
      sceneNumber: 5,
      title: 'Post Synthetic Lab Result to Patient Chart',
      role: 'Laboratory Staff',
      screenLabel: 'Orders & Requisitions · Post Result',
      actorDisplay: 'Devon Brooks, MLS',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'lab-post-result-btn',
      uiActions: [{ kind: 'click', target: 'lab-post-result-btn', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 400 }],
      caption:
        'Click "Post Result" to finalize REQ-88940, evaluate reference intervals automatically, and deliver the result to Dr. Elena Rostova’s review queue.',
      narration:
        'Step 5. Clicking Post Result writes the result directly into Elena’s chart, marks REQ-88940 as Resulted, and routes it to Dr. Rostova for clinician review.',
      explanationAfter: 'Synthetic lab result posted and order marked Resulted.',
      nextStepPreview: 'Inspect Lab Results & Trends tab',
      practiceHint: 'Click the green "Post Result" button.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Creates LabResult and marks order Resulted.',
      execute: (prev) => {
        const hasNewLab = prev.labResults.some((l) => l.orderId === DEMO_IDS.labOrder);
        return {
          ...prev,
          orders: prev.orders.map((o) => (o.id === DEMO_IDS.labOrder ? { ...o, status: 'Resulted' as const } : o)),
          labResults: hasNewLab
            ? prev.labResults
            : upsertById(prev.labResults, {
                id: DEMO_IDS.labResult,
                orderId: DEMO_IDS.labOrder,
                patientId: DEMO_PATIENT_ID,
                facilityId: DEMO_FACILITY_ID,
                testName: 'Renal Function & Serum Potassium Panel',
                collectionDate: DEMO_CLINICAL_DATE,
                value: '4.6',
                numericValue: 4.6,
                unit: 'mmol/L',
                referenceInterval: '3.5–5.1',
                flag: 'Normal',
                status: 'Final',
                reviewOwnerId: 'staff-1',
                patientReleased: false,
              }),
        };
      },
      validate: (st) =>
        st.labResults.some((l) => l.patientId === DEMO_PATIENT_ID && l.value === '4.6')
          ? { passed: true, detail: 'Serum Potassium 4.6 mmol/L posted to Elena’s chart.' }
          : { passed: false, detail: 'Posted lab result not found.' },
    },
    {
      sceneId: 'lab-06-view-results-tab',
      sceneNumber: 6,
      title: 'Inspect Posted Result in Lab Results & Trends',
      role: 'Laboratory Staff',
      screenLabel: 'Lab Results & Trends (M11)',
      actorDisplay: 'Devon Brooks, MLS',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'seg-tab-labs',
      uiActions: [{ kind: 'click', target: 'seg-tab-labs', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 350 }],
      caption:
        'Click the "Lab Results & Trends (M11)" tab to confirm 4.6 mmol/L appears with reference range 3.5–5.1 and Normal flag.',
      narration:
        'Step 6. Switching to Lab Results and Trends confirms the posted result with its reference interval, normal flag, and pending clinician review status.',
      explanationAfter: 'Result verified in Lab Results table.',
      nextStepPreview: 'Switch to Clinician to close the review loop',
      practiceHint: 'Click the "Lab Results & Trends (M11)" tab.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Switches Orders & Results sub-tab to Lab Results.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Lab Results tab verified.' }),
    },
    {
      sceneId: 'lab-07-clinician-handoff',
      sceneNumber: 7,
      title: 'Handoff to Ordering Clinician Review',
      role: 'Clinician',
      screenLabel: 'Lab Results · Clinician Review',
      actorDisplay: 'Laboratory Staff -> Clinician (Handoff)',
      actorKind: 'handoff',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'role-preview-switcher',
      uiActions: [{ kind: 'review', target: 'role-preview-switcher', pauseBeforeMs: 350 }],
      caption:
        'Switch to Dr. Elena Rostova (Clinician) to see the newly posted lab result waiting for clinician acknowledgement.',
      narration:
        'Step 7. Now we switch to Dr. Elena Rostova’s view. The new potassium result is waiting for her acknowledgement before release.',
      explanationAfter: 'Clinician view active with pending lab acknowledgement.',
      nextStepPreview: 'Click Acknowledge & Release',
      practiceHint: 'Confirm the active role switched to Clinician.',
      executiveInclude: false,
      durationMs: 2800,
      expectedMutation: 'Switches role to Clinician.',
      prepareView: (prev) => switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'orders-results'),
      execute: (prev) => switchRoleView(prev, 'Clinician', 'patients', DEMO_PATIENT_ID, 'orders-results'),
      validate: (st) =>
        st.currentRole === 'Clinician'
          ? { passed: true, detail: 'Clinician role active.' }
          : { passed: false, detail: 'Expected Clinician role.' },
    },
    {
      sceneId: 'lab-08-acknowledge-result',
      sceneNumber: 8,
      title: 'Clinician Acknowledges & Closes Result Loop',
      role: 'Clinician',
      screenLabel: 'Lab Results · Closed Loop',
      actorDisplay: 'Dr. Elena Rostova, MD (Clinician)',
      actorKind: 'human',
      classification: 'Human approved',
      isSimulatedApproval: true,
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'orders-results',
      visualTarget: 'lab-ack-btn',
      uiActions: [
        { kind: 'click', target: 'seg-tab-labs', pauseBeforeMs: 200, pauseAfterMs: 250 },
        { kind: 'click', target: 'lab-ack-btn', requiredTarget: false, pauseBeforeMs: 400, pauseAfterMs: 400 },
      ],
      caption:
        'Click "Acknowledge & Release" so Dr. Rostova marks the lab Reviewed and closes the order-to-result safety loop.',
      narration:
        'Step 8. Dr. Rostova clicks Acknowledge and Release. The lab status transitions to Reviewed, completing the end-to-end laboratory lifecycle.',
      explanationAfter: 'Lab result acknowledged and closed-loop audit logged.',
      nextStepPreview: 'Tutorial complete — continue to Care Coordinator',
      practiceHint: 'Click "Acknowledge & Release" on the posted lab result.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Marks posted lab result status Reviewed.',
      execute: (prev) => ({
        ...prev,
        labResults: prev.labResults.map((l) =>
          l.patientId === DEMO_PATIENT_ID && l.status !== 'Reviewed'
            ? { ...l, status: 'Reviewed' as const, reviewedAt: `${DEMO_CLINICAL_DATE} 14:15 EST`, patientReleased: true }
            : l
        ),
      }),
      validate: (st) =>
        st.labResults.filter((l) => l.patientId === DEMO_PATIENT_ID).every((l) => l.status === 'Reviewed')
          ? { passed: true, detail: 'All Elena Alvarez lab results acknowledged & Reviewed.' }
          : { passed: false, detail: 'Unreviewed lab result remains.' },
    },
  ];

  // --------------------------------------------------------------------------
  // 7. CARE COORDINATOR TUTORIAL (8 REAL-UI STEPS)
  // --------------------------------------------------------------------------
  const careCoordScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'cc-01-open-tasks',
      sceneNumber: 1,
      title: 'Open Assigned Care Coordinator Worklist',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Tasks & Team Worklists (M16)',
      actorDisplay: 'Marcus Vance, RN (Care Coordinator)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'tasks',
      patientId: null,
      visualTarget: 'tasks-work-queue',
      uiActions: [{ kind: 'review', target: 'tasks-work-queue', pauseBeforeMs: 400 }],
      caption:
        'Marcus Vance, RN opens his assigned Tasks worklist and immediately sees the post-consultation handoff task routed from Dr. Elena Rostova for Elena Alvarez.',
      narration:
        'Step 1. Welcome to the Care Coordinator tutorial. Marcus Vance opens his assigned work queue and sees the post-visit follow-up task routed from Dr. Rostova.',
      explanationAfter: 'Assigned follow-up task visible in Care Coordinator scope.',
      nextStepPreview: 'Inspect Elena’s Care Plan & approved instructions',
      practiceHint: 'Review Elena’s follow-up task in the Tasks table.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Opens Tasks queue in Nurse / Care Coordinator role.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'tasks', null),
      execute: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'tasks', null),
      validate: (st) =>
        st.currentRole === 'Nurse / Care Coordinator' && st.currentNav === 'tasks'
          ? { passed: true, detail: 'Care Coordinator Tasks worklist active.' }
          : { passed: false, detail: 'Expected Care Coordinator Tasks view.' },
    },
    {
      sceneId: 'cc-02-open-care-plan',
      sceneNumber: 2,
      title: 'Review Approved Post-Visit Plan',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Patient Chart · Care Plan',
      actorDisplay: 'Marcus Vance, RN',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'care-plan',
      visualTarget: 'patient-tab-care-plan',
      uiActions: [{ kind: 'review', target: 'patient-tab-care-plan', pauseBeforeMs: 350 }],
      caption:
        'Open Elena’s Care Plan to review clinician-approved instructions: home BP log, <2g sodium diet, 5-day potassium lab recheck, and 2-week clinic follow-up.',
      narration:
        'Step 2. Marcus reviews Elena’s Care Plan so his outreach aligns with Dr. Rostova’s signed instructions.',
      explanationAfter: 'Approved care instructions confirmed.',
      nextStepPreview: 'Confirm 2-week follow-up appointment booking',
      practiceHint: 'Review the Care Plan tab for Elena Alvarez.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Opens Care Plan tab for Elena Alvarez.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'patients', DEMO_PATIENT_ID, 'care-plan'),
      execute: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'patients', DEMO_PATIENT_ID, 'care-plan'),
      validate: (st) =>
        st.selectedPatientTab === 'care-plan'
          ? { passed: true, detail: 'Care Plan tab active.' }
          : { passed: false, detail: 'Expected Care Plan tab.' },
    },
    {
      sceneId: 'cc-03-book-followup',
      sceneNumber: 3,
      title: 'Schedule 2-Week CKD & BP Follow-Up',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Care Plan · Follow-Up Scheduling',
      actorDisplay: 'Marcus Vance, RN',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'care-plan',
      visualTarget: 'patient-tab-care-plan',
      uiActions: [{ kind: 'review', target: 'patient-tab-care-plan', pauseBeforeMs: 350 }],
      caption:
        'Book Elena’s conflict-checked 2-week follow-up appointment (2026-12-02 10:30 EST) with Dr. Elena Rostova and link it to the Follow-Up Plan.',
      narration:
        'Step 3. Marcus schedules Elena’s conflict-checked two-week follow-up on December 2nd at 10:30 AM with Dr. Rostova.',
      explanationAfter: 'Follow-up appointment apt-demo-followup created and linked.',
      nextStepPreview: 'Log Simulated Patient Reminder',
      practiceHint: 'Confirm the 2-week follow-up booking.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Creates follow-up appointment apt-demo-followup and links to fp-demo-01.',
      execute: (prev) => ({
        ...prev,
        appointments: upsertById(
          prev.appointments,
          {
            id: DEMO_IDS.followUpAppointment,
            patientId: DEMO_PATIENT_ID,
            providerId: 'staff-1',
            facilityId: DEMO_FACILITY_ID,
            date: '2026-12-02',
            startTime: '10:30',
            durationMin: 30,
            type: 'CKD & BP Follow-Up',
            subtype: 'Scheduled Visit',
            status: 'Scheduled',
            room: 'Exam 3',
            reason: '2-week BP and post-Amlodipine/potassium lab recheck',
            reminderSent: true,
            reminderStatus: 'Simulated Logged',
            calendarSynced: true,
            coPayAmount: 25,
            coPayCollected: false,
          },
          false
        ),
        followUpPlans: upsertById(prev.followUpPlans || [], {
          id: DEMO_IDS.followUpPlan,
          patientId: DEMO_PATIENT_ID,
          encounterId: DEMO_IDS.encounter,
          providerId: 'staff-1',
          facilityId: DEMO_FACILITY_ID,
          interval: '2 weeks (2026-12-02)',
          instructions: 'BP trend & potassium lab recheck; bring 14-day home BP log.',
          createdAt: DEMO_CLINICAL_DATE,
          linkedAppointmentId: DEMO_IDS.followUpAppointment,
          reminderChannel: 'Simulated SMS',
          reminderStatus: 'Not Scheduled',
        }),
      }),
      validate: (st) =>
        st.appointments.some((a) => a.id === DEMO_IDS.followUpAppointment)
          ? { passed: true, detail: '2-week follow-up appointment scheduled for 2026-12-02.' }
          : { passed: false, detail: 'Follow-up appointment missing.' },
    },
    {
      sceneId: 'cc-04-simulated-reminder',
      sceneNumber: 4,
      title: 'Log Simulated Patient Reminder',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Patient Chart · Communications',
      actorDisplay: 'Marcus Vance, RN (Simulated Outreach)',
      actorKind: 'human',
      classification: 'Simulated action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'communications',
      visualTarget: 'patient-tab-communications',
      uiActions: [{ kind: 'click', target: 'patient-tab-communications', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 350 }],
      caption:
        'Open Communications and log a simulated appointment & home BP reminder (explicitly labeled Simulated — no external SMS or email sent).',
      narration:
        'Step 4. Marcus logs a simulated patient reminder in Communications confirming the December 2nd follow-up and home blood pressure log instructions.',
      explanationAfter: 'Simulated reminder logged in Communications and Follow-Up Plan.',
      nextStepPreview: 'Return to Tasks & mark coordination task Complete',
      practiceHint: 'Click the "Communications" chart tab.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Logs simulated reminder thread and updates followUpPlan reminderStatus.',
      execute: (prev) => {
        const next = switchRoleView(prev, 'Nurse / Care Coordinator', 'patients', DEMO_PATIENT_ID, 'communications');
        return {
          ...next,
          followUpPlans: (next.followUpPlans || []).map((fp) =>
            fp.id === DEMO_IDS.followUpPlan ? { ...fp, reminderStatus: 'Simulated Logged' as const } : fp
          ),
          messages: upsertById(next.messages, {
            id: DEMO_IDS.reminderThread,
            patientId: DEMO_PATIENT_ID,
            subject: 'Simulated Reminder: 2-Week CKD & BP Follow-Up (2026-12-02 10:30 EST)',
            channel: 'Text',
            ownerId: 'staff-2',
            priority: 'Normal',
            status: 'Open',
            tags: ['Follow-Up Reminder', 'Simulated'],
            participants: ['Elena Alvarez', 'Marcus Vance, RN'],
            messages: [
              {
                id: 'm-demo-rem-1',
                sender: 'Marcus Vance, RN',
                isPatient: false,
                isInternalNote: false,
                channel: 'Text',
                timestamp: `${DEMO_CLINICAL_DATE} 14:30 EST`,
                body: 'Simulated reminder logged: Your 2-week follow-up with Dr. Elena Rostova is scheduled for 2026-12-02 at 10:30 EST. Please bring your home BP log.',
                deliveryStatus: 'Simulated',
              },
            ],
          }),
        };
      },
      validate: (st) =>
        (st.followUpPlans || []).some((fp) => fp.id === DEMO_IDS.followUpPlan && fp.reminderStatus === 'Simulated Logged')
          ? { passed: true, detail: 'Simulated reminder logged on follow-up plan.' }
          : { passed: false, detail: 'Simulated reminder status missing.' },
    },
    {
      sceneId: 'cc-05-open-tasks-return',
      sceneNumber: 5,
      title: 'Return to Care Coordinator Tasks Worklist',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Tasks & Team Worklists (M16)',
      actorDisplay: 'Marcus Vance, RN',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'tasks',
      patientId: null,
      visualTarget: 'tasks-work-queue',
      uiActions: [{ kind: 'review', target: 'tasks-work-queue', pauseBeforeMs: 350 }],
      caption:
        'Return to the Tasks worklist to close Elena’s follow-up coordination task now that booking and reminder are complete.',
      narration:
        'Step 5. Marcus returns to his Tasks worklist to close out the follow-up coordination task.',
      explanationAfter: 'Tasks worklist displayed.',
      nextStepPreview: 'Change task status to Complete',
      practiceHint: 'Locate Elena’s follow-up task row.',
      executiveInclude: false,
      durationMs: 2600,
      expectedMutation: 'Returns to Tasks worklist.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'tasks', null),
      execute: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'tasks', null),
      validate: (st) =>
        st.currentNav === 'tasks'
          ? { passed: true, detail: 'Tasks view active.' }
          : { passed: false, detail: 'Expected Tasks view.' },
    },
    {
      sceneId: 'cc-06-complete-task',
      sceneNumber: 6,
      title: 'Mark Follow-Up Coordination Task Complete',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Tasks · Status Update',
      actorDisplay: 'Marcus Vance, RN',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'tasks',
      patientId: null,
      visualTarget: 'task-status-select-demo',
      uiActions: [{ kind: 'select', target: 'task-status-select-demo', value: 'Complete', pauseBeforeMs: 400, pauseAfterMs: 400 }],
      caption:
        'Change Elena’s follow-up coordination task status to "Complete" via the real status selector. Open task counts decrement immediately.',
      narration:
        'Step 6. Watch Marcus change the task status dropdown to Complete. Open task counts across the entire EHR decrement immediately.',
      explanationAfter: 'Follow-up coordination task marked Complete.',
      nextStepPreview: 'Inspect Elena’s full Patient Timeline',
      practiceHint: 'Select "Complete" in the task status dropdown.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Marks task tsk-demo-01 Complete.',
      execute: (prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === DEMO_IDS.handoffTask ? { ...t, status: 'Complete' as const } : t)),
      }),
      validate: (st) => {
        const t = st.tasks.find((x) => x.id === DEMO_IDS.handoffTask);
        return !t || t.status === 'Complete'
          ? { passed: true, detail: 'Care Coordinator task marked Complete.' }
          : { passed: false, detail: 'Task still open.' };
      },
    },
    {
      sceneId: 'cc-07-verify-timeline',
      sceneNumber: 7,
      title: 'Verify Longitudinal Continuity in Patient Timeline',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Patient Chart · Timeline',
      actorDisplay: 'Marcus Vance, RN',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'timeline',
      visualTarget: 'patient-timeline-panel',
      uiActions: [{ kind: 'review', target: 'patient-timeline-panel', pauseBeforeMs: 400 }],
      caption:
        'Open Elena’s Patient Timeline to verify the complete chronological chain: booking, pre-visit intake, vitals, signed consult, lab result, and 2-week follow-up.',
      narration:
        'Step 7. Opening Elena’s Patient Timeline confirms every event from scheduling through follow-up is connected in one chronological chart.',
      explanationAfter: 'Longitudinal patient timeline verified.',
      nextStepPreview: 'Verify Critical Events filter non-inflation',
      practiceHint: 'Review Elena’s chronological Patient Timeline.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Opens Patient Timeline tab.',
      prepareView: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'patients', DEMO_PATIENT_ID, 'timeline'),
      execute: (prev) => switchRoleView(prev, 'Nurse / Care Coordinator', 'patients', DEMO_PATIENT_ID, 'timeline'),
      validate: (st) =>
        st.selectedPatientTab === 'timeline'
          ? { passed: true, detail: 'Patient Timeline open.' }
          : { passed: false, detail: 'Expected Timeline tab.' },
    },
    {
      sceneId: 'cc-08-verify-critical-filter',
      sceneNumber: 8,
      title: 'Verify Critical Events Safety Filter (Non-Inflation)',
      role: 'Nurse / Care Coordinator',
      screenLabel: 'Patient Timeline · Critical Events',
      actorDisplay: 'Marcus Vance, RN (Clinical Safety)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'patients',
      patientId: DEMO_PATIENT_ID,
      patientTab: 'timeline',
      visualTarget: 'seg-tab-critical',
      uiActions: [{ kind: 'click', target: 'seg-tab-critical', pauseBeforeMs: 400, pauseAfterMs: 400 }],
      caption:
        'Click "Critical Events" to prove routine follow-up tasks and normal reminders never clutter or inflate truly critical clinical alerts.',
      narration:
        'Step 8. Finally, clicking Critical Events proves our safety governance: routine administrative tasks and normal reminders never pollute true critical alerts. Care Coordinator workflow complete.',
      explanationAfter: 'Critical Events filter verified clean.',
      nextStepPreview: 'Tutorial complete — explore Administrator FHIR R4 Export next',
      practiceHint: 'Click the "Critical Events" tab.',
      executiveInclude: true,
      durationMs: 3400,
      expectedMutation: 'Activates Critical Events timeline view.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Critical Events filter verified.' }),
    },
  ];

  // --------------------------------------------------------------------------
  // 8. ADMINISTRATOR GOVERNANCE & HL7 FHIR R4 TUTORIAL (8 REAL-UI STEPS)
  // --------------------------------------------------------------------------
  const adminScenes: DemoSceneDefinition[] = [
    {
      sceneId: 'adm-01-block-clinician',
      sceneNumber: 1,
      title: 'Verify Unauthorized Role Block (Clinician)',
      role: 'Clinician',
      screenLabel: 'Administration · RBAC Enforcement',
      actorDisplay: 'Dr. Elena Rostova, MD (Blocked)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'admin-restricted-banner',
      uiActions: [{ kind: 'review', target: 'admin-restricted-banner', pauseBeforeMs: 450 }],
      caption:
        'First, verify RBAC governance: when a Clinician navigates to Administration, system configuration and HL7 FHIR R4 patient export are strictly blocked.',
      narration:
        'Step 1. Welcome to the Administrator tutorial. First, we prove role-based access enforcement: as a Clinician, Administration and HL7 FHIR R4 export are strictly blocked.',
      explanationAfter: 'Unauthorized Clinician access reliably blocked.',
      nextStepPreview: 'Switch to Administrator role & facility context',
      practiceHint: 'Confirm the red "Administration Restricted" banner is shown for Clinician.',
      executiveInclude: true,
      durationMs: 3500,
      expectedMutation: 'Verifies executeAuthorizedFhirExport rejects Clinician role.',
      prepareView: (prev) => switchRoleView(prev, 'Clinician', 'administration', null),
      execute: (prev) => switchRoleView(prev, 'Clinician', 'administration', null),
      validate: (st) => {
        const denied = executeAuthorizedFhirExport(st, {
          role: st.currentRole,
          actorName: 'Dr. Elena Rostova, MD',
          patientId: DEMO_PATIENT_ID,
          mode: 'masked',
          confirmedIdentifiable: false,
        });
        return !denied.ok && st.currentRole === 'Clinician'
          ? { passed: true, detail: 'Clinician correctly blocked from FHIR R4 export & Administration.' }
          : { passed: false, detail: 'Expected Clinician to be blocked from FHIR R4 export.' };
      },
    },
    {
      sceneId: 'adm-02-switch-admin',
      sceneNumber: 2,
      title: 'Switch to Administrator & Multi-Facility Scope',
      role: 'Administrator',
      screenLabel: 'Administration · Multi-Facility',
      actorDisplay: 'Priya Nair, MHA (Administrator)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'facility-switcher',
      uiActions: [{ kind: 'review', target: 'facility-switcher', pauseBeforeMs: 350 }],
      caption:
        'Switch to Administrator (Priya Nair, MHA). Administrators unlock multi-facility switching, system configuration, AI governance, and HL7 FHIR R4 export.',
      narration:
        'Step 2. Switching to Administrator unlocks multi-facility context switching and the full Administration, Interoperability, and Audit console.',
      explanationAfter: 'Administrator workspace unlocked.',
      nextStepPreview: 'Inspect Configuration (M36) governance rules',
      practiceHint: 'Observe the Administrator role and facility switcher.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Switches active role to Administrator on Administration page.',
      prepareView: (prev) => switchRoleView(prev, 'Administrator', 'administration', null),
      execute: (prev) => switchRoleView(prev, 'Administrator', 'administration', null),
      validate: (st) =>
        st.currentRole === 'Administrator' && st.currentNav === 'administration'
          ? { passed: true, detail: 'Administrator workspace active.' }
          : { passed: false, detail: 'Expected Administrator role.' },
    },
    {
      sceneId: 'adm-03-config-rules',
      sceneNumber: 3,
      title: 'Inspect System Configuration & Safety Rules (M36)',
      role: 'Administrator',
      screenLabel: 'Administration · Configuration (M36)',
      actorDisplay: 'Priya Nair, MHA (Administrator)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'seg-tab-config',
      uiActions: [{ kind: 'click', target: 'seg-tab-config', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 400 }],
      caption:
        'Click "Configuration (M36)" to inspect enabled AI capabilities and safety rules like auto-creating urgent tasks on critical labs.',
      narration:
        'Step 3. Clicking Configuration opens feature controls and clinical workflow rules, including automatic urgent task creation for critical lab values.',
      explanationAfter: 'Configuration rules verified.',
      nextStepPreview: 'Open HL7 FHIR R4 Export tab',
      practiceHint: 'Click the "Configuration (M36)" tab.',
      executiveInclude: false,
      durationMs: 3200,
      expectedMutation: 'Opens Configuration tab.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Configuration tab inspected.' }),
    },
    {
      sceneId: 'adm-04-open-fhir',
      sceneNumber: 4,
      title: 'Open HL7 FHIR R4 Export & Select Elena Alvarez',
      role: 'Administrator',
      screenLabel: 'Administration · HL7 FHIR R4 Export',
      actorDisplay: 'Priya Nair, MHA (Administrator)',
      actorKind: 'human',
      classification: 'Manual entry',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'seg-tab-fhir-export',
      uiActions: [
        { kind: 'click', target: 'seg-tab-fhir-export', requiredTarget: true, pauseBeforeMs: 350, pauseAfterMs: 300 },
        { kind: 'select', target: '#fhir-pat-select', value: DEMO_PATIENT_ID, pauseBeforeMs: 250, pauseAfterMs: 250 },
      ],
      caption:
        'Click "HL7 FHIR R4 Export (Admin Only)" and select Elena Alvarez (MRN-109420) as the synthetic export subject.',
      narration:
        'Step 4. Priya opens the HL7 FHIR R4 Export tab and selects Elena Alvarez from the synthetic patient list.',
      explanationAfter: 'Elena Alvarez selected for FHIR R4 export.',
      nextStepPreview: 'Confirm Masked / Pseudonymized privacy default',
      practiceHint: 'Click "HL7 FHIR R4 Export (Admin Only)" and select Elena Alvarez.',
      executiveInclude: true,
      durationMs: 3200,
      expectedMutation: 'Selects Elena Alvarez in FHIR R4 generator.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Elena Alvarez selected for FHIR export.' }),
    },
    {
      sceneId: 'adm-05-masked-privacy',
      sceneNumber: 5,
      title: 'Verify PII-Masked / Pseudonymized Default Mode',
      role: 'Administrator',
      screenLabel: 'HL7 FHIR R4 · Privacy Guard',
      actorDisplay: 'Priya Nair, MHA (Privacy Default)',
      actorKind: 'human',
      classification: 'Human verification required',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'fhir-mode-masked',
      uiActions: [{ kind: 'review', target: 'fhir-mode-masked', pauseBeforeMs: 350 }],
      caption:
        'Masked / Pseudonymized mode is selected by default so direct PII (name, phone, email, address) is scrubbed across every FHIR resource.',
      narration:
        'Step 5. Privacy by default: Masked and Pseudonymized mode is pre-selected, automatically redacting direct patient identifiers across the entire FHIR bundle.',
      explanationAfter: 'Masked privacy default confirmed.',
      nextStepPreview: 'Click Generate & Validate FHIR R4',
      practiceHint: 'Confirm "Masked / Pseudonymized (Default)" is selected.',
      executiveInclude: false,
      durationMs: 3000,
      expectedMutation: 'Confirms masked FHIR mode.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'Masked mode confirmed.' }),
    },
    {
      sceneId: 'adm-06-generate-fhir',
      sceneNumber: 6,
      title: 'Generate & Structurally Validate HL7 FHIR R4 Bundle',
      role: 'Administrator',
      screenLabel: 'HL7 FHIR R4 · Validation',
      actorDisplay: 'Priya Nair, MHA (FHIR R4 Export)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'fhir-generate-btn',
      uiActions: [{ kind: 'click', target: 'fhir-generate-btn', requiredTarget: true, pauseBeforeMs: 450, pauseAfterMs: 450 }],
      caption:
        'Click "Generate & Validate FHIR R4" to build the real masked R4 Bundle and run structural & reference integrity validation (clearly disclosed as prototype structural check, not official HL7 certification).',
      narration:
        'Step 6. Watch Priya click Generate and Validate FHIR R4. EigenH builds a masked R4 bundle containing Patient, Encounter, Observations, Conditions, and Medications with zero structural errors.',
      explanationAfter: 'Structurally valid masked HL7 FHIR R4 Bundle generated (0 errors, 0 PII leaks).',
      nextStepPreview: 'Inspect resource counts & .fhir.json download',
      practiceHint: 'Click the blue "Generate & Validate FHIR R4" button.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Generates and validates masked HL7 FHIR R4 Bundle for Elena Alvarez.',
      execute: (prev) => ({
        ...prev,
        auditEvents: appendDemoAudit(
          prev,
          'adm-06',
          `${DEMO_CLINICAL_DATE} 14:40 EST`,
          'Administrator',
          'Priya Nair, MHA',
          'HL7 FHIR R4 Export (Masked)',
          'Patient',
          DEMO_PATIENT_ID,
          'Generated structurally valid masked HL7 FHIR R4 Bundle (0 errors, PII redacted)'
        ),
      }),
      validate: (st) => {
        const res = executeAuthorizedFhirExport(st, {
          role: st.currentRole,
          actorName: 'Priya Nair, MHA',
          patientId: DEMO_PATIENT_ID,
          mode: 'masked',
          confirmedIdentifiable: false,
        });
        const serialized = JSON.stringify(res.bundle || {});
        return res.ok && res.validation?.valid && !serialized.includes('Elena Alvarez')
          ? { passed: true, detail: `Valid masked R4 Bundle (${res.bundle?.entry.length} resources, 0 errors, 0 PII leaks).` }
          : { passed: false, detail: 'Masked FHIR R4 export failed validation or leaked PII.' };
      },
    },
    {
      sceneId: 'adm-07-download-ready',
      sceneNumber: 7,
      title: 'Inspect Validated Bundle & .fhir.json Download',
      role: 'Administrator',
      screenLabel: 'HL7 FHIR R4 · Download Ready',
      actorDisplay: 'Priya Nair, MHA',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'fhir-download-btn',
      uiActions: [{ kind: 'review', target: 'fhir-download-btn', pauseBeforeMs: 400 }],
      caption:
        'Resource counts, JSON preview, prototype structural validation notice, and one-click ".fhir.json" download are all ready for authorized interoperability review.',
      narration:
        'Step 7. The validated bundle preview confirms every resource count and activates the .fhir.json download button.',
      explanationAfter: 'FHIR R4 download verified ready.',
      nextStepPreview: 'Inspect immutable Privacy & Audit Trail (M37)',
      practiceHint: 'Inspect the resource counts and ".fhir.json" download button.',
      executiveInclude: true,
      durationMs: 3000,
      expectedMutation: 'Highlights .fhir.json download button.',
      execute: (prev) => prev,
      validate: () => ({ passed: true, detail: 'FHIR download ready.' }),
    },
    {
      sceneId: 'adm-08-audit-trail',
      sceneNumber: 8,
      title: 'Verify Privacy & Audit Trail (M37)',
      role: 'Administrator',
      screenLabel: 'Administration · Audit Trail (M37)',
      actorDisplay: 'Priya Nair, MHA (Audit Governance)',
      actorKind: 'human',
      classification: 'Completed action',
      routeNav: 'administration',
      patientId: null,
      visualTarget: 'seg-tab-audit',
      uiActions: [{ kind: 'click', target: 'seg-tab-audit', requiredTarget: true, pauseBeforeMs: 400, pauseAfterMs: 400 }],
      caption:
        'Click "Privacy & Audit Trail (M37)" to confirm every clinical, AI review, handoff, and FHIR export action is logged with actor, role, target, and timestamp.',
      narration:
        'Step 8. Finally, Priya opens the Privacy and Audit Trail tab, proving complete traceability across every role and AI action in EigenH. Administrator tutorial complete.',
      explanationAfter: 'End-to-end audit trail verified.',
      nextStepPreview: 'Tutorial complete — explore Complete Patient Journey or any role',
      practiceHint: 'Click the "Privacy & Audit Trail (M37)" tab.',
      executiveInclude: true,
      durationMs: 3600,
      expectedMutation: 'Opens Audit Trail tab showing recorded audit events.',
      execute: (prev) => prev,
      validate: (st) =>
        st.auditEvents.length > 0
          ? { passed: true, detail: `${st.auditEvents.length} audit events verified.` }
          : { passed: false, detail: 'Audit trail empty.' },
    },
  ];

  return [
    {
      id: 'role-front-desk',
      number: 'R1',
      category: 'Role-Based Workflows',
      title: 'Front Desk Tutorial — Check-In & Eligibility',
      subtitle: '10-Step Reference Tutorial · Real Modal Clicks & MA Handoff',
      description:
        'Step-by-step interactive training for Front Desk staff: arrival queue, Check-In & Intake modal, demographics/consent verification, simulated coverage check, rooming, and Medical Assistant handoff.',
      primaryRole: 'Front Desk',
      participatingRoles: ['Front Desk', 'Medical Assistant'],
      valueStatement: 'Teaches exact Front Desk arrival workflow while separating administrative check-in from MA clinical prep.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 3),
      scenes: frontDeskScenes,
    },
    {
      id: 'role-patient-intake',
      number: 'R2',
      category: 'Role-Based Workflows',
      title: 'Patient Pre-Visit Intake & AI Extraction Tutorial',
      subtitle: '10-Step Tutorial · Visible Typing, Synthetic PDFs & AI-Prepared Review',
      description:
        'Demonstrates how a patient completes the simulated pre-visit link, visibly types symptoms and medications, attaches outside lab PDFs, submits directly into the EHR, and triggers source-linked AI extraction.',
      primaryRole: 'Front Desk',
      participatingRoles: ['Front Desk', 'Medical Assistant'],
      valueStatement: 'Eliminates clipboard re-entry while clearly labeling every AI-prepared field as review required.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 1),
      scenes: patientIntakeScenes,
    },
    {
      id: 'role-medical-assistant',
      number: 'R3',
      category: 'Role-Based Workflows',
      title: 'Medical Assistant Tutorial — Vitals & Clinical Rooming',
      subtitle: '10-Step Tutorial · Visible Vitals Entry, Allergy Screen & NP Handoff',
      description:
        'Teaches Medical Assistants how to open clinical intake, visibly type BP 146/88, HR 74, SpO2 99, verify Sulfa allergy safety, save validated vitals, and hand off to NP / Clinician.',
      primaryRole: 'Medical Assistant',
      participatingRoles: ['Medical Assistant', 'Nurse Practitioner'],
      valueStatement: 'Clearly separates MA clinical intake from Front Desk arrival and automates BP trend comparisons.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 3),
      scenes: medicalAssistantScenes,
    },
    {
      id: 'role-np-support',
      number: 'R4',
      category: 'Role-Based Workflows',
      title: 'Nurse Practitioner / Clinical Support Tutorial',
      subtitle: '8-Step Tutorial · Verify AI Drafts, Reconcile Meds & Clinician Handoff',
      description:
        'Shows how a clinic-configured Nurse Practitioner verifies AI-prepared outside lab extractions against PDF quotes, reconciles active medications, and hands off a ready chart to the attending clinician.',
      primaryRole: 'Nurse Practitioner',
      participatingRoles: ['Nurse Practitioner', 'Clinician'],
      valueStatement: 'Proves human verification gates between AI document extraction and official chart facts.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 5),
      scenes: npSupportScenes,
    },
    {
      id: 'role-clinician',
      number: 'R5',
      category: 'Role-Based Workflows',
      title: 'Clinician / Provider Tutorial — AI Copilot End-to-End',
      subtitle: '12-Step Showcase · Pre-Consult -> Simulated Ambient Scribe -> Action Composer -> Sign',
      description:
        'Our strongest clinical tutorial: Dr. Elena Rostova reviews What Matters Today, runs Simulated Ambient AI Scribe, edits Draft SOAP, inspects "Why?" provenance, individually approves orders/meds, and signs.',
      primaryRole: 'Clinician',
      participatingRoles: ['Clinician', 'Laboratory Staff', 'Nurse / Care Coordinator'],
      valueStatement: 'Demonstrates AI-native clinician acceleration with strict human-in-the-loop sign-off and explainability.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 6),
      scenes: clinicianScenes,
    },
    {
      id: 'role-laboratory',
      number: 'R6',
      category: 'Role-Based Workflows',
      title: 'Laboratory Staff Tutorial — Specimen & Result Lifecycle',
      subtitle: '8-Step Tutorial · Authorized Order -> Specimen -> Visible Value Entry -> Clinician Review',
      description:
        'Walks Laboratory Staff through authorized requisition REQ-88940, real Specimen Collection click, visible typing of synthetic Potassium 4.6 mmol/L, posting into the chart, and clinician acknowledgement.',
      primaryRole: 'Laboratory Staff',
      participatingRoles: ['Laboratory Staff', 'Clinician'],
      valueStatement: 'Connects clinician-authorized orders to bench execution and closed-loop clinician result acknowledgement.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 10),
      scenes: labScenes,
    },
    {
      id: 'role-care-coordinator',
      number: 'R7',
      category: 'Role-Based Workflows',
      title: 'Care Coordinator Tutorial — Follow-Up & Continuity',
      subtitle: '8-Step Tutorial · Tasks Queue -> 2-Week Booking -> Simulated Reminder -> Timeline',
      description:
        'Teaches Care Coordinators how to pick up clinician handoffs, verify approved care plans, schedule 2-week follow-ups, log simulated reminders, close tasks, and verify Critical Events non-inflation.',
      primaryRole: 'Nurse / Care Coordinator',
      participatingRoles: ['Nurse / Care Coordinator', 'Clinician'],
      valueStatement: 'Closes post-visit follow-up loops cleanly while preserving non-inflated clinical safety timelines.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 12),
      scenes: careCoordScenes,
    },
    {
      id: 'role-administrator',
      number: 'R8',
      category: 'Role-Based Workflows',
      title: 'Administrator Tutorial — RBAC & Masked HL7 FHIR R4 Export',
      subtitle: '8-Step Tutorial · Clinician Block -> Config M36 -> Masked FHIR R4 -> Audit M37',
      description:
        'Proves strict Administrator-only governance: confirms Clinicians are blocked, inspects multi-facility config, generates a structurally valid PII-masked HL7 FHIR R4 Bundle, and audits every event.',
      primaryRole: 'Administrator',
      participatingRoles: ['Clinician', 'Administrator'],
      valueStatement: 'Demonstrates enforceable RBAC, PII-masked interoperability defaults, and immutable prototype audit trails.',
      status: 'Ready',
      isRoleTutorial: true,
      patientId: DEMO_PATIENT_ID,
      prepareState: (base) => prepareFromJourneyPrefix(base, 13),
      scenes: adminScenes,
    },
  ];
}
