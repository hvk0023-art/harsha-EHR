import type {
  AppState,
  DataVerificationState,
  Patient,
  PatientTabKey,
  StaffRole,
} from '../types/hms';
import { evaluateDuplicateSafety } from './registrationIntelligence';

// ============================================================================
// 1. PATIENT KNOWLEDGE GRAPH (STRICTLY DERIVED FROM SYNTHETIC PATIENT RECORDS)
// ============================================================================

export type PatientGraphEntityType =
  | 'Patient'
  | 'Appointment'
  | 'Encounter'
  | 'Condition'
  | 'Allergy'
  | 'Observation'
  | 'Medication'
  | 'Lab Order'
  | 'Lab Result'
  | 'Imaging Report'
  | 'Document'
  | 'Follow-Up'
  | 'Task';

export interface PatientGraphNode {
  id: string;
  entityType: PatientGraphEntityType;
  label: string;
  sublabel: string;
  patientId: string;
  patientName: string;
  relationship: string;
  sourceRecord: string;
  date: string;
  verificationStatus: DataVerificationState;
  detail: string;
  targetTab: PatientTabKey;
  /** Ring level from center patient node: 0 = Patient, 1 = Primary Clinical Entity, 2 = Linked Child Record */
  ring: 0 | 1 | 2;
}

export interface PatientGraphEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
}

export interface PatientKnowledgeGraphData {
  patientId: string;
  patientName: string;
  nodes: PatientGraphNode[];
  edges: PatientGraphEdge[];
  isLimitedGraph: boolean;
  honestyNotice: string;
}

/**
 * Derives a real, source-linked Patient Knowledge Graph exclusively from records
 * present in AppState for the given synthetic patient. Never invents unsupported edges.
 */
export function buildPatientKnowledgeGraph(
  state: AppState,
  patientId: string
): PatientKnowledgeGraphData {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) {
    return {
      patientId,
      patientName: 'Unknown Patient',
      nodes: [],
      edges: [],
      isLimitedGraph: true,
      honestyNotice: 'Patient record not found in synthetic state.',
    };
  }

  const rootId = `kg-patient-${patient.id}`;
  const nodes: PatientGraphNode[] = [
    {
      id: rootId,
      entityType: 'Patient',
      label: patient.fullName,
      sublabel: `${patient.mrn} · DOB ${patient.dob}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Central Synthetic Patient Record',
      sourceRecord: `Patient/${patient.id} (${patient.mrn})`,
      date: patient.registrationVerifiedAt || '2026-11-18',
      verificationStatus:
        patient.registrationStatus === 'In Progress' ? 'Patient-Reported' : 'Verified',
      detail: `${patient.sex}, ${patient.age}y · ${patient.phone}${
        patient.abhaId ? ` · ABHA ${patient.abhaId}` : ' · ABHA optional (not linked)'
      }`,
      targetTab: 'overview',
      ring: 0,
    },
  ];
  const edges: PatientGraphEdge[] = [];

  // 1. Conditions
  patient.conditions.forEach((c) => {
    const nodeId = `kg-cond-${c.id}`;
    nodes.push({
      id: nodeId,
      entityType: 'Condition',
      label: c.name,
      sublabel: `ICD-10 ${c.icd10}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Condition',
      sourceRecord: `Condition/${c.id} (${c.source})`,
      date: c.onsetDate,
      verificationStatus: c.verified
        ? 'Verified'
        : c.source === 'Patient Reported'
        ? 'Patient-Reported'
        : 'External Awaiting Verification',
      detail: `Status: ${c.status} · Source: ${c.source} · Last reviewed: ${c.lastReviewed}`,
      targetTab: 'history',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'has condition',
    });
  });

  // 2. Allergies
  patient.allergies.forEach((a) => {
    const nodeId = `kg-alg-${a.id}`;
    nodes.push({
      id: nodeId,
      entityType: 'Allergy',
      label: `Allergy: ${a.substance}`,
      sublabel: `${a.severity} · ${a.reaction}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → AllergyIntolerance',
      sourceRecord: `Allergy/${a.id} (${a.source})`,
      date: a.recordedDate,
      verificationStatus: a.verified ? 'Verified' : 'External Awaiting Verification',
      detail: `Reaction: ${a.reaction} (${a.severity}) · Source: ${a.source}`,
      targetTab: 'overview',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'documented allergy',
    });
  });

  // 3. Scheduled Appointments
  const appts = state.appointments.filter(
    (a) => a.patientId === patient.id && a.status !== 'Cancelled'
  );
  appts.slice(0, 3).forEach((a) => {
    const nodeId = `kg-appt-${a.id}`;
    nodes.push({
      id: nodeId,
      entityType: 'Appointment',
      label: a.type,
      sublabel: `${a.date} · ${a.startTime} (${a.status})`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Scheduled Appointment',
      sourceRecord: `Appointment/${a.id}`,
      date: a.date,
      verificationStatus: 'Verified',
      detail: `Reason: ${a.reason} · Status: ${a.status}`,
      targetTab: 'overview',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'scheduled visit',
    });
  });

  // 4. Encounters
  const encounterNodeMap = new Map<string, string>();
  const encounters = state.encounters.filter((e) => e.patientId === patient.id);
  encounters.slice(0, 4).forEach((enc) => {
    const nodeId = `kg-enc-${enc.id}`;
    encounterNodeMap.set(enc.id, nodeId);
    nodes.push({
      id: nodeId,
      entityType: 'Encounter',
      label: enc.type,
      sublabel: `${enc.date} · SOAP ${enc.noteStatus}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Encounter (SOAP Note)',
      sourceRecord: `Encounter/${enc.id}`,
      date: enc.date,
      verificationStatus:
        enc.noteStatus === 'Signed' || enc.noteStatus === 'Amended'
          ? 'Verified'
          : 'AI-Extracted',
      detail: `Chief complaint: ${enc.chiefComplaint} · Note status: ${enc.noteStatus}${
        enc.signedBy ? ` (Signed by ${enc.signedBy})` : ''
      }`,
      targetTab: 'encounters',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'encounter',
    });
  });

  // 5. Latest Vitals Observation
  const vitals = state.vitals.filter((v) => v.patientId === patient.id);
  vitals.slice(0, 2).forEach((v) => {
    const nodeId = `kg-vit-${v.id}`;
    nodes.push({
      id: nodeId,
      entityType: 'Observation',
      label: `BP ${v.bpSystolic}/${v.bpDiastolic} mmHg`,
      sublabel: `HR ${v.heartRate} · SpO2 ${v.spo2}%`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Vital Observation',
      sourceRecord: `Observation/${v.id} (${v.source})`,
      date: v.recordedAt.slice(0, 10),
      verificationStatus: 'Verified',
      detail: `Recorded ${v.recordedAt} by ${v.recordedBy} · Temp ${v.tempF}°F · Wt ${v.weightKg} kg`,
      targetTab: 'encounters',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'clinical observation',
    });
  });

  // 6. Medications
  const meds = state.medications.filter(
    (m) => m.patientId === patient.id && m.status !== 'Discontinued'
  );
  meds.forEach((m) => {
    const nodeId = `kg-med-${m.id}`;
    nodes.push({
      id: nodeId,
      entityType: 'Medication',
      label: `${m.name} ${m.dose}`,
      sublabel: `${m.frequency} · ${m.reconciled ? 'Reconciled' : 'Unreconciled'}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Medication Statement',
      sourceRecord: `Medication/${m.id} (${m.pharmacy})`,
      date: m.startDate,
      verificationStatus: m.reconciled ? 'Verified' : 'External Awaiting Verification',
      detail: `${m.route} · ${m.frequency} · Status: ${m.status} · Pharmacy: ${m.pharmacy}`,
      targetTab: 'medications',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'medication statement',
    });
  });

  // 7. Documents (Consolidated & External Source Documents)
  const docNodeMap = new Map<string, string>();
  const docs = state.documents.filter((d) => d.patientId === patient.id);
  docs.forEach((d) => {
    const nodeId = `kg-doc-${d.id}`;
    docNodeMap.set(d.id, nodeId);
    nodes.push({
      id: nodeId,
      entityType: 'Document',
      label: d.title,
      sublabel: `${d.category} · ${d.source}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: 'Patient → Consolidated Source Document',
      sourceRecord: `Document/${d.id} (${d.source})`,
      date: d.date,
      verificationStatus: d.verified ? 'Verified' : 'External Awaiting Verification',
      detail: d.summary,
      targetTab: d.inboxItemId ? 'data-inbox' : 'documents-forms',
      ring: 1,
    });
    edges.push({
      id: `edge-${rootId}-${nodeId}`,
      fromId: rootId,
      toId: nodeId,
      label: 'source document',
    });
  });

  // 8. Clinical Orders (linked to Encounter when encounterId exists, otherwise Patient)
  const orderNodeMap = new Map<string, string>();
  const orders = state.orders.filter((o) => o.patientId === patient.id);
  orders.forEach((ord) => {
    const nodeId = `kg-ord-${ord.id}`;
    orderNodeMap.set(ord.id, nodeId);
    const parentId = (ord.encounterId && encounterNodeMap.get(ord.encounterId)) || rootId;
    nodes.push({
      id: nodeId,
      entityType: 'Lab Order',
      label: ord.name,
      sublabel: `${ord.requisitionId} · ${ord.status}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship:
        parentId === rootId
          ? 'Patient → Clinical Order'
          : 'Patient → Encounter → Laboratory Order',
      sourceRecord: `ServiceRequest/${ord.id} (${ord.requisitionId})`,
      date: ord.createdAt,
      verificationStatus: ord.status === 'Draft' ? 'AI-Extracted' : 'Verified',
      detail: `Category: ${ord.category} · Priority: ${ord.priority} · Code: ${ord.code}`,
      targetTab: 'orders-results',
      ring: parentId === rootId ? 1 : 2,
    });
    edges.push({
      id: `edge-${parentId}-${nodeId}`,
      fromId: parentId,
      toId: nodeId,
      label: 'ordered',
    });
  });

  // 9. Lab Results (linked to Lab Order OR Source Document OR Patient)
  const labs = state.labResults.filter((l) => l.patientId === patient.id);
  labs.forEach((lab) => {
    const nodeId = `kg-lab-${lab.id}`;
    const orderParent = orderNodeMap.get(lab.orderId);
    const docParent = lab.sourceDocumentId ? docNodeMap.get(lab.sourceDocumentId) : undefined;
    const parentId = orderParent || docParent || rootId;
    const relationship = orderParent
      ? 'Patient → Encounter → Laboratory Order → Result'
      : docParent
      ? 'Patient → Source Document → Verified Lab Result'
      : 'Patient → Laboratory Result';

    nodes.push({
      id: nodeId,
      entityType: 'Lab Result',
      label: `${lab.testName}: ${lab.value} ${lab.unit}`.trim(),
      sublabel: `${lab.flag} · ${lab.status}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship,
      sourceRecord: lab.sourceLabel
        ? `DiagnosticReport/${lab.id} (${lab.sourceLabel})`
        : `DiagnosticReport/${lab.id}`,
      date: lab.collectionDate,
      verificationStatus:
        lab.status === 'Reviewed' || lab.status === 'Final'
          ? 'Verified'
          : 'External Awaiting Verification',
      detail: `Value: ${lab.value} ${lab.unit} · Ref ${lab.referenceInterval} · Flag: ${lab.flag} · Status: ${lab.status}`,
      targetTab: 'orders-results',
      ring: parentId === rootId ? 1 : 2,
    });
    edges.push({
      id: `edge-${parentId}-${nodeId}`,
      fromId: parentId,
      toId: nodeId,
      label: orderParent ? 'resulted in' : docParent ? 'extracted & verified' : 'lab result',
    });
  });

  // 10. Imaging Reports (linked to Source Document or Patient)
  const imaging = state.imagingReports.filter((img) => img.patientId === patient.id);
  imaging.forEach((img) => {
    const nodeId = `kg-img-${img.id}`;
    const docParent = img.sourceDocumentId ? docNodeMap.get(img.sourceDocumentId) : undefined;
    const parentId = docParent || rootId;
    nodes.push({
      id: nodeId,
      entityType: 'Imaging Report',
      label: `${img.modality}: ${img.studyName}`,
      sublabel: `${img.status} · ${img.performedAt}`,
      patientId: patient.id,
      patientName: patient.fullName,
      relationship: docParent
        ? 'Patient → Source Document → Imaging Report'
        : 'Patient → Imaging Report',
      sourceRecord: img.sourceLabel
        ? `ImagingReport/${img.id} (${img.sourceLabel})`
        : `ImagingReport/${img.id}`,
      date: img.performedAt,
      verificationStatus:
        img.status === 'Reviewed' || img.status === 'Final'
          ? 'Verified'
          : 'External Awaiting Verification',
      detail: `Impression: ${img.impression} · Radiologist: ${img.radiologist}`,
      targetTab: 'orders-results',
      ring: parentId === rootId ? 1 : 2,
    });
    edges.push({
      id: `edge-${parentId}-${nodeId}`,
      fromId: parentId,
      toId: nodeId,
      label: docParent ? 'extracted & verified' : 'imaging report',
    });
  });

  // 11. Follow-up plans
  (state.followUpPlans || [])
    .filter((fp) => fp.patientId === patient.id)
    .forEach((fp) => {
      const nodeId = `kg-fp-${fp.id}`;
      const parentId = (fp.encounterId && encounterNodeMap.get(fp.encounterId)) || rootId;
      nodes.push({
        id: nodeId,
        entityType: 'Follow-Up',
        label: `Follow-Up (${fp.interval})`,
        sublabel: fp.reminderStatus,
        patientId: patient.id,
        patientName: patient.fullName,
        relationship: 'Patient → Follow-Up Activity',
        sourceRecord: `CarePlan/${fp.id}`,
        date: fp.createdAt,
        verificationStatus: 'Verified',
        detail: fp.instructions,
        targetTab: 'care-plan',
        ring: parentId === rootId ? 1 : 2,
      });
      edges.push({
        id: `edge-${parentId}-${nodeId}`,
        fromId: parentId,
        toId: nodeId,
        label: 'follow-up plan',
      });
    });

  const nonPatientCount = nodes.length - 1;
  const isLimitedGraph = nonPatientCount < 3;
  const honestyNotice = isLimitedGraph
    ? `Limited graph (${nonPatientCount} linked record${nonPatientCount === 1 ? '' : 's'} currently on file). EigenH displays only real synthetic records from this chart and never fabricates relationships.`
    : `${nonPatientCount} source-linked clinical entities and ${edges.length} verified relationships derived strictly from ${patient.fullName}’s synthetic EHR records.`;

  return {
    patientId: patient.id,
    patientName: patient.fullName,
    nodes,
    edges,
    isLimitedGraph,
    honestyNotice,
  };
}

// ============================================================================
// 2. WORLD KNOWLEDGE REFERENCE LAYER (STRICTLY SEPARATED FROM PATIENT RECORD)
// ============================================================================

export interface WorldKnowledgeReference {
  id: string;
  concept: string;
  standardCode: string;
  relationshipType: string;
  relatedConcept: string;
  referenceSummary: string;
  sourceName: string;
  sourceVersion: string;
  marketApplicability: string;
  matchKeywords: string[];
  governanceDisclaimer: string;
}

/**
 * Curated static subset of general medical reference metadata.
 * Strictly separated from individual patient records: never asserts patient diagnoses,
 * never queries a live terminology server, and never executes autonomous clinical rules.
 */
export const WORLD_KNOWLEDGE_REFERENCE_ENTRIES: readonly WorldKnowledgeReference[] = [
  {
    id: 'wk-dm2-hba1c',
    concept: 'Type 2 Diabetes Mellitus (ICD-10: E11.9)',
    standardCode: 'ICD-10 E11.9 ↔ LOINC 4548-4 (HbA1c)',
    relationshipType: 'Standard Diagnostic Monitoring Terminology',
    relatedConcept: 'Glycated Haemoglobin (HbA1c) & Fasting Blood Glucose',
    referenceSummary:
      'General medical terminology links Type 2 Diabetes Mellitus monitoring concepts to standardized Regenstrief LOINC HbA1c and fasting glucose assays for documentation completeness.',
    sourceName: 'WHO ICD-10 · US CDC/NCHS ICD-10-CM · Regenstrief LOINC · RSSDI India Reference',
    sourceVersion: 'WHO ICD-10 (2019) / US CDC-NCHS ICD-10-CM FY2027 · LOINC v2.83 (Aug 2026)',
    marketApplicability: 'India (WHO ICD-10 / ABDM & RSSDI) · US (CDC/NCHS ICD-10-CM)',
    matchKeywords: ['diabetes', 'e11', 'hba1c', 'glucose', 'metformin'],
    governanceDisclaimer:
      'Curated static reference metadata only — NOT a patient diagnosis, treatment rule, or live terminology server.',
  },
  {
    id: 'wk-ckd-egfr',
    concept: 'Chronic Kidney Disease (ICD-10: N18.x)',
    standardCode: 'ICD-10-CM N18.31/N18.32 (WHO ICD-10 N18.3) ↔ LOINC 62238-1 (eGFR CKD-EPI)',
    relationshipType: 'Standard Renal Biomarker Reference Mapping',
    relatedConcept: 'Estimated Glomerular Filtration Rate (eGFR) & Serum Potassium',
    referenceSummary:
      'Reference terminology associates CKD staging nomenclature (WHO ICD-10 N18.3 globally; US CDC/NCHS ICD-10-CM N18.31/N18.32 sub-stages in US charts) with eGFR (CKD-EPI) and electrolyte codes for HL7 FHIR R4 reporting.',
    sourceName: 'KDIGO 2024 CKD Guideline · WHO ICD-10 & US CDC/NCHS ICD-10-CM · Regenstrief LOINC',
    sourceVersion: 'KDIGO 2024 · LOINC v2.83 (Aug 2026)',
    marketApplicability: 'Global / India (WHO ICD-10 N18.3) · US Nephrology (CDC/NCHS ICD-10-CM N18.31/N18.32)',
    matchKeywords: ['kidney', 'ckd', 'egfr', 'n18', 'creatinine', 'potassium'],
    governanceDisclaimer:
      'Curated static reference metadata only — does not diagnose or stage an individual patient automatically.',
  },
  {
    id: 'wk-htn-bp',
    concept: 'Essential Hypertension (ICD-10: I10)',
    standardCode: 'ICD-10 I10 ↔ LOINC 85354-9 (Blood Pressure Panel)',
    relationshipType: 'Standard Vital Sign Observation Mapping',
    relatedConcept: 'Systolic & Diastolic Blood Pressure Documentation',
    referenceSummary:
      'Reference terminology maps essential hypertension documentation to standardized HL7 FHIR R4 Blood Pressure Observation panels (systolic + diastolic mmHg).',
    sourceName: 'WHO ICD-10 · US CDC/NCHS ICD-10-CM · Regenstrief LOINC · HL7 FHIR R4',
    sourceVersion: 'WHO ICD-10 (2019) / US CDC-NCHS ICD-10-CM FY2027 · LOINC v2.83 (Aug 2026) · FHIR R4 4.0.1',
    marketApplicability: 'India (WHO ICD-10 / ABDM FHIR R4) · US (CDC/NCHS ICD-10-CM / US Core FHIR R4)',
    matchKeywords: ['hypertension', 'i10', 'blood pressure', 'telmisartan', 'lisinopril', 'amlodipine'],
    governanceDisclaimer:
      'Curated static reference metadata only — clinician evaluation is required for any patient-specific interpretation.',
  },
];

export function findRelatedWorldReferences(
  state: AppState,
  patientId: string
): { reference: WorldKnowledgeReference; matchedPatientTerms: string[] }[] {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return [];

  const searchableTokens: string[] = [
    ...patient.conditions.map((c) => `${c.name} ${c.icd10}`),
    ...state.labResults.filter((l) => l.patientId === patientId).map((l) => l.testName),
    ...state.medications.filter((m) => m.patientId === patientId).map((m) => m.name),
  ];
  const joined = searchableTokens.join(' ').toLowerCase();

  return WORLD_KNOWLEDGE_REFERENCE_ENTRIES.map((ref) => {
    const matched = ref.matchKeywords.filter((kw) => joined.includes(kw));
    return { reference: ref, matchedPatientTerms: matched };
  }).filter((item) => item.matchedPatientTerms.length > 0);
}

// ============================================================================
// 3. EIGENH CLINICAL INTELLIGENCE — EXPLAINABLE WORKFLOW RECOMMENDATIONS
// ============================================================================

export type ExplainableRecommendationCategory =
  | 'Missing Clinical Information'
  | 'Unverified Extracted Information'
  | 'Missing Medication Reconciliation'
  | 'Unreviewed Laboratory Result'
  | 'Duplicate Identity Review'
  | 'Incomplete Intake Preparation'
  | 'Historical Information for Review';

export interface ExplainableRecommendation {
  id: string;
  patientId: string;
  category: ExplainableRecommendationCategory;
  priority: 'High' | 'Medium' | 'Advisory';
  whatSuggested: string;
  whyAppeared: string;
  supportingPatientInfo: string;
  supportingReference?: string;
  uncertaintyNote: string;
  responsibleReviewer: StaffRole;
  targetTab: PatientTabKey;
  status: 'Open' | 'Accepted' | 'Reviewed' | 'Dismissed';
  decidedBy?: string;
  decidedAt?: string;
  safetyBoundary: string;
}

/**
 * Generates contextual, explainable documentation-quality, workflow-coordination,
 * and missing-information recommendations for a patient.
 * Explicitly excludes autonomous diagnosis, prescribing, or note-signing.
 */
export function buildExplainableRecommendations(
  state: AppState,
  patientId: string
): ExplainableRecommendation[] {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return [];

  const decisions = state.recommendationDecisions || {};
  const recs: ExplainableRecommendation[] = [];
  const safetyBoundary =
    'Documentation & workflow advisory only — EigenH AI never autonomously diagnoses, prescribes, or signs notes.';

  const attachDecision = (
    base: Omit<ExplainableRecommendation, 'status' | 'decidedBy' | 'decidedAt' | 'safetyBoundary'>
  ): ExplainableRecommendation => {
    const dec = decisions[base.id];
    return {
      ...base,
      status: dec?.status || 'Open',
      decidedBy: dec?.decidedBy,
      decidedAt: dec?.decidedAt,
      safetyBoundary,
    };
  };

  // 1. Missing allergy confirmation / documented allergy status when external doc left it blank
  if (patient.allergies.length === 0) {
    recs.push(
      attachDecision({
        id: `rec-missing-allergy-${patient.id}`,
        patientId: patient.id,
        category: 'Missing Clinical Information',
        priority: 'High',
        whatSuggested: 'Verify allergy status (confirm NKDA or document drug allergies) before clinical consultation',
        whyAppeared:
          'No verified allergy entries are currently recorded on this patient’s profile, and imported external summaries did not contain a confirmed allergy list.',
        supportingPatientInfo: `${patient.fullName} (${patient.mrn}) · Allergies on file: 0`,
        supportingReference: 'Standard Pre-Visit Intake Safety Checklist (Local EHR Policy)',
        uncertaintyNote:
          'Absence of documented allergies does not confirm No Known Drug Allergies (NKDA) until staff explicitly verify with the patient.',
        responsibleReviewer: 'Medical Assistant',
        targetTab: 'overview',
      })
    );
  }

  // 2. Unverified extracted fields still pending in Patient Data Inbox
  const pendingInboxItems = (state.dataInboxItems || []).filter(
    (item) =>
      (item.confirmedPatientId === patient.id || item.candidatePatientIds.includes(patient.id)) &&
      item.status !== 'Verified & Consolidated' &&
      item.status !== 'Rejected'
  );
  if (pendingInboxItems.length > 0) {
    const totalPendingFields = pendingInboxItems.reduce(
      (sum, item) => sum + item.extractedFields.filter((f) => f.decision === 'Pending').length,
      0
    );
    const uncertainCount = pendingInboxItems.reduce(
      (sum, item) => sum + item.extractedFields.filter((f) => f.uncertain && f.decision === 'Pending').length,
      0
    );
    recs.push(
      attachDecision({
        id: `rec-unverified-inbox-${patient.id}`,
        patientId: patient.id,
        category: 'Unverified Extracted Information',
        priority: 'High',
        whatSuggested: `Review ${pendingInboxItems.length} incoming document(s) with ${totalPendingFields} pending AI-extracted field(s) in Patient Data Inbox`,
        whyAppeared:
          uncertainCount > 0
            ? `${uncertainCount} extracted field(s) are flagged Uncertain due to low source clarity and require explicit human approval before entering the chart.`
            : 'External patient documents were uploaded and classified but await staff verification before consolidation.',
        supportingPatientInfo: pendingInboxItems.map((d) => `${d.title} (${d.status})`).join('; '),
        uncertaintyNote:
          'Automated extraction is assistive only and must be checked against the original document preview.',
        responsibleReviewer: 'Front Desk',
        targetTab: 'data-inbox',
      })
    );
  }

  // 3. Unreconciled medications
  const unreconciledMeds = state.medications.filter(
    (m) => m.patientId === patient.id && m.status !== 'Discontinued' && !m.reconciled
  );
  if (unreconciledMeds.length > 0) {
    recs.push(
      attachDecision({
        id: `rec-med-reconcile-${patient.id}`,
        patientId: patient.id,
        category: 'Missing Medication Reconciliation',
        priority: 'Medium',
        whatSuggested: `Reconcile ${unreconciledMeds.length} active or imported medication(s) with the patient`,
        whyAppeared:
          'One or more medications were imported from outside summaries or prior charts without current-visit dose and adherence confirmation.',
        supportingPatientInfo: unreconciledMeds
          .map((m) => `${m.name} ${m.dose} (${m.frequency})`)
          .join(', '),
        supportingReference: 'Medication Reconciliation Intake Standard',
        uncertaintyNote:
          'Imported pharmacy or clinic lists may not reflect recent over-the-counter changes or dose adjustments.',
        responsibleReviewer: 'Nurse Practitioner',
        targetTab: 'medications',
      })
    );
  }

  // 4. Unreviewed abnormal or newly consolidated laboratory results
  const unreviewedLabs = state.labResults.filter(
    (l) => l.patientId === patient.id && l.status !== 'Reviewed'
  );
  if (unreviewedLabs.length > 0) {
    recs.push(
      attachDecision({
        id: `rec-unreviewed-labs-${patient.id}`,
        patientId: patient.id,
        category: 'Unreviewed Laboratory Result',
        priority: unreviewedLabs.some((l) => l.flag === 'Critical' || l.flag === 'Abnormal')
          ? 'High'
          : 'Medium',
        whatSuggested: `Flag ${unreviewedLabs.length} unreviewed laboratory result(s) for clinician review before visit`,
        whyAppeared:
          'Structured laboratory values are present on the patient chart (including consolidated external reports) and have not yet been marked Reviewed by a clinician.',
        supportingPatientInfo: unreviewedLabs
          .map((l) => `${l.testName}: ${l.value} ${l.unit} (${l.flag})`)
          .join(' · '),
        supportingReference: 'Regenstrief LOINC v2.83 (Aug 2026) Diagnostic Report Review Workflow',
        uncertaintyNote:
          'External lab reference intervals may vary by laboratory methodology; inspect original PDF report.',
        responsibleReviewer: 'Clinician',
        targetTab: 'orders-results',
      })
    );
  }

  // 5. Missing emergency contact / caregiver during registration
  if (patient.caregivers.length === 0) {
    recs.push(
      attachDecision({
        id: `rec-missing-emergency-contact-${patient.id}`,
        patientId: patient.id,
        category: 'Incomplete Intake Preparation',
        priority: 'Advisory',
        whatSuggested: 'Capture an emergency contact / family caregiver prior to rooming',
        whyAppeared:
          'No emergency contact or next-of-kin record is currently linked to this patient profile.',
        supportingPatientInfo: `${patient.fullName} (${patient.mrn}) · Caregivers on file: 0`,
        uncertaintyNote: 'Required by hospital front-desk registration completeness standards.',
        responsibleReviewer: 'Front Desk',
        targetTab: 'overview',
      })
    );
  }

  // 6. Possible duplicate record warning (non-merging advisory)
  const otherPatients = state.patients.filter((p) => p.id !== patient.id);
  const dupMatches = evaluateDuplicateSafety(otherPatients, {
    fullName: patient.fullName,
    dob: patient.dob,
    phone: patient.phone,
    email: patient.email,
  });
  if (dupMatches.length > 0) {
    const top = dupMatches[0];
    recs.push(
      attachDecision({
        id: `rec-duplicate-review-${patient.id}`,
        patientId: patient.id,
        category: 'Duplicate Identity Review',
        priority: top.mergeAllowed ? 'High' : 'Advisory',
        whatSuggested: `Confirm identity separation from ${top.patient.fullName} (${top.patient.mrn})`,
        whyAppeared: `${top.tier}: ${top.reasons.join(', ')}. ${top.safetyExplanation}`,
        supportingPatientInfo: `${patient.fullName} (DOB ${patient.dob}) vs ${top.patient.fullName} (DOB ${top.patient.dob})`,
        uncertaintyNote:
          'Never merge charts on name alone; confirm two independent identifiers with the patient.',
        responsibleReviewer: 'Front Desk',
        targetTab: 'overview',
      })
    );
  }

  // 7. Unverified external condition awaiting clinician confirmation
  const unverifiedConds = patient.conditions.filter((c) => !c.verified);
  if (unverifiedConds.length > 0) {
    recs.push(
      attachDecision({
        id: `rec-external-cond-${patient.id}`,
        patientId: patient.id,
        category: 'Historical Information for Review',
        priority: 'Medium',
        whatSuggested: `Verify ${unverifiedConds.length} externally sourced condition(s) before clinical charting`,
        whyAppeared:
          'External clinical summaries contain active diagnosis entries that have not been reconciled into the verified problem list.',
        supportingPatientInfo: unverifiedConds
          .map((c) => `${c.name} (${c.icd10}) — ${c.source}`)
          .join('; '),
        supportingReference: 'WHO ICD-10 / US CDC-NCHS ICD-10-CM Problem List Verification',
        uncertaintyNote:
          'External conditions remain labeled unverified until confirmed by an authorized clinician.',
        responsibleReviewer: 'Clinician',
        targetTab: 'overview',
      })
    );
  }

  return recs;
}
