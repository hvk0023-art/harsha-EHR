import { INITIAL_APP_STATE, TODAY_DATE } from '../data/seedData';
import type { AppState, Patient, StaffRole } from '../types/hms';

export const DEMO_PATIENT_ID = 'pat-demo-elena';
export const DEMO_MRN = 'MRN-109420';
export const DEMO_FACILITY_ID = 'fac-boston';

export const DEMO_IDS = {
  patient: DEMO_PATIENT_ID,
  appointment: 'apt-demo-01',
  followUpAppointment: 'apt-demo-followup',
  intake: 'intake-demo-01',
  policy: 'pol-demo-01',
  vitals: 'vit-demo-01',
  encounter: 'enc-demo-01',
  scribe: 'scribe-demo-01',
  labOrder: 'ord-demo-01',
  labResult: 'lab-demo-01',
  medDraft: 'med-demo-01',
  followUpPlan: 'fp-demo-01',
  handoffTask: 'tsk-demo-01',
  messageThread: 'msg-demo-01',
  reminderThread: 'msg-demo-rem-01',
  outsideDoc: 'doc-demo-01',
  criticalLabOrder: 'ord-demo-crit-09',
  criticalLabResult: 'lab-demo-crit-09',
  criticalTask: 'tsk-demo-crit-09',
  reconcileDoc: 'extdoc-1',
};

export const DEMO_CLINICAL_DATE = TODAY_DATE; // Deterministic date '2026-11-18'

export const DEMO_AMBIENT_TRANSCRIPT = `Clinician (Dr. Elena Rostova, MD): Good morning, Ms. Alvarez. I reviewed the outside renal panel you uploaded and today's vitals showing BP 146/88 mmHg. How have you felt over the past two weeks?
Patient (Elena Alvarez): Morning Doctor. Mostly good, though my home blood pressure has been running 142 to 148 over 86 even while taking Lisinopril 10 mg daily, and I noticed mild evening ankle puffiness twice last week.
Clinician: Any chest pain, shortness of breath, or dizziness when standing?
Patient: No chest pain or shortness of breath, no dizziness.
Clinician: Your outside creatinine was 1.38 mg/dL with eGFR 48 mL/min, and your potassium was 4.5 mmol/L. You have a documented Sulfa allergy, so we will avoid thiazides/sulfonamide diuretics. Let us add low-dose Amlodipine 5 mg once daily as a draft for review, order a Renal Function and Serum Potassium Panel to recheck in 5 days, and schedule a 2-week blood pressure and lab follow-up with our care coordinator.`;

export function createFlagshipDemoPatient(): Patient {
  return {
    id: DEMO_PATIENT_ID,
    mrn: DEMO_MRN,
    fullName: 'Elena Alvarez',
    dob: '1965-07-19',
    age: 61,
    sex: 'Female',
    phone: '(617) 555-0184',
    email: 'elena.alvarez@example.org',
    address: '215 Newbury St, Unit 4A, Boston, MA 02116',
    facilityId: DEMO_FACILITY_ID,
    primaryProviderId: 'staff-1',
    status: 'Active',
    preferredLanguage: 'English',
    entryPath: 'Scheduled',
    favourite: true,
    specialtyTags: ['Internal Medicine', 'Nephrology'],
    chiefConcern: 'Scheduled chronic kidney disease (Stage 3a) and hypertension follow-up',
    allergies: [
      {
        id: 'alg-demo-1',
        substance: 'Sulfonamides (Sulfa)',
        reaction: 'Maculopapular rash',
        severity: 'Moderate',
        verified: true,
        source: 'Local Chart',
        recordedDate: '2023-05-10',
      },
    ],
    conditions: [
      {
        id: 'cnd-demo-1',
        name: 'Chronic kidney disease, stage 3a',
        icd10: 'N18.31',
        status: 'Active',
        onsetDate: '2024-02-14',
        source: 'Local Verified',
        verified: true,
        lastReviewed: '2026-08-20',
      },
      {
        id: 'cnd-demo-2',
        name: 'Essential hypertension',
        icd10: 'I10',
        status: 'Active',
        onsetDate: '2021-04-03',
        source: 'Local Verified',
        verified: true,
        lastReviewed: '2026-08-20',
      },
    ],
    historyItems: [
      {
        id: 'hist-demo-1',
        category: 'Medical',
        title: 'Home BP monitoring log initiated',
        detail: 'Patient tracks morning and evening BP with validated upper-arm cuff',
        date: '2026-08-20',
        source: 'Local Verified',
        lastReviewed: '2026-08-20',
        verified: true,
      },
      {
        id: 'hist-demo-2',
        category: 'Social',
        title: 'Low-sodium renal dietary counseling',
        detail: 'Targets < 2,000 mg sodium/day; non-smoker',
        date: '2026-08-20',
        source: 'Local Verified',
        lastReviewed: '2026-08-20',
        verified: true,
      },
    ],
    caregivers: [
      {
        id: 'cg-demo-1',
        name: 'Mateo Alvarez',
        relationship: 'Spouse',
        phone: '(617) 555-0185',
        isEmergencyContact: true,
        isGuarantor: true,
        portalAccess: 'View Only',
      },
    ],
    careTeamIds: ['staff-1', 'staff-2', 'staff-11', 'staff-12'],
    intakeFormsComplete: false,
    photoConsent: true,
    researchConsent: 'Not Asked',
    customFields: {
      'Preferred Pharmacy': 'CVS Boylston #0412',
    },
  };
}

export function findStaffForRole(state: AppState, role: StaffRole, facilityId = DEMO_FACILITY_ID) {
  return (
    state.staff.find((s) => s.role === role && s.facilityId === facilityId) ||
    state.staff.find((s) => s.role === role) ||
    state.staff[0]
  );
}

/**
 * Deterministically prepares a clean synthetic demo state without duplicating
 * any demo records across repeated replays.
 */
export function buildCleanDemoBaseState(sourceState: AppState): AppState {
  const isDemoId = (id: string) => id.includes('-demo-') || id.startsWith('demo-');

  // Ensure required canonical facilities, staff, pat-1, and extdoc-1 exist inside the isolated sandbox
  const existingFacilityIds = new Set(sourceState.facilities.map((f) => f.id));
  const ensuredFacilities = [
    ...sourceState.facilities,
    ...INITIAL_APP_STATE.facilities.filter((f) => !existingFacilityIds.has(f.id)),
  ];

  const existingStaffIds = new Set(sourceState.staff.map((s) => s.id));
  const ensuredStaff = [
    ...sourceState.staff,
    ...INITIAL_APP_STATE.staff.filter((s) => !existingStaffIds.has(s.id)),
  ];

  let cleanPatients = sourceState.patients.filter((p) => p.id !== DEMO_PATIENT_ID);
  const seedPat1 = INITIAL_APP_STATE.patients.find((p) => p.id === 'pat-1');
  if (seedPat1 && !cleanPatients.some((p) => p.id === 'pat-1')) {
    cleanPatients = [...cleanPatients, structuredClone(seedPat1)];
  }
  const demoPatient = createFlagshipDemoPatient();

  const sourceExtDocs = Array.isArray(sourceState.externalDocQueue)
    ? sourceState.externalDocQueue
    : [];
  const hasReconcileDoc = sourceExtDocs.some((d) => d.id === DEMO_IDS.reconcileDoc);
  const seedReconcileDoc = INITIAL_APP_STATE.externalDocQueue.find(
    (d) => d.id === DEMO_IDS.reconcileDoc
  );
  const ensuredExtDocs =
    hasReconcileDoc || !seedReconcileDoc
      ? sourceExtDocs
      : [structuredClone(seedReconcileDoc), ...sourceExtDocs];

  // Baseline historical medication & prior vitals/lab for Elena Alvarez (for trend comparison)
  const baselineMed = {
    id: 'med-demo-base-lisinopril',
    patientId: DEMO_PATIENT_ID,
    name: 'Lisinopril',
    dose: '10 mg',
    route: 'Oral',
    frequency: 'Once daily',
    status: 'Active' as const,
    prescriberId: 'staff-1',
    pharmacy: 'CVS Boylston #0412',
    formularyStatus: 'Tier 1 Preferred' as const,
    controlled: false,
    reconciled: false, // Intentionally unreconciled until MA/NP prep verifies it
    startDate: '2024-03-01',
    lastFilled: '2026-10-22',
    refillsRemaining: 2,
  };

  const baselinePriorVital = {
    id: 'vit-demo-prior',
    patientId: DEMO_PATIENT_ID,
    recordedAt: '2026-08-20 09:40 EST',
    bpSystolic: 134,
    bpDiastolic: 82,
    heartRate: 72,
    tempF: 98.4,
    spo2: 99,
    weightKg: 67.5,
    heightCm: 164,
    painScore: 0,
    source: 'Clinic Intake' as const,
    recordedBy: 'Maya Patel, CMA',
  };

  const baselinePriorEgfr = {
    id: 'lab-demo-prior-egfr',
    orderId: 'ord-demo-prior',
    patientId: DEMO_PATIENT_ID,
    facilityId: DEMO_FACILITY_ID,
    testName: 'eGFR (CKD-EPI)',
    collectionDate: '2026-08-18',
    value: '51',
    numericValue: 51,
    unit: 'mL/min/1.73m2',
    referenceInterval: '>= 60',
    flag: 'Abnormal' as const,
    status: 'Reviewed' as const,
    reviewOwnerId: 'staff-1',
    reviewedAt: '2026-08-20',
    patientReleased: true,
  };

  return {
    ...sourceState,
    facilities: ensuredFacilities,
    staff: ensuredStaff,
    currentPortal: 'staff',
    currentFacilityId: DEMO_FACILITY_ID,
    unsavedDirty: false,
    patients: [demoPatient, ...cleanPatients],
    appointments: sourceState.appointments.filter((a) => !isDemoId(a.id) && a.patientId !== DEMO_PATIENT_ID),
    encounters: sourceState.encounters.filter((e) => !isDemoId(e.id) && e.patientId !== DEMO_PATIENT_ID),
    vitals: [
      baselinePriorVital,
      ...sourceState.vitals.filter((v) => !isDemoId(v.id) && v.patientId !== DEMO_PATIENT_ID),
    ],
    orders: sourceState.orders.filter((o) => !isDemoId(o.id) && o.patientId !== DEMO_PATIENT_ID),
    labResults: [
      baselinePriorEgfr,
      ...sourceState.labResults.filter((l) => !isDemoId(l.id) && l.patientId !== DEMO_PATIENT_ID),
    ],
    medications: [
      baselineMed,
      ...sourceState.medications.filter((m) => !isDemoId(m.id) && m.patientId !== DEMO_PATIENT_ID),
    ],
    followUpPlans: (sourceState.followUpPlans || []).filter(
      (fp) => !isDemoId(fp.id) && fp.patientId !== DEMO_PATIENT_ID
    ),
    tasks: sourceState.tasks.filter((t) => !isDemoId(t.id) && t.patientId !== DEMO_PATIENT_ID),
    messages: sourceState.messages.filter((m) => !isDemoId(m.id) && m.patientId !== DEMO_PATIENT_ID),
    documents: sourceState.documents.filter((d) => !isDemoId(d.id) && d.patientId !== DEMO_PATIENT_ID),
    policies: sourceState.policies.filter((p) => !isDemoId(p.id) && p.patientId !== DEMO_PATIENT_ID),
    preVisitIntakes: (sourceState.preVisitIntakes || []).filter(
      (i) => !isDemoId(i.id) && i.patientId !== DEMO_PATIENT_ID
    ),
    handoffs: (sourceState.handoffs || []).filter(
      (h) => !isDemoId(h.id) && h.patientId !== DEMO_PATIENT_ID
    ),
    scribeSessions: (sourceState.scribeSessions || []).filter(
      (s) => !isDemoId(s.id) && s.patientId !== DEMO_PATIENT_ID
    ),
    externalDocQueue: ensuredExtDocs.map((d) =>
      d.id === DEMO_IDS.reconcileDoc
        ? {
            ...d,
            status: 'Pending Human Verification' as const,
            filedPatientId: undefined,
            verifiedBy: undefined,
            verifiedAt: undefined,
          }
        : d
    ),
    auditEvents: sourceState.auditEvents.filter((a) => !isDemoId(a.id)),
  };
}

export function appendDemoAudit(
  state: AppState,
  idSuffix: string,
  timestamp: string,
  role: StaffRole,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: string
): AppState['auditEvents'] {
  const auditId = `aud-demo-${idSuffix}`;
  const filtered = state.auditEvents.filter((a) => a.id !== auditId);
  return [
    {
      id: auditId,
      timestamp,
      actor: `${actor} (Demo Playback)`,
      role,
      facilityId: DEMO_FACILITY_ID,
      action,
      targetType,
      targetId,
      detail,
    },
    ...filtered,
  ].slice(0, 100);
}
