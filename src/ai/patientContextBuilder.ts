import { canSwitchFacility, filterPatientsForRole } from '../state/permissions';
import type {
  AppState,
  Appointment,
  Encounter,
  ImagingReport,
  LabResult,
  Medication,
  Patient,
  PatientDataInboxItem,
  PatientDocument,
  Referral,
  StaffRole,
  TaskItem,
  VitalObservation,
} from '../types/hms';
import type { ClinicalSourceReference } from './clinicalAiTypes';

export interface PermittedPatientContext {
  patient: Patient;
  facilityName: string;
  vitals: VitalObservation[];
  labs: LabResult[];
  imaging: ImagingReport[];
  medications: Medication[];
  encounters: Encounter[];
  documents: PatientDocument[];
  inboxItems: PatientDataInboxItem[];
  tasks: TaskItem[];
  appointments: Appointment[];
  referrals: Referral[];
  missingDataSignals: string[];
  conflictSignals: string[];
  sourceCatalog: Record<string, ClinicalSourceReference>;
  allowedSourceIds: string[];
  contextSummaryJson: string;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Enforces strict role, facility, and patient context isolation before any AI
 * context building or chart search executes.
 */
export function verifyPatientContextAccess(
  state: AppState,
  params: {
    patientId: string;
    role: StaffRole;
    userId: string;
    facilityId: string;
  }
): AccessCheckResult {
  const patient = state.patients.find((p) => p.id === params.patientId);
  if (!patient) {
    return { allowed: false, reason: `Patient ${params.patientId} was not found in the active synthetic EHR state.` };
  }

  const allowAllFacilities = canSwitchFacility(params.role);
  if (!allowAllFacilities && patient.facilityId !== params.facilityId) {
    return {
      allowed: false,
      reason: `Cross-facility access blocked: role "${params.role}" is scoped to facility ${params.facilityId}, not ${patient.facilityId}.`,
    };
  }

  const permittedPatients = filterPatientsForRole(state.patients, {
    role: params.role,
    userId: params.userId,
    facilityId: params.facilityId,
    includeAllFacilities: allowAllFacilities,
  });

  if (!permittedPatients.some((p) => p.id === patient.id)) {
    return {
      allowed: false,
      reason: `Patient scope isolation blocked: ${patient.fullName} (${patient.mrn}) is outside the assigned scope for ${params.role}.`,
    };
  }

  return { allowed: true };
}

/**
 * Builds a deterministic, source-ID-indexed patient context bundle from actual
 * permitted EHR state. Never includes records belonging to any other patient.
 */
export function buildPermittedPatientContext(
  state: AppState,
  params: {
    patientId: string;
    role: StaffRole;
    userId: string;
    facilityId: string;
  }
): { ok: true; context: PermittedPatientContext } | { ok: false; error: string } {
  const access = verifyPatientContextAccess(state, params);
  if (!access.allowed) {
    return { ok: false, error: access.reason || 'Unauthorized patient context access.' };
  }

  const patient = state.patients.find((p) => p.id === params.patientId)!;
  const facility = state.facilities.find((f) => f.id === patient.facilityId);

  const vitals = state.vitals
    .filter((v) => v.patientId === patient.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const labs = state.labResults
    .filter((l) => l.patientId === patient.id)
    .sort((a, b) => b.collectionDate.localeCompare(a.collectionDate));
  const imaging = state.imagingReports
    .filter((i) => i.patientId === patient.id)
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  const medications = state.medications.filter((m) => m.patientId === patient.id);
  const encounters = state.encounters
    .filter((e) => e.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const documents = state.documents
    .filter((d) => d.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const inboxItems = (state.dataInboxItems || []).filter(
    (item) =>
      item.confirmedPatientId === patient.id ||
      item.candidatePatientIds.includes(patient.id)
  );
  const tasks = state.tasks.filter((t) => t.patientId === patient.id);
  const appointments = state.appointments
    .filter((a) => a.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const referrals = state.referrals.filter((r) => r.patientId === patient.id);

  const sourceCatalog: Record<string, ClinicalSourceReference> = {};

  sourceCatalog[patient.id] = {
    sourceId: patient.id,
    sourceType: 'Patient',
    label: `Patient Profile (${patient.fullName}, ${patient.mrn})`,
    date: patient.registrationVerifiedAt,
    excerpt: `${patient.fullName}, ${patient.age}y ${patient.sex}, DOB ${patient.dob}, MRN ${patient.mrn}${patient.chiefConcern ? ` · Chief concern: ${patient.chiefConcern}` : ''}`,
    targetTab: 'overview',
  };

  for (const cond of patient.conditions) {
    sourceCatalog[cond.id] = {
      sourceId: cond.id,
      sourceType: 'Condition',
      label: `Condition: ${cond.name} (${cond.icd10})`,
      date: cond.onsetDate,
      excerpt: `${cond.name} (${cond.icd10}) — ${cond.status}, ${cond.verified ? 'Verified' : 'Unverified external'} (${cond.source})`,
      targetTab: 'history',
    };
  }

  for (const alg of patient.allergies) {
    sourceCatalog[alg.id] = {
      sourceId: alg.id,
      sourceType: 'Allergy',
      label: `Allergy: ${alg.substance}`,
      date: alg.recordedDate,
      excerpt: `${alg.substance} — ${alg.reaction} (${alg.severity}, ${alg.verified ? 'Verified' : 'Unverified'})`,
      targetTab: 'overview',
    };
  }

  for (const vit of vitals) {
    sourceCatalog[vit.id] = {
      sourceId: vit.id,
      sourceType: 'VitalObservation',
      label: `Vitals ${vit.recordedAt}`,
      date: vit.recordedAt,
      excerpt: `BP ${vit.bpSystolic}/${vit.bpDiastolic} mmHg, HR ${vit.heartRate} bpm, SpO2 ${vit.spo2}%, Wt ${vit.weightKg} kg (${vit.source})`,
      targetTab: 'overview',
    };
  }

  for (const lab of labs) {
    sourceCatalog[lab.id] = {
      sourceId: lab.id,
      sourceType: 'LabResult',
      label: `Lab: ${lab.testName} (${lab.collectionDate})`,
      date: lab.collectionDate,
      excerpt: `${lab.testName}: ${lab.value} ${lab.unit} [Ref: ${lab.referenceInterval}] (${lab.flag}, ${lab.status})`,
      targetTab: 'orders-results',
    };
  }

  for (const img of imaging) {
    sourceCatalog[img.id] = {
      sourceId: img.id,
      sourceType: 'ImagingReport',
      label: `Imaging: ${img.studyName} (${img.performedAt})`,
      date: img.performedAt,
      excerpt: `${img.studyName} (${img.modality}): ${img.impression}`,
      targetTab: 'orders-results',
    };
  }

  for (const med of medications) {
    sourceCatalog[med.id] = {
      sourceId: med.id,
      sourceType: 'Medication',
      label: `Medication: ${med.name} ${med.dose}`,
      date: med.startDate,
      excerpt: `${med.name} ${med.dose} ${med.route} ${med.frequency} — ${med.status} (${med.reconciled ? 'Reconciled' : 'Unreconciled'})`,
      targetTab: 'medications',
    };
  }

  for (const enc of encounters) {
    sourceCatalog[enc.id] = {
      sourceId: enc.id,
      sourceType: 'Encounter',
      label: `Encounter: ${enc.type} (${enc.date})`,
      date: enc.date,
      excerpt: `${enc.date} ${enc.type} (${enc.noteStatus}) — CC: ${enc.chiefComplaint}. Assessment: ${enc.soap.assessment.slice(0, 140)}`,
      targetTab: 'encounters',
    };
  }

  for (const doc of documents) {
    sourceCatalog[doc.id] = {
      sourceId: doc.id,
      sourceType: 'Document',
      label: `Document: ${doc.title}`,
      date: doc.date,
      excerpt: `${doc.title} (${doc.category}, ${doc.verified ? 'Verified' : 'Unverified'}): ${doc.summary}`,
      targetTab: 'documents-forms',
    };
  }

  for (const item of inboxItems) {
    sourceCatalog[item.id] = {
      sourceId: item.id,
      sourceType: 'DataInbox',
      label: `Data Inbox: ${item.title}`,
      date: item.documentDate,
      excerpt: `${item.title} (${item.category}) — Status: ${item.status} from ${item.sourceOrganization}`,
      targetTab: 'data-inbox',
    };
  }

  for (const tsk of tasks) {
    sourceCatalog[tsk.id] = {
      sourceId: tsk.id,
      sourceType: 'Task',
      label: `Task: ${tsk.title}`,
      date: tsk.dueDate,
      excerpt: `${tsk.title} (${tsk.status}, ${tsk.priority}, Due ${tsk.dueDate})`,
      targetTab: 'overview',
    };
  }

  for (const appt of appointments) {
    sourceCatalog[appt.id] = {
      sourceId: appt.id,
      sourceType: 'Appointment',
      label: `Appointment: ${appt.type} (${appt.date})`,
      date: appt.date,
      excerpt: `${appt.date} ${appt.startTime} — ${appt.type} (${appt.status}): ${appt.reason}`,
      targetTab: 'pre-consultation',
    };
  }

  for (const ref of referrals) {
    sourceCatalog[ref.id] = {
      sourceId: ref.id,
      sourceType: 'Referral',
      label: `Referral: ${ref.specialty}`,
      date: ref.createdAt,
      excerpt: `${ref.direction} ${ref.specialty} referral (${ref.status}): ${ref.reason}`,
      targetTab: 'care-plan',
    };
  }

  // Explicit Missing Data Signals (never equate missing with normal or NKDA)
  const missingDataSignals: string[] = [];
  if (patient.allergies.length === 0) {
    missingDataSignals.push(
      'No allergy records documented in chart — absence of recorded allergies does NOT confirm No Known Drug Allergies (NKDA); clinician must verify directly.'
    );
  }
  if (vitals.length === 0) {
    missingDataSignals.push('No vital sign observations recorded for this patient.');
  }
  if (labs.length === 0) {
    missingDataSignals.push('No structured laboratory results recorded in chart; missing labs cannot be interpreted as normal.');
  }
  if (medications.length === 0) {
    missingDataSignals.push('No active or historical medications documented; confirm current medication list with patient.');
  }
  if (!patient.intakeFormsComplete) {
    missingDataSignals.push('Pre-visit intake forms are not yet marked complete.');
  }

  // Explicit Conflict & Unverified Information Signals
  const conflictSignals: string[] = [];
  const unverifiedConditions = patient.conditions.filter((c) => !c.verified);
  if (unverifiedConditions.length > 0) {
    conflictSignals.push(
      `${unverifiedConditions.length} external/patient-reported condition(s) awaiting clinician verification: ${unverifiedConditions.map((c) => c.name).join(', ')}.`
    );
  }
  const unreconciledMeds = medications.filter((m) => !m.reconciled);
  if (unreconciledMeds.length > 0) {
    conflictSignals.push(
      `${unreconciledMeds.length} medication(s) pending reconciliation: ${unreconciledMeds.map((m) => `${m.name} ${m.dose}`).join(', ')}.`
    );
  }
  const pendingInbox = inboxItems.filter((i) => i.status !== 'Verified & Consolidated' && i.status !== 'Rejected');
  if (pendingInbox.length > 0) {
    conflictSignals.push(
      `${pendingInbox.length} incoming Data Inbox document(s) awaiting human verification: ${pendingInbox.map((i) => i.title).join(', ')}.`
    );
  }
  const unreviewedLabs = labs.filter((l) => l.status !== 'Reviewed');
  if (unreviewedLabs.length > 0) {
    conflictSignals.push(
      `${unreviewedLabs.length} laboratory result(s) not yet marked Reviewed (including ${unreviewedLabs.filter((l) => l.flag === 'Critical').length} critical).`
    );
  }

  // Detect duplicate/potentially conflicting medication names
  const medByBaseName = new Map<string, Medication[]>();
  for (const m of medications.filter((x) => x.status === 'Active' || x.status === 'Draft')) {
    const key = m.name.toLowerCase().split(/\s+/)[0];
    const list = medByBaseName.get(key) || [];
    list.push(m);
    medByBaseName.set(key, list);
  }
  for (const [, list] of medByBaseName.entries()) {
    if (list.length > 1) {
      conflictSignals.push(
        `Potential medication overlap/conflict: ${list.map((m) => `${m.name} ${m.dose} (${m.status})`).join(' vs ')}.`
      );
    }
  }

  const compactPayload = {
    patient: {
      sourceId: patient.id,
      fullName: patient.fullName,
      mrn: patient.mrn,
      dob: patient.dob,
      age: patient.age,
      sex: patient.sex,
      chiefConcern: patient.chiefConcern || null,
      facility: facility?.name || patient.facilityId,
      registrationStatus: patient.registrationStatus || 'Active',
    },
    conditions: patient.conditions.map((c) => ({
      sourceId: c.id,
      name: c.name,
      icd10: c.icd10,
      status: c.status,
      onsetDate: c.onsetDate,
      verified: c.verified,
      source: c.source,
    })),
    allergies: patient.allergies.map((a) => ({
      sourceId: a.id,
      substance: a.substance,
      reaction: a.reaction,
      severity: a.severity,
      verified: a.verified,
    })),
    vitals: vitals.slice(0, 8).map((v) => ({
      sourceId: v.id,
      recordedAt: v.recordedAt,
      bp: `${v.bpSystolic}/${v.bpDiastolic} mmHg`,
      heartRate: v.heartRate,
      spo2: v.spo2,
      weightKg: v.weightKg,
      source: v.source,
    })),
    labs: labs.slice(0, 16).map((l) => ({
      sourceId: l.id,
      testName: l.testName,
      value: l.value,
      unit: l.unit,
      referenceInterval: l.referenceInterval,
      flag: l.flag,
      status: l.status,
      collectionDate: l.collectionDate,
    })),
    imaging: imaging.slice(0, 6).map((i) => ({
      sourceId: i.id,
      studyName: i.studyName,
      modality: i.modality,
      performedAt: i.performedAt,
      impression: i.impression,
      status: i.status,
    })),
    medications: medications.map((m) => ({
      sourceId: m.id,
      name: m.name,
      dose: m.dose,
      frequency: m.frequency,
      status: m.status,
      reconciled: m.reconciled,
      startDate: m.startDate,
    })),
    encounters: encounters.slice(0, 6).map((e) => ({
      sourceId: e.id,
      date: e.date,
      type: e.type,
      chiefComplaint: e.chiefComplaint,
      noteStatus: e.noteStatus,
      assessment: e.soap.assessment.slice(0, 260),
      plan: e.soap.plan.slice(0, 260),
    })),
    documents: documents.slice(0, 8).map((d) => ({
      sourceId: d.id,
      title: d.title,
      category: d.category,
      date: d.date,
      verified: d.verified,
      summary: d.summary,
    })),
    pendingDataInbox: inboxItems.slice(0, 6).map((i) => ({
      sourceId: i.id,
      title: i.title,
      category: i.category,
      status: i.status,
      documentDate: i.documentDate,
    })),
    openTasks: tasks
      .filter((t) => t.status !== 'Complete')
      .map((t) => ({
        sourceId: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate,
      })),
    upcomingAppointments: appointments.slice(0, 4).map((a) => ({
      sourceId: a.id,
      date: a.date,
      startTime: a.startTime,
      type: a.type,
      status: a.status,
      reason: a.reason,
    })),
    missingDataSignals,
    conflictSignals,
  };

  return {
    ok: true,
    context: {
      patient,
      facilityName: facility?.name || patient.facilityId,
      vitals,
      labs,
      imaging,
      medications,
      encounters,
      documents,
      inboxItems,
      tasks,
      appointments,
      referrals,
      missingDataSignals,
      conflictSignals,
      sourceCatalog,
      allowedSourceIds: Object.keys(sourceCatalog),
      contextSummaryJson: JSON.stringify(compactPayload),
    },
  };
}

/**
 * ClinicalProvenanceMapper — resolves an array of AI-emitted sourceIds strictly
 * against the permitted patient's source catalog, dropping ungrounded IDs and
 * reporting any stripped references as validation warnings.
 */
export function resolveGroundedSources(
  sourceIds: readonly string[],
  sourceCatalog: Record<string, ClinicalSourceReference>
): { resolved: ClinicalSourceReference[]; ungroundedIds: string[] } {
  const seen = new Set<string>();
  const resolved: ClinicalSourceReference[] = [];
  const ungroundedIds: string[] = [];

  for (const rawId of sourceIds) {
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const ref = sourceCatalog[id];
    if (ref) {
      resolved.push(ref);
    } else {
      ungroundedIds.push(id);
    }
  }

  return { resolved, ungroundedIds };
}
