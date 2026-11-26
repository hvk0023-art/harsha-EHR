import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_APP_STATE } from '../data/seedData';
import type { AppState } from '../types/hms';
import {
  validateActionComposerOutput,
  validateAmbientScribeV2Output,
  validateDocumentIntelligenceOutput,
  validatePreConsultationBriefOutput,
} from './aiOutputValidator';
import {
  CLINICAL_AI_EVAL_SUITE_VERSION,
  runClinicalAiEvaluationSuite,
} from './clinicalAiEvaluation';
import {
  executeDeterministicChartSearch,
  planChartQuery,
  runDeterministicActionComposer,
  runDeterministicAmbientScribeV2,
  runDeterministicDocumentIntelligence,
} from './deterministicClinicalAi';
import { buildPermittedPatientContext, verifyPatientContextAccess } from './patientContextBuilder';
import {
  classifyGeminiUpstreamError,
  computeBoundedBackoffMs,
  orderModelsWithCooldown,
  parseProviderRetryDelayMs,
} from '../../server/clinicalAiRouter';

function freshState(): AppState {
  return structuredClone(INITIAL_APP_STATE);
}

describe('EigenH Phase 2 Real AI Clinical Intelligence — Safety, Evaluation & Determinism', () => {
  it('passes all 10 synthetic evaluation corpus categories (eigenh-eval-v2.0)', () => {
    const report = runClinicalAiEvaluationSuite(freshState());
    assert.equal(report.version, CLINICAL_AI_EVAL_SUITE_VERSION);
    assert.equal(report.totalCount, 10);
    for (const item of report.results) {
      assert.equal(
        item.passed,
        true,
        `Eval case ${item.id} (${item.category}) failed: ${item.detail}`
      );
    }
    assert.equal(report.passedCount, 10);
    assert.equal(report.failedCount, 0);
  });

  it('produces genuinely different structured outputs for two distinct synthetic clinical documents', () => {
    const renalLabText = `Lab: Harborview Diagnostics
Patient: Elena Vance
DOB: 1962-04-12
MRN: MRN-100291
Sample Date: 2026-11-16
Serum Creatinine: 1.48 mg/dL (Ref: 0.60 - 1.10 mg/dL) (H)
eGFR: 46 mL/min/1.73m2 (Ref: >60 mL/min/1.73m2) (L)`;

    const diabetesDischargeText = `Hospital: Manipal Specialty Hospital Bengaluru
Patient: Aarav Mehta
DOB: 1974-03-22
MRN: MRN-208612
Discharge Date: 2026-11-15
Document Type: Discharge Summary
HbA1c: 8.6 % (Ref: 4.0 - 5.6 %) (H)
Fasting Blood Glucose: 184 mg/dL (Ref: 70 - 99 mg/dL) (H)
Diagnosis: Uncontrolled Type 2 Diabetes Mellitus with peripheral neuropathy
Continue Metformin 1000 mg twice daily`;

    const outA = runDeterministicDocumentIntelligence({
      documentId: 'doc-diff-a',
      title: 'Renal Function Lab Panel',
      sourceOrganization: 'Harborview Diagnostics',
      documentDate: '2026-11-16',
      rawText: renalLabText,
    });
    const outB = runDeterministicDocumentIntelligence({
      documentId: 'doc-diff-b',
      title: 'Hospital Discharge Summary',
      sourceOrganization: 'Manipal Specialty Hospital',
      documentDate: '2026-11-15',
      rawText: diabetesDischargeText,
    });

    assert.equal(outA.documentType, 'Laboratory Report');
    assert.equal(outB.documentType, 'Discharge Summary');
    assert.notEqual(outA.extractedPatientIdentity.fullName, outB.extractedPatientIdentity.fullName);
    assert.ok(outA.labMeasurements.some((m) => /creatinine/i.test(m.testName) && m.originalValue === '1.48'));
    assert.ok(outB.labMeasurements.some((m) => /hba1c/i.test(m.testName) && m.originalValue === '8.6'));
    assert.ok(!outA.labMeasurements.some((m) => /hba1c/i.test(m.testName)));
    assert.ok(!outB.labMeasurements.some((m) => /creatinine/i.test(m.testName)));
  });

  it('produces genuinely different Ambient Scribe V2 SOAP drafts and Action Composer proposals for two distinct transcripts', () => {
    const state = freshState();
    const ctxRes = buildPermittedPatientContext(state, {
      patientId: 'pat-1',
      role: 'Clinician',
      userId: 'staff-1',
      facilityId: 'fac-boston',
    });
    assert.equal(ctxRes.ok, true);
    if (!ctxRes.ok) return;

    const ckdTranscript = `Clinician: Your clinic blood pressure is 150/90 and eGFR is 48.
Patient: I have mild evening ankle swelling and take Lisinopril 10 mg daily.
Clinician: Let us propose starting Amlodipine 5 mg once daily, order a Basic Metabolic Panel in 2 weeks, and refer to Nephrology for CKD stage 3a.`;

    const afibTranscript = `Clinician: Your pulse is irregular at 92 bpm and INR returned at 1.6 on Warfarin 5 mg.
Patient: I missed two evening tablets while traveling and noticed brief palpitations yesterday.
Clinician: Please resume Warfarin 5 mg daily without doubling doses, order a repeat INR in 5 days, and follow up with Cardiology anticoagulation clinic in 1 week.`;

    const soapA = runDeterministicAmbientScribeV2(
      {
        patientId: 'pat-1',
        encounterId: 'enc-diff-a',
        transcript: ckdTranscript,
        draftVersion: 1,
        patientContextJson: ctxRes.context.contextSummaryJson,
        allowedSourceIds: ctxRes.context.allowedSourceIds,
      },
      ctxRes.context
    );
    const soapB = runDeterministicAmbientScribeV2(
      {
        patientId: 'pat-1',
        encounterId: 'enc-diff-b',
        transcript: afibTranscript,
        draftVersion: 1,
        patientContextJson: ctxRes.context.contextSummaryJson,
        allowedSourceIds: ctxRes.context.allowedSourceIds,
      },
      ctxRes.context
    );

    assert.equal(soapA.draftStatus, 'Draft');
    assert.equal(soapA.autoSigned, false);
    assert.equal(soapB.draftStatus, 'Draft');
    assert.equal(soapB.autoSigned, false);
    assert.notEqual(soapA.soap.plan, soapB.soap.plan);
    assert.match(soapA.soap.plan, /Amlodipine/i);
    assert.match(soapB.soap.plan, /Warfarin|INR/i);

    const actionsA = runDeterministicActionComposer(
      {
        patientId: 'pat-1',
        encounterId: 'enc-diff-a',
        soap: soapA.soap,
        transcript: ckdTranscript,
        patientContextJson: ctxRes.context.contextSummaryJson,
        allowedSourceIds: ctxRes.context.allowedSourceIds,
      },
      ctxRes.context
    );
    const actionsB = runDeterministicActionComposer(
      {
        patientId: 'pat-1',
        encounterId: 'enc-diff-b',
        soap: soapB.soap,
        transcript: afibTranscript,
        patientContextJson: ctxRes.context.contextSummaryJson,
        allowedSourceIds: ctxRes.context.allowedSourceIds,
      },
      ctxRes.context
    );

    const titlesA = actionsA.proposals.map((p) => p.title).join(' | ');
    const titlesB = actionsB.proposals.map((p) => p.title).join(' | ');
    assert.notEqual(titlesA, titlesB);
    assert.ok(actionsA.proposals.every((p) => p.requiresClinicianAuthorization === true));
    assert.ok(actionsB.proposals.every((p) => p.requiresClinicianAuthorization === true));
  });

  it('enforces validator safety rails: scrubs invented ref ranges, drops ungrounded IDs, and prevents auto-signing', () => {
    // 1. Invented reference range scrubbed when absent from raw source text
    const rawDocText = 'Patient: Elena Vance\nDOB: 1962-04-12\nSerum Potassium: 4.9 mmol/L';
    const docCheck = validateDocumentIntelligenceOutput(
      {
        documentType: 'Laboratory Report',
        documentDate: '2026-11-16',
        laboratoryOrFacilityIdentity: 'Outside Lab',
        extractedPatientIdentity: { fullName: 'Elena Vance', dob: '1962-04-12' },
        summary: 'Potassium result',
        labMeasurements: [
          {
            testName: 'Serum Potassium',
            originalValue: '4.9',
            originalUnit: 'mmol/L',
            referenceRange: '3.5 - 5.1 mmol/L', // Hallucinated — not in rawDocText!
            sampleOrResultDate: '2026-11-16',
            laboratoryIdentity: 'Outside Lab',
            flag: 'Normal',
            sourceSnippet: 'Serum Potassium: 4.9 mmol/L',
            uncertain: false,
          },
        ],
        extractedFields: [],
        missingOrAmbiguousFlags: [],
        identitySafetyNote: 'Matched DOB',
      },
      rawDocText
    );
    assert.equal(docCheck.valid, true);
    assert.equal(
      docCheck.sanitized?.labMeasurements[0].referenceRange,
      'Not stated in source document',
      'Hallucinated reference range must be replaced with "Not stated in source document"'
    );
    assert.equal(docCheck.sanitized?.labMeasurements[0].uncertain, true);

    // 2. Pre-consultation brief drops ungrounded source IDs
    const briefCheck = validatePreConsultationBriefOutput(
      {
        whatMattersTodayHeadline: 'CKD follow-up',
        whatMattersTodayBullets: [
          { text: 'eGFR 48', sourceIds: ['lab-1', 'fake-id-404'] },
        ],
        sections: [
          {
            id: 'sec-1',
            section: 'Laboratory Trends',
            headline: 'Renal trend',
            detail: 'eGFR 48 mL/min',
            sourceIds: ['lab-1', 'another-fake-999'],
            evidenceType: 'Source-Grounded Fact',
          },
        ],
        missingClinicalData: [],
        conflictingInformation: [],
        uncertaintyIndicators: [],
        disclaimer: 'Draft',
      },
      ['lab-1']
    );
    assert.equal(briefCheck.valid, true);
    assert.deepEqual(briefCheck.sanitized?.whatMattersTodayBullets[0].sourceIds, ['lab-1']);
    assert.deepEqual(briefCheck.sanitized?.sections[0].sourceIds, ['lab-1']);
    assert.ok(briefCheck.warnings.some((w) => w.includes('fake-id-404')));

    // 3. Ambient Scribe V2 cannot mark note Signed
    const scribeCheck = validateAmbientScribeV2Output(
      {
        draftVersion: 2,
        draftStatus: 'Signed',
        autoSigned: true,
        soap: {
          subjective: 'Subj',
          objective: 'Obj',
          assessment: 'Assess',
          plan: 'Plan',
        },
        supportingTranscriptQuotes: [],
        unsupportedOrUncertainStatements: [],
        medicationsMentionedAsProposalsOnly: [],
        clinicianSignOffNotice: '',
      },
      2
    );
    assert.equal(scribeCheck.valid, true);
    assert.equal(scribeCheck.sanitized?.draftStatus, 'Draft');
    assert.equal(scribeCheck.sanitized?.autoSigned, false);

    // 4. Action Composer enforces authorization & deduplication
    const compCheck = validateActionComposerOutput(
      {
        encounterId: 'enc-99',
        proposals: [
          {
            id: 'a1',
            idempotencyKey: 'key-same',
            kind: 'Referral',
            title: 'Nephrology Referral',
            summary: 'CKD stage 3a consult',
            supportingSourceText: 'Refer to nephrology',
            sourceIds: ['enc-99', 'bad-src'],
            rationale: 'Rising ACR',
            confidence: 'High',
            requiresClinicianAuthorization: false,
            payload: { specialty: 'Nephrology' },
          },
          {
            id: 'a2',
            idempotencyKey: 'key-same',
            kind: 'Referral',
            title: 'Nephrology Referral Duplicate',
            summary: 'Duplicate',
            supportingSourceText: 'Refer to nephrology',
            sourceIds: ['enc-99'],
            rationale: 'Dup',
            confidence: 'High',
            requiresClinicianAuthorization: true,
            payload: { specialty: 'Nephrology' },
          },
        ],
        safetyBoundaryNote: '',
      },
      'enc-99',
      ['enc-99']
    );
    assert.equal(compCheck.valid, true);
    assert.equal(compCheck.sanitized?.proposals.length, 1);
    assert.equal(compCheck.sanitized?.proposals[0].requiresClinicianAuthorization, true);
    assert.deepEqual(compCheck.sanitized?.proposals[0].sourceIds, ['enc-99']);
  });

  it('answers structured Ask EigenH chart queries deterministically with tables/trends and blocks unauthorized patient access', () => {
    const state = freshState();
    const ctxRes = buildPermittedPatientContext(state, {
      patientId: 'pat-1',
      role: 'Clinician',
      userId: 'staff-1',
      facilityId: 'fac-boston',
    });
    assert.equal(ctxRes.ok, true);
    if (!ctxRes.ok) return;

    // Structured BP trend query
    const bpPlan = planChartQuery('Show blood pressure trend');
    assert.equal(bpPlan.intent, 'bp-trend');
    assert.equal(bpPlan.strategy, 'deterministic-structured');
    const bpAns = executeDeterministicChartSearch(ctxRes.context, 'Show blood pressure trend');
    assert.ok(bpAns.sources.length >= 1, 'BP trend must cite permitted vital observations');
    assert.ok(bpAns.trendSeries && bpAns.trendSeries.points.length >= 1, 'BP trend must emit chart series');

    // Active medications query
    const medAns = executeDeterministicChartSearch(ctxRes.context, 'List active medications');
    assert.equal(medAns.queryPlan.intent, 'active-medications');
    assert.ok(medAns.table && medAns.table.rows.length >= 1);

    // Cross-facility access blocked for facility-scoped clinician
    const bengaluruPat = state.patients.find((p) => p.facilityId === 'fac-bengaluru');
    assert.ok(bengaluruPat, 'Seed data should include a Bengaluru patient');
    const blocked = verifyPatientContextAccess(state, {
      patientId: bengaluruPat.id,
      role: 'Clinician',
      userId: 'staff-1',
      facilityId: 'fac-boston',
    });
    assert.equal(blocked.allowed, false);
  });

  it('classifies Gemini upstream errors accurately without treating 404/401/403 as transient capacity and bounds retry delays', () => {
    const authErr = classifyGeminiUpstreamError(
      new Error('{"error":{"code":403,"message":"API key not valid","status":"PERMISSION_DENIED"}}')
    );
    assert.equal(authErr.category, 'auth');
    assert.equal(authErr.errorCode, 'LIVE_AI_AUTH_ERROR');
    assert.equal(authErr.retryable, false);
    assert.equal(authErr.failoverAllowed, false);

    const notFoundErr = classifyGeminiUpstreamError(
      new Error('{"error":{"code":404,"message":"models/gemini-2.5-flash is not found","status":"NOT_FOUND"}}')
    );
    assert.equal(notFoundErr.category, 'unsupported_model');
    assert.equal(notFoundErr.errorCode, 'LIVE_AI_MODEL_UNSUPPORTED');
    assert.equal(notFoundErr.retryable, false, '404 unsupported model must never be retried as transient capacity');
    assert.equal(notFoundErr.failoverAllowed, true);

    const capErr = classifyGeminiUpstreamError(
      new Error('{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}')
    );
    assert.equal(capErr.category, 'capacity_transient');
    assert.equal(capErr.errorCode, 'LIVE_AI_CAPACITY_UNAVAILABLE');
    assert.equal(capErr.retryable, true);
    assert.equal(capErr.failoverAllowed, true);
    assert.ok(capErr.formattedMessage.startsWith('Live Gemini AI unavailable (HTTP 503):'));

    assert.equal(parseProviderRetryDelayMs('{"retryDelay":"2s"}'), 2000);
    assert.equal(parseProviderRetryDelayMs('Please retry in 1500ms'), 1500);
    assert.equal(parseProviderRetryDelayMs('Please retry after 30s'), 4000, 'Provider retry delay must be bounded');
    const b0 = computeBoundedBackoffMs(0, undefined, 0);
    const b1 = computeBoundedBackoffMs(1, undefined, 0);
    assert.equal(b0, 500);
    assert.equal(b1, 1000);
    assert.equal(computeBoundedBackoffMs(0, 2200, 0), 2200);

    // Anti-hammering cooldown moves overloaded primary behind healthy fallback until cooldown expires
    const cd = new Map<string, number>([['gemini-4-hydrogen', 10_000]]);
    assert.deepEqual(
      orderModelsWithCooldown(['gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.5-flash'], cd, 5_000),
      ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-4-hydrogen']
    );
    assert.deepEqual(
      orderModelsWithCooldown(['gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.5-flash'], cd, 12_000),
      ['gemini-4-hydrogen', 'gemini-3.6-flash', 'gemini-3.5-flash']
    );
  });
});
