import { classifySyntheticDocument } from '../state/registrationIntelligence';
import type {
  ActionComposerInput,
  ActionComposerOutput,
  AmbientScribeV2Input,
  AmbientScribeV2Output,
  ChartQueryPlan,
  ChartSearchOutput,
  ClinicalSourceReference,
  ComposedClinicalActionProposal,
  DocumentExtractedFieldProposal,
  DocumentIntelligenceInput,
  DocumentIntelligenceOutput,
  ExtractedLabMeasurement,
  PreConsultationBriefClaim,
  PreConsultationBriefOutput,
  SupportedDocumentType,
} from './clinicalAiTypes';
import type { PermittedPatientContext } from './patientContextBuilder';

function mapInboxCategoryToSupportedDocType(cat: string): SupportedDocumentType {
  if (cat === 'Laboratory Report') return 'Laboratory Report';
  if (cat === 'Discharge Summary') return 'Discharge Summary';
  if (cat === 'Medication Record' || cat === 'Pharmacy Information') return 'Prescription Document';
  if (cat === 'Imaging Report') return 'Imaging Report';
  if (cat === 'Clinical Consultation Note' || cat === 'Previous Medical History') {
    return 'Clinical Consultation Note';
  }
  return 'Other Medical Document';
}

/**
 * Parses actual synthetic document text (lab reports, discharge summaries,
 * prescriptions, imaging reports, consultation notes) into structured extraction
 * proposals without hardcoding unrelated results and without inventing missing
 * reference ranges.
 */
export function runDeterministicDocumentIntelligence(
  input: DocumentIntelligenceInput
): DocumentIntelligenceOutput {
  const raw = input.rawText.trim();
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const classified = classifySyntheticDocument(input.title, raw);
  const documentType = mapInboxCategoryToSupportedDocType(classified);

  // Extract patient identity strictly from document text
  const nameMatch = raw.match(/(?:Patient|Name|Patient Name)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{2,48})/i);
  const dobMatch = raw.match(/(?:DOB|Date of Birth)\s*[:\-]\s*(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  const phoneMatch = raw.match(/(?:Phone|Mobile|Tel|Contact)\s*[:\-]\s*([+\d][\d\s\-()]{7,18})/i);
  const mrnMatch = raw.match(/(?:MRN|Patient ID|External ID|Reg No)\s*[:\-]\s*([A-Za-z0-9\-]+)/i);
  const abhaMatch = raw.match(/(?:ABHA)\s*[:\-]\s*([0-9\-]{8,20})/i);
  const dateMatch = raw.match(/(?:Sample Date|Collected|Report Date|Date|Performed|Dispensed|Discharge Date)\s*[:\-]\s*(\d{4}-\d{2}-\d{2}|\d{2}\s+[A-Za-z]{3,9}\s+\d{4})/i);
  const labOrgMatch = raw.match(/(?:Lab|Laboratory|Facility|Hospital|Clinic|Pharmacy)\s*[:\-]\s*([^\n]{3,80})/i);

  const extractedIdentity = {
    fullName: nameMatch?.[1]?.split(/\s*\(|\s*\||\,/)[0]?.trim() || 'Not stated in source document',
    dob: dobMatch?.[1]?.trim(),
    phone: phoneMatch?.[1]?.trim(),
    mrnOrExternalId: mrnMatch?.[1]?.trim(),
    abhaOptional: abhaMatch?.[1]?.trim(),
  };

  const documentDate = dateMatch?.[1]?.trim() || input.documentDate || 'Not stated';
  const labIdentity = labOrgMatch?.[1]?.trim() || input.sourceOrganization || 'Not stated';

  const labMeasurements: ExtractedLabMeasurement[] = [];
  const extractedFields: DocumentExtractedFieldProposal[] = [];
  const missingOrAmbiguousFlags: string[] = [];

  if (!extractedIdentity.dob && !extractedIdentity.phone && !extractedIdentity.mrnOrExternalId) {
    missingOrAmbiguousFlags.push(
      'Missing secondary patient identifier (DOB, phone, or MRN) — name-only patient matching is blocked.'
    );
  }

  // Parse lab lines: e.g. "HbA1c: 7.4 % (Ref: 4.0 - 5.6%)" or "Serum Creatinine: 1.42 mg/dL"
  const labPattern =
    /^[-•*]?\s*([A-Za-z][A-Za-z0-9\s/()+\-]{1,42}?)\s*[:\-=]\s*([<>]?\s*\d+(?:\.\d+)?)\s*(%|mg\/dL|g\/dL|mmol\/L|mEq\/L|mL\/min\/1\.73m[2²]|mL\/min|mg\/g|U\/L|IU\/L|uIU\/mL|mIU\/L|ng\/mL|pg\/mL|k\/uL|10\^3\/uL|ratio|mmHg|sec|s)?(?:\s*(?:\(([^)]+)\)|\[([^\]]+)\]|Ref(?:erence)?\s*(?:Range)?\s*[:\-]?\s*([^\n;]+)))?/i;

  const medPattern =
    /(?:Rx|Medication|Drug|Dispensed|Continue|Start|Tab\.?|Cap\.?)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9\s\-]{2,36})\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|g|mL|units|IU))(?:\s+([^\n.;]{2,45}))?/i;

  const diagPattern =
    /(?:Diagnosis|Diagnoses|Impression|Condition|Assessment|Problem)\s*[:\-]\s*([^\n]{4,140})/i;

  const allergyPattern = /(?:Allerg(?:y|ies))\s*[:\-]\s*([^\n]{3,120})/i;

  let fieldIndex = 1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(Patient|Name|DOB|Date|Phone|Mobile|MRN|ABHA|Sample|Report|Collected|Lab|Hospital|Clinic|Pharmacy|Facility)\s*[:\-]/i.test(line)) {
      continue;
    }

    const allergyHit = line.match(allergyPattern);
    if (allergyHit) {
      const val = allergyHit[1].trim();
      const isUnclear = /unknown|not documented|unverified|pending/i.test(val);
      extractedFields.push({
        id: `det-f-${input.documentId}-${fieldIndex++}`,
        label: 'Documented Allergy Statement',
        value: val,
        targetSection: 'Allergy',
        sourceLocation: `Line ${i + 1}`,
        sourceSnippet: line,
        confidence: isUnclear ? 'Low' : 'High',
        uncertain: isUnclear,
        uncertaintyReason: isUnclear
          ? 'Allergy status in document is incomplete or unverified — confirm directly with patient.'
          : undefined,
      });
      continue;
    }

    const labHit = line.match(labPattern);
    if (labHit) {
      const testName = labHit[1].trim();
      const origVal = labHit[2].replace(/\s+/g, '');
      const origUnit = (labHit[3] || '').trim() || 'Not stated';
      const parenMeta = (labHit[4] || labHit[5] || labHit[6] || '').trim();
      const refMatch = parenMeta.match(/(?:Ref(?:erence)?\s*(?:Range)?\s*[:\-]?\s*)?([<>]?\s*\d+(?:\.\d+)?(?:\s*[-–to]+\s*\d+(?:\.\d+)?)?[^,;]*)/i);
      const hasRef = Boolean(refMatch && /(?:ref|normal|range|<|>|\d+\s*[-–]\s*\d+)/i.test(parenMeta));
      const referenceRange = hasRef && refMatch ? refMatch[1].trim() : 'Not stated in source document';
      const flag: ExtractedLabMeasurement['flag'] = /\bcritical|panic|alert\b/i.test(line)
        ? 'Critical'
        : /\bhigh|low|abnormal|elevated|borderline|\(H\)|\(L\)\b/i.test(line)
        ? 'Abnormal'
        : /\bnormal\b/i.test(line)
        ? 'Normal'
        : 'Unspecified';

      const uncertain =
        !hasRef ||
        origUnit === 'Not stated' ||
        /unclear|blurred|ambiguous|approx|illegible|pending/i.test(line);
      const uncertaintyReason = !hasRef
        ? 'Reference range not printed in source document (never invented by AI — verify against original lab sheet).'
        : origUnit === 'Not stated'
        ? 'Measurement unit missing in source document — do not silently normalize.'
        : uncertain
        ? 'Ambiguous wording or unverified external value detected in source line.'
        : undefined;

      if (!hasRef) {
        missingOrAmbiguousFlags.push(`Missing reference range for ${testName} (${origVal} ${origUnit}).`);
      }

      labMeasurements.push({
        testName,
        originalValue: origVal,
        originalUnit: origUnit,
        referenceRange,
        sampleOrResultDate: documentDate,
        laboratoryIdentity: labIdentity,
        flag,
        sourceSnippet: line,
        uncertain,
        uncertaintyReason,
      });

      extractedFields.push({
        id: `det-f-${input.documentId}-${fieldIndex++}`,
        label: testName,
        value: origUnit !== 'Not stated' ? `${origVal} ${origUnit}` : origVal,
        originalUnit: origUnit,
        referenceRange,
        targetSection: 'Lab',
        sourceLocation: `Line ${i + 1}`,
        sourceSnippet: line,
        confidence: uncertain ? 'Medium' : 'High',
        uncertain,
        uncertaintyReason,
        metadata: {
          testName,
          value: origVal,
          numericValue: origVal.replace(/[^\d.]/g, ''),
          unit: origUnit === 'Not stated' ? '' : origUnit,
          referenceInterval: referenceRange,
          flag: flag === 'Unspecified' ? 'Normal' : flag,
        },
      });
      continue;
    }

    const medHit = line.match(medPattern);
    if (medHit) {
      const medName = medHit[1].trim();
      const dose = medHit[2].trim();
      const freq = (medHit[3] || '').trim() || 'Frequency not stated in source';
      const missingFreq = !medHit[3] || /unclear|missing|unknown/i.test(freq);
      extractedFields.push({
        id: `det-f-${input.documentId}-${fieldIndex++}`,
        label: `Medication: ${medName}`,
        value: `${medName} ${dose}${medHit[3] ? ` — ${freq}` : ''}`,
        targetSection: 'Medication',
        sourceLocation: `Line ${i + 1}`,
        sourceSnippet: line,
        confidence: missingFreq ? 'Medium' : 'High',
        uncertain: missingFreq,
        uncertaintyReason: missingFreq
          ? 'Dosing frequency or duration incomplete in source document; confirm before reconciling.'
          : undefined,
        metadata: {
          medName,
          dose,
          frequency: freq,
          pharmacy: labIdentity,
        },
      });
      continue;
    }

    const diagHit = line.match(diagPattern);
    if (diagHit) {
      const content = diagHit[1].trim();
      const isImaging = documentType === 'Imaging Report' || /ultrasound|ct|mri|x-ray|radiograph|echocardiogram|sonography/i.test(raw);
      extractedFields.push({
        id: `det-f-${input.documentId}-${fieldIndex++}`,
        label: isImaging ? 'Imaging Impression' : 'Documented Condition / Assessment',
        value: content,
        targetSection: isImaging ? 'Imaging' : 'Condition',
        sourceLocation: `Line ${i + 1}`,
        sourceSnippet: line,
        confidence: 'Medium',
        uncertain: /possible|rule out|probable|suspected|\?/i.test(content),
        uncertaintyReason: /possible|rule out|probable|suspected|\?/i.test(content)
          ? 'Provisional or uncertain clinical wording in source text — clinician verification required.'
          : undefined,
        metadata: isImaging
          ? { studyName: input.title, impression: content, findings: content, modality: 'Ultrasound' }
          : { conditionName: content },
      });
    }
  }

  // Fallback if document is narrative text (e.g. discharge summary or consultation note)
  if (extractedFields.length === 0) {
    const snippet = lines.slice(0, 3).join(' ').slice(0, 220);
    extractedFields.push({
      id: `det-f-${input.documentId}-1`,
      label: `${documentType} Narrative Extract`,
      value: snippet || raw.slice(0, 200),
      targetSection: documentType === 'Imaging Report' ? 'Imaging' : 'History',
      sourceLocation: 'Lines 1–3',
      sourceSnippet: snippet || raw.slice(0, 180),
      confidence: 'Medium',
      uncertain: true,
      uncertaintyReason:
        'Unstructured narrative document — verify clinical details before filing into structured chart sections.',
      metadata: {
        title: input.title,
        historyCategory: 'Medical',
      },
    });
    missingOrAmbiguousFlags.push(
      'No structured lab/medication lines detected automatically; narrative excerpt staged for manual staff verification.'
    );
  }

  return {
    documentType,
    documentDate,
    laboratoryOrFacilityIdentity: labIdentity,
    extractedPatientIdentity: extractedIdentity,
    summary: `Deterministic parser extracted ${extractedFields.length} reviewable field(s) (${labMeasurements.length} lab measurement(s)) from "${input.title}" (${documentType}).`,
    labMeasurements,
    extractedFields,
    missingOrAmbiguousFlags: Array.from(new Set(missingOrAmbiguousFlags)),
    identitySafetyNote:
      'Never merge or file into a patient chart on name alone; verify DOB, phone number, MRN, or ABHA against the source document.',
  };
}

/**
 * Deterministic fallback/demo Pre-Consultation Brief synthesized strictly from
 * permitted longitudinal patient context with concrete sourceIds.
 */
export function runDeterministicPreConsultationBrief(
  ctx: PermittedPatientContext
): PreConsultationBriefOutput {
  const { patient, vitals, labs, imaging, medications, encounters, documents, inboxItems, tasks, appointments } = ctx;
  const sections: PreConsultationBriefClaim[] = [];
  const bullets: { text: string; sourceIds: string[] }[] = [];

  const nextAppt = appointments.find((a) => a.status !== 'Cancelled' && a.status !== 'Completed') || appointments[0];
  if (nextAppt) {
    const detail = `${nextAppt.type} (${nextAppt.date} ${nextAppt.startTime}, ${nextAppt.status}): ${nextAppt.reason}.`;
    bullets.push({ text: `Visit focus: ${nextAppt.reason}`, sourceIds: [nextAppt.id] });
    sections.push({
      id: 'det-brief-reason',
      section: 'Reason for Visit',
      headline: nextAppt.type,
      detail,
      sourceIds: [nextAppt.id],
      evidenceType: 'Source-Grounded Fact',
    });
  } else if (patient.chiefConcern) {
    bullets.push({ text: `Chief concern: ${patient.chiefConcern}`, sourceIds: [patient.id] });
    sections.push({
      id: 'det-brief-reason',
      section: 'Reason for Visit',
      headline: 'Documented Chief Concern',
      detail: patient.chiefConcern,
      sourceIds: [patient.id],
      evidenceType: 'Source-Grounded Fact',
    });
  }

  if (patient.conditions.length > 0) {
    const condIds = patient.conditions.map((c) => c.id);
    sections.push({
      id: 'det-brief-history',
      section: 'Relevant Medical History',
      headline: `${patient.conditions.length} Active / Documented Condition(s)`,
      detail: patient.conditions
        .map((c) => `${c.name} (${c.icd10}, ${c.verified ? 'Verified' : 'Unverified external'})`)
        .join('; '),
      sourceIds: condIds,
      evidenceType: 'Source-Grounded Fact',
      uncertain: patient.conditions.some((c) => !c.verified),
    });
  }

  if (encounters.length > 0) {
    const latestEnc = encounters[0];
    sections.push({
      id: 'det-brief-events',
      section: 'Recent Clinical Events',
      headline: `Most Recent Encounter: ${latestEnc.type} (${latestEnc.date})`,
      detail: `Chief complaint: ${latestEnc.chiefComplaint}. Status: ${latestEnc.noteStatus}. ${latestEnc.soap.assessment.slice(0, 160)}`,
      sourceIds: [latestEnc.id],
      evidenceType: 'Source-Grounded Fact',
    });
  }

  const activeMeds = medications.filter((m) => m.status === 'Active' || m.status === 'Draft');
  if (activeMeds.length > 0 || patient.allergies.length > 0) {
    const medText =
      activeMeds.length > 0
        ? `Medications (${activeMeds.length}): ${activeMeds.map((m) => `${m.name} ${m.dose} (${m.status}${m.reconciled ? '' : ', unreconciled'})`).join('; ')}.`
        : 'No active medications documented.';
    const allergyText =
      patient.allergies.length > 0
        ? `Allergies: ${patient.allergies.map((a) => `${a.substance} — ${a.reaction} (${a.severity})`).join('; ')}.`
        : 'Allergies: Not documented in chart (does NOT confirm NKDA; verify with patient).';
    sections.push({
      id: 'det-brief-meds',
      section: 'Medications & Allergies',
      headline: 'Medication & Allergy Profile',
      detail: `${medText} ${allergyText}`,
      sourceIds: [...activeMeds.map((m) => m.id), ...patient.allergies.map((a) => a.id), patient.id],
      evidenceType: 'Source-Grounded Fact',
      uncertain: activeMeds.some((m) => !m.reconciled) || patient.allergies.length === 0,
    });
  }

  const abnormalLabs = labs.filter((l) => l.flag === 'Critical' || l.flag === 'Abnormal');
  if (labs.length > 0) {
    const topLabs = (abnormalLabs.length > 0 ? abnormalLabs : labs).slice(0, 4);
    const labSummary = topLabs
      .map((l) => `${l.testName}: ${l.value} ${l.unit} [Ref ${l.referenceInterval}, ${l.flag}, ${l.collectionDate}]`)
      .join('; ');
    bullets.push({
      text: `${abnormalLabs.length > 0 ? `${abnormalLabs.length} abnormal/critical` : `${labs.length} recorded`} lab result(s): ${topLabs[0].testName} ${topLabs[0].value} ${topLabs[0].unit} (${topLabs[0].collectionDate})`,
      sourceIds: topLabs.map((l) => l.id),
    });
    sections.push({
      id: 'det-brief-labs',
      section: 'Laboratory Trends',
      headline: 'Key Recorded Laboratory Observations',
      detail: `${labSummary}. (Observations only — clinician determines diagnostic significance.)`,
      sourceIds: topLabs.map((l) => l.id),
      evidenceType: 'Source-Grounded Fact',
    });
  }

  if (vitals.length > 0) {
    const latestV = vitals[0];
    const priorV = vitals[1];
    bullets.push({
      text: `Latest BP ${latestV.bpSystolic}/${latestV.bpDiastolic} mmHg (${latestV.recordedAt})${priorV ? ` vs prior ${priorV.bpSystolic}/${priorV.bpDiastolic} mmHg` : ''}`,
      sourceIds: priorV ? [latestV.id, priorV.id] : [latestV.id],
    });
  }

  if (imaging.length > 0 || documents.length > 0) {
    const repIds = [...imaging.slice(0, 2).map((i) => i.id), ...documents.slice(0, 2).map((d) => d.id)];
    const repDetails = [
      ...imaging.slice(0, 2).map((i) => `${i.studyName} (${i.performedAt}): ${i.impression}`),
      ...documents.slice(0, 2).map((d) => `${d.title} (${d.date}, ${d.verified ? 'Verified' : 'Unverified'})`),
    ].join('; ');
    sections.push({
      id: 'det-brief-reports',
      section: 'Significant Prior Reports',
      headline: 'Imaging & External Documents',
      detail: repDetails,
      sourceIds: repIds,
      evidenceType: 'Source-Grounded Fact',
    });
  }

  const pendingDocs = inboxItems.filter((i) => i.status !== 'Verified & Consolidated' && i.status !== 'Rejected');
  const unreviewedLabs = labs.filter((l) => l.status !== 'Reviewed');
  if (pendingDocs.length > 0 || unreviewedLabs.length > 0) {
    sections.push({
      id: 'det-brief-unreviewed',
      section: 'Unreviewed Information',
      headline: `${pendingDocs.length} Pending Inbox Doc(s) · ${unreviewedLabs.length} Unreviewed Lab(s)`,
      detail: [
        pendingDocs.length > 0 ? `Inbox awaiting verification: ${pendingDocs.map((d) => d.title).join(', ')}.` : '',
        unreviewedLabs.length > 0 ? `Unreviewed labs: ${unreviewedLabs.map((l) => `${l.testName} (${l.value} ${l.unit})`).join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      sourceIds: [...pendingDocs.map((d) => d.id), ...unreviewedLabs.map((l) => l.id)],
      evidenceType: 'Missing / Conflict Alert',
      uncertain: true,
    });
  }

  const openTasks = tasks.filter((t) => t.status !== 'Complete');
  if (openTasks.length > 0) {
    bullets.push({
      text: `${openTasks.length} open follow-up task(s): ${openTasks[0].title} (Due ${openTasks[0].dueDate})`,
      sourceIds: openTasks.map((t) => t.id),
    });
    sections.push({
      id: 'det-brief-tasks',
      section: 'Outstanding Actions',
      headline: `${openTasks.length} Open Task(s)`,
      detail: openTasks.map((t) => `${t.title} (${t.priority}, due ${t.dueDate})`).join('; '),
      sourceIds: openTasks.map((t) => t.id),
      evidenceType: 'Source-Grounded Fact',
    });
  }

  return {
    whatMattersTodayHeadline: `What Matters Today — ${patient.fullName} (${patient.mrn})`,
    whatMattersTodayBullets:
      bullets.length > 0
        ? bullets
        : [{ text: `Review active chart for ${patient.fullName} (${patient.mrn}).`, sourceIds: [patient.id] }],
    sections,
    missingClinicalData: ctx.missingDataSignals,
    conflictingInformation: ctx.conflictSignals,
    uncertaintyIndicators: [
      ...(ctx.missingDataSignals.length > 0 ? ['One or more expected clinical sections are missing — do not assume normal or NKDA.'] : []),
      ...(ctx.conflictSignals.length > 0 ? ['Unverified or unreconciled records exist and require clinician review.'] : []),
    ],
    disclaimer:
      'Deterministic source-linked draft synthesized from permitted synthetic EHR records. Clinician review and verification required.',
  };
}

// ============================================================================
// ASK EIGENH — CONSTRAINED QUERY PLANNER & DETERMINISTIC STRUCTURED EXECUTOR
// ============================================================================

export function planChartQuery(rawQuestion: string): ChartQueryPlan {
  const q = rawQuestion.trim().toLowerCase();

  // Explicit guard against cross-patient / unrestricted queries
  if (/\b(all patients|other patients|everyone|database|sql|drop table|other facility|another patient)\b/i.test(q)) {
    return {
      intent: 'unsupported',
      strategy: 'unsupported',
      targetRecordTypes: [],
      rationale: 'Ask EigenH is restricted strictly to the currently selected permitted patient chart.',
    };
  }

  // Unsupported clinical diagnosis / autonomous prescribing / prognosis / off-chart questions
  if (
    /\b(should i prescribe|prescribe a|prescribe new|what diagnosis|diagnose|weather|stock|joke|write code|predict\b.*\b(risk|probability|mortality|stroke|survival)|prognosis|mortality probability)\b/i.test(
      q
    )
  ) {
    return {
      intent: 'unsupported',
      strategy: 'unsupported',
      targetRecordTypes: [],
      rationale:
        'Ask EigenH only retrieves and summarizes documented records for this patient; it does not diagnose, prescribe, predict prognosis, or answer off-chart questions.',
    };
  }

  if (/\b(egfr|gfr|estimated glomerular)\b/i.test(q)) {
    return {
      intent: 'egfr-lookup',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['LabResult'],
      rationale: 'Deterministic lookup of recorded eGFR laboratory observations for the active patient.',
    };
  }

  if (/\b(blood pressure|bp trend|systolic|diastolic|hypertension trend|\bbp\b)\b/i.test(q)) {
    return {
      intent: 'bp-trend',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['VitalObservation'],
      rationale: 'Deterministic retrieval and chronological charting of recorded blood pressure vitals.',
    };
  }

  if (/\b(latest lab|lab result|labs|laboratory|creatinine|potassium|a1c|hba1c|inr|hemoglobin|cbc|lipid)\b/i.test(q)) {
    return {
      intent: 'latest-labs',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['LabResult'],
      rationale: 'Deterministic retrieval of structured laboratory results with exact units and reference intervals.',
    };
  }

  if (/\b(medications?|meds|prescriptions?|prescribed|drugs?|taking|doses?)\b/i.test(q)) {
    return {
      intent: 'active-medications',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['Medication'],
      rationale: 'Deterministic lookup of documented medications, statuses, and reconciliation states.',
    };
  }

  if (/\b(documents?|inbox|awaiting verification|unverified|pdf|uploaded|external report)\b/i.test(q)) {
    return {
      intent: 'pending-documents',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['DataInbox', 'Document'],
      rationale: 'Deterministic check of Data Inbox items and documents awaiting verification.',
    };
  }

  if (/\b(tasks?|follow[- ]?up|open action|pending action|to do|overdue)\b/i.test(q)) {
    return {
      intent: 'open-tasks',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['Task'],
      rationale: 'Deterministic listing of open follow-up tasks linked to this patient.',
    };
  }

  if (/\b(allerg|conditions?|diagnoses|diagnosis|problem list|medical history)\b/i.test(q)) {
    return {
      intent: 'allergies-conditions',
      strategy: 'deterministic-structured',
      targetRecordTypes: ['Allergy', 'Condition'],
      rationale: 'Deterministic listing of documented allergies and conditions with verification state.',
    };
  }

  if (/\b(encounters?|visits?|consultations?|soap|summary|summarize|history|notes?|timeline)\b/i.test(q)) {
    return {
      intent: 'encounter-summary',
      strategy: 'grounded-narrative',
      targetRecordTypes: ['Encounter', 'Document', 'ImagingReport'],
      rationale: 'Grounded narrative synthesis of available encounter notes and clinical documents.',
    };
  }

  return {
    intent: 'narrative-question',
    strategy: 'grounded-narrative',
    targetRecordTypes: ['Encounter', 'Document', 'LabResult', 'Medication', 'Condition'],
    rationale: 'Grounded search across permitted patient records for the selected chart.',
  };
}

export function executeDeterministicChartSearch(
  ctx: PermittedPatientContext,
  question: string
): ChartSearchOutput {
  const plan = planChartQuery(question);
  const { patient, labs, vitals, medications, inboxItems, documents, tasks, encounters, sourceCatalog } = ctx;

  const pickSources = (ids: string[]): ClinicalSourceReference[] =>
    ids.map((id) => sourceCatalog[id]).filter((s): s is ClinicalSourceReference => Boolean(s));

  if (plan.intent === 'unsupported') {
    return {
      question,
      queryPlan: plan,
      answer:
        'This question is outside the permitted chart-search scope. Ask EigenH only answers record-backed questions about the currently selected patient (labs, vitals/BP trends, medications, allergies, pending documents, open tasks, and encounter history) and never diagnoses, prescribes, or accesses other patients.',
      incompleteOrMissingNote: plan.rationale,
      sources: [sourceCatalog[patient.id]].filter(Boolean),
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'egfr-lookup') {
    const egfrLabs = labs.filter((l) => /egfr|gfr/i.test(l.testName));
    if (egfrLabs.length === 0) {
      return {
        question,
        queryPlan: plan,
        answer: `No eGFR laboratory measurement is currently recorded in ${patient.fullName}'s chart.`,
        incompleteOrMissingNote: 'Missing eGFR results cannot be interpreted as normal renal function.',
        sources: [sourceCatalog[patient.id]].filter(Boolean),
        narrativeGroundedByModel: false,
      };
    }
    const latest = egfrLabs[0];
    const chronological = [...egfrLabs].reverse();
    const numericPoints = chronological
      .filter((l) => typeof l.numericValue === 'number' && Number.isFinite(l.numericValue))
      .map((l) => ({ label: l.collectionDate, value: l.numericValue! }));

    return {
      question,
      queryPlan: plan,
      answer: `Last recorded ${latest.testName} for ${patient.fullName} was ${latest.value} ${latest.unit} on ${latest.collectionDate} (Reference: ${latest.referenceInterval}; Flag: ${latest.flag}; Status: ${latest.status}).`,
      sources: pickSources(egfrLabs.map((l) => l.id)),
      table: {
        title: `Recorded eGFR History (${egfrLabs.length})`,
        columns: ['Date', 'Test', 'Value', 'Reference', 'Flag', 'Status'],
        rows: egfrLabs.map((l) => [
          l.collectionDate,
          l.testName,
          `${l.value} ${l.unit}`.trim(),
          l.referenceInterval,
          l.flag,
          l.status,
        ]),
      },
      trendSeries:
        numericPoints.length >= 2
          ? {
              title: 'eGFR Trend (Recorded Chart Values)',
              unit: latest.unit || 'mL/min/1.73m²',
              color: '#185FA5',
              points: numericPoints,
            }
          : undefined,
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'latest-labs') {
    // Optional specific lab keyword filter
    const specificKeyword = question
      .toLowerCase()
      .match(/\b(creatinine|potassium|hba1c|a1c|inr|hemoglobin|ldl|uacr|albumin|glucose|tsh|sodium)\b/)?.[1];
    const matchedLabs = specificKeyword
      ? labs.filter((l) => l.testName.toLowerCase().includes(specificKeyword))
      : labs;

    if (matchedLabs.length === 0) {
      return {
        question,
        queryPlan: plan,
        answer: specificKeyword
          ? `No "${specificKeyword}" laboratory results are currently recorded in ${patient.fullName}'s chart.`
          : `No laboratory results are currently recorded in ${patient.fullName}'s chart.`,
        incompleteOrMissingNote: 'Absence of lab results does not indicate normal values.',
        sources: [sourceCatalog[patient.id]].filter(Boolean),
        narrativeGroundedByModel: false,
      };
    }

    const latestSubset = matchedLabs.slice(0, 8);
    const abnormalCount = latestSubset.filter((l) => l.flag === 'Abnormal' || l.flag === 'Critical').length;
    return {
      question,
      queryPlan: plan,
      answer: `Found ${matchedLabs.length} recorded laboratory result(s) for ${patient.fullName}${specificKeyword ? ` matching "${specificKeyword}"` : ''}. Most recent: ${latestSubset[0].testName} ${latestSubset[0].value} ${latestSubset[0].unit} on ${latestSubset[0].collectionDate} (${latestSubset[0].flag}). ${abnormalCount} of the ${latestSubset.length} displayed result(s) are flagged Abnormal or Critical.`,
      sources: pickSources(latestSubset.map((l) => l.id)),
      table: {
        title: `Latest Laboratory Results (${latestSubset.length} of ${matchedLabs.length})`,
        columns: ['Date', 'Test', 'Result', 'Reference', 'Flag', 'Status'],
        rows: latestSubset.map((l) => [
          l.collectionDate,
          l.testName,
          `${l.value} ${l.unit}`.trim(),
          l.referenceInterval,
          l.flag,
          l.status,
        ]),
      },
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'bp-trend') {
    if (vitals.length === 0) {
      return {
        question,
        queryPlan: plan,
        answer: `No blood pressure readings are currently documented in ${patient.fullName}'s chart.`,
        incompleteOrMissingNote: 'Record clinic intake or home BP readings to inspect longitudinal trends.',
        sources: [sourceCatalog[patient.id]].filter(Boolean),
        narrativeGroundedByModel: false,
      };
    }
    const chronological = [...vitals].reverse();
    const latest = vitals[0];
    const earliest = chronological[0];
    const sysDelta = latest.bpSystolic - earliest.bpSystolic;
    return {
      question,
      queryPlan: plan,
      answer: `${vitals.length} blood pressure observation(s) recorded for ${patient.fullName}. Latest: ${latest.bpSystolic}/${latest.bpDiastolic} mmHg on ${latest.recordedAt} (${latest.source}).${vitals.length > 1 ? ` Earliest recorded: ${earliest.bpSystolic}/${earliest.bpDiastolic} mmHg on ${earliest.recordedAt} (systolic change: ${sysDelta >= 0 ? `+${sysDelta}` : sysDelta} mmHg).` : ''}`,
      sources: pickSources(vitals.map((v) => v.id)),
      table: {
        title: `Blood Pressure Readings (${vitals.length})`,
        columns: ['Recorded At', 'BP (mmHg)', 'HR (bpm)', 'SpO2', 'Source'],
        rows: vitals.map((v) => [
          v.recordedAt,
          `${v.bpSystolic}/${v.bpDiastolic}`,
          `${v.heartRate}`,
          `${v.spo2}%`,
          v.source,
        ]),
      },
      trendSeries: {
        title: 'Systolic Blood Pressure Trend (mmHg)',
        unit: 'mmHg',
        color: '#185FA5',
        points: chronological.map((v) => ({
          label: v.recordedAt.slice(0, 10),
          value: v.bpSystolic,
          secondaryValue: v.bpDiastolic,
          note: `${v.bpSystolic}/${v.bpDiastolic} mmHg`,
        })),
      },
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'active-medications') {
    if (medications.length === 0) {
      return {
        question,
        queryPlan: plan,
        answer: `No medications are currently documented in ${patient.fullName}'s chart.`,
        incompleteOrMissingNote: 'Confirm current home or external medications directly with the patient.',
        sources: [sourceCatalog[patient.id]].filter(Boolean),
        narrativeGroundedByModel: false,
      };
    }
    const unreconciled = medications.filter((m) => !m.reconciled).length;
    return {
      question,
      queryPlan: plan,
      answer: `${medications.length} medication record(s) documented for ${patient.fullName} (${medications.filter((m) => m.status === 'Active').length} Active, ${unreconciled} pending reconciliation).`,
      incompleteOrMissingNote:
        unreconciled > 0 ? `${unreconciled} medication(s) have not yet been marked reconciled.` : undefined,
      sources: pickSources(medications.map((m) => m.id)),
      table: {
        title: `Documented Medications (${medications.length})`,
        columns: ['Medication', 'Dose', 'Frequency', 'Status', 'Reconciled'],
        rows: medications.map((m) => [
          m.name,
          m.dose,
          m.frequency,
          m.status,
          m.reconciled ? 'Yes' : 'Pending',
        ]),
      },
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'pending-documents') {
    const pendingInbox = inboxItems.filter((i) => i.status !== 'Verified & Consolidated' && i.status !== 'Rejected');
    const unverifiedDocs = documents.filter((d) => !d.verified);
    const totalPending = pendingInbox.length + unverifiedDocs.length;

    if (totalPending === 0) {
      return {
        question,
        queryPlan: plan,
        answer: `No clinical documents are currently awaiting verification for ${patient.fullName}. (${documents.length} verified document(s) are filed in the chart.)`,
        sources: pickSources(documents.slice(0, 4).map((d) => d.id).concat(patient.id)),
        narrativeGroundedByModel: false,
      };
    }

    const rows: string[][] = [
      ...pendingInbox.map((i) => [i.title, i.category, i.status, i.sourceOrganization, i.documentDate]),
      ...unverifiedDocs.map((d) => [d.title, d.category, 'Unverified Document', d.source, d.date]),
    ];

    return {
      question,
      queryPlan: plan,
      answer: `${totalPending} clinical document(s) are awaiting human verification for ${patient.fullName}: ${pendingInbox.length} in Data Inbox and ${unverifiedDocs.length} unverified filed document(s).`,
      sources: pickSources([...pendingInbox.map((i) => i.id), ...unverifiedDocs.map((d) => d.id)]),
      table: {
        title: `Documents Awaiting Verification (${totalPending})`,
        columns: ['Document', 'Category', 'Status', 'Source', 'Date'],
        rows,
      },
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'open-tasks') {
    const open = tasks.filter((t) => t.status !== 'Complete');
    if (open.length === 0) {
      return {
        question,
        queryPlan: plan,
        answer: `There are no open follow-up tasks remaining for ${patient.fullName}.`,
        sources: [sourceCatalog[patient.id]].filter(Boolean),
        narrativeGroundedByModel: false,
      };
    }
    return {
      question,
      queryPlan: plan,
      answer: `${open.length} open follow-up task(s) remain for ${patient.fullName} (${open.filter((t) => t.priority === 'Urgent' || t.priority === 'High').length} Urgent/High priority).`,
      sources: pickSources(open.map((t) => t.id)),
      table: {
        title: `Open Follow-Up Tasks (${open.length})`,
        columns: ['Task', 'Priority', 'Status', 'Team', 'Due Date'],
        rows: open.map((t) => [t.title, t.priority, t.status, t.team, t.dueDate]),
      },
      narrativeGroundedByModel: false,
    };
  }

  if (plan.intent === 'allergies-conditions') {
    const allergyPart =
      patient.allergies.length > 0
        ? `Recorded allergies (${patient.allergies.length}): ${patient.allergies.map((a) => `${a.substance} (${a.reaction}, ${a.severity})`).join('; ')}.`
        : 'No allergy entries are recorded (absence of documentation does NOT confirm NKDA).';
    const condPart =
      patient.conditions.length > 0
        ? `Documented conditions (${patient.conditions.length}): ${patient.conditions.map((c) => `${c.name} [${c.icd10}, ${c.verified ? 'Verified' : 'Unverified'}]`).join('; ')}.`
        : 'No conditions are documented.';
    return {
      question,
      queryPlan: plan,
      answer: `${allergyPart} ${condPart}`,
      incompleteOrMissingNote:
        patient.allergies.length === 0
          ? 'Verify allergy status directly with patient before ordering medications.'
          : undefined,
      sources: pickSources([
        ...patient.allergies.map((a) => a.id),
        ...patient.conditions.map((c) => c.id),
        patient.id,
      ]),
      narrativeGroundedByModel: false,
    };
  }

  // Encounter summary or narrative fallback (deterministic mode)
  if (encounters.length === 0 && documents.length === 0) {
    return {
      question,
      queryPlan: plan,
      answer: `No clinical encounter notes or narrative documents are recorded for ${patient.fullName} yet.`,
      incompleteOrMissingNote: 'Answer is incomplete because no encounter history exists in the chart.',
      sources: [sourceCatalog[patient.id]].filter(Boolean),
      narrativeGroundedByModel: false,
    };
  }

  const encSummary = encounters
    .slice(0, 4)
    .map(
      (e) =>
        `${e.date} — ${e.type} (${e.noteStatus}): Chief complaint "${e.chiefComplaint}". Assessment: ${e.soap.assessment.slice(0, 120)}`
    )
    .join(' | ');

  return {
    question,
    queryPlan: plan,
    answer:
      encounters.length > 0
        ? `Encounter history for ${patient.fullName} (${encounters.length} encounter(s)): ${encSummary}`
        : `No encounters found, but ${documents.length} document(s) exist: ${documents.slice(0, 3).map((d) => `${d.title} (${d.date})`).join('; ')}.`,
    incompleteOrMissingNote:
      encounters.some((e) => e.noteStatus === 'Draft')
        ? 'One or more encounters are still in Draft status and awaiting clinician signature.'
        : undefined,
    sources: pickSources([
      ...encounters.slice(0, 4).map((e) => e.id),
      ...documents.slice(0, 3).map((d) => d.id),
    ]),
    table:
      encounters.length > 0
        ? {
            title: `Encounter History (${encounters.length})`,
            columns: ['Date', 'Type', 'Chief Complaint', 'Status'],
            rows: encounters.map((e) => [e.date, e.type, e.chiefComplaint, e.noteStatus]),
          }
        : undefined,
    narrativeGroundedByModel: false,
  };
}

// ============================================================================
// AMBIENT SCRIBE V2 — TRANSCRIPT-RESPONSIVE DETERMINISTIC DRAFTER
// ============================================================================

export function runDeterministicAmbientScribeV2(
  input: AmbientScribeV2Input,
  ctx: PermittedPatientContext
): AmbientScribeV2Output {
  const lines = input.transcript
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const patientUtterances = lines.filter((l) =>
    /^(patient|pt|family|caregiver)(?:\s*\([^)]+\))?\s*:/i.test(l)
  );
  const clinicianUtterances = lines.filter((l) =>
    /^(clinician|doctor|dr\.?|provider|np|md)(?:\s*\([^)]+\))?\s*:/i.test(l)
  );

  const subjectiveQuotes = patientUtterances.length > 0 ? patientUtterances : lines.slice(0, 2);
  const subjective =
    subjectiveQuotes.length > 0
      ? subjectiveQuotes
          .map((l) => l.replace(/^(patient|pt|family|caregiver)(?:\s*\([^)]+\))?\s*:\s*/i, ''))
          .join(' ')
      : 'No patient-reported symptoms identified in transcript — clinician must review.';

  // Extract only objective numbers actually present in transcript or latest vitals
  const bpMentions = input.transcript.match(/\b\d{2,3}\/\d{2,3}\s*(?:mmHg)?/gi) || [];
  const examLines = lines.filter((l) =>
    /\b(exam|lungs|heart|edema|blood pressure|bp|pulse|spo2|weight|temp|vitals|clear|auscultation|abdomen)\b/i.test(l)
  );
  const latestVital = ctx.vitals[0];
  const objectiveParts: string[] = [];
  if (latestVital) {
    objectiveParts.push(
      `Charted vitals (${latestVital.recordedAt}): BP ${latestVital.bpSystolic}/${latestVital.bpDiastolic} mmHg, HR ${latestVital.heartRate} bpm, SpO2 ${latestVital.spo2}%, Wt ${latestVital.weightKg} kg.`
    );
  }
  if (examLines.length > 0) {
    objectiveParts.push(`Transcript objective mentions: ${examLines.slice(0, 3).join(' ')}`);
  }
  if (objectiveParts.length === 0) {
    objectiveParts.push(
      'No physical examination findings explicitly stated in transcript — clinician must document verified examination.'
    );
  }

  // Extract plan-like utterances from clinician lines
  const planLines = clinicianUtterances.filter((l) =>
    /\b(order|check|start|adjust|increase|decrease|continue|follow[- ]?up|schedule|refer|panel|lab|prescription|monitor|return|weeks?|days?)\b/i.test(l)
  );

  // Detect medication mentions strictly as proposals
  const medRegex =
    /\b(amlodipine|lisinopril|losartan|metformin|atorvastatin|furosemide|empagliflozin|telmisartan|glimepiride|apixaban|warfarin|albuterol|budesonide|levothyroxine|omeprazole|aspirin|clopidogrel|insulin)\b(?:\s+\d+(?:\.\d+)?\s*(?:mg|mcg|units))?/gi;
  const medMentions = Array.from(
    new Set((input.transcript.match(medRegex) || []).map((m) => m.trim()))
  );

  const assessmentLines = clinicianUtterances.filter((l) =>
    /\b(ckd|kidney|hypertension|blood pressure|diabetes|a1c|asthma|fibrillation|inr|edema|pain|chest|thyroid|cough|infection|follow-up|stable|elevated|worsening)\b/i.test(l)
  );

  const assessment =
    assessmentLines.length > 0
      ? `Transcript clinical discussion points (Draft — clinician confirms final diagnosis): ${assessmentLines.slice(0, 2).join(' ')}`
      : `Documented chart context: ${ctx.patient.conditions.map((c) => `${c.name} (${c.icd10})`).join('; ') || 'No prior coded conditions'}. Draft assessment requires clinician verification.`;

  const plan =
    planLines.length > 0
      ? planLines
          .map(
            (l, idx) =>
              `${idx + 1}. ${l.replace(/^(clinician|doctor|dr\.?|provider|np|md)(?:\s*\([^)]+\))?\s*:\s*/i, '')}`
          )
          .join('\n')
      : '1. Review transcript details with patient and finalize diagnostic/therapeutic plan.\n2. Confirm orders, medication adjustments, and follow-up timeline manually.';

  const unsupportedOrUncertainStatements: AmbientScribeV2Output['unsupportedOrUncertainStatements'] = [];
  if (examLines.length === 0) {
    unsupportedOrUncertainStatements.push({
      section: 'objective',
      statement: 'Physical examination details absent from transcript.',
      reason: 'AI did not invent exam findings; clinician must verify and document exam findings.',
    });
  }
  if (medMentions.length > 0) {
    unsupportedOrUncertainStatements.push({
      section: 'plan',
      statement: `Medication(s) discussed in transcript: ${medMentions.join(', ')}.`,
      reason: 'Listed strictly as draft proposals — requires allergy/reconciliation check and clinician order authorization.',
    });
  }
  if (bpMentions.length > 0) {
    unsupportedOrUncertainStatements.push({
      section: 'subjective',
      statement: `Patient-reported/mentioned BP values (${bpMentions.join(', ')})`,
      reason: 'Distinguish patient-reported home readings from verified clinic vital signs.',
    });
  }

  return {
    draftVersion: Math.max(1, input.draftVersion),
    draftStatus: 'Draft',
    autoSigned: false,
    soap: {
      subjective,
      objective: objectiveParts.join(' '),
      assessment,
      plan,
    },
    supportingTranscriptQuotes: [
      ...subjectiveQuotes.slice(0, 2).map((quote) => ({ section: 'subjective' as const, quote })),
      ...examLines.slice(0, 1).map((quote) => ({ section: 'objective' as const, quote })),
      ...planLines.slice(0, 2).map((quote) => ({ section: 'plan' as const, quote })),
    ],
    unsupportedOrUncertainStatements,
    medicationsMentionedAsProposalsOnly: medMentions,
    clinicianSignOffNotice:
      'Deterministic SOAP draft (v' +
      Math.max(1, input.draftVersion) +
      ') — auto-signing disabled. Compare with original transcript and sign manually.',
  };
}

// ============================================================================
// AI CLINICAL ACTION COMPOSER — PLAN-RESPONSIVE DETERMINISTIC PROPOSER
// ============================================================================

export function runDeterministicActionComposer(
  input: ActionComposerInput,
  ctx: PermittedPatientContext
): ActionComposerOutput {
  const combinedPlan = `${input.soap.plan}\n${input.soap.assessment}`.trim();
  const lines = combinedPlan
    .split(/\r?\n|(?<=\.)\s+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const proposals: ComposedClinicalActionProposal[] = [];
  const baseSourceIds = [input.encounterId, ctx.patient.id].filter((id) => ctx.sourceCatalog[id]);

  // 1. Lab order detection from actual reviewed SOAP plan
  const labLine = lines.find((l) =>
    /\b(lab|panel|bmp|cmp|renal|potassium|creatinine|egfr|hba1c|a1c|cbc|lipid|tsh|inr|uacr|urine|blood work)\b/i.test(l)
  );
  if (labLine) {
    const isHba1c = /\b(hba1c|a1c)\b/i.test(labLine);
    const isInr = /\binr\b/i.test(labLine);
    const isTsh = /\btsh|thyroid\b/i.test(labLine);
    const labName = isInr
      ? 'Prothrombin Time & INR Panel'
      : isTsh
      ? 'Thyroid Stimulating Hormone (TSH) Panel'
      : isHba1c
      ? 'HbA1c & Renal Metabolic Panel'
      : 'Renal Function & Serum Potassium Panel';
    const labCode = isInr ? '85610' : isTsh ? '84443' : isHba1c ? '83036' : '80048';
    proposals.push({
      id: `act-${input.encounterId}-lab`,
      idempotencyKey: `${input.encounterId}:Lab Order:${labCode}`,
      kind: 'Lab Order',
      title: `Lab Order Draft: ${labName} (${labCode})`,
      summary: `Proposed routine laboratory requisition derived from reviewed consultation plan.`,
      supportingSourceText: labLine,
      sourceIds: baseSourceIds,
      rationale: 'Matches laboratory monitoring documented in the clinician-reviewed SOAP Plan.',
      confidence: 'High',
      requiresClinicianAuthorization: true,
      payload: { name: labName, code: labCode, priority: /\bstat|urgent\b/i.test(labLine) ? 'Urgent' : 'Routine' },
    });
  }

  // 2. Medication review / draft proposal from reviewed plan
  const medMatch = combinedPlan.match(
    /\b(amlodipine|lisinopril|losartan|metformin|atorvastatin|furosemide|empagliflozin|telmisartan|glimepiride|apixaban|warfarin|levothyroxine|albuterol)\b(?:\s+(\d+(?:\.\d+)?\s*(?:mg|mcg|units)))?/i
  );
  if (medMatch) {
    const medLine =
      lines.find((l) => l.toLowerCase().includes(medMatch[1].toLowerCase())) || combinedPlan.slice(0, 140);
    const medName = medMatch[1][0].toUpperCase() + medMatch[1].slice(1).toLowerCase();
    const dose = medMatch[2] || 'Dose to confirm';
    proposals.push({
      id: `act-${input.encounterId}-med`,
      idempotencyKey: `${input.encounterId}:Medication Draft:${medName.toLowerCase()}`,
      kind: 'Medication Draft',
      title: `Medication Review Proposal: ${medName} ${dose}`,
      summary: `Draft medication review/entry — requires allergy check and authorized clinician approval (simulated, never auto-transmitted).`,
      supportingSourceText: medLine,
      sourceIds: [...baseSourceIds, ...ctx.patient.allergies.map((a) => a.id)],
      rationale: `Documented in consultation plan; patient allergies (${ctx.patient.allergies.map((a) => a.substance).join(', ') || 'not recorded — verify NKDA'}) must be confirmed before activation.`,
      confidence: medMatch[2] ? 'Medium' : 'Low',
      uncertaintyNote: medMatch[2]
        ? 'Confirm dose, frequency, and medication reconciliation before approving Draft -> Active.'
        : 'Dose was not explicitly specified in plan text — clinician must enter/confirm dose.',
      requiresClinicianAuthorization: true,
      payload: {
        name: medName,
        dose,
        frequency: 'Once daily (confirm)',
        duration: '30 days',
        pharmacy: ctx.medications[0]?.pharmacy || 'Assigned Patient Pharmacy',
      },
    });
  }

  // 3. Follow-up task proposal
  const followUpLine = lines.find((l) =>
    /\b(follow[- ]?up|recheck|return|schedule|week|month|day|care coordinator|log|monitor)\b/i.test(l)
  );
  if (followUpLine) {
    const intervalMatch = followUpLine.match(/\b(\d+\s*(?:day|days|week|weeks|month|months))\b/i);
    const interval = intervalMatch?.[1] || '2 weeks';
    proposals.push({
      id: `act-${input.encounterId}-task`,
      idempotencyKey: `${input.encounterId}:Task:follow-up-${interval.replace(/\s+/g, '-')}`,
      kind: 'Task',
      title: `Follow-Up Task: Coordinate ${interval} Recheck & Pending Results`,
      summary: `Routes post-visit follow-up tracking to Care Coordinator queue upon clinician authorization.`,
      supportingSourceText: followUpLine,
      sourceIds: baseSourceIds,
      rationale: 'Ensures follow-up visit scheduling and lab tracking are not missed after checkout.',
      confidence: 'High',
      requiresClinicianAuthorization: true,
      payload: {
        ownerId: 'staff-2',
        dueDate: '2026-11-23',
        priority: 'High',
        interval,
      },
    });

    proposals.push({
      id: `act-${input.encounterId}-avs`,
      idempotencyKey: `${input.encounterId}:Patient Message:avs-instructions`,
      kind: 'Patient Message',
      title: 'Patient Instruction Draft (After-Visit Summary)',
      summary: `Plain-language post-visit instructions drafted from reviewed plan for clinician approval.`,
      supportingSourceText: followUpLine,
      sourceIds: baseSourceIds,
      rationale: 'Summarizes follow-up instructions for the patient portal/AVS after clinician review.',
      confidence: 'Medium',
      requiresClinicianAuthorization: true,
      payload: {
        subject: `After-Visit Instructions (${ctx.patient.fullName})`,
        body: `Reviewed visit follow-up: ${followUpLine} Please contact the care team if symptoms worsen.`,
      },
    });
  }

  // 4. Referral draft when explicitly supported by plan
  const referralLine = lines.find((l) => /\b(refer|referral|consult|nephrology|cardiology|endocrinology|ophthalmology)\b/i.test(l));
  if (referralLine) {
    const specMatch = referralLine.match(/\b(nephrology|cardiology|endocrinology|ophthalmology|pulmonology|nutrition|dietitian)\b/i);
    const specialty = specMatch ? specMatch[1][0].toUpperCase() + specMatch[1].slice(1).toLowerCase() : 'Specialist';
    proposals.push({
      id: `act-${input.encounterId}-ref`,
      idempotencyKey: `${input.encounterId}:Referral:${specialty.toLowerCase()}`,
      kind: 'Referral',
      title: `Referral Draft: ${specialty} Consultation`,
      summary: `Draft outgoing ${specialty} referral based on consultation plan.`,
      supportingSourceText: referralLine,
      sourceIds: baseSourceIds,
      rationale: 'Explicit specialist referral or consultation noted in reviewed SOAP Plan.',
      confidence: 'Medium',
      requiresClinicianAuthorization: true,
      payload: {
        specialty,
        urgency: /\burgent\b/i.test(referralLine) ? 'Urgent' : 'Routine',
        reason: referralLine,
      },
    });
  }

  return {
    encounterId: input.encounterId,
    proposals,
    safetyBoundaryNote:
      'Deterministic Action Composer proposals require individual clinician review and approval before entering Lab, Medication, or Care Coordination queues.',
  };
}
