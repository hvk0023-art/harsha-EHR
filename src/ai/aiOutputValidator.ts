import type {
  ActionComposerOutput,
  AmbientScribeV2Output,
  ChartSearchOutput,
  ClinicalAIOperation,
  DocumentIntelligenceOutput,
  PreConsultationBriefOutput,
} from './clinicalAiTypes';

export interface ValidationOutcome<T> {
  valid: boolean;
  sanitized?: T;
  errors: string[];
  warnings: string[];
}

const VALID_TARGET_SECTIONS = new Set([
  'Condition',
  'Lab',
  'Imaging',
  'Medication',
  'Allergy',
  'History',
  'Demographics',
]);

const VALID_DOC_TYPES = new Set([
  'Laboratory Report',
  'Discharge Summary',
  'Prescription Document',
  'Imaging Report',
  'Clinical Consultation Note',
  'Other Medical Document',
]);

const VALID_PROPOSAL_KINDS = new Set([
  'Lab Order',
  'Medication Draft',
  'Task',
  'Follow-Up Plan',
  'Patient Message',
  'Referral',
]);

function normalizeConfidence(val: unknown): 'High' | 'Medium' | 'Low' {
  if (val === 'High' || val === 'Medium' || val === 'Low') return val;
  return 'Medium';
}

function asTrimmedString(val: unknown, fallback = ''): string {
  return typeof val === 'string' ? val.trim() : fallback;
}

function filterAllowedIds(
  rawIds: unknown,
  allowedSet: Set<string>,
  warnings: string[],
  contextLabel: string
): string[] {
  if (!Array.isArray(rawIds)) return [];
  const validIds: string[] = [];
  const seen = new Set<string>();
  for (const item of rawIds) {
    const id = asTrimmedString(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (allowedSet.size === 0 || allowedSet.has(id)) {
      validIds.push(id);
    } else {
      warnings.push(`Dropped ungrounded source reference "${id}" from ${contextLabel}.`);
    }
  }
  return validIds;
}

export function validateDocumentIntelligenceOutput(
  raw: unknown,
  rawSourceText: string
): ValidationOutcome<DocumentIntelligenceOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Document intelligence response must be a JSON object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;
  const rawDocType = asTrimmedString(obj.documentType, 'Other Medical Document');
  const documentType = VALID_DOC_TYPES.has(rawDocType)
    ? (rawDocType as DocumentIntelligenceOutput['documentType'])
    : 'Other Medical Document';

  const identityObj =
    obj.extractedPatientIdentity && typeof obj.extractedPatientIdentity === 'object'
      ? (obj.extractedPatientIdentity as Record<string, unknown>)
      : {};

  const fullName = asTrimmedString(identityObj.fullName, 'Not stated in source document');
  const dob = asTrimmedString(identityObj.dob) || undefined;
  const phone = asTrimmedString(identityObj.phone) || undefined;
  const mrnOrExternalId = asTrimmedString(identityObj.mrnOrExternalId) || undefined;
  const abhaOptional = asTrimmedString(identityObj.abhaOptional) || undefined;

  const rawLabs = Array.isArray(obj.labMeasurements) ? obj.labMeasurements : [];
  const sourceWithoutDates = rawSourceText.replace(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g, ' ');
  const lowerSource = sourceWithoutDates.toLowerCase();

  const labMeasurements = rawLabs
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((m) => {
      const testName = asTrimmedString(m.testName, 'Unspecified Lab Test');
      const originalValue = asTrimmedString(m.originalValue);
      const originalUnit = asTrimmedString(m.originalUnit, 'Not stated');
      let referenceRange = asTrimmedString(m.referenceRange, 'Not stated in source document');
      const sourceSnippet = asTrimmedString(m.sourceSnippet);
      let uncertain = Boolean(m.uncertain);
      let uncertaintyReason = asTrimmedString(m.uncertaintyReason) || undefined;

      // Safeguard: never silently invent a missing reference range if none appears in source text
      if (
        referenceRange &&
        referenceRange !== 'Not stated in source document' &&
        !lowerSource.includes('ref') &&
        !lowerSource.includes('range') &&
        !lowerSource.includes('normal') &&
        !lowerSource.includes('<') &&
        !lowerSource.includes('>') &&
        !/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/.test(sourceWithoutDates)
      ) {
        warnings.push(
          `Reference range "${referenceRange}" for ${testName} was not present in source text and was reset to "Not stated in source document".`
        );
        referenceRange = 'Not stated in source document';
        uncertain = true;
        uncertaintyReason =
          uncertaintyReason || 'Reference range not printed in source document; clinician review required.';
      }

      const rawFlag = asTrimmedString(m.flag, 'Unspecified');
      const flag: 'Normal' | 'Abnormal' | 'Critical' | 'Unspecified' =
        rawFlag === 'Normal' || rawFlag === 'Abnormal' || rawFlag === 'Critical'
          ? rawFlag
          : 'Unspecified';

      return {
        testName,
        originalValue,
        originalUnit,
        referenceRange: referenceRange || 'Not stated in source document',
        sampleOrResultDate: asTrimmedString(m.sampleOrResultDate, 'Not stated'),
        laboratoryIdentity: asTrimmedString(m.laboratoryIdentity, 'Not stated'),
        flag,
        sourceSnippet: sourceSnippet || `${testName}: ${originalValue} ${originalUnit}`.trim(),
        uncertain,
        uncertaintyReason,
      };
    })
    .filter((m) => m.originalValue.length > 0);

  const rawFields = Array.isArray(obj.extractedFields) ? obj.extractedFields : [];
  const extractedFields = rawFields
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((f, idx) => {
      const targetRaw = asTrimmedString(f.targetSection, 'History');
      const targetSection = VALID_TARGET_SECTIONS.has(targetRaw)
        ? (targetRaw as DocumentIntelligenceOutput['extractedFields'][number]['targetSection'])
        : 'History';
      const label = asTrimmedString(f.label, `Extracted Field ${idx + 1}`);
      const value = asTrimmedString(f.value);
      const rawMeta =
        f.metadata && typeof f.metadata === 'object' ? (f.metadata as Record<string, unknown>) : {};
      const metadata: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawMeta)) {
        if (typeof v === 'string' && v.trim()) metadata[k] = v.trim();
      }
      const originalUnit = asTrimmedString(f.originalUnit) || metadata.unit || undefined;
      let referenceRange = asTrimmedString(f.referenceRange) || metadata.referenceInterval || undefined;
      if (
        targetSection === 'Lab' &&
        referenceRange &&
        referenceRange !== 'Not stated in source document' &&
        !lowerSource.includes('ref') &&
        !lowerSource.includes('range') &&
        !lowerSource.includes('<') &&
        !lowerSource.includes('>') &&
        !/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/.test(sourceWithoutDates)
      ) {
        referenceRange = 'Not stated in source document';
        metadata.referenceInterval = 'Not stated in source document';
      }

      return {
        id: asTrimmedString(f.id, `ai-docf-${idx + 1}`),
        label,
        value,
        originalUnit,
        referenceRange,
        targetSection,
        sourceLocation: asTrimmedString(f.sourceLocation, 'Source Document Body'),
        sourceSnippet: asTrimmedString(f.sourceSnippet, value.slice(0, 140)),
        confidence: normalizeConfidence(f.confidence),
        uncertain: Boolean(f.uncertain),
        uncertaintyReason: asTrimmedString(f.uncertaintyReason) || undefined,
        metadata,
      };
    })
    .filter((f) => f.value.length > 0);

  if (extractedFields.length === 0 && labMeasurements.length === 0) {
    errors.push('Document extraction returned zero structured fields from the provided synthetic document.');
    return { valid: false, errors, warnings };
  }

  const missingOrAmbiguousFlags = Array.isArray(obj.missingOrAmbiguousFlags)
    ? obj.missingOrAmbiguousFlags.map((x) => asTrimmedString(x)).filter(Boolean)
    : [];

  if (!dob && !phone && !mrnOrExternalId) {
    missingOrAmbiguousFlags.push(
      'Document header lacks secondary identifier (DOB, phone, or MRN) — name-only patient matching/merging is blocked.'
    );
  }

  return {
    valid: true,
    errors,
    warnings,
    sanitized: {
      documentType,
      documentDate: asTrimmedString(obj.documentDate, 'Not stated'),
      laboratoryOrFacilityIdentity: asTrimmedString(obj.laboratoryOrFacilityIdentity, 'Not stated'),
      extractedPatientIdentity: {
        fullName,
        dob,
        phone,
        mrnOrExternalId,
        abhaOptional,
      },
      summary: asTrimmedString(obj.summary, `Structured draft extraction for ${documentType}.`),
      labMeasurements,
      extractedFields,
      missingOrAmbiguousFlags: Array.from(new Set(missingOrAmbiguousFlags)),
      identitySafetyNote:
        asTrimmedString(obj.identitySafetyNote) ||
        'Never merge or file into a patient chart on name alone; verify at least two identifiers (DOB, phone, MRN, or ABHA).',
    },
  };
}

export function validatePreConsultationBriefOutput(
  raw: unknown,
  allowedSourceIds: readonly string[],
  hasRecordedAllergies = true
): ValidationOutcome<PreConsultationBriefOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Pre-consultation brief response must be a JSON object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;
  const allowedSet = new Set(allowedSourceIds);

  let whatMattersTodayHeadline = asTrimmedString(
    obj.whatMattersTodayHeadline,
    'Source-linked Pre-Consultation Summary (Draft — Clinician Review Required)'
  );
  if (!hasRecordedAllergies && /\b(nkda|no known drug allergies|no known allergies)\b/i.test(whatMattersTodayHeadline)) {
    warnings.push(
      'Removed unsupported NKDA claim from headline because patient has zero recorded allergy entries; clinician confirmation is required.'
    );
    whatMattersTodayHeadline = whatMattersTodayHeadline.replace(
      /\b(nkda|no known drug allergies|no known allergies)\b/gi,
      'unconfirmed allergy history (requires direct clinician verification)'
    );
  }

  const rawBullets = Array.isArray(obj.whatMattersTodayBullets) ? obj.whatMattersTodayBullets : [];
  const whatMattersTodayBullets = rawBullets
    .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
    .map((b, idx) => {
      let text = asTrimmedString(b.text);
      if (!hasRecordedAllergies && /\b(nkda|no known drug allergies|no known allergies)\b/i.test(text)) {
        warnings.push(
          `Removed unsupported NKDA claim from What Matters bullet ${idx + 1} because patient has zero recorded allergy entries.`
        );
        text = text.replace(
          /\b(nkda|no known drug allergies|no known allergies)\b/gi,
          'allergy history unconfirmed (requires direct clinician verification)'
        );
      }
      const sourceIds = filterAllowedIds(b.sourceIds, allowedSet, warnings, `What Matters bullet ${idx + 1}`);
      return { text, sourceIds };
    })
    .filter((b) => b.text.length > 0);

  const allowedSections = new Set([
    'Reason for Visit',
    'Relevant Medical History',
    'Recent Clinical Events',
    'Medications & Allergies',
    'Laboratory Trends',
    'Significant Prior Reports',
    'Unreviewed Information',
    'Outstanding Actions',
  ]);

  const rawSections = Array.isArray(obj.sections) ? obj.sections : [];
  const sections = rawSections
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    .map((s, idx) => {
      const secName = asTrimmedString(s.section, 'Recent Clinical Events');
      const section = allowedSections.has(secName)
        ? (secName as PreConsultationBriefOutput['sections'][number]['section'])
        : 'Recent Clinical Events';
      const headline = asTrimmedString(s.headline, section);
      let detail = asTrimmedString(s.detail);
      const sourceIds = filterAllowedIds(s.sourceIds, allowedSet, warnings, `Brief section ${headline}`);
      const rawEv = asTrimmedString(s.evidenceType, 'AI Synthesis (Review Required)');
      const evidenceType: PreConsultationBriefOutput['sections'][number]['evidenceType'] =
        rawEv === 'Source-Grounded Fact' ||
        rawEv === 'AI Synthesis (Review Required)' ||
        rawEv === 'Missing / Conflict Alert'
          ? rawEv
          : 'AI Synthesis (Review Required)';

      // Clinical safety check: never convert absent allergy list into NKDA confirmation
      if (!hasRecordedAllergies && /\b(nkda|no known drug allergies|no known allergies)\b/i.test(detail)) {
        warnings.push(
          'Removed unsupported NKDA claim because patient has zero recorded allergy entries; clinician confirmation is required.'
        );
        detail =
          'No allergy entries are currently recorded in the chart. Absence of recorded allergies does NOT confirm NKDA — verify directly with patient.';
      }

      const uncertain = Boolean(s.uncertain) || sourceIds.length === 0;
      if (sourceIds.length === 0 && evidenceType !== 'Missing / Conflict Alert') {
        warnings.push(`Claim "${headline}" had no valid source record ID and was marked uncertain.`);
      }

      return {
        id: asTrimmedString(s.id, `brief-claim-${idx + 1}`),
        section,
        headline,
        detail,
        sourceIds,
        evidenceType,
        uncertain,
      };
    })
    .filter((s) => s.detail.length > 0);

  if (sections.length === 0 && whatMattersTodayBullets.length === 0) {
    errors.push('Pre-consultation brief contained no clinical sections or What Matters Today items.');
    return { valid: false, errors, warnings };
  }

  const missingClinicalData = Array.isArray(obj.missingClinicalData)
    ? obj.missingClinicalData.map((x) => asTrimmedString(x)).filter(Boolean)
    : [];
  const conflictingInformation = Array.isArray(obj.conflictingInformation)
    ? obj.conflictingInformation.map((x) => asTrimmedString(x)).filter(Boolean)
    : [];
  const uncertaintyIndicators = Array.isArray(obj.uncertaintyIndicators)
    ? obj.uncertaintyIndicators.map((x) => asTrimmedString(x)).filter(Boolean)
    : [];

  if (!hasRecordedAllergies && !missingClinicalData.some((m) => /allerg/i.test(m))) {
    missingClinicalData.unshift(
      'Allergy history not recorded in chart — absence of data does not confirm NKDA.'
    );
  }

  return {
    valid: true,
    errors,
    warnings,
    sanitized: {
      whatMattersTodayHeadline,
      whatMattersTodayBullets,
      sections,
      missingClinicalData,
      conflictingInformation,
      uncertaintyIndicators,
      disclaimer:
        'Prototype AI draft based on synthetic EHR records. Every claim must be verified against its linked source record by an authorized clinician.',
    },
  };
}

export function validateAmbientScribeV2Output(
  raw: unknown,
  draftVersion: number
): ValidationOutcome<AmbientScribeV2Output> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Ambient Scribe V2 response must be a JSON object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;
  const soapObj =
    obj.soap && typeof obj.soap === 'object' ? (obj.soap as Record<string, unknown>) : {};

  const subjective = asTrimmedString(soapObj.subjective);
  const objective = asTrimmedString(soapObj.objective);
  const assessment = asTrimmedString(soapObj.assessment);
  const plan = asTrimmedString(soapObj.plan);

  if (!subjective && !objective && !assessment && !plan) {
    errors.push('SOAP draft returned empty S/O/A/P sections.');
    return { valid: false, errors, warnings };
  }

  const validSoapKeys = new Set(['subjective', 'objective', 'assessment', 'plan']);
  const supportingTranscriptQuotes = Array.isArray(obj.supportingTranscriptQuotes)
    ? obj.supportingTranscriptQuotes
        .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
        .map((q) => {
          const sec = asTrimmedString(q.section, 'subjective').toLowerCase();
          return {
            section: (validSoapKeys.has(sec) ? sec : 'subjective') as
              | 'subjective'
              | 'objective'
              | 'assessment'
              | 'plan',
            quote: asTrimmedString(q.quote),
          };
        })
        .filter((q) => q.quote.length > 0)
    : [];

  const unsupportedOrUncertainStatements = Array.isArray(obj.unsupportedOrUncertainStatements)
    ? obj.unsupportedOrUncertainStatements
        .filter((u): u is Record<string, unknown> => Boolean(u && typeof u === 'object'))
        .map((u) => {
          const sec = asTrimmedString(u.section, 'assessment').toLowerCase();
          return {
            section: (validSoapKeys.has(sec) ? sec : 'assessment') as
              | 'subjective'
              | 'objective'
              | 'assessment'
              | 'plan',
            statement: asTrimmedString(u.statement),
            reason: asTrimmedString(u.reason, 'Requires direct clinician confirmation against encounter exam/transcript.'),
          };
        })
        .filter((u) => u.statement.length > 0)
    : [];

  const medicationsMentionedAsProposalsOnly = Array.isArray(obj.medicationsMentionedAsProposalsOnly)
    ? obj.medicationsMentionedAsProposalsOnly.map((m) => asTrimmedString(m)).filter(Boolean)
    : [];

  return {
    valid: true,
    errors,
    warnings,
    sanitized: {
      draftVersion: Math.max(1, draftVersion),
      draftStatus: 'Draft',
      autoSigned: false,
      soap: {
        subjective: subjective || 'Not explicitly stated in transcript — clinician review required.',
        objective: objective || 'No physical examination findings explicitly documented in transcript — clinician must document verified exam.',
        assessment: assessment || 'Draft assessment pending clinician verification — AI does not establish clinical diagnoses.',
        plan: plan || 'Draft plan pending clinician review and explicit order authorization.',
      },
      supportingTranscriptQuotes,
      unsupportedOrUncertainStatements,
      medicationsMentionedAsProposalsOnly,
      clinicianSignOffNotice:
        'Draft SOAP note only (auto-signing disabled). Authorized clinician must review against original transcript and sign manually.',
    },
  };
}

export function validateActionComposerOutput(
  raw: unknown,
  encounterId: string,
  allowedSourceIds: readonly string[]
): ValidationOutcome<ActionComposerOutput> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Action composer response must be a JSON object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;
  const allowedSet = new Set(allowedSourceIds);
  const rawProposals = Array.isArray(obj.proposals) ? obj.proposals : [];

  const seenIdempotency = new Set<string>();
  const proposals: ActionComposerOutput['proposals'] = [];

  for (let i = 0; i < rawProposals.length; i += 1) {
    const item = rawProposals[i];
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const rawKind = asTrimmedString(rec.kind, 'Task');
    const kind = VALID_PROPOSAL_KINDS.has(rawKind)
      ? (rawKind as ActionComposerOutput['proposals'][number]['kind'])
      : 'Task';
    const title = asTrimmedString(rec.title);
    if (!title) continue;

    const normalizedSlug = `${encounterId}:${kind}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
    const idempotencyKey = asTrimmedString(rec.idempotencyKey) || normalizedSlug;
    if (seenIdempotency.has(idempotencyKey)) {
      warnings.push(`Deduplicated repeated clinical action proposal "${title}" via idempotency key.`);
      continue;
    }
    seenIdempotency.add(idempotencyKey);

    const rawPayload =
      rec.payload && typeof rec.payload === 'object' ? (rec.payload as Record<string, unknown>) : {};
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawPayload)) {
      if (typeof v === 'string' && v.trim()) payload[k] = v.trim();
    }

    const sourceIds = filterAllowedIds(rec.sourceIds, allowedSet, warnings, `Action proposal "${title}"`);

    proposals.push({
      id: asTrimmedString(rec.id, `ai-act-${encounterId}-${i + 1}`),
      idempotencyKey,
      kind,
      title,
      summary: asTrimmedString(rec.summary, title),
      supportingSourceText: asTrimmedString(
        rec.supportingSourceText,
        'Derived from reviewed encounter SOAP plan.'
      ),
      sourceIds,
      rationale: asTrimmedString(rec.rationale, 'Proposed from reviewed consultation plan.'),
      confidence: normalizeConfidence(rec.confidence),
      uncertaintyNote: asTrimmedString(rec.uncertaintyNote) || undefined,
      requiresClinicianAuthorization: true,
      payload,
    });
  }

  return {
    valid: true,
    errors,
    warnings,
    sanitized: {
      encounterId,
      proposals,
      safetyBoundaryNote:
        'AI proposes structured clinical actions only. Every order, medication draft, task, or referral requires individual authorization by an authorized clinician.',
    },
  };
}

export function validateChartNarrativeOutput(
  raw: unknown,
  allowedSourceIds: readonly string[]
): ValidationOutcome<{ answer: string; sourceIds: string[]; incompleteOrMissingNote?: string }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Chart narrative response must be a JSON object.'], warnings };
  }
  const obj = raw as Record<string, unknown>;
  const answer = asTrimmedString(obj.answer);
  if (!answer) {
    return { valid: false, errors: ['Chart narrative answer cannot be empty.'], warnings };
  }
  const allowedSet = new Set(allowedSourceIds);
  const sourceIds = filterAllowedIds(obj.sourceIds, allowedSet, warnings, 'Ask EigenH narrative answer');
  return {
    valid: true,
    errors,
    warnings,
    sanitized: {
      answer,
      sourceIds,
      incompleteOrMissingNote: asTrimmedString(obj.incompleteOrMissingNote) || undefined,
    },
  };
}

export function isSupportedOperation(op: unknown): op is ClinicalAIOperation {
  return (
    op === 'document-intelligence' ||
    op === 'pre-consultation-brief' ||
    op === 'chart-search' ||
    op === 'ambient-scribe-v2' ||
    op === 'action-composer'
  );
}

export type ValidatedOperationOutput =
  | DocumentIntelligenceOutput
  | PreConsultationBriefOutput
  | ChartSearchOutput
  | AmbientScribeV2Output
  | ActionComposerOutput;
