import { INITIAL_APP_STATE, TODAY_DATE } from '../data/seedData';
import {
  buildExplainableRecommendations,
  buildPatientKnowledgeGraph,
} from '../state/knowledgeGraph';
import {
  createSyntheticInboxItemFromTemplate,
  evaluateDuplicateSafety,
  SYNTHETIC_DOCUMENT_TEMPLATES,
} from '../state/registrationIntelligence';
import type { AppState, Patient, PatientTabKey, StaffNavKey, StaffRole } from '../types/hms';
import type { DemoScenarioDefinition, DemoSceneDefinition } from './demoTypes';

export const REG_DEMO_FACILITY_ID = 'fac-bengaluru';
export const REG_DEMO_PATIENT_ID = 'pat-demo-aarav';
export const REG_DEMO_NEAR_MATCH_MRN = 'MRN-208612';
export const REG_DEMO_NEAR_MATCH_DOB = '1974-03-22';
export const REG_DEMO_FRONT_DESK_ID = 'staff-13';
export const REG_DEMO_CLINICIAN_ID = 'staff-9';

export const REG_DEMO_IDS = {
  patient: REG_DEMO_PATIENT_ID,
  appointment: 'apt-regdemo-01',
  labInboxItem: 'inbox-regdemo-lab',
  historyInboxItem: 'inbox-regdemo-hist',
  labDoc: 'doc-regdemo-lab',
  labHba1c: 'lab-regdemo-hba1c',
  labFbg: 'lab-regdemo-fbg',
  labEgfr: 'lab-regdemo-egfr',
  condT2dm: 'cond-regdemo-t2dm',
  medMetformin: 'med-regdemo-metformin',
};

export function findRegisteredAarav(state: AppState): Patient | undefined {
  return (
    state.patients.find((p) => p.id === REG_DEMO_PATIENT_ID) ||
    state.patients.find(
      (p) => p.fullName.trim().toLowerCase() === 'aarav mehta' && p.dob === '1979-08-15'
    )
  );
}

/**
 * Resolves the distinct Bengaluru near-match synthetic fixture (Aarav Mehta, DOB 1974-03-22,
 * MRN-208612) by stable identity attributes rather than relying exclusively on a hardcoded ID.
 */
export function findNearMatchAarav(state: AppState): Patient | undefined {
  return (
    state.patients.find(
      (p) =>
        p.fullName.trim().toLowerCase() === 'aarav mehta' &&
        p.dob === REG_DEMO_NEAR_MATCH_DOB &&
        p.facilityId === REG_DEMO_FACILITY_ID
    ) ||
    state.patients.find(
      (p) => (p.mrn || '').trim().toUpperCase() === REG_DEMO_NEAR_MATCH_MRN
    ) ||
    state.patients.find(
      (p) => p.id === 'pat-9' && p.dob === REG_DEMO_NEAR_MATCH_DOB
    )
  );
}

/**
 * Builds the canonical synthetic Bengaluru near-match fixture strictly for the isolated
 * registration demo sandbox when the active workspace predates or lacks this fixture.
 */
export function buildCanonicalNearMatchAarav(): Patient {
  const seed = INITIAL_APP_STATE.patients.find(
    (p) =>
      (p.mrn || '').trim().toUpperCase() === REG_DEMO_NEAR_MATCH_MRN ||
      (p.fullName.trim().toLowerCase() === 'aarav mehta' && p.dob === REG_DEMO_NEAR_MATCH_DOB)
  );
  if (seed) {
    return structuredClone(seed);
  }
  return {
    id: 'pat-9',
    mrn: REG_DEMO_NEAR_MATCH_MRN,
    fullName: 'Aarav Mehta',
    dob: REG_DEMO_NEAR_MATCH_DOB,
    age: 52,
    sex: 'Male',
    phone: '+91 98801 44219',
    email: 'aarav.m.1974@example.in',
    address: '14 Koramangala 4th Block, Bengaluru 560034',
    facilityId: REG_DEMO_FACILITY_ID,
    primaryProviderId: REG_DEMO_CLINICIAN_ID,
    status: 'Active',
    preferredLanguage: 'English',
    entryPath: 'Scheduled',
    specialtyTags: ['Internal Medicine'],
    allergies: [],
    conditions: [],
    historyItems: [],
    caregivers: [],
    careTeamIds: [REG_DEMO_CLINICIAN_ID, REG_DEMO_FRONT_DESK_ID],
    intakeFormsComplete: true,
    photoConsent: false,
    researchConsent: 'Not Asked',
    chiefConcern: 'Routine annual preventive wellness review (different patient — near-match fixture)',
    registrationStatus: 'Verified & Ready',
    registrationVerifiedBy: 'Kavya Nair',
    registrationVerifiedAt: '2026-06-14 10:15 IST',
  };
}

function findBengaluruStaff(state: AppState, role: StaffRole) {
  return (
    state.staff.find((s) => s.facilityId === REG_DEMO_FACILITY_ID && s.role === role) ||
    state.staff.find((s) => s.id === REG_DEMO_FRONT_DESK_ID) ||
    state.staff[0]
  );
}

function alignRegView(
  state: AppState,
  role: StaffRole,
  nav: StaffNavKey,
  patientId: string | null,
  patientTab: PatientTabKey = 'overview'
): AppState {
  const actor = findBengaluruStaff(state, role);
  return {
    ...state,
    currentPortal: 'staff',
    currentRole: role,
    currentUserId: actor.id,
    currentFacilityId: REG_DEMO_FACILITY_ID,
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

function appendRegDemoAudit(
  state: AppState,
  idSuffix: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: string
): AppState['auditEvents'] {
  const actor = findBengaluruStaff(state, state.currentRole);
  const auditId = `aud-regdemo-${idSuffix}`;
  const filtered = state.auditEvents.filter((a) => a.id !== auditId);
  return [
    {
      id: auditId,
      timestamp: `${TODAY_DATE} 09:20 IST`,
      actor: `${actor.name} (Demo Playback)`,
      role: state.currentRole,
      facilityId: REG_DEMO_FACILITY_ID,
      action,
      targetType,
      targetId,
      detail,
    },
    ...filtered,
  ].slice(0, 100);
}

/**
 * Produces a 100% clean, idempotent starting state for the Patient Registration &
 * Data Consolidation demo at EigenH Bengaluru Hub.
 * - Ensures required Bengaluru facility and staff fixtures exist inside the isolated sandbox.
 * - Removes any prior demo Aarav Mehta (1979-08-15) for replay hygiene.
 * - Guarantees the distinct near-match Bengaluru synthetic patient (Aarav Mehta,
 *   DOB 1974-03-22, MRN-208612) is present without ever duplicating it.
 */
export function buildCleanRegistrationDemoState(baseState: AppState): AppState {
  const existingFacilityIds = new Set(baseState.facilities.map((f) => f.id));
  const ensuredFacilities = [
    ...baseState.facilities,
    ...INITIAL_APP_STATE.facilities.filter(
      (f) => f.id === REG_DEMO_FACILITY_ID && !existingFacilityIds.has(f.id)
    ),
  ];

  const existingStaffIds = new Set(baseState.staff.map((s) => s.id));
  const ensuredStaff = [
    ...baseState.staff,
    ...INITIAL_APP_STATE.staff.filter(
      (s) => s.facilityId === REG_DEMO_FACILITY_ID && !existingStaffIds.has(s.id)
    ),
  ];

  const existingDemoPatientIds = new Set(
    baseState.patients
      .filter(
        (p) =>
          p.id === REG_DEMO_PATIENT_ID ||
          (p.fullName.trim().toLowerCase() === 'aarav mehta' && p.dob === '1979-08-15')
      )
      .map((p) => p.id)
  );
  existingDemoPatientIds.add(REG_DEMO_PATIENT_ID);

  let cleanedPatients = baseState.patients.filter((p) => !existingDemoPatientIds.has(p.id));
  const hasNearMatch = Boolean(
    findNearMatchAarav({ ...baseState, patients: cleanedPatients })
  );
  if (!hasNearMatch) {
    cleanedPatients = [...cleanedPatients, buildCanonicalNearMatchAarav()];
  }

  const isDemoArtifact = (id: string) => id.includes('-regdemo-');

  const cleanedDecisions: AppState['recommendationDecisions'] = {};
  for (const [k, v] of Object.entries(baseState.recommendationDecisions || {})) {
    if (!existingDemoPatientIds.has(v.patientId)) {
      cleanedDecisions[k] = v;
    }
  }

  const stateWithStaff: AppState = {
    ...baseState,
    facilities: ensuredFacilities,
    staff: ensuredStaff,
  };
  const actor = findBengaluruStaff(stateWithStaff, 'Front Desk');

  return {
    ...stateWithStaff,
    currentPortal: 'staff',
    currentRole: 'Front Desk',
    currentUserId: actor.id,
    currentFacilityId: REG_DEMO_FACILITY_ID,
    currentNav: 'patients',
    selectedPatientId: null,
    selectedPatientTab: 'overview',
    unsavedDirty: false,
    patients: cleanedPatients,
    appointments: baseState.appointments.filter(
      (a) => !isDemoArtifact(a.id) && !existingDemoPatientIds.has(a.patientId)
    ),
    documents: baseState.documents.filter(
      (d) => !isDemoArtifact(d.id) && !existingDemoPatientIds.has(d.patientId)
    ),
    labResults: baseState.labResults.filter(
      (l) => !isDemoArtifact(l.id) && !existingDemoPatientIds.has(l.patientId)
    ),
    imagingReports: baseState.imagingReports.filter(
      (i) => !isDemoArtifact(i.id) && !existingDemoPatientIds.has(i.patientId)
    ),
    medications: baseState.medications.filter(
      (m) => !isDemoArtifact(m.id) && !existingDemoPatientIds.has(m.patientId)
    ),
    dataInboxItems: (baseState.dataInboxItems || []).filter(
      (item) =>
        !isDemoArtifact(item.id) &&
        (!item.confirmedPatientId || !existingDemoPatientIds.has(item.confirmedPatientId)) &&
        item.extractedIdentity.dob !== '1979-08-15'
    ),
    recommendationDecisions: cleanedDecisions,
    auditEvents: baseState.auditEvents.filter(
      (ev) =>
        !isDemoArtifact(ev.id) &&
        !(ev.detail || '').includes('[REG-DEMO]') &&
        !existingDemoPatientIds.has(ev.targetId)
    ),
  };
}

function buildCanonicalRegisteredAarav(state: AppState): Patient {
  const actor = findBengaluruStaff(state, 'Front Desk');
  const nowStamp = `${TODAY_DATE} 09:10 IST`;
  return {
    id: REG_DEMO_PATIENT_ID,
    mrn: 'MRN-209115',
    fullName: 'Aarav Mehta',
    dob: '1979-08-15',
    age: 47,
    sex: 'Male',
    phone: '+91 98452 33109',
    email: 'aarav.mehta.demo@example.in',
    address: '42 12th Main Rd, Indiranagar, Bengaluru 560038',
    facilityId: REG_DEMO_FACILITY_ID,
    primaryProviderId: REG_DEMO_CLINICIAN_ID,
    status: 'Active',
    preferredLanguage: 'English / Kannada',
    entryPath: 'Scheduled',
    specialtyTags: ['Preventive Medicine', 'Scheduled Registration'],
    allergies: [],
    conditions: [],
    historyItems: [],
    caregivers: [
      {
        id: 'cg-regdemo-01',
        name: 'Meera Mehta',
        relationship: 'Spouse',
        phone: '+91 98452 33110',
        isEmergencyContact: true,
        isGuarantor: false,
        portalAccess: 'None',
      },
    ],
    careTeamIds: [REG_DEMO_CLINICIAN_ID, actor.id],
    intakeFormsComplete: true,
    photoConsent: false,
    researchConsent: 'Not Asked',
    chiefConcern: 'Scheduled preventive diabetes & metabolic review (bringing outside lab reports)',
    registrationStatus: 'Verified & Ready',
    registrationVerifiedBy: actor.name,
    registrationVerifiedAt: nowStamp,
    fieldProvenance: {
      fullName: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: actor.name,
      },
      dob: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: actor.name,
      },
      phone: {
        status: 'Verified',
        source: 'Scheduled Front-Desk Verification',
        updatedAt: nowStamp,
        verifiedBy: actor.name,
      },
    },
  };
}

const REG_CONSOLIDATION_SCENES: DemoSceneDefinition[] = [
  // CHAPTER 1
  {
    sceneId: 'reg-01-scheduled-context',
    sceneNumber: 1,
    title: 'Scheduled Patient Context',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk · Bengaluru Hub)',
    actorKind: 'human',
    screenLabel: 'Patient Directory — Bengaluru Hub',
    classification: 'Manual entry',
    routeNav: 'patients',
    patientId: null,
    visualTarget: 'scheduled-registration-btn',
    uiActions: [
      {
        kind: 'click',
        target: 'scheduled-registration-btn',
        pauseBeforeMs: 500,
        pauseAfterMs: 400,
        requiredTarget: true,
      },
    ],
    caption:
      'Front Desk at EigenH Bengaluru Hub opens Intelligent Scheduled Registration for an arriving scheduled outpatient visit.',
    narration:
      'Welcome to EigenH. Let us walk through how a scheduled patient is registered and how outside medical records are verified before the clinical visit. At our Bengaluru Hub front desk, Kavya Nair opens Intelligent Scheduled Registration.',
    executiveNarration:
      'Front Desk opens Intelligent Scheduled Registration at our Bengaluru Hub for an upcoming scheduled visit.',
    explanationAfter:
      'Intelligent Scheduled Registration modal opened — scoped cleanly to scheduled outpatient visits, with ABHA optional and no Aadhaar required.',
    nextStepPreview: 'Identity Lookup & Duplicate Safety Guard',
    durationMs: 4200,
    expectedMutation: 'Aligns Bengaluru Hub Front Desk directory and opens Scheduled Registration modal.',
    prepareView: (prev) => alignRegView(prev, 'Front Desk', 'patients', null),
    execute: (prev) => alignRegView(prev, 'Front Desk', 'patients', null),
    validate: (s) => ({
      passed: s.currentFacilityId === REG_DEMO_FACILITY_ID && s.currentNav === 'patients',
      detail: 'Bengaluru Hub Front Desk directory active for scheduled registration.',
    }),
  },

  // CHAPTER 2
  {
    sceneId: 'reg-02-identity-duplicate-check',
    sceneNumber: 2,
    title: 'Identity & Duplicate Safety Guard',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk)',
    actorKind: 'human',
    screenLabel: 'Scheduled Registration · Identity Lookup',
    classification: 'Human verification required',
    routeNav: 'patients',
    patientId: null,
    visualTarget: 'reg-duplicate-panel',
    uiActions: [
      {
        kind: 'type',
        target: 'reg-lookup-input',
        value: 'Aarav Mehta',
        pauseBeforeMs: 350,
        pauseAfterMs: 450,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'reg-duplicate-panel',
        pauseBeforeMs: 250,
        pauseAfterMs: 700,
        requiredTarget: true,
      },
    ],
    caption:
      'Searching "Aarav Mehta" finds an existing patient with the same name (MRN-208612, DOB 1974-03-22). EigenH flags a Name-Only Match and blocks merging.',
    narration:
      'First, Kavya checks whether the patient already exists by searching for Aarav Mehta. EigenH immediately spots another Aarav Mehta with a different date of birth and phone number. To protect patient safety, EigenH blocks any merge on name alone and prompts staff to verify two independent identifiers.',
    executiveNarration:
      'Searching Aarav Mehta triggers a Name-Only duplicate safety guard, preventing unsafe chart merges without matching date of birth and phone.',
    explanationAfter:
      'Name-only match safely separated from MRN-208612 (DOB 1974-03-22) — zero automatic merge.',
    nextStepPreview: 'AI-Assisted Field Preparation & Verification',
    durationMs: 4600,
    expectedMutation:
      'Verifies near-match synthetic Bengaluru fixture (Aarav Mehta, DOB 1974-03-22, MRN-208612) triggers Name-Only Duplicate Safety Guard with mergeAllowed=false.',
    prepareView: (prev) => alignRegView(prev, 'Front Desk', 'patients', null),
    execute: (prev) => {
      const nearMatch = findNearMatchAarav(prev);
      return {
        ...alignRegView(prev, 'Front Desk', 'patients', null),
        auditEvents: appendRegDemoAudit(
          prev,
          'dup-guard',
          'Duplicate Safety Check',
          'Patient',
          nearMatch?.id || 'pat-9',
          `[REG-DEMO] Blocked name-only merge between arriving Aarav Mehta (1979-08-15) and existing ${
            nearMatch?.mrn || REG_DEMO_NEAR_MATCH_MRN
          } (${nearMatch?.dob || REG_DEMO_NEAR_MATCH_DOB})`
        ),
      };
    },
    validate: (s) => {
      const existingNearMatch = findNearMatchAarav(s);
      if (!existingNearMatch) {
        return {
          passed: false,
          detail:
            'Near-match Bengaluru fixture (Aarav Mehta, DOB 1974-03-22, MRN-208612) missing from active demo sandbox.',
        };
      }
      const safetyMatches = evaluateDuplicateSafety(s.patients, {
        fullName: 'Aarav Mehta',
        dob: '1979-08-15',
        phone: '+91 98452 33109',
      });
      const nearMatchEvaluation = safetyMatches.find(
        (m) => m.patient.id === existingNearMatch.id
      );
      if (!nearMatchEvaluation) {
        return {
          passed: false,
          detail: `Duplicate safety evaluator did not surface ${existingNearMatch.fullName} (${existingNearMatch.mrn}) as a candidate.`,
        };
      }
      if (nearMatchEvaluation.mergeAllowed) {
        return {
          passed: false,
          detail: `Safety violation: name-only match ${existingNearMatch.mrn} unexpectedly allowed automatic merge.`,
        };
      }
      return {
        passed: true,
        detail: `Confirmed Name-Only duplicate guard against ${existingNearMatch.fullName} (${existingNearMatch.mrn}, DOB ${existingNearMatch.dob}) — merge blocked.`,
      };
    },
  },

  // CHAPTER 3
  {
    sceneId: 'reg-03-intelligent-registration',
    sceneNumber: 3,
    title: 'Registration & Human Verification',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk) + AI Assistant',
    actorKind: 'ai',
    screenLabel: 'Scheduled Registration · Demographics & Attestation',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: null,
    visualTarget: 'reg-submit-btn',
    uiActions: [
      {
        kind: 'click',
        target: 'reg-ai-prepare-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 550,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'reg-completeness-meter',
        pauseBeforeMs: 250,
        pauseAfterMs: 450,
      },
      {
        kind: 'click',
        target: 'reg-verify-checkbox',
        pauseBeforeMs: 300,
        pauseAfterMs: 350,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'reg-submit-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 500,
        requiredTarget: true,
      },
    ],
    caption:
      'AI prepares scheduled demographics from the booking packet, tracks completeness (100% required fields), highlights uncertain items, and saves only after human verification.',
    narration:
      'Next, EigenH prepares the scheduled registration fields from the booking packet, leaving ABHA optional and never requesting Aadhaar. After checking the completeness indicator and confirming identity at the desk, Kavya signs the human verification gate and completes registration, opening Aarav’s new Patient 360 profile.',
    executiveNarration:
      'AI prepares scheduled demographics with ABHA optional, and Kavya confirms human verification to create Aarav’s verified profile.',
    explanationAfter:
      'Aarav Mehta (DOB 1979-08-15) registered with verifier attribution and scheduled outpatient slot.',
    nextStepPreview: 'Patient Document Collection in Universal Data Inbox',
    durationMs: 5200,
    expectedMutation: 'Creates verified Patient Aarav Mehta (DOB 1979-08-15) and Pre-Registered appointment.',
    isSimulatedApproval: true,
    prepareView: (prev) => alignRegView(prev, 'Front Desk', 'patients', null),
    execute: (prev) => {
      const existing = findRegisteredAarav(prev);
      const patient = existing || buildCanonicalRegisteredAarav(prev);
      const appt = {
        id: REG_DEMO_IDS.appointment,
        patientId: patient.id,
        providerId: REG_DEMO_CLINICIAN_ID,
        facilityId: REG_DEMO_FACILITY_ID,
        date: TODAY_DATE,
        startTime: '10:30',
        durationMin: 30,
        type: 'Scheduled Outpatient Consultation',
        subtype: 'Scheduled Visit' as const,
        status: 'Pre-Registered' as const,
        reason: patient.chiefConcern || 'Scheduled preventive diabetes & metabolic review',
        reminderSent: false,
        reminderStatus: 'Not Sent' as const,
        calendarSynced: true,
        coPayAmount: 800,
        coPayCollected: false,
      };
      const base = alignRegView(prev, 'Front Desk', 'patients', patient.id, 'overview');
      return {
        ...base,
        patients: upsertById(base.patients, patient, true),
        appointments: upsertById(base.appointments, appt, false),
        auditEvents: appendRegDemoAudit(
          base,
          'reg-complete',
          'Scheduled Registration Completed',
          'Patient',
          patient.id,
          `[REG-DEMO] Registered ${patient.fullName} (${patient.mrn}) with human verifier attribution`
        ),
      };
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      return {
        passed: Boolean(pat && pat.registrationStatus === 'Verified & Ready'),
        detail: pat
          ? `Registered ${pat.fullName} (${pat.mrn}) — Verified by ${pat.registrationVerifiedBy || 'Front Desk'}.`
          : 'Scheduled registration for Aarav Mehta (1979-08-15) not found.',
      };
    },
  },

  // CHAPTER 4
  {
    sceneId: 'reg-04-document-collection',
    sceneNumber: 4,
    title: 'Patient Document Collection',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk)',
    actorKind: 'human',
    screenLabel: 'Patient Chart → Universal Patient Data Inbox',
    classification: 'Manual entry',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'data-inbox',
    visualTarget: 'inbox-upload-lab-btn',
    uiActions: [
      {
        kind: 'click',
        target: 'patient-tab-data-inbox',
        pauseBeforeMs: 300,
        pauseAfterMs: 350,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'inbox-adapter-registry',
        pauseBeforeMs: 250,
        pauseAfterMs: 400,
      },
      {
        kind: 'click',
        target: 'inbox-upload-lab-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 500,
        requiredTarget: true,
      },
    ],
    caption:
      'Front Desk opens the Universal Patient Data Inbox—showing honest Planned status for ABDM, DigiLocker, and LIS—and ingests Aarav’s outside Metropolis lab report.',
    narration:
      'Aarav brought recent laboratory reports from an outside diagnostic center. Kavya opens the Universal Patient Data Inbox, which honestly marks external networks like ABDM, DigiLocker, and LIS as planned adapters not yet connected, and uploads Aarav’s Metropolis Diagnostics HbA1c and renal lab report.',
    executiveNarration:
      'Kavya opens the Universal Patient Data Inbox and ingests Aarav’s outside Metropolis Diagnostics lab report.',
    explanationAfter:
      'Metropolis Diagnostics HbA1c & Renal Profile ingested and auto-classified as Laboratory Report.',
    nextStepPreview: 'AI Document Extraction with Uncertainty Highlighting',
    durationMs: 4800,
    expectedMutation: 'Adds classified Metropolis Lab PDF item into Patient Data Inbox.',
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'overview');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev) || buildCanonicalRegisteredAarav(prev);
      const labTpl = SYNTHETIC_DOCUMENT_TEMPLATES[0];
      const item = createSyntheticInboxItemFromTemplate(labTpl, prev.patients, {
        id: REG_DEMO_IDS.labInboxItem,
        targetPatient: pat,
        initialStatus: 'Classified',
      });
      const aligned = alignRegView(prev, 'Front Desk', 'patients', pat.id, 'data-inbox');
      return {
        ...aligned,
        dataInboxItems: upsertById(aligned.dataInboxItems || [], item, true),
      };
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      const items = (s.dataInboxItems || []).filter(
        (i) =>
          i.category === 'Laboratory Report' &&
          (i.candidatePatientIds.includes(pat?.id || '') ||
            i.extractedIdentity.fullName.toLowerCase() === 'aarav mehta')
      );
      return {
        passed: items.length > 0,
        detail: `${items.length} synthetic laboratory document(s) classified in Patient Data Inbox.`,
      };
    },
  },

  // CHAPTER 5
  {
    sceneId: 'reg-05-ai-extraction',
    sceneNumber: 5,
    title: 'AI Extraction & Uncertainty Detection',
    role: 'Front Desk',
    actorDisplay: 'EigenH AI Document Assistant',
    actorKind: 'ai',
    screenLabel: 'Patient Data Inbox · AI Extraction',
    classification: 'AI-prepared',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'data-inbox',
    visualTarget: 'inbox-field-uncertain',
    uiActions: [
      {
        kind: 'click',
        target: 'inbox-confirm-patient-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 400,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'inbox-run-extraction-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 550,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'inbox-field-uncertain',
        pauseBeforeMs: 250,
        pauseAfterMs: 650,
      },
    ],
    caption:
      'After confirming Aarav’s identity match, AI extracts structured HbA1c, Fasting Glucose, and eGFR values—and flags a smudged handwritten margin note as Uncertain.',
    narration:
      'Kavya confirms the document matches Aarav Mehta using date of birth and mobile number, while leaving the other Aarav Mehta safely blocked. She runs AI extraction. EigenH pulls out HbA1c, fasting glucose, and eGFR with source excerpts, and explicitly flags a smudged handwritten margin note as uncertain so staff review it carefully.',
    executiveNarration:
      'AI extracts structured lab values with source excerpts and explicitly highlights a smudged margin note as uncertain.',
    explanationAfter:
      '3 high-confidence lab fields and 1 uncertain handwritten margin note prepared for human review.',
    nextStepPreview: 'Human Verification & Consolidation into Chart',
    durationMs: 5000,
    expectedMutation: 'Confirms patient match and transitions inbox document to AI Extracted.',
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'data-inbox');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev) || buildCanonicalRegisteredAarav(prev);
      const items = (prev.dataInboxItems || []).map((item) =>
        item.extractedIdentity.fullName.toLowerCase() === 'aarav mehta'
          ? { ...item, confirmedPatientId: pat.id, status: 'AI Extracted' as const }
          : item
      );
      return {
        ...alignRegView(prev, 'Front Desk', 'patients', pat.id, 'data-inbox'),
        dataInboxItems: items,
      };
    },
    validate: (s) => {
      const extracted = (s.dataInboxItems || []).find(
        (i) => i.status === 'AI Extracted' || i.status === 'Verified & Consolidated'
      );
      return {
        passed: Boolean(extracted && extracted.confirmedPatientId),
        detail: extracted
          ? `Document "${extracted.title}" matched and AI-extracted (${extracted.extractedFields.length} fields).`
          : 'Inbox document has not completed AI extraction yet.',
      };
    },
  },

  // CHAPTER 6
  {
    sceneId: 'reg-06-human-verification',
    sceneNumber: 6,
    title: 'Human Verification & Consolidation',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk)',
    actorKind: 'human',
    screenLabel: 'Patient Data Inbox · Human Approval Gate',
    classification: 'Human approved',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'data-inbox',
    visualTarget: 'inbox-save-verified-btn',
    uiActions: [
      {
        kind: 'click',
        target: 'inbox-field-accept-0',
        pauseBeforeMs: 250,
        pauseAfterMs: 220,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'inbox-field-accept-1',
        pauseBeforeMs: 220,
        pauseAfterMs: 220,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'inbox-field-accept-2',
        pauseBeforeMs: 220,
        pauseAfterMs: 220,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'inbox-field-reject-uncertain',
        pauseBeforeMs: 280,
        pauseAfterMs: 320,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'inbox-save-verified-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 500,
        requiredTarget: true,
      },
    ],
    caption:
      'Front Desk accepts the 3 verified laboratory results, rejects the unclear smudged margin note, and commits the verified record into Aarav’s chart.',
    narration:
      'Nothing enters the medical record without human verification. Kavya accepts the three clear lab measurements—HbA1c at 7.4 percent, fasting glucose at 148, and eGFR at 79—rejects the unreadable handwritten note so unverified assumptions stay out of the chart, and clicks Save Verified Record.',
    executiveNarration:
      'Kavya accepts the three verified lab results, rejects the uncertain margin note, and commits the verified record.',
    explanationAfter:
      '3 verified laboratory results and the original source document consolidated with full audit provenance.',
    nextStepPreview: 'Patient 360° Intelligence Profile',
    durationMs: 5200,
    expectedMutation: 'Writes verified LabResults and source PatientDocument to Aarav Mehta’s chart.',
    isSimulatedApproval: true,
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'data-inbox');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev) || buildCanonicalRegisteredAarav(prev);
      const actor = findBengaluruStaff(prev, 'Front Desk');
      const labItem = (prev.dataInboxItems || []).find(
        (i) => i.confirmedPatientId === pat.id || i.extractedIdentity.fullName.toLowerCase() === 'aarav mehta'
      );
      const updatedInbox = (prev.dataInboxItems || []).map((item) =>
        item.id === labItem?.id
          ? {
              ...item,
              confirmedPatientId: pat.id,
              status: 'Verified & Consolidated' as const,
              verifiedBy: actor.name,
              verifiedAt: `${TODAY_DATE} 09:20 IST`,
              extractedFields: item.extractedFields.map((f) => ({
                ...f,
                decision: f.uncertain ? ('Rejected' as const) : ('Accepted' as const),
                reviewedBy: actor.name,
              })),
            }
          : item
      );
      const sourceDoc = {
        id: REG_DEMO_IDS.labDoc,
        patientId: pat.id,
        title: labItem?.title || SYNTHETIC_DOCUMENT_TEMPLATES[0].title,
        category: 'Lab PDF' as const,
        author: actor.name,
        source: labItem?.sourceOrganization || SYNTHETIC_DOCUMENT_TEMPLATES[0].sourceOrganization,
        date: '2026-11-12',
        version: 1,
        verified: true,
        external: true,
        summary: '3 verified lab fields consolidated; 1 uncertain margin note rejected by Front Desk.',
        rawPreviewText: labItem?.rawPreviewText || SYNTHETIC_DOCUMENT_TEMPLATES[0].rawPreviewText,
        inboxItemId: labItem?.id || REG_DEMO_IDS.labInboxItem,
      };
      const newLabs = [
        {
          id: REG_DEMO_IDS.labHba1c,
          orderId: 'ext-inbox',
          patientId: pat.id,
          facilityId: REG_DEMO_FACILITY_ID,
          testName: 'HbA1c (HPLC)',
          collectionDate: '2026-11-12',
          value: '7.4',
          numericValue: 7.4,
          unit: '%',
          referenceInterval: '4.0 - 5.6 %',
          flag: 'Abnormal' as const,
          status: 'Final' as const,
          reviewOwnerId: REG_DEMO_CLINICIAN_ID,
          patientReleased: false,
          sourceDocumentId: sourceDoc.id,
          sourceLabel: 'Metropolis Diagnostics Bengaluru (Verified Intake)',
        },
        {
          id: REG_DEMO_IDS.labFbg,
          orderId: 'ext-inbox',
          patientId: pat.id,
          facilityId: REG_DEMO_FACILITY_ID,
          testName: 'Fasting Blood Glucose',
          collectionDate: '2026-11-12',
          value: '148',
          numericValue: 148,
          unit: 'mg/dL',
          referenceInterval: '70 - 99 mg/dL',
          flag: 'Abnormal' as const,
          status: 'Final' as const,
          reviewOwnerId: REG_DEMO_CLINICIAN_ID,
          patientReleased: false,
          sourceDocumentId: sourceDoc.id,
          sourceLabel: 'Metropolis Diagnostics Bengaluru (Verified Intake)',
        },
        {
          id: REG_DEMO_IDS.labEgfr,
          orderId: 'ext-inbox',
          patientId: pat.id,
          facilityId: REG_DEMO_FACILITY_ID,
          testName: 'eGFR (CKD-EPI)',
          collectionDate: '2026-11-12',
          value: '79',
          numericValue: 79,
          unit: 'mL/min/1.73m2',
          referenceInterval: '>= 60',
          flag: 'Normal' as const,
          status: 'Final' as const,
          reviewOwnerId: REG_DEMO_CLINICIAN_ID,
          patientReleased: false,
          sourceDocumentId: sourceDoc.id,
          sourceLabel: 'Metropolis Diagnostics Bengaluru (Verified Intake)',
        },
      ];
      let nextLabs = prev.labResults;
      for (const l of newLabs) nextLabs = upsertById(nextLabs, l, true);

      return {
        ...alignRegView(prev, 'Front Desk', 'patients', pat.id, 'data-inbox'),
        dataInboxItems: updatedInbox,
        documents: upsertById(prev.documents, sourceDoc, true),
        labResults: nextLabs,
        auditEvents: appendRegDemoAudit(
          prev,
          'inbox-commit',
          'Commit Verified Data Inbox Record',
          'Patient',
          pat.id,
          '[REG-DEMO] Consolidated 3 verified lab values; rejected 1 uncertain margin note'
        ),
      };
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      const labs = s.labResults.filter((l) => l.patientId === pat?.id);
      const docs = s.documents.filter((d) => d.patientId === pat?.id);
      return {
        passed: labs.length >= 3 && docs.length >= 1,
        detail: `${labs.length} verified lab results and ${docs.length} source document(s) saved to ${pat?.fullName || 'patient'}’s chart.`,
      };
    },
  },

  // CHAPTER 7
  {
    sceneId: 'reg-07-patient-360-profile',
    sceneNumber: 7,
    title: 'Patient 360° Intelligence Profile',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk)',
    actorKind: 'human',
    screenLabel: 'Patient Chart → Patient 360° Profile',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'overview',
    visualTarget: 'patient-360-profile',
    uiActions: [
      {
        kind: 'click',
        target: 'patient-tab-overview',
        pauseBeforeMs: 300,
        pauseAfterMs: 400,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'patient-360-profile',
        pauseBeforeMs: 250,
        pauseAfterMs: 650,
      },
    ],
    caption:
      'Patient 360° consolidates Aarav’s verified labs, original source document preview, verifier attribution, provenance states, and clearly flags missing allergy confirmation.',
    narration:
      'Now let us open Aarav’s Patient 360 profile. Every clinical item clearly shows whether it is verified, patient-reported, external awaiting verification, or missing. His newly consolidated HbA1c and glucose results appear alongside the original report preview, while unconfirmed allergy status is transparently highlighted in the missing items panel.',
    executiveNarration:
      'Patient 360 brings verified labs, original document previews, and transparent missing-information flags into one clear view.',
    explanationAfter:
      'Patient 360° Intelligence Profile displays verified consolidation with transparent provenance.',
    nextStepPreview: 'Patient Knowledge Graph & World Knowledge Reference Layer',
    durationMs: 4600,
    expectedMutation: 'Opens Patient 360° Intelligence Profile with consolidated verified records.',
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'data-inbox');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'overview');
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      return {
        passed: Boolean(pat && s.selectedPatientId === pat.id && s.selectedPatientTab === 'overview'),
        detail: `Viewing Patient 360° Profile for ${pat?.fullName || 'Aarav Mehta'}.`,
      };
    },
  },

  // CHAPTER 8
  {
    sceneId: 'reg-08-knowledge-graph',
    sceneNumber: 8,
    title: 'Patient Knowledge Graph & Reference Layer',
    role: 'Front Desk',
    actorDisplay: 'EigenH Knowledge Graph View',
    actorKind: 'ai',
    screenLabel: 'Patient Chart → Knowledge Graph',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'knowledge-graph',
    visualTarget: 'kg-node-inspector',
    uiActions: [
      {
        kind: 'click',
        target: 'patient-tab-knowledge-graph',
        pauseBeforeMs: 300,
        pauseAfterMs: 450,
        requiredTarget: true,
      },
      {
        kind: 'click',
        target: 'kg-inspect-lab-btn',
        pauseBeforeMs: 350,
        pauseAfterMs: 450,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'world-knowledge-reference-layer',
        pauseBeforeMs: 300,
        pauseAfterMs: 650,
      },
    ],
    caption:
      'The Patient Knowledge Graph maps Aarav’s real source-linked documents and verified lab results. Below it, the World Knowledge Reference Layer stays strictly separated.',
    narration:
      'Next, we inspect the Patient Knowledge Graph. Every node and edge is built strictly from Aarav’s real records—linking Aarav to his scheduled visit, his Metropolis lab PDF, and each verified lab result. Clicking any node reveals its full source provenance. Underneath, the World Knowledge Reference Layer provides standard ICD-10 and LOINC terminology clearly separated as general reference only, never a diagnosis.',
    executiveNarration:
      'The Patient Knowledge Graph links source documents to verified labs, while general ICD-10 and LOINC references remain strictly separated.',
    explanationAfter:
      'Inspected source-derived Lab Result provenance node and verified separation of World Knowledge references.',
    nextStepPreview: 'Explainable AI Recommendations (EigenH Clinical Intelligence)',
    durationMs: 5200,
    expectedMutation: 'Renders source-derived Patient Knowledge Graph with >= 5 linked nodes.',
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'overview');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(
        prev,
        'Front Desk',
        'patients',
        pat?.id || REG_DEMO_PATIENT_ID,
        'knowledge-graph'
      );
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      if (!pat) return { passed: false, detail: 'Aarav Mehta not found.' };
      const graph = buildPatientKnowledgeGraph(s, pat.id);
      return {
        passed: graph.nodes.length >= 5 && graph.edges.length >= 4,
        detail: `Patient Knowledge Graph built with ${graph.nodes.length} real nodes and ${graph.edges.length} edges.`,
      };
    },
  },

  // CHAPTER 9
  {
    sceneId: 'reg-09-clinical-intelligence',
    sceneNumber: 9,
    title: 'Explainable AI Recommendations',
    role: 'Front Desk',
    actorDisplay: 'EigenH Clinical Intelligence + Staff Review',
    actorKind: 'ai',
    screenLabel: 'Patient 360° → EigenH Clinical Intelligence',
    classification: 'Human verification required',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'overview',
    visualTarget: 'clinical-intelligence-panel',
    uiActions: [
      {
        kind: 'click',
        target: 'patient-tab-overview',
        pauseBeforeMs: 300,
        pauseAfterMs: 400,
        requiredTarget: true,
      },
      {
        kind: 'review',
        target: 'clinical-intelligence-panel',
        pauseBeforeMs: 300,
        pauseAfterMs: 500,
      },
      {
        kind: 'click',
        target: 'rec-accept-btn-0',
        pauseBeforeMs: 350,
        pauseAfterMs: 500,
        requiredTarget: true,
      },
    ],
    caption:
      'EigenH Clinical Intelligence explains why allergy confirmation and clinician lab review are suggested—showing supporting records, uncertainty limits, and working Accept/Review/Dismiss controls.',
    narration:
      'Back on the Patient 360 profile, EigenH Clinical Intelligence surfaces explainable workflow suggestions—such as confirming allergy status before consultation and flagging newly consolidated abnormal labs for the doctor. Each suggestion explains why it appeared, cites the exact patient record, states its scope boundary, and records Kavya’s acceptance in the audit log.',
    executiveNarration:
      'EigenH Clinical Intelligence surfaces explainable pre-visit workflow suggestions with supporting records and human review logging.',
    explanationAfter:
      'Explainable workflow recommendation accepted and recorded in the audit trail.',
    nextStepPreview: 'Registration Complete & Ready for Visit',
    durationMs: 5000,
    expectedMutation: 'Persists Accepted decision on first explainable recommendation for Aarav Mehta.',
    isSimulatedApproval: true,
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(
        prev,
        'Front Desk',
        'patients',
        pat?.id || REG_DEMO_PATIENT_ID,
        'knowledge-graph'
      );
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev);
      if (!pat) return prev;
      const recs = buildExplainableRecommendations(prev, pat.id);
      const firstRec = recs[0];
      const actor = findBengaluruStaff(prev, 'Front Desk');
      const aligned = alignRegView(prev, 'Front Desk', 'patients', pat.id, 'overview');
      if (!firstRec) return aligned;
      return {
        ...aligned,
        recommendationDecisions: {
          ...(aligned.recommendationDecisions || {}),
          [firstRec.id]: {
            recommendationId: firstRec.id,
            patientId: pat.id,
            status: 'Accepted',
            decidedBy: actor.name,
            decidedRole: 'Front Desk',
            decidedAt: `${TODAY_DATE} 09:24 IST`,
          },
        },
        auditEvents: appendRegDemoAudit(
          aligned,
          'rec-accept',
          'AI Recommendation Accepted',
          'Patient',
          pat.id,
          `[REG-DEMO] Accepted explainable recommendation ${firstRec.id}`
        ),
      };
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      if (!pat) return { passed: false, detail: 'Aarav Mehta not found.' };
      const decided = Object.values(s.recommendationDecisions || {}).filter(
        (d) => d.patientId === pat.id
      );
      return {
        passed: decided.length >= 1,
        detail: `${decided.length} explainable recommendation decision(s) audited for ${pat.fullName}.`,
      };
    },
  },

  // CHAPTER 10
  {
    sceneId: 'reg-10-registration-complete',
    sceneNumber: 10,
    title: 'Registration Complete & Ready for Visit',
    role: 'Front Desk',
    actorDisplay: 'Kavya Nair (Front Desk · Bengaluru Hub)',
    actorKind: 'handoff',
    screenLabel: 'Patient 360° · Registration Complete',
    classification: 'Completed action',
    routeNav: 'patients',
    patientId: null,
    patientTab: 'overview',
    visualTarget: 'patient-360-profile',
    uiActions: [
      {
        kind: 'review',
        target: 'patient-360-profile',
        pauseBeforeMs: 300,
        pauseAfterMs: 700,
      },
    ],
    caption:
      'Registration is complete! Aarav Mehta’s verified demographics, consolidated lab results, Patient Knowledge Graph, and audit trail are ready for the clinician—stopping cleanly before the clinical consultation.',
    narration:
      'Registration and pre-visit data consolidation are now complete. Aarav Mehta’s identity was safely verified without any name-only duplicate merge, his outside laboratory report was extracted and human-verified, his Patient 360 profile and Knowledge Graph are organized with full provenance, and his chart is ready for the clinical team.',
    executiveNarration:
      'Registration is complete. Aarav’s verified profile, consolidated labs, and Knowledge Graph are ready for the clinical team.',
    explanationAfter:
      'Focused scheduled registration & consolidation complete — stops cleanly at pre-visit readiness.',
    nextStepPreview: 'End of tutorial — replay safely or explore Complete Clinical Journey',
    durationMs: 4800,
    expectedMutation: 'Confirms complete, verified registration readiness without entering clinical encounter.',
    prepareView: (prev) => {
      const pat = findRegisteredAarav(prev);
      return alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'overview');
    },
    execute: (prev) => {
      const pat = findRegisteredAarav(prev);
      const aligned = alignRegView(prev, 'Front Desk', 'patients', pat?.id || REG_DEMO_PATIENT_ID, 'overview');
      return {
        ...aligned,
        auditEvents: appendRegDemoAudit(
          aligned,
          'ready-summary',
          'Pre-Visit Registration Readiness Complete',
          'Patient',
          pat?.id || REG_DEMO_PATIENT_ID,
          '[REG-DEMO] Scheduled patient registration and data consolidation verified ready for visit'
        ),
      };
    },
    validate: (s) => {
      const pat = findRegisteredAarav(s);
      if (!pat) return { passed: false, detail: 'Aarav Mehta not found.' };
      const labs = s.labResults.filter((l) => l.patientId === pat.id);
      const docs = s.documents.filter((d) => d.patientId === pat.id);
      const encounters = s.encounters.filter((e) => e.patientId === pat.id);
      return {
        passed:
          pat.registrationStatus === 'Verified & Ready' &&
          labs.length >= 3 &&
          docs.length >= 1 &&
          encounters.length === 0,
        detail: `Registration complete for ${pat.fullName} (${pat.mrn}): ${labs.length} verified labs, ${docs.length} source doc, 0 clinical encounters started (clean scope boundary).`,
      };
    },
  },
];

export const REGISTRATION_CONSOLIDATION_SCENARIO: DemoScenarioDefinition = {
  id: 'demo-00-registration-consolidation',
  number: '00',
  category: 'Complete Patient Journeys',
  title: 'Patient Registration & Data Consolidation',
  subtitle: 'Watch how EigenH collects, verifies and organizes patient information before the clinical visit.',
  description:
    'India-first scheduled patient registration and pre-visit intelligence walkthrough at EigenH Bengaluru Hub. Demonstrates duplicate identity safety (blocking name-only merges), optional ABHA with no Aadhaar required, Universal Patient Data Inbox extraction with uncertainty flagging, human verification, Patient 360° Profile, source-derived Patient Knowledge Graph, separated World Knowledge Reference Layer, and Explainable AI Recommendations—stopping cleanly at registration readiness.',
  primaryRole: 'Front Desk',
  participatingRoles: ['Front Desk'],
  valueStatement:
    'Eliminates pre-visit data chaos while enforcing duplicate safety, source provenance, and human verification before clinical care begins.',
  status: 'Ready',
  flagship: true,
  patientId: REG_DEMO_PATIENT_ID,
  prepareState: (base) => buildCleanRegistrationDemoState(base),
  scenes: REG_CONSOLIDATION_SCENES,
};
