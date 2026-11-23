import { buildPatientTimeline } from './clinicalEvents';
import { checkMedicationAllergyConflict } from './domainLogic';
import type {
  AiProposedAction,
  AppState,
  Encounter,
  Patient,
  PatientTabKey,
} from '../types/hms';

export type ProvenanceKind =
  | 'Recorded Fact'
  | 'Derived Calculation'
  | 'Simulated AI Suggestion'
  | 'Unavailable Data';

export interface ReadinessCriterion {
  id: string;
  label: string;
  status: 'Complete' | 'Needs Review' | 'Missing';
  detail: string;
  provenance: ProvenanceKind;
  targetTab: PatientTabKey;
}

export interface PreVisitReadinessReport {
  completedCount: number;
  totalCount: number;
  needsReviewCount: number;
  missingCount: number;
  criteria: ReadinessCriterion[];
}

export interface WhatMattersItem {
  id: string;
  section:
    | 'Reason for Visit'
    | 'Recent Clinical Events'
    | 'Medications & Allergies'
    | 'Trends'
    | 'Missing or Unverified'
    | 'Outstanding Actions';
  title: string;
  detail: string;
  provenance: ProvenanceKind;
  sourceLabel: string;
  targetTab: PatientTabKey;
  severity?: 'normal' | 'warning' | 'critical';
}

export interface SafetyRadarAlert {
  id: string;
  category:
    | 'Allergy Conflict'
    | 'Critical Lab Result'
    | 'Unreviewed Abnormal Result'
    | 'Unverified External Record'
    | 'Medication Reconciliation'
    | 'Pending Clinical Handoff'
    | 'Overdue Follow-Up';
  severity: 'Critical' | 'Warning' | 'Advisory';
  title: string;
  detail: string;
  supportingRecord: string;
  targetTab: PatientTabKey;
}

export interface JourneyTimeMachineEntry {
  id: string;
  timestamp: string;
  stage: string;
  actor: string;
  role: string;
  actorKind: 'AI Draft' | 'Human Action' | 'Role Handoff' | 'Patient Input';
  whatChanged: string;
  whyAdvanced: string;
  nextOwner?: string;
  targetTab: PatientTabKey;
}

export function buildPreVisitReadiness(state: AppState, patientId: string): PreVisitReadinessReport {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) {
    return {
      completedCount: 0,
      totalCount: 0,
      needsReviewCount: 0,
      missingCount: 0,
      criteria: [],
    };
  }

  const intakes = state.preVisitIntakes.filter((i) => i.patientId === patientId);
  const latestIntake = intakes[0];
  const policies = state.policies.filter((p) => p.patientId === patientId);
  const vitals = state.vitals.filter((v) => v.patientId === patientId);
  const meds = state.medications.filter((m) => m.patientId === patientId);
  const unverifiedMeds = meds.filter((m) => !m.reconciled);
  const unverifiedExternalConds = patient.conditions.filter((c) => !c.verified);
  const unverifiedExtracted = latestIntake
    ? latestIntake.extractedItems.filter((item) => !item.verified)
    : [];
  const pendingExtDocs = state.externalDocQueue.filter(
    (d) => d.status === 'Pending Human Verification' && d.candidatePatientIds.includes(patientId)
  );

  const criteria: ReadinessCriterion[] = [
    {
      id: 'readiness-demographics',
      label: 'Identity & demographics on file',
      status: patient.fullName && patient.dob && patient.phone ? 'Complete' : 'Missing',
      detail: `${patient.mrn} · DOB ${patient.dob} · ${patient.phone || 'Phone unavailable'}`,
      provenance: 'Recorded Fact',
      targetTab: 'overview',
    },
    {
      id: 'readiness-intake',
      label: 'Pre-visit intake questionnaire',
      status: latestIntake
        ? latestIntake.status === 'Verified'
          ? 'Complete'
          : 'Needs Review'
        : patient.intakeFormsComplete
        ? 'Complete'
        : 'Missing',
      detail: latestIntake
        ? `Submitted ${latestIntake.submittedAt} (${latestIntake.status})`
        : patient.intakeFormsComplete
        ? 'Clinic intake forms marked complete'
        : 'No pre-visit intake submission recorded',
      provenance: latestIntake || patient.intakeFormsComplete ? 'Recorded Fact' : 'Unavailable Data',
      targetTab: 'pre-visit-intake',
    },
    {
      id: 'readiness-insurance',
      label: 'Coverage & eligibility status (simulated)',
      status:
        policies.some((p) => p.status === 'Active') || latestIntake?.insuranceStatus === 'Simulated Verified'
          ? 'Complete'
          : policies.length > 0
          ? 'Needs Review'
          : 'Missing',
      detail:
        policies[0]
          ? `${policies[0].payerName} (${policies[0].status} — simulated eligibility)`
          : latestIntake?.insurancePayer
          ? `${latestIntake.insurancePayer} (${latestIntake.insuranceStatus})`
          : 'No active coverage verified',
      provenance: policies.length > 0 || latestIntake ? 'Recorded Fact' : 'Unavailable Data',
      targetTab: 'account',
    },
    {
      id: 'readiness-vitals',
      label: 'Baseline visit vitals captured',
      status: vitals.length > 0 ? 'Complete' : 'Missing',
      detail: vitals[0]
        ? `BP ${vitals[0].bpSystolic}/${vitals[0].bpDiastolic} mmHg · HR ${vitals[0].heartRate} bpm · Wt ${vitals[0].weightKg} kg (${vitals[0].recordedAt})`
        : 'Vitals not yet recorded by Medical Assistant',
      provenance: vitals.length > 0 ? 'Recorded Fact' : 'Unavailable Data',
      targetTab: 'encounters',
    },
    {
      id: 'readiness-allergies',
      label: 'Allergies documented & verified',
      status:
        patient.allergies.length === 0
          ? 'Complete'
          : patient.allergies.every((a) => a.verified)
          ? 'Complete'
          : 'Needs Review',
      detail:
        patient.allergies.length === 0
          ? 'No known drug allergies (NKDA)'
          : patient.allergies.map((a) => `${a.substance} (${a.severity})`).join(', '),
      provenance: 'Recorded Fact',
      targetTab: 'overview',
    },
    {
      id: 'readiness-meds',
      label: 'Medication list reconciliation',
      status:
        meds.length === 0
          ? 'Needs Review'
          : unverifiedMeds.length === 0
          ? 'Complete'
          : 'Needs Review',
      detail:
        meds.length === 0
          ? 'No active medications documented'
          : unverifiedMeds.length === 0
          ? `${meds.length} medication(s) reconciled`
          : `${unverifiedMeds.length} of ${meds.length} medication(s) pending reconciliation`,
      provenance: meds.length > 0 ? 'Derived Calculation' : 'Unavailable Data',
      targetTab: 'medications',
    },
    {
      id: 'readiness-external',
      label: 'AI intake extractions & external records verified',
      status:
        unverifiedExtracted.length === 0 && unverifiedExternalConds.length === 0 && pendingExtDocs.length === 0
          ? 'Complete'
          : 'Needs Review',
      detail:
        unverifiedExtracted.length + unverifiedExternalConds.length + pendingExtDocs.length === 0
          ? 'All extracted intake fields and external records reviewed by staff'
          : `${unverifiedExtracted.length} AI intake item(s), ${unverifiedExternalConds.length} external condition(s), ${pendingExtDocs.length} unmatched outside doc(s) awaiting human verification`,
      provenance: 'Derived Calculation',
      targetTab: 'pre-consultation',
    },
  ];

  return {
    completedCount: criteria.filter((c) => c.status === 'Complete').length,
    totalCount: criteria.length,
    needsReviewCount: criteria.filter((c) => c.status === 'Needs Review').length,
    missingCount: criteria.filter((c) => c.status === 'Missing').length,
    criteria,
  };
}

export function buildWhatMattersToday(state: AppState, patientId: string): WhatMattersItem[] {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return [];

  const items: WhatMattersItem[] = [];
  const appts = state.appointments
    .filter((a) => a.patientId === patientId && a.status !== 'Cancelled')
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  const latestAppt = appts[0];
  const latestIntake = state.preVisitIntakes.find((i) => i.patientId === patientId);
  const vitals = state.vitals.filter((v) => v.patientId === patientId);
  const labs = state.labResults.filter((l) => l.patientId === patientId);
  const meds = state.medications.filter((m) => m.patientId === patientId);
  const openTasks = state.tasks.filter((t) => t.patientId === patientId && t.status !== 'Complete');
  const timeline = buildPatientTimeline(state, patientId);

  items.push({
    id: 'wmt-reason',
    section: 'Reason for Visit',
    title: latestAppt
      ? `${latestAppt.type} (${latestAppt.date} · ${latestAppt.startTime})`
      : patient.chiefConcern || 'Outpatient Clinical Consultation',
    detail:
      latestIntake?.reasonForVisit ||
      latestAppt?.reason ||
      patient.chiefConcern ||
      'No chief complaint documented yet.',
    provenance: latestIntake || latestAppt ? 'Recorded Fact' : 'Unavailable Data',
    sourceLabel: latestIntake ? 'Pre-Visit Intake Submission' : 'Appointment Schedule',
    targetTab: latestIntake ? 'pre-visit-intake' : 'overview',
  });

  if (latestIntake?.symptomsSummary) {
    items.push({
      id: 'wmt-symptoms',
      section: 'Reason for Visit',
      title: 'Patient-reported pre-visit symptoms',
      detail: latestIntake.symptomsSummary,
      provenance: 'Recorded Fact',
      sourceLabel: `Patient Intake (${latestIntake.submittedAt})`,
      targetTab: 'pre-visit-intake',
    });
  }

  const criticalOrSignificant = timeline.filter((e) => e.isCritical).slice(0, 2);
  if (criticalOrSignificant.length > 0) {
    criticalOrSignificant.forEach((ev) => {
      items.push({
        id: `wmt-ev-${ev.id}`,
        section: 'Recent Clinical Events',
        title: ev.title,
        detail: `${ev.date} · ${ev.summary} (${ev.eventNature})`,
        provenance: 'Recorded Fact',
        sourceLabel: 'Longitudinal Timeline',
        targetTab: ev.targetTab,
        severity: ev.severity === 'Critical' ? 'critical' : 'warning',
      });
    });
  } else {
    items.push({
      id: 'wmt-no-critical',
      section: 'Recent Clinical Events',
      title: 'No critical clinical events flagged on file',
      detail: `${timeline.length} routine longitudinal record(s) reviewed across encounters, labs, and orders.`,
      provenance: 'Derived Calculation',
      sourceLabel: 'Critical Events Filter',
      targetTab: 'timeline',
    });
  }

  items.push({
    id: 'wmt-meds-allergies',
    section: 'Medications & Allergies',
    title: `${meds.filter((m) => m.status === 'Active').length} Active Medication(s) · ${patient.allergies.length} Allergy Record(s)`,
    detail:
      patient.allergies.length > 0
        ? `Allergies: ${patient.allergies.map((a) => `${a.substance} (${a.severity})`).join(', ')}. Active meds: ${meds
            .filter((m) => m.status === 'Active')
            .slice(0, 3)
            .map((m) => `${m.name} ${m.dose}`)
            .join(', ') || 'None'}.`
        : `NKDA verified. Active meds: ${meds
            .filter((m) => m.status === 'Active')
            .slice(0, 3)
            .map((m) => `${m.name} ${m.dose}`)
            .join(', ') || 'None'}.`,
    provenance: 'Recorded Fact',
    sourceLabel: 'Medications & Allergy Banner',
    targetTab: 'medications',
    severity: patient.allergies.some((a) => a.severity === 'Severe') ? 'warning' : 'normal',
  });

  if (vitals.length >= 2) {
    const latest = vitals[0];
    const prior = vitals[1];
    const sysDelta = latest.bpSystolic - prior.bpSystolic;
    items.push({
      id: 'wmt-bp-trend',
      section: 'Trends',
      title: `Blood pressure ${latest.bpSystolic}/${latest.bpDiastolic} mmHg (${sysDelta >= 0 ? '+' : ''}${sysDelta} systolic vs prior)`,
      detail: `Latest ${latest.recordedAt} compared with ${prior.bpSystolic}/${prior.bpDiastolic} mmHg on ${prior.recordedAt}.`,
      provenance: 'Derived Calculation',
      sourceLabel: 'Clinic Vitals Flowsheet',
      targetTab: 'encounters',
      severity: latest.bpSystolic >= 140 || latest.bpDiastolic >= 90 ? 'warning' : 'normal',
    });
  } else if (vitals.length === 1) {
    items.push({
      id: 'wmt-bp-single',
      section: 'Trends',
      title: `Baseline BP ${vitals[0].bpSystolic}/${vitals[0].bpDiastolic} mmHg · HR ${vitals[0].heartRate} bpm`,
      detail: `Recorded ${vitals[0].recordedAt} by ${vitals[0].recordedBy}. Prior clinic vitals unavailable for delta comparison.`,
      provenance: 'Recorded Fact',
      sourceLabel: 'Clinic Vitals Flowsheet',
      targetTab: 'encounters',
    });
  } else {
    items.push({
      id: 'wmt-bp-missing',
      section: 'Trends',
      title: 'Today’s vital signs not yet recorded',
      detail: 'Awaiting Medical Assistant intake vital signs.',
      provenance: 'Unavailable Data',
      sourceLabel: 'Clinic Vitals Flowsheet',
      targetTab: 'encounters',
      severity: 'warning',
    });
  }

  const egfrLabs = labs
    .filter((l) => l.testName.toLowerCase().includes('egfr') && typeof l.numericValue === 'number')
    .sort((a, b) => b.collectionDate.localeCompare(a.collectionDate));
  if (egfrLabs.length > 0) {
    const latestEgfr = egfrLabs[0];
    const priorEgfr = egfrLabs[1];
    items.push({
      id: 'wmt-egfr-trend',
      section: 'Trends',
      title: `Latest eGFR: ${latestEgfr.value} ${latestEgfr.unit} (${latestEgfr.flag})`,
      detail: priorEgfr
        ? `Prior eGFR ${priorEgfr.value} ${priorEgfr.unit} on ${priorEgfr.collectionDate}; change ${(
            (latestEgfr.numericValue || 0) - (priorEgfr.numericValue || 0)
          ).toFixed(0)} mL/min.`
        : `Collected ${latestEgfr.collectionDate}; reference ${latestEgfr.referenceInterval}.`,
      provenance: priorEgfr ? 'Derived Calculation' : 'Recorded Fact',
      sourceLabel: 'Lab Results',
      targetTab: 'orders-results',
      severity: latestEgfr.flag === 'Critical' ? 'critical' : latestEgfr.flag === 'Abnormal' ? 'warning' : 'normal',
    });
  }

  const unverifiedItems = latestIntake ? latestIntake.extractedItems.filter((i) => !i.verified) : [];
  if (unverifiedItems.length > 0) {
    items.push({
      id: 'wmt-unverified-intake',
      section: 'Missing or Unverified',
      title: `${unverifiedItems.length} AI-extracted pre-visit item(s) awaiting staff verification`,
      detail: unverifiedItems.map((u) => `${u.field}: ${u.value}`).join(' · '),
      provenance: 'Simulated AI Suggestion',
      sourceLabel: 'AI Intake Intelligence (Draft)',
      targetTab: 'pre-consultation',
      severity: 'warning',
    });
  }

  const unreviewedLabs = labs.filter((l) => l.status !== 'Reviewed');
  if (unreviewedLabs.length > 0 || openTasks.length > 0) {
    items.push({
      id: 'wmt-outstanding',
      section: 'Outstanding Actions',
      title: `${unreviewedLabs.length} unreviewed lab(s) · ${openTasks.length} open follow-up task(s)`,
      detail:
        unreviewedLabs.length > 0
          ? `Review needed: ${unreviewedLabs.map((l) => `${l.testName} (${l.value} ${l.unit})`).join(', ')}`
          : openTasks.slice(0, 2).map((t) => t.title).join('; '),
      provenance: 'Derived Calculation',
      sourceLabel: 'Orders & Tasks Queue',
      targetTab: unreviewedLabs.length > 0 ? 'orders-results' : 'care-plan',
      severity: unreviewedLabs.some((l) => l.flag === 'Critical') ? 'critical' : 'normal',
    });
  }

  return items;
}

export function buildClinicalSafetyRadar(state: AppState, patientId: string): SafetyRadarAlert[] {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return [];

  const alerts: SafetyRadarAlert[] = [];
  const meds = state.medications.filter((m) => m.patientId === patientId && m.status !== 'Discontinued');
  const labs = state.labResults.filter((l) => l.patientId === patientId);
  const openTasks = state.tasks.filter((t) => t.patientId === patientId && t.status !== 'Complete');

  // 1. Allergy-medication cross-check
  meds.forEach((m) => {
    const conflict = checkMedicationAllergyConflict(patient, m.name);
    if (conflict.hasConflict) {
      alerts.push({
        id: `rad-alg-${m.id}`,
        category: 'Allergy Conflict',
        severity: 'Critical',
        title: `Potential allergy conflict: ${m.name}`,
        detail: `Matches documented allergy ${conflict.matchedAllergy}${conflict.reaction ? ` (${conflict.reaction})` : ''}.`,
        supportingRecord: `Medication ${m.name} vs Allergy ${conflict.matchedAllergy || 'documented'}`,
        targetTab: 'medications',
      });
    }
  });

  // 2. Critical & unreviewed abnormal labs
  labs
    .filter((l) => l.flag === 'Critical' && l.status !== 'Reviewed')
    .forEach((l) => {
      alerts.push({
        id: `rad-crit-${l.id}`,
        category: 'Critical Lab Result',
        severity: 'Critical',
        title: `Unacknowledged Critical Lab: ${l.testName} = ${l.value} ${l.unit}`,
        detail: `Collected ${l.collectionDate} · Reference ${l.referenceInterval}. Requires prompt clinician acknowledgement and documented follow-up.`,
        supportingRecord: `LabResult ${l.id} (${l.status})`,
        targetTab: 'orders-results',
      });
    });

  labs
    .filter((l) => l.flag === 'Abnormal' && l.status !== 'Reviewed')
    .forEach((l) => {
      alerts.push({
        id: `rad-abn-${l.id}`,
        category: 'Unreviewed Abnormal Result',
        severity: 'Warning',
        title: `Unreviewed Abnormal Lab: ${l.testName} = ${l.value} ${l.unit}`,
        detail: `Collected ${l.collectionDate} · Reference ${l.referenceInterval}. Clinician sign-off pending.`,
        supportingRecord: `LabResult ${l.id}`,
        targetTab: 'orders-results',
      });
    });

  // 3. Unverified external conditions or documents
  patient.conditions
    .filter((c) => !c.verified)
    .forEach((c) => {
      alerts.push({
        id: `rad-cnd-${c.id}`,
        category: 'Unverified External Record',
        severity: 'Advisory',
        title: `Unverified external condition: ${c.name}`,
        detail: `Source: ${c.source} (${c.icd10}). Requires human verification before treating as confirmed diagnosis.`,
        supportingRecord: `Condition ${c.icd10}`,
        targetTab: 'overview',
      });
    });

  state.externalDocQueue
    .filter((d) => d.status === 'Pending Human Verification' && d.candidatePatientIds.includes(patientId))
    .forEach((d) => {
      alerts.push({
        id: `rad-extdoc-${d.id}`,
        category: 'Unverified External Record',
        severity: 'Warning',
        title: `Uncertain outside document match: ${d.title}`,
        detail: d.uncertaintyReason,
        supportingRecord: `${d.sourceOrganization} (${d.receivedAt})`,
        targetTab: 'documents-forms',
      });
    });

  // 4. Incomplete medication reconciliation
  const unreconciled = meds.filter((m) => !m.reconciled);
  if (unreconciled.length > 0) {
    alerts.push({
      id: `rad-medrec-${patientId}`,
      category: 'Medication Reconciliation',
      severity: 'Warning',
      title: `${unreconciled.length} medication(s) require reconciliation`,
      detail: unreconciled.map((m) => `${m.name} ${m.dose}`).join(', '),
      supportingRecord: 'Active Medication List',
      targetTab: 'medications',
    });
  }

  // 5. Pending handoffs
  const pendingHandoffs = state.handoffs.filter((h) => h.patientId === patientId && h.status === 'Pending');
  if (pendingHandoffs.length > 0) {
    const latestH = pendingHandoffs[0];
    alerts.push({
      id: `rad-handoff-${latestH.id}`,
      category: 'Pending Clinical Handoff',
      severity: 'Advisory',
      title: `Handoff awaiting ${latestH.toRole} (${latestH.toOwnerName})`,
      detail: latestH.reason,
      supportingRecord: latestH.linkedRecordRef,
      targetTab: 'post-consultation',
    });
  }

  // 6. Urgent / overdue follow-up tasks
  openTasks
    .filter((t) => t.priority === 'Urgent' || t.priority === 'High')
    .slice(0, 2)
    .forEach((t) => {
      alerts.push({
        id: `rad-task-${t.id}`,
        category: 'Overdue Follow-Up',
        severity: t.priority === 'Urgent' ? 'Critical' : 'Warning',
        title: `${t.priority} Follow-Up Task: ${t.title}`,
        detail: `Due ${t.dueDate} · Team: ${t.team}`,
        supportingRecord: `Task ${t.id}`,
        targetTab: 'care-plan',
      });
    });

  return alerts;
}

export function buildConsultationActionProposals(
  transcript: string,
  patient: Patient,
  encounter: Encounter | undefined
): AiProposedAction[] {
  const lower = transcript.toLowerCase();
  const hasPotassiumOrRenal =
    lower.includes('potassium') ||
    lower.includes('renal') ||
    lower.includes('cmp') ||
    lower.includes('creatinine') ||
    lower.includes('kidney') ||
    lower.includes('egfr');
  const hasAmlodipineOrBp =
    lower.includes('amlodipine') ||
    lower.includes('blood pressure') ||
    lower.includes('lisinopril') ||
    lower.includes('bp');
  const hasFollowUp =
    lower.includes('follow') ||
    lower.includes('2 week') ||
    lower.includes('4 week') ||
    lower.includes('recheck');

  const proposals: AiProposedAction[] = [
    {
      id: `comp-lab-${patient.id}`,
      kind: 'Lab Order',
      title: hasPotassiumOrRenal
        ? 'Order Basic Metabolic Panel & Serum Potassium (LOINC 80048)'
        : 'Order Comprehensive Metabolic Panel (CPT 80053)',
      summary: hasPotassiumOrRenal
        ? 'Routine lab requisition to recheck serum creatinine, eGFR, and potassium after antihypertensive review.'
        : 'Baseline metabolic panel aligned with documented consultation plan.',
      status: 'Awaiting Approval',
      payload: {
        name: hasPotassiumOrRenal ? 'Renal Function & Serum Potassium Panel' : 'Comprehensive Metabolic Panel (CMP)',
        code: hasPotassiumOrRenal ? '80048' : '80053',
        priority: 'Routine',
      },
      whyExplanation:
        'Extracted from the simulated consultation transcript referencing renal monitoring and electrolyte recheck, corroborated by documented CKD/hypertension history.',
      supportingRecord: encounter
        ? `Encounter ${encounter.id} (${encounter.date}) + Outside Renal Lab PDF`
        : 'Simulated consultation transcript',
      source: 'Simulated Ambient AI Scribe + Chart History',
      sourceVerified: true,
      confidence: 'High',
      humanDecisionRequired: 'Authorized Clinician must explicitly approve before requisition becomes Ordered.',
    },
    {
      id: `comp-med-${patient.id}`,
      kind: 'Medication Draft',
      title: hasAmlodipineOrBp
        ? 'Draft Prescription: Amlodipine Besylate 5 mg PO Daily (30 days)'
        : 'Draft Medication Reconciliation Update',
      summary:
        'Add low-dose dihydropyridine CCB for persistent clinic systolic BP > 140 mmHg. Saved as Draft until clinician approval (no external eRx transmission).',
      status: 'Awaiting Approval',
      payload: {
        name: 'Amlodipine Besylate',
        dose: '5 mg',
        frequency: 'Once daily',
        duration: '30 days',
        pharmacy: 'CVS Boylston #0412',
      },
      whyExplanation:
        'Transcript notes elevated home and clinic BP (146/88 mmHg) despite Lisinopril 10 mg daily, with no documented calcium-channel blocker allergy.',
      supportingRecord: `Today's Clinic Vitals + Allergy Check (${
        patient.allergies.length > 0 ? patient.allergies.map((a) => a.substance).join(', ') : 'NKDA'
      })`,
      source: 'Simulated Ambient AI Scribe + Vitals Flowsheet',
      sourceVerified: true,
      confidence: 'Medium',
      uncertaintyNote:
        'Confirm absence of significant peripheral edema before activating; patient noted mild evening ankle swelling in outside summary.',
      humanDecisionRequired: 'Authorized Clinician must review allergy/edema check and click Approve to move Draft -> Active.',
    },
    {
      id: `comp-fp-${patient.id}`,
      kind: 'Follow-Up Plan',
      title: hasFollowUp
        ? 'Follow-Up Plan: 2-Week Lab & Blood Pressure Recheck'
        : 'Follow-Up Plan: 4-Week Outpatient Review',
      summary:
        'Schedule Care Coordinator follow-up visit in 2 weeks with home BP log review and simulated appointment reminder.',
      status: 'Awaiting Approval',
      payload: {
        interval: hasFollowUp ? '2 weeks' : '4 weeks',
        date: '2026-12-02',
        startTime: '10:30',
        instructions:
          'Complete Renal Function & Serum Potassium Panel within 5 days. Bring morning and evening home BP log to 2-week follow-up visit.',
      },
      whyExplanation:
        'Clinician advised a 2-week blood pressure and potassium follow-up after initiating Amlodipine 5 mg and ordering renal labs.',
      supportingRecord: 'Simulated consultation plan + Care Coordination protocol',
      source: 'Simulated Ambient AI Scribe',
      sourceVerified: true,
      confidence: 'High',
      humanDecisionRequired: 'Clinician approves follow-up plan; Care Coordinator schedules slot and logs simulated reminder.',
    },
    {
      id: `comp-msg-${patient.id}`,
      kind: 'Patient Message',
      title: 'Draft After-Visit Patient Instructions (Plain Language)',
      summary:
        'Summarizes new Amlodipine 5 mg draft, lab draw instructions, low-sodium guidance, and red-flag symptoms for patient review.',
      status: 'Awaiting Approval',
      payload: {
        subject: 'After-Visit Summary & Next Steps',
        body: 'Thank you for visiting EigenH Boston Medical Center today. Please complete your blood work (Renal & Potassium panel) within 5 days, track your morning and evening blood pressure, and contact the clinic promptly if you notice dizziness, worsening ankle swelling, or chest discomfort.',
      },
      whyExplanation:
        'Translates technical SOAP plan into plain-language patient instructions without sending automatically.',
      supportingRecord: 'SOAP Plan Draft',
      source: 'Simulated AI Instruction Composer',
      sourceVerified: false,
      confidence: 'High',
      uncertaintyNote: 'Draft text only — requires clinician review before releasing to patient message thread.',
      humanDecisionRequired: 'Clinician must approve before message thread is created.',
    },
    {
      id: `comp-task-${patient.id}`,
      kind: 'Task',
      title: 'Care Coordinator Handoff: Verify Lab Completion & Book 2-Week Follow-Up',
      summary: 'Routes approved lab tracking and follow-up booking to Jordan Lee, RN (Care Coordinator).',
      status: 'Awaiting Approval',
      payload: {
        ownerId: 'staff-2',
        dueDate: '2026-11-23',
        priority: 'High',
      },
      whyExplanation:
        'Ensures closed-loop follow-through between provider visit, lab processing, and post-visit care coordination.',
      supportingRecord: 'Post-Consultation Handoff Policy',
      source: 'Smart Role Handoff Composer (Simulated)',
      sourceVerified: true,
      confidence: 'High',
      humanDecisionRequired: 'Clinician approves handoff task to populate Care Coordinator queue.',
    },
  ];

  return proposals;
}

export function buildJourneyTimeMachine(state: AppState, patientId: string): JourneyTimeMachineEntry[] {
  const entries: JourneyTimeMachineEntry[] = [];

  state.handoffs
    .filter((h) => h.patientId === patientId)
    .forEach((h) => {
      entries.push({
        id: `tm-h-${h.id}`,
        timestamp: h.timestamp,
        stage: `Handoff: ${h.fromRole} -> ${h.toRole}`,
        actor: h.fromActor,
        role: h.fromRole,
        actorKind: 'Role Handoff',
        whatChanged: h.reason,
        whyAdvanced: `Linked record: ${h.linkedRecordRef}`,
        nextOwner: `${h.toOwnerName} (${h.toRole})`,
        targetTab: 'post-consultation',
      });
    });

  state.preVisitIntakes
    .filter((i) => i.patientId === patientId)
    .forEach((i) => {
      entries.push({
        id: `tm-i-${i.id}`,
        timestamp: i.submittedAt,
        stage: 'Pre-Visit Patient Intake',
        actor: 'Patient (Simulated Intake Link)',
        role: 'Patient',
        actorKind: 'Patient Input',
        whatChanged: `Submitted reason for visit, ${i.reportedMedications.length} reported meds, ${i.uploadedDocuments.length} uploaded document(s).`,
        whyAdvanced: `Status: ${i.status} · ${i.extractedItems.filter((x) => x.verified).length}/${i.extractedItems.length} AI items verified`,
        nextOwner: 'Front Desk & Medical Assistant',
        targetTab: 'pre-visit-intake',
      });
    });

  state.auditEvents
    .filter((a) => a.targetId === patientId || a.detail.includes(patientId) || a.targetType === 'Patient' && a.targetId === patientId)
    .slice(0, 25)
    .forEach((a) => {
      const isAi = a.action.toLowerCase().includes('ai') || a.actor.toLowerCase().includes('ai');
      entries.push({
        id: `tm-a-${a.id}`,
        timestamp: a.timestamp,
        stage: a.action,
        actor: a.actor,
        role: a.role,
        actorKind: isAi ? 'AI Draft' : 'Human Action',
        whatChanged: a.detail,
        whyAdvanced: `${a.targetType}:${a.targetId}`,
        targetTab:
          a.targetType === 'Encounter'
            ? 'post-consultation'
            : a.targetType === 'LabResult' || a.targetType === 'Order'
            ? 'orders-results'
            : 'overview',
      });
    });

  // Also include order/lab/encounter/appointment audit records for this patient
  const patRecordIds = new Set<string>([
    ...state.appointments.filter((x) => x.patientId === patientId).map((x) => x.id),
    ...state.encounters.filter((x) => x.patientId === patientId).map((x) => x.id),
    ...state.orders.filter((x) => x.patientId === patientId).map((x) => x.id),
    ...state.labResults.filter((x) => x.patientId === patientId).map((x) => x.id),
    ...state.medications.filter((x) => x.patientId === patientId).map((x) => x.id),
    ...state.followUpPlans.filter((x) => x.patientId === patientId).map((x) => x.id),
  ]);

  const seenAuditIds = new Set(entries.map((e) => e.id));
  state.auditEvents
    .filter((a) => patRecordIds.has(a.targetId))
    .slice(0, 30)
    .forEach((a) => {
      const key = `tm-a-${a.id}`;
      if (seenAuditIds.has(key)) return;
      seenAuditIds.add(key);
      const isAi = a.action.toLowerCase().includes('ai') || a.actor.toLowerCase().includes('ai');
      entries.push({
        id: key,
        timestamp: a.timestamp,
        stage: a.action,
        actor: a.actor,
        role: a.role,
        actorKind: isAi ? 'AI Draft' : 'Human Action',
        whatChanged: a.detail,
        whyAdvanced: `${a.targetType}:${a.targetId}`,
        targetTab:
          a.targetType === 'Encounter'
            ? 'post-consultation'
            : a.targetType === 'LabResult' || a.targetType === 'Order'
            ? 'orders-results'
            : a.targetType === 'Medication'
            ? 'medications'
            : 'overview',
      });
    });

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
