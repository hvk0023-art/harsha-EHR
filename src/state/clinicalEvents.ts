import type { AppState, PatientTabKey } from '../types/hms';

export type ClinicalEventNature =
  | 'Significant Clinical Event'
  | 'Formal Adverse Event (Medical Care)'
  | 'Routine Clinical Record';

export type ClinicalEventCategory =
  | 'Laboratory'
  | 'Vitals'
  | 'Encounter'
  | 'Condition'
  | 'Allergy / Adverse Reaction'
  | 'Procedure / Acute Care'
  | 'Medication'
  | 'Imaging'
  | 'Order'
  | 'Care Plan';

export interface ClinicalTimelineEvent {
  id: string;
  date: string;
  category: ClinicalEventCategory;
  resourceType:
    | 'DiagnosticReport'
    | 'Observation'
    | 'Encounter'
    | 'Condition'
    | 'AllergyIntolerance'
    | 'AdverseEvent'
    | 'Procedure'
    | 'MedicationRequest'
    | 'ServiceRequest'
    | 'CarePlan';
  title: string;
  summary: string;
  severity: 'Critical' | 'High' | 'Moderate' | 'Normal';
  isCritical: boolean;
  eventNature: ClinicalEventNature;
  criticalReason?: string;
  encounterLabel?: string;
  sourceId: string;
  targetTab: PatientTabKey;
}

const SIGNIFICANT_CONDITION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\b(acute\s+)?(ischemic\s+|hemorrhagic\s+)?stroke\b|\bcva\b/i, reason: 'Acute cerebrovascular event (stroke)' },
  { pattern: /\b(acute\s+)?myocardial\s+infarction\b|\bstemi\b|\bnstemi\b|\bheart\s+attack\b/i, reason: 'Acute myocardial infarction' },
  { pattern: /\bsepsis\b|\bseptic\s+shock\b/i, reason: 'Life-threatening sepsis / shock' },
  { pattern: /\bpulmonary\s+embolism\b|\banaphylaxis\b/i, reason: 'Acute high-risk cardiopulmonary or anaphylactic event' },
  { pattern: /\bsevere\s+hypotension\b|\bcardiogenic\s+shock\b/i, reason: 'Severe hemodynamic instability' },
  { pattern: /\btreatment\s+complication\b|\bpost-?op(erative)?\s+complication\b|\biatrogenic\b|\badverse\s+drug\s+event\b/i, reason: 'Clinically significant treatment complication' },
];

const ADVERSE_EVENT_PATTERNS =
  /\b(anaphylaxis|angioedema|treatment\s+complication|post-?op(erative)?\s+complication|iatrogenic|adverse\s+drug\s+event|drug-induced|bleeding\s+complication)\b/i;

export function buildPatientTimeline(state: AppState, patientId: string): ClinicalTimelineEvent[] {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return [];

  const events: ClinicalTimelineEvent[] = [];
  const patientEncounters = state.encounters.filter((e) => e.patientId === patientId);
  const encById = new Map(patientEncounters.map((e) => [e.id, e]));

  // 1. Lab Results (only flag === 'Critical' is classified as Critical Event; Abnormal is NOT auto-critical)
  state.labResults
    .filter((l) => l.patientId === patientId)
    .forEach((lab) => {
      const isCrit = lab.flag === 'Critical';
      const linkedOrder = state.orders.find((o) => o.id === lab.orderId);
      const linkedEnc = linkedOrder?.encounterId ? encById.get(linkedOrder.encounterId) : undefined;
      events.push({
        id: `tl-lab-${lab.id}`,
        date: lab.collectionDate,
        category: 'Laboratory',
        resourceType: 'DiagnosticReport',
        title: `${lab.testName}: ${lab.value} ${lab.unit}`.trim(),
        summary: `Ref ${lab.referenceInterval} · Flag: ${lab.flag} · Status: ${lab.status}`,
        severity: isCrit ? 'Critical' : lab.flag === 'Abnormal' ? 'Moderate' : 'Normal',
        isCritical: isCrit,
        eventNature: isCrit ? 'Significant Clinical Event' : 'Routine Clinical Record',
        criticalReason: isCrit ? `Critical laboratory value (${lab.value} ${lab.unit}, ref ${lab.referenceInterval})` : undefined,
        encounterLabel: linkedEnc ? `${linkedEnc.type} (${linkedEnc.date})` : undefined,
        sourceId: lab.id,
        targetTab: 'orders-results',
      });
    });

  // 2. Vitals (only severe hypotension BP <90/<50, severe hypoxemia SpO2 <90%, or extreme hyperpyrexia >=103.5F)
  state.vitals
    .filter((v) => v.patientId === patientId)
    .forEach((v) => {
      const severeHypotension = v.bpSystolic < 90 || v.bpDiastolic < 50;
      const severeHypoxemia = v.spo2 > 0 && v.spo2 < 90;
      const severeFever = v.tempF >= 103.5;
      const isCrit = severeHypotension || severeHypoxemia || severeFever;
      const reasons: string[] = [];
      if (severeHypotension) reasons.push(`Severe hypotension (${v.bpSystolic}/${v.bpDiastolic} mmHg)`);
      if (severeHypoxemia) reasons.push(`Severe hypoxemia (SpO₂ ${v.spo2}%)`);
      if (severeFever) reasons.push(`Critical hyperpyrexia (${v.tempF}°F)`);

      events.push({
        id: `tl-vit-${v.id}`,
        date: v.recordedAt.slice(0, 10),
        category: 'Vitals',
        resourceType: 'Observation',
        title: `Vital Signs — BP ${v.bpSystolic}/${v.bpDiastolic}, HR ${v.heartRate}, SpO₂ ${v.spo2}%`,
        summary: `Temp ${v.tempF}°F · Wt ${v.weightKg} kg · Source: ${v.source} (${v.recordedBy})`,
        severity: isCrit ? 'Critical' : 'Normal',
        isCritical: isCrit,
        eventNature: isCrit ? 'Significant Clinical Event' : 'Routine Clinical Record',
        criticalReason: isCrit ? reasons.join('; ') : undefined,
        sourceId: v.id,
        targetTab: 'overview',
      });
    });

  // 3. Encounters (routine encounters are NEVER critical; only acute emergency/stroke/MI/complication documented)
  patientEncounters.forEach((enc) => {
    const combinedText = `${enc.type} ${enc.chiefComplaint} ${enc.diagnoses.join(' ')} ${enc.soap.assessment}`;
    const emergencyVisit = /\b(emergency\s+admission|ed\s+admission|acute\s+stroke|myocardial\s+infarction|code\s+blue|icu\s+transfer)\b/i.test(
      combinedText
    );
    const complicationVisit = /\b(treatment\s+complication|post-?op(erative)?\s+complication|adverse\s+drug\s+event)\b/i.test(
      combinedText
    );
    const isCrit = emergencyVisit || complicationVisit;

    events.push({
      id: `tl-enc-${enc.id}`,
      date: enc.date,
      category: 'Encounter',
      resourceType: 'Encounter',
      title: `${enc.type} — ${enc.chiefComplaint}`,
      summary: `Note: ${enc.noteStatus}${enc.signedBy ? ` (${enc.signedBy})` : ''} · Dx: ${enc.diagnoses.join(', ') || 'Pending'}`,
      severity: isCrit ? 'Critical' : 'Normal',
      isCritical: isCrit,
      eventNature: complicationVisit
        ? 'Formal Adverse Event (Medical Care)'
        : emergencyVisit
        ? 'Significant Clinical Event'
        : 'Routine Clinical Record',
      criticalReason: complicationVisit
        ? 'Clinically significant treatment complication documented during encounter'
        : emergencyVisit
        ? 'Acute emergency admission or high-acuity clinical event'
        : undefined,
      encounterLabel: `${enc.type} (${enc.date})`,
      sourceId: enc.id,
      targetTab: 'encounters',
    });
  });

  // 4. Conditions (only clinically major acute events or complications, NOT routine chronic diagnoses)
  patient.conditions.forEach((cond) => {
    const matched = SIGNIFICANT_CONDITION_PATTERNS.find((item) => item.pattern.test(cond.name));
    const isAdverse = ADVERSE_EVENT_PATTERNS.test(cond.name);
    const isCrit = Boolean(matched);
    events.push({
      id: `tl-cond-${cond.id}`,
      date: cond.onsetDate,
      category: 'Condition',
      resourceType: isAdverse ? 'AdverseEvent' : 'Condition',
      title: `${cond.name} (${cond.icd10})`,
      summary: `Status: ${cond.status} · Source: ${cond.source}`,
      severity: isCrit ? 'Critical' : 'Normal',
      isCritical: isCrit,
      eventNature: isAdverse
        ? 'Formal Adverse Event (Medical Care)'
        : isCrit
        ? 'Significant Clinical Event'
        : 'Routine Clinical Record',
      criticalReason: matched?.reason,
      sourceId: cond.id,
      targetTab: 'history',
    });
  });

  // 5. Severe Allergies / Formal Adverse Reactions to Medical Care
  patient.allergies.forEach((alg) => {
    const isFormalAdverse = alg.severity === 'Severe' && ADVERSE_EVENT_PATTERNS.test(`${alg.reaction} ${alg.substance}`);
    events.push({
      id: `tl-alg-${alg.id}`,
      date: alg.recordedDate,
      category: 'Allergy / Adverse Reaction',
      resourceType: isFormalAdverse ? 'AdverseEvent' : 'AllergyIntolerance',
      title: `Allergy: ${alg.substance} — ${alg.reaction}`,
      summary: `Severity: ${alg.severity} · ${alg.verified ? 'Verified' : 'Unverified'} · Source: ${alg.source}`,
      severity: isFormalAdverse ? 'Critical' : alg.severity === 'Severe' ? 'High' : 'Moderate',
      isCritical: isFormalAdverse,
      eventNature: isFormalAdverse ? 'Formal Adverse Event (Medical Care)' : 'Routine Clinical Record',
      criticalReason: isFormalAdverse
        ? `Severe life-threatening medication/treatment adverse reaction (${alg.reaction})`
        : undefined,
      sourceId: alg.id,
      targetTab: 'history',
    });
  });

  // 6. Emergency Admissions (ESI-1 / ESI-2) & Major Surgery Cases
  state.emergencyOrCases
    .filter((c) => c.patientId === patientId)
    .forEach((acute) => {
      const isHighAcuityEd = acute.kind === 'Emergency' && (acute.triageCategory === 'ESI-1' || acute.triageCategory === 'ESI-2');
      const isMajorSurgery = acute.kind === 'Surgery';
      const isCrit = isHighAcuityEd || isMajorSurgery;
      events.push({
        id: `tl-acute-${acute.id}`,
        date: state.encounters.find((e) => e.patientId === patientId)?.date || '2026-11-18',
        category: 'Procedure / Acute Care',
        resourceType: acute.kind === 'Surgery' ? 'Procedure' : 'Encounter',
        title: `${acute.kind}: ${acute.chiefOrProcedure}`,
        summary: `Location: ${acute.location} · Status: ${acute.status}${acute.triageCategory ? ` · Triage: ${acute.triageCategory}` : ''}`,
        severity: isCrit ? 'Critical' : 'Moderate',
        isCritical: isCrit,
        eventNature: isCrit ? 'Significant Clinical Event' : 'Routine Clinical Record',
        criticalReason: isMajorSurgery
          ? 'Major surgical procedure'
          : isHighAcuityEd
          ? `High-acuity emergency presentation (${acute.triageCategory})`
          : undefined,
        sourceId: acute.id,
        targetTab: 'overview',
      });
    });

  // 7. Imaging Reports (only critical acute findings such as acute stroke/PE/hemorrhage are critical)
  state.imagingReports
    .filter((img) => img.patientId === patientId)
    .forEach((img) => {
      const acuteFinding = /\b(acute\s+infarct|intracranial\s+hemorrhage|pulmonary\s+embolism|pneumothorax|aortic\s+dissection)\b/i.test(
        `${img.findings} ${img.impression}`
      );
      events.push({
        id: `tl-img-${img.id}`,
        date: img.performedAt,
        category: 'Imaging',
        resourceType: 'DiagnosticReport',
        title: `${img.modality}: ${img.studyName}`,
        summary: `${img.impression} · Status: ${img.status}`,
        severity: acuteFinding ? 'Critical' : 'Normal',
        isCritical: acuteFinding,
        eventNature: acuteFinding ? 'Significant Clinical Event' : 'Routine Clinical Record',
        criticalReason: acuteFinding ? 'Critical acute diagnostic imaging finding' : undefined,
        sourceId: img.id,
        targetTab: 'orders-results',
      });
    });

  // 8. Active/Draft Clinical Orders (non-critical workflow records)
  state.orders
    .filter((o) => o.patientId === patientId)
    .forEach((ord) => {
      events.push({
        id: `tl-ord-${ord.id}`,
        date: ord.createdAt,
        category: 'Order',
        resourceType: 'ServiceRequest',
        title: `${ord.category} Order: ${ord.name} (${ord.requisitionId})`,
        summary: `Priority: ${ord.priority} · Status: ${ord.status}`,
        severity: ord.priority === 'STAT' ? 'High' : 'Normal',
        isCritical: false,
        eventNature: 'Routine Clinical Record',
        sourceId: ord.id,
        targetTab: 'orders-results',
      });
    });

  // 9. Medications (routine prescription records)
  state.medications
    .filter((m) => m.patientId === patientId)
    .forEach((med) => {
      events.push({
        id: `tl-med-${med.id}`,
        date: med.startDate,
        category: 'Medication',
        resourceType: 'MedicationRequest',
        title: `${med.name} ${med.dose} (${med.frequency})`,
        summary: `Route: ${med.route}${med.duration ? ` · Duration: ${med.duration}` : ''} · Status: ${med.status}`,
        severity: 'Normal',
        isCritical: false,
        eventNature: 'Routine Clinical Record',
        sourceId: med.id,
        targetTab: 'medications',
      });
    });

  // 10. Follow-up Plans
  (state.followUpPlans || [])
    .filter((f) => f.patientId === patientId)
    .forEach((fp) => {
      events.push({
        id: `tl-fp-${fp.id}`,
        date: fp.createdAt,
        category: 'Care Plan',
        resourceType: 'CarePlan',
        title: `Follow-Up Plan (${fp.interval})`,
        summary: `${fp.instructions} · Reminder: ${fp.reminderStatus}`,
        severity: 'Normal',
        isCritical: false,
        eventNature: 'Routine Clinical Record',
        sourceId: fp.id,
        targetTab: 'care-plan',
      });
    });

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export function filterTimelineEvents(
  events: ClinicalTimelineEvent[],
  view: 'all' | 'critical',
  categoryFilter: string = 'All'
): ClinicalTimelineEvent[] {
  return events.filter((ev) => {
    if (view === 'critical' && !ev.isCritical) return false;
    if (categoryFilter !== 'All' && ev.category !== categoryFilter) return false;
    return true;
  });
}
