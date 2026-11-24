import { findDuplicatePatients, type DuplicateCandidate } from './domainLogic';
import type {
  FieldProvenanceEntry,
  InboxDocumentCategory,
  InboxExtractedField,
  Patient,
  PatientDataInboxItem,
} from '../types/hms';

export type DuplicateSafetyTier =
  | 'Exact Identity Match'
  | 'Possible Duplicate — Review Required'
  | 'Name-Only Match — Do NOT Merge';

export interface SafeDuplicateEvaluation extends DuplicateCandidate {
  tier: DuplicateSafetyTier;
  mergeAllowed: boolean;
  safetyExplanation: string;
}

/**
 * Evaluates possible duplicate synthetic patients with strict identity-safety rules.
 * Name-only matching is NEVER sufficient for identity merging — at least two independent
 * identifiers (e.g., Name + DOB, Name + Phone, Name + Email, or exact MRN/ABHA) are required.
 */
export function evaluateDuplicateSafety(
  patients: Patient[],
  input: { fullName: string; dob: string; phone?: string; email?: string; mrn?: string; abhaId?: string }
): SafeDuplicateEvaluation[] {
  const baseMatches = findDuplicatePatients(patients, input);
  const normMrn = (input.mrn || '').trim().toLowerCase();
  const normAbha = (input.abhaId || '').replace(/\D/g, '');
  const seenIds = new Set(baseMatches.map((m) => m.patient.id));

  const extended: DuplicateCandidate[] = [...baseMatches];

  // Also check explicit MRN or optional ABHA exact matches
  for (const p of patients) {
    if (seenIds.has(p.id)) continue;
    const reasons: string[] = [];
    let score = 0;
    if (normMrn && p.mrn.toLowerCase() === normMrn) {
      score += 95;
      reasons.push('Exact MRN match');
    }
    const pAbha = (p.abhaId || '').replace(/\D/g, '');
    if (normAbha && normAbha.length >= 10 && pAbha === normAbha) {
      score += 95;
      reasons.push('Exact ABHA ID match');
    }
    if (score >= 50) {
      extended.push({ patient: p, score: Math.min(100, score), reasons });
    }
  }

  return extended
    .map((candidate) => {
      const hasExactId = candidate.reasons.some(
        (r) => r === 'Exact MRN match' || r === 'Exact ABHA ID match'
      );
      const hasDob = candidate.reasons.includes('Same DOB');
      const hasPhone = candidate.reasons.includes('Same phone');
      const hasEmail = candidate.reasons.includes('Same email');
      const hasExactName = candidate.reasons.includes('Exact name match');

      const secondaryConfirmations = [hasDob, hasPhone, hasEmail].filter(Boolean).length;

      if (hasExactId || (hasExactName && secondaryConfirmations >= 2)) {
        return {
          ...candidate,
          tier: 'Exact Identity Match' as const,
          mergeAllowed: true,
          safetyExplanation:
            'Matched on multiple independent identifiers. Open existing chart instead of creating a duplicate record.',
        };
      }

      if (hasExactName && secondaryConfirmations === 1) {
        return {
          ...candidate,
          tier: 'Possible Duplicate — Review Required' as const,
          mergeAllowed: true,
          safetyExplanation:
            'Matched on name plus one secondary identifier (DOB, phone, or email). Confirm with patient before linking.',
        };
      }

      return {
        ...candidate,
        tier: 'Name-Only Match — Do NOT Merge' as const,
        mergeAllowed: false,
        safetyExplanation:
          'Name-only match is NOT sufficient to merge patient identities. Verify DOB and mobile number before linking or register as a distinct patient.',
      };
    })
    .sort((a, b) => b.score - a.score);
}

export interface RegistrationCompletenessReport {
  percentage: number;
  requiredCompleted: number;
  requiredTotal: number;
  missingRequired: string[];
  missingRecommended: string[];
  readyForRegistration: boolean;
}

export interface RegistrationDraftInput {
  fullName: string;
  dob: string;
  sex: string;
  phone: string;
  address: string;
  chiefConcern: string;
  email?: string;
  emergencyContactName?: string;
  abhaId?: string;
  verifiedByHuman?: boolean;
}

export function computeRegistrationCompleteness(
  draft: RegistrationDraftInput
): RegistrationCompletenessReport {
  const requiredChecks: { label: string; filled: boolean }[] = [
    { label: 'Full Name', filled: draft.fullName.trim().length >= 2 },
    { label: 'Date of Birth', filled: /^\d{4}-\d{2}-\d{2}$/.test(draft.dob.trim()) },
    { label: 'Sex', filled: Boolean(draft.sex.trim()) },
    { label: 'Mobile / Phone Number', filled: draft.phone.replace(/\D/g, '').length >= 7 },
    { label: 'Address / City', filled: draft.address.trim().length >= 4 },
    { label: 'Scheduled Visit Reason', filled: draft.chiefConcern.trim().length >= 3 },
  ];

  const recommendedChecks: { label: string; filled: boolean }[] = [
    { label: 'Emergency Contact', filled: Boolean(draft.emergencyContactName?.trim()) },
    { label: 'Email Address', filled: Boolean(draft.email?.trim()) },
    { label: 'Optional ABHA ID (if available)', filled: Boolean(draft.abhaId?.trim()) },
  ];

  const requiredCompleted = requiredChecks.filter((c) => c.filled).length;
  const requiredTotal = requiredChecks.length;
  const missingRequired = requiredChecks.filter((c) => !c.filled).map((c) => c.label);
  const missingRecommended = recommendedChecks.filter((c) => !c.filled).map((c) => c.label);

  // Required fields carry 80% weight, recommended (excluding optional ABHA requirement) carry 20%
  const requiredScore = (requiredCompleted / requiredTotal) * 80;
  const nonAbhaRecommended = recommendedChecks.slice(0, 2);
  const recScore =
    (nonAbhaRecommended.filter((c) => c.filled).length / nonAbhaRecommended.length) * 20;

  return {
    percentage: Math.round(requiredScore + recScore),
    requiredCompleted,
    requiredTotal,
    missingRequired,
    missingRecommended,
    readyForRegistration: missingRequired.length === 0,
  };
}

export interface VerifiedFieldMergeResult {
  mergedValues: Record<string, string>;
  conflicts: {
    field: string;
    existingVerifiedValue: string;
    proposedDocumentValue: string;
    proposedSource: string;
    preservedExisting: true;
  }[];
  appliedNewFields: string[];
}

/**
 * Protects previously verified patient demographics/clinical values from silent overwrite
 * when a newly submitted document contains different information.
 */
export function mergeVerifiedPatientFields(
  existingValues: Record<string, string | undefined>,
  existingProvenance: Record<string, FieldProvenanceEntry> | undefined,
  proposedValues: Record<string, string>,
  proposedSource: string
): VerifiedFieldMergeResult {
  const mergedValues: Record<string, string> = {};
  const conflicts: VerifiedFieldMergeResult['conflicts'] = [];
  const appliedNewFields: string[] = [];

  for (const [key, val] of Object.entries(existingValues)) {
    if (val !== undefined) mergedValues[key] = val;
  }

  for (const [field, proposedVal] of Object.entries(proposedValues)) {
    const cleanProposed = proposedVal.trim();
    if (!cleanProposed) continue;
    const currentVal = (existingValues[field] || '').trim();
    const prov = existingProvenance?.[field];

    if (currentVal && prov?.status === 'Verified' && currentVal.toLowerCase() !== cleanProposed.toLowerCase()) {
      conflicts.push({
        field,
        existingVerifiedValue: currentVal,
        proposedDocumentValue: cleanProposed,
        proposedSource,
        preservedExisting: true,
      });
      // Strictly preserve existing verified field
      mergedValues[field] = currentVal;
    } else if (!currentVal) {
      mergedValues[field] = cleanProposed;
      appliedNewFields.push(field);
    }
  }

  return { mergedValues, conflicts, appliedNewFields };
}

export interface DataSourceAdapterDescriptor {
  id: string;
  name: string;
  regionScope: 'India (ABDM / HIE)' | 'Global / Clinical Standards' | 'Local Prototype';
  status: 'Active Prototype (Synthetic Only)' | 'Planned / Future Adapter (Not Connected)';
  description: string;
  consentNote: string;
}

/**
 * Honest adapter-based architecture registry.
 * Never displays "ABHA Connected", "LIS Synced", or "DigiLocker Verified" without
 * a real, authorized, tested integration.
 */
export const DATA_SOURCE_ADAPTERS: readonly DataSourceAdapterDescriptor[] = [
  {
    id: 'adapter-synthetic-upload',
    name: 'Synthetic Document Intake & Manual Upload',
    regionScope: 'Local Prototype',
    status: 'Active Prototype (Synthetic Only)',
    description:
      'Active local intake adapter for uploading or selecting synthetic PDFs, lab reports, imaging summaries, and pharmacy records.',
    consentNote: 'Synthetic demo records only — no real patient PHI/PII.',
  },
  {
    id: 'adapter-abdm-abha',
    name: 'ABDM / ABHA Consent-Based Health Information Exchange (HIU/HIP)',
    regionScope: 'India (ABDM / HIE)',
    status: 'Planned / Future Adapter (Not Connected)',
    description:
      'Future consent-artefact exchange for ABDM Health Information Types (DiagnosticReport, Prescription, DischargeSummary). ABHA is optional and never mandatory.',
    consentNote: 'Requires authorized ABDM sandbox/production onboarding and explicit patient consent artefact.',
  },
  {
    id: 'adapter-digilocker',
    name: 'DigiLocker Health Records',
    regionScope: 'India (ABDM / HIE)',
    status: 'Planned / Future Adapter (Not Connected)',
    description:
      'Future patient-authorized document pull where technically supported and consented by the patient.',
    consentNote: 'Not connected in prototype; Aadhaar is never requested or stored.',
  },
  {
    id: 'adapter-lis',
    name: 'Laboratory Information System (LIS / LOINC)',
    regionScope: 'Global / Clinical Standards',
    status: 'Planned / Future Adapter (Not Connected)',
    description:
      'Future bidirectional lab requisition and structured LOINC diagnostic report ingestion.',
    consentNote: 'Not connected — synthetic lab reports are imported via the local Data Inbox.',
  },
  {
    id: 'adapter-radiology',
    name: 'Radiology / PACS / RIS Reporting',
    regionScope: 'Global / Clinical Standards',
    status: 'Planned / Future Adapter (Not Connected)',
    description:
      'Future structured imaging report and DICOM study reference adapter.',
    consentNote: 'Not connected — synthetic imaging summaries use local upload review.',
  },
  {
    id: 'adapter-fhir-r4',
    name: 'HL7 FHIR R4 Interoperability Endpoint',
    regionScope: 'Global / Clinical Standards',
    status: 'Planned / Future Adapter (Not Connected)',
    description:
      'Future FHIR R4 Bundle ingestion and NRCeS ABDM profile validation (local masked FHIR R4 export is available for Administrators).',
    consentNote: 'No live external FHIR server connected.',
  },
];

export interface SyntheticDocumentTemplate {
  templateId: string;
  title: string;
  category: InboxDocumentCategory;
  sourceAdapter: PatientDataInboxItem['sourceAdapter'];
  sourceOrganization: string;
  documentDate: string;
  rawPreviewText: string;
  extractedIdentity: PatientDataInboxItem['extractedIdentity'];
  extractedFields: Omit<InboxExtractedField, 'decision'>[];
}

export const SYNTHETIC_DOCUMENT_TEMPLATES: readonly SyntheticDocumentTemplate[] = [
  {
    templateId: 'tpl-in-metropolis-lab',
    title: 'Metropolis Diagnostics — HbA1c & Renal Profile (Synthetic PDF)',
    category: 'Laboratory Report',
    sourceAdapter: 'Patient-Submitted Document (Demo)',
    sourceOrganization: 'Metropolis Diagnostics Bengaluru (Synthetic)',
    documentDate: '2026-11-12',
    rawPreviewText: `METROPOLIS DIAGNOSTICS — BENGALURU (SYNTHETIC SAMPLE REPORT)
Patient: Aarav Mehta | DOB: 1979-08-15 | Mobile: +91 98452 33109
Sample Collected: 2026-11-12 08:15 IST | Ref Lab ID: MET-BLR-88412
----------------------------------------------------------------
1. Glycated Haemoglobin (HbA1c, HPLC): 7.4 %   [Ref: 4.0 - 5.6 %]  (HIGH)
2. Fasting Blood Glucose: 148 mg/dL            [Ref: 70 - 99 mg/dL] (HIGH)
3. Serum Creatinine: 1.05 mg/dL                [Ref: 0.70 - 1.30 mg/dL] (NORMAL)
4. eGFR (CKD-EPI): 79 mL/min/1.73m2            [Ref: >= 60] (NORMAL)
Handwritten Margin Note (partially smudged): "Repeat fasting lipids next month; patient mentioned occasional mild metformin GI upset?"`,
    extractedIdentity: {
      fullName: 'Aarav Mehta',
      dob: '1979-08-15',
      phone: '+91 98452 33109',
      mrnOrExternalId: 'MET-BLR-88412',
    },
    extractedFields: [
      {
        id: 'extf-lab-hba1c',
        label: 'HbA1c (HPLC)',
        value: '7.4 % (Abnormal — Ref 4.0-5.6 %)',
        targetSection: 'Lab',
        sourceSnippet: 'Glycated Haemoglobin (HbA1c, HPLC): 7.4 % [Ref: 4.0 - 5.6 %] (HIGH)',
        confidence: 'High',
        uncertain: false,
        metadata: {
          testName: 'HbA1c (HPLC)',
          numericValue: '7.4',
          value: '7.4',
          unit: '%',
          referenceInterval: '4.0 - 5.6 %',
          flag: 'Abnormal',
        },
      },
      {
        id: 'extf-lab-fbg',
        label: 'Fasting Blood Glucose',
        value: '148 mg/dL (Abnormal — Ref 70-99 mg/dL)',
        targetSection: 'Lab',
        sourceSnippet: 'Fasting Blood Glucose: 148 mg/dL [Ref: 70 - 99 mg/dL] (HIGH)',
        confidence: 'High',
        uncertain: false,
        metadata: {
          testName: 'Fasting Blood Glucose',
          numericValue: '148',
          value: '148',
          unit: 'mg/dL',
          referenceInterval: '70 - 99 mg/dL',
          flag: 'Abnormal',
        },
      },
      {
        id: 'extf-lab-egfr',
        label: 'eGFR (CKD-EPI)',
        value: '79 mL/min/1.73m2 (Normal — Ref >= 60)',
        targetSection: 'Lab',
        sourceSnippet: 'eGFR (CKD-EPI): 79 mL/min/1.73m2 [Ref: >= 60] (NORMAL)',
        confidence: 'High',
        uncertain: false,
        metadata: {
          testName: 'eGFR (CKD-EPI)',
          numericValue: '79',
          value: '79',
          unit: 'mL/min/1.73m2',
          referenceInterval: '>= 60',
          flag: 'Normal',
        },
      },
      {
        id: 'extf-lab-uncertain-intolerance',
        label: 'Possible Metformin GI Intolerance Note',
        value: 'Patient reported mild GI upset with Metformin (margin note unclear)',
        targetSection: 'History',
        sourceSnippet: 'Handwritten Margin Note (partially smudged): "patient mentioned occasional mild metformin GI upset?"',
        confidence: 'Low',
        uncertain: true,
        uncertaintyReason:
          'Extracted from a smudged handwritten margin note with a question mark — verify with patient before recording.',
        metadata: {
          historyCategory: 'Medical',
          title: 'Metformin tolerance note (External Lab Margin)',
        },
      },
    ],
  },
  {
    templateId: 'tpl-in-prior-history-summary',
    title: 'Indiranagar Clinic — Prior Consultation & Pharmacy Summary (Synthetic)',
    category: 'Previous Medical History',
    sourceAdapter: 'External Clinic PDF (Demo)',
    sourceOrganization: 'Indiranagar Family Health Clinic (Synthetic)',
    documentDate: '2026-08-24',
    rawPreviewText: `OUTPATIENT CONSULTATION & MEDICATION SUMMARY (SYNTHETIC)
Patient: Aarav Mehta | DOB: 1979-08-15 | Phone: +91 98452 33109
Clinic: Indiranagar Family Health Clinic, Bengaluru
----------------------------------------------------------------
Active Diagnoses:
- Type 2 Diabetes Mellitus without complications (ICD-10: E11.9) — Onset 2022
- Essential Hypertension (ICD-10: I10) — Onset 2023

Dispensed Pharmacy List (MedPlus Indiranagar):
- Metformin Hydrochloride 500 mg PO Twice Daily (after meals)
- Telmisartan 40 mg PO Once Daily (morning)

Allergy Section: Left blank on scanned page (verify NKDA or allergies at intake).`,
    extractedIdentity: {
      fullName: 'Aarav Mehta',
      dob: '1979-08-15',
      phone: '+91 98452 33109',
      mrnOrExternalId: 'IFC-2026-4410',
    },
    extractedFields: [
      {
        id: 'extf-hist-t2dm',
        label: 'Condition: Type 2 Diabetes Mellitus',
        value: 'Type 2 diabetes mellitus without complications (E11.9)',
        targetSection: 'Condition',
        sourceSnippet: 'Active Diagnoses: Type 2 Diabetes Mellitus without complications (ICD-10: E11.9) — Onset 2022',
        confidence: 'High',
        uncertain: false,
        metadata: {
          conditionName: 'Type 2 diabetes mellitus without complications',
          icd10: 'E11.9',
          onsetDate: '2022-01-15',
        },
      },
      {
        id: 'extf-hist-med-metformin',
        label: 'Medication: Metformin 500 mg',
        value: 'Metformin Hydrochloride 500 mg Oral Twice Daily (MedPlus Indiranagar)',
        targetSection: 'Medication',
        sourceSnippet: 'Dispensed Pharmacy List: Metformin Hydrochloride 500 mg PO Twice Daily (after meals)',
        confidence: 'High',
        uncertain: false,
        metadata: {
          medName: 'Metformin Hydrochloride',
          dose: '500 mg',
          frequency: 'Twice daily',
          pharmacy: 'MedPlus Indiranagar (Synthetic)',
        },
      },
      {
        id: 'extf-hist-med-telmisartan',
        label: 'Medication: Telmisartan 40 mg',
        value: 'Telmisartan 40 mg Oral Once Daily (MedPlus Indiranagar)',
        targetSection: 'Medication',
        sourceSnippet: 'Dispensed Pharmacy List: Telmisartan 40 mg PO Once Daily (morning)',
        confidence: 'Medium',
        uncertain: true,
        uncertaintyReason:
          'Last refill date not printed on summary — verify patient is currently taking 40 mg daily.',
        metadata: {
          medName: 'Telmisartan',
          dose: '40 mg',
          frequency: 'Once daily',
          pharmacy: 'MedPlus Indiranagar (Synthetic)',
        },
      },
    ],
  },
  {
    templateId: 'tpl-in-imaging-usg',
    title: 'Bengaluru Diagnostics — Abdominal Ultrasound Report (Synthetic)',
    category: 'Imaging Report',
    sourceAdapter: 'Patient-Submitted Document (Demo)',
    sourceOrganization: 'Bengaluru Diagnostic Imaging Centre (Synthetic)',
    documentDate: '2026-09-18',
    rawPreviewText: `ULTRASOUND ABDOMEN & PELVIS (SYNTHETIC SAMPLE)
Patient: Aarav Mehta | DOB: 1979-08-15
Study: Abdominal Ultrasound | Radiologist: Dr. Rajesh Hegde, MD
Findings: Mild Grade 1 hepatic steatosis (fatty liver). Kidneys normal in size and echotexture; no hydronephrosis or calculi.
Impression: Grade 1 fatty liver; normal bilateral renal parenchyma.`,
    extractedIdentity: {
      fullName: 'Aarav Mehta',
      dob: '1979-08-15',
      mrnOrExternalId: 'BDIC-USG-9912',
    },
    extractedFields: [
      {
        id: 'extf-img-usg',
        label: 'Abdominal Ultrasound Impression',
        value: 'Grade 1 hepatic steatosis; normal bilateral renal parenchyma',
        targetSection: 'Imaging',
        sourceSnippet: 'Impression: Grade 1 fatty liver; normal bilateral renal parenchyma.',
        confidence: 'High',
        uncertain: false,
        metadata: {
          studyName: 'Ultrasound Abdomen & Pelvis',
          modality: 'Ultrasound',
          findings: 'Mild Grade 1 hepatic steatosis (fatty liver). Kidneys normal in size and echotexture; no hydronephrosis or calculi.',
          impression: 'Grade 1 fatty liver; normal bilateral renal parenchyma.',
          radiologist: 'Dr. Rajesh Hegde, MD (External Synthetic)',
        },
      },
    ],
  },
  {
    templateId: 'tpl-in-pharmacy-rx',
    title: 'MedPlus Pharmacy — Dispense & Refill Record (Synthetic)',
    category: 'Pharmacy Information',
    sourceAdapter: 'Patient-Submitted Document (Demo)',
    sourceOrganization: 'MedPlus Pharmacy Indiranagar (Synthetic)',
    documentDate: '2026-11-05',
    rawPreviewText: `PHARMACY DISPENSE RECORD (SYNTHETIC)
Customer: Aarav Mehta | Phone: +91 98452 33109
Dispensed 2026-11-05:
- Atorvastatin 10 mg Tablets — 30 tabs (Once nightly)
Note: Printed dose smudged (10 mg vs 20 mg) — verify strength with patient.`,
    extractedIdentity: {
      fullName: 'Aarav Mehta',
      phone: '+91 98452 33109',
      mrnOrExternalId: 'MP-RX-55301',
    },
    extractedFields: [
      {
        id: 'extf-rx-atorva',
        label: 'Dispensed Medication: Atorvastatin',
        value: 'Atorvastatin 10 mg Once nightly (verify strength)',
        targetSection: 'Medication',
        sourceSnippet: 'Atorvastatin 10 mg Tablets — 30 tabs (Once nightly). Printed dose smudged (10 mg vs 20 mg).',
        confidence: 'Low',
        uncertain: true,
        uncertaintyReason: 'Printed tablet strength on receipt is partially smudged (10 mg vs 20 mg). Confirm before approving.',
        metadata: {
          medName: 'Atorvastatin',
          dose: '10 mg',
          frequency: 'Once nightly',
          pharmacy: 'MedPlus Indiranagar (Synthetic)',
        },
      },
    ],
  },
];

export function classifySyntheticDocument(filenameOrTitle: string, contentText: string): InboxDocumentCategory {
  const combined = `${filenameOrTitle} ${contentText}`.toLowerCase();
  if (/\b(hba1c|glucose|creatinine|egfr|cbc|lipid|pathology|lab|diagnostic|blood test)\b/.test(combined)) {
    return 'Laboratory Report';
  }
  if (/\b(x-?ray|ultrasound|usg|ct scan|mri|radiology|impression|modality)\b/.test(combined)) {
    return 'Imaging Report';
  }
  if (/\b(discharge summary|hospital course|discharged)\b/.test(combined)) {
    return 'Discharge Summary';
  }
  if (/\b(pharmacy|dispensed|refill|medplus|apollo pharmacy|cvs)\b/.test(combined)) {
    return 'Pharmacy Information';
  }
  if (/\b(prescription|medication list|rx|mg po|twice daily)\b/.test(combined)) {
    return 'Medication Record';
  }
  if (/\b(consultation|clinic note|outpatient visit|assessment|soap)\b/.test(combined)) {
    return 'Clinical Consultation Note';
  }
  if (/\b(history|past medical|surgical|diagnosis|icd-10)\b/.test(combined)) {
    return 'Previous Medical History';
  }
  return 'Other Medical Document';
}

export function createSyntheticInboxItemFromTemplate(
  template: SyntheticDocumentTemplate,
  patients: Patient[],
  options?: {
    id?: string;
    receivedAt?: string;
    targetPatient?: Patient;
    initialStatus?: PatientDataInboxItem['status'];
  }
): PatientDataInboxItem {
  const identity = options?.targetPatient
    ? {
        fullName: options.targetPatient.fullName,
        dob: options.targetPatient.dob,
        phone: options.targetPatient.phone,
        mrnOrExternalId: template.extractedIdentity.mrnOrExternalId,
        abhaOptional: options.targetPatient.abhaId,
      }
    : { ...template.extractedIdentity };

  const matches = evaluateDuplicateSafety(patients, {
    fullName: identity.fullName,
    dob: identity.dob || '',
    phone: identity.phone,
    abhaId: identity.abhaOptional,
  });

  const candidateIds = Array.from(
    new Set([
      ...(options?.targetPatient ? [options.targetPatient.id] : []),
      ...matches.map((m) => m.patient.id),
    ])
  );

  return {
    id: options?.id || `inbox-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: template.title,
    category: template.category,
    sourceAdapter: template.sourceAdapter,
    sourceOrganization: template.sourceOrganization,
    receivedAt: options?.receivedAt || '2026-11-18 09:15 IST',
    documentDate: template.documentDate,
    rawPreviewText: options?.targetPatient
      ? template.rawPreviewText.replace(/Aarav Mehta/g, options.targetPatient.fullName)
      : template.rawPreviewText,
    extractedIdentity: identity,
    candidatePatientIds: candidateIds,
    confirmedPatientId: undefined,
    status: options?.initialStatus || 'Classified',
    extractedFields: template.extractedFields.map((f) => ({
      ...f,
      id: `${options?.id || 'f'}-${f.id}`,
      decision: 'Pending',
    })),
  };
}

export interface RegistrationDemoCompletionSummary {
  patientFound: boolean;
  patientId: string;
  patientName: string;
  mrn: string;
  dob: string;
  phone: string;
  facilityName: string;
  registrationStatus: string;
  verifiedBy: string;
  verifiedAt: string;
  verifiedFields: { field: string; value: string; source: string }[];
  acceptedExtractedFields: { label: string; value: string; section: string }[];
  rejectedExtractedFields: { label: string; value: string; reason: string }[];
  sourceDocuments: { id: string; title: string; category: string; source: string; date: string; verified: boolean }[];
  outstandingItems: string[];
  nextAppointment: { date: string; startTime: string; type: string; providerName: string; reason: string } | null;
  encountersCreated: number;
  readinessLabel: string;
}

/**
 * Derives a scenario-specific completion summary strictly from the actual synthetic
 * Bengaluru registration patient's records in AppState (never reusing another patient's journey).
 */
export function buildRegistrationDemoCompletionSummary(
  state: Pick<
    import('../types/hms').AppState,
    'patients' | 'facilities' | 'staff' | 'appointments' | 'documents' | 'dataInboxItems' | 'labResults' | 'vitals' | 'encounters'
  >,
  patientId: string
): RegistrationDemoCompletionSummary {
  const patient =
    state.patients.find((p) => p.id === patientId) ||
    state.patients.find(
      (p) => p.fullName.trim().toLowerCase() === 'aarav mehta' && p.dob === '1979-08-15'
    );
  if (!patient) {
    return {
      patientFound: false,
      patientId,
      patientName: 'Unregistered Patient',
      mrn: 'Pending',
      dob: 'Pending',
      phone: 'Pending',
      facilityName: 'EigenH Bengaluru Care Hub',
      registrationStatus: 'In Progress',
      verifiedBy: 'Pending verification',
      verifiedAt: 'Pending',
      verifiedFields: [],
      acceptedExtractedFields: [],
      rejectedExtractedFields: [],
      sourceDocuments: [],
      outstandingItems: ['Scheduled patient registration not yet completed.'],
      nextAppointment: null,
      encountersCreated: 0,
      readinessLabel: 'Registration Incomplete',
    };
  }

  const facility = state.facilities.find((f) => f.id === patient.facilityId);
  const prov = patient.fieldProvenance || {};
  const verifiedFields: RegistrationDemoCompletionSummary['verifiedFields'] = [];

  const fieldCatalog: { key: string; label: string; value: string | undefined }[] = [
    { key: 'fullName', label: 'Full Legal Name', value: patient.fullName },
    { key: 'dob', label: 'Date of Birth', value: patient.dob },
    { key: 'phone', label: 'Mobile Number', value: patient.phone },
    { key: 'address', label: 'Residential Address', value: patient.address },
    { key: 'chiefConcern', label: 'Scheduled Visit Context', value: patient.chiefConcern },
  ];

  for (const item of fieldCatalog) {
    if (!item.value) continue;
    const entry = prov[item.key];
    if (entry?.status === 'Verified' || patient.registrationStatus === 'Verified & Ready') {
      verifiedFields.push({
        field: item.label,
        value: item.value,
        source: entry?.source || 'Scheduled Front-Desk Verification',
      });
    }
  }
  if (patient.caregivers.length > 0) {
    const cg = patient.caregivers[0];
    verifiedFields.push({
      field: 'Emergency Contact',
      value: `${cg.name} (${cg.relationship} · ${cg.phone})`,
      source: 'Scheduled Front-Desk Verification',
    });
  }

  const patientInboxItems = (state.dataInboxItems || []).filter(
    (item) => item.confirmedPatientId === patient.id || item.candidatePatientIds.includes(patient.id)
  );
  const acceptedExtractedFields: RegistrationDemoCompletionSummary['acceptedExtractedFields'] = [];
  const rejectedExtractedFields: RegistrationDemoCompletionSummary['rejectedExtractedFields'] = [];

  for (const item of patientInboxItems) {
    for (const field of item.extractedFields) {
      if (field.decision === 'Accepted' || field.decision === 'Corrected') {
        acceptedExtractedFields.push({
          label: field.label,
          value: field.correctedValue || field.value,
          section: field.targetSection,
        });
      } else if (field.decision === 'Rejected') {
        rejectedExtractedFields.push({
          label: field.label,
          value: field.value,
          reason:
            field.uncertaintyReason ||
            'Rejected by staff during human verification against original document.',
        });
      }
    }
  }

  const sourceDocuments = state.documents
    .filter((d) => d.patientId === patient.id)
    .map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      source: d.source,
      date: d.date,
      verified: d.verified,
    }));

  const outstandingItems: string[] = [];
  if (patient.allergies.length === 0) {
    outstandingItems.push('Allergy status not yet verified (confirm NKDA or drug allergies at intake)');
  }
  const hasVitals = state.vitals.some((v) => v.patientId === patient.id);
  if (!hasVitals) {
    outstandingItems.push('Current-visit baseline vitals pending rooming');
  }
  const unreviewedLabs = state.labResults.filter(
    (l) => l.patientId === patient.id && l.status !== 'Reviewed'
  );
  if (unreviewedLabs.length > 0) {
    outstandingItems.push(
      `${unreviewedLabs.length} consolidated lab result(s) flagged for clinician review before visit`
    );
  }
  if (!patient.abhaId) {
    outstandingItems.push('Optional ABHA ID not linked (not required for registration; Aadhaar never requested)');
  }

  const upcomingAppt = state.appointments.find(
    (a) => a.patientId === patient.id && a.status !== 'Cancelled'
  );
  const apptProvider = upcomingAppt
    ? state.staff.find((s) => s.id === upcomingAppt.providerId)
    : undefined;
  const encountersCreated = state.encounters.filter((e) => e.patientId === patient.id).length;

  return {
    patientFound: true,
    patientId: patient.id,
    patientName: patient.fullName,
    mrn: patient.mrn,
    dob: patient.dob,
    phone: patient.phone,
    facilityName: facility?.name || 'EigenH Bengaluru Care Hub',
    registrationStatus: patient.registrationStatus || 'Verified & Ready',
    verifiedBy: patient.registrationVerifiedBy || 'Front Desk Staff',
    verifiedAt: patient.registrationVerifiedAt || '2026-11-18 IST',
    verifiedFields,
    acceptedExtractedFields,
    rejectedExtractedFields,
    sourceDocuments,
    outstandingItems,
    nextAppointment: upcomingAppt
      ? {
          date: upcomingAppt.date,
          startTime: upcomingAppt.startTime,
          type: upcomingAppt.type,
          providerName: apptProvider?.name || 'Assigned Clinician',
          reason: upcomingAppt.reason,
        }
      : null,
    encountersCreated,
    readinessLabel:
      encountersCreated === 0
        ? 'Ready for Scheduled Clinical Visit (0 Encounters Created)'
        : `Ready for Visit (${encountersCreated} Encounter(s) on File)`,
  };
}
