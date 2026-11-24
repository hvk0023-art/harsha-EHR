import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_APP_STATE } from '../data/seedData';
import { runEntireScenarioSync } from '../demo/demoEngine';
import {
  findRegisteredAarav,
  REGISTRATION_CONSOLIDATION_SCENARIO,
} from '../demo/registrationConsolidationScenario';
import type { AppState } from '../types/hms';
import {
  buildExplainableRecommendations,
  buildPatientKnowledgeGraph,
  findRelatedWorldReferences,
  WORLD_KNOWLEDGE_REFERENCE_ENTRIES,
} from './knowledgeGraph';
import {
  buildRegistrationDemoCompletionSummary,
  classifySyntheticDocument,
  computeRegistrationCompleteness,
  DATA_SOURCE_ADAPTERS,
  evaluateDuplicateSafety,
  mergeVerifiedPatientFields,
  SYNTHETIC_DOCUMENT_TEMPLATES,
} from './registrationIntelligence';

function freshState(): AppState {
  return structuredClone(INITIAL_APP_STATE);
}

describe('Patient Registration Intelligence, Data Inbox & Knowledge Graph', () => {
  it('blocks automatic merge on name-only match while allowing match on Name + DOB/Phone', () => {
    const state = freshState();

    // Near-match Bengaluru patient pat-9 is Aarav Mehta (DOB 1974-03-22, +91 98450 77812)
    const nameOnly = evaluateDuplicateSafety(state.patients, {
      fullName: 'Aarav Mehta',
      dob: '1979-08-15',
      phone: '+91 98452 33109',
    });
    assert.ok(nameOnly.length >= 1, 'Should detect existing Aarav Mehta as a near-match candidate');
    assert.equal(nameOnly[0].tier, 'Name-Only Match — Do NOT Merge');
    assert.equal(nameOnly[0].mergeAllowed, false, 'Name-only match must NEVER permit merge');

    // Name + matching DOB triggers Possible Duplicate with explicit confirmation
    const nameAndDob = evaluateDuplicateSafety(state.patients, {
      fullName: 'Aarav Mehta',
      dob: '1974-03-22',
      phone: '+91 99999 00000',
    });
    assert.equal(nameAndDob[0].tier, 'Possible Duplicate — Review Required');
    assert.equal(nameAndDob[0].mergeAllowed, true);

    // Exact Name + DOB + Phone triggers Exact Identity Match
    const exactMatch = evaluateDuplicateSafety(state.patients, {
      fullName: 'Aarav Mehta',
      dob: '1974-03-22',
      phone: '+91 98450 77812',
    });
    assert.equal(exactMatch[0].tier, 'Exact Identity Match');
    assert.equal(exactMatch[0].mergeAllowed, true);
  });

  it('computes registration completeness without ever requiring ABHA or Aadhaar', () => {
    const incomplete = computeRegistrationCompleteness({
      fullName: 'Aarav Mehta',
      dob: '',
      sex: 'Male',
      phone: '',
      address: '',
      chiefConcern: '',
    });
    assert.equal(incomplete.readyForRegistration, false);
    assert.ok(incomplete.missingRequired.includes('Date of Birth'));
    assert.ok(incomplete.missingRequired.includes('Mobile / Phone Number'));

    const completeWithoutAbha = computeRegistrationCompleteness({
      fullName: 'Aarav Mehta',
      dob: '1979-08-15',
      sex: 'Male',
      phone: '+91 98452 33109',
      address: '42 12th Main Rd, Indiranagar, Bengaluru 560038',
      chiefConcern: 'Scheduled preventive diabetes review',
      email: 'aarav.mehta.demo@example.in',
      emergencyContactName: 'Meera Mehta',
      abhaId: '',
    });
    assert.equal(completeWithoutAbha.readyForRegistration, true);
    assert.equal(completeWithoutAbha.percentage, 100);
  });

  it('protects previously verified fields from silent overwrite when incoming documents differ', () => {
    const result = mergeVerifiedPatientFields(
      { phone: '+91 98452 33109', email: '' },
      {
        phone: {
          status: 'Verified',
          source: 'Front Desk Verification',
          updatedAt: '2026-11-18',
          verifiedBy: 'Kavya Nair',
        },
      },
      { phone: '+91 90000 11111', email: 'new.email@example.in' },
      'External Lab PDF'
    );

    assert.equal(result.mergedValues.phone, '+91 98452 33109', 'Verified phone must NOT be overwritten');
    assert.equal(result.mergedValues.email, 'new.email@example.in', 'Empty field may be prepared');
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].preservedExisting, true);
  });

  it('enforces honest adapter connection statuses with zero fabricated live claims', () => {
    const externalAdapters = DATA_SOURCE_ADAPTERS.filter((a) => a.id !== 'adapter-synthetic-upload');
    assert.ok(externalAdapters.length >= 5);
    for (const adapter of externalAdapters) {
      assert.equal(adapter.status, 'Planned / Future Adapter (Not Connected)');
      assert.doesNotMatch(
        `${adapter.name} ${adapter.status}`,
        /(ABHA Connected|LIS Synced|DigiLocker Verified)/i
      );
    }

    assert.equal(
      classifySyntheticDocument('Metropolis_HbA1c.pdf', 'Glycated Haemoglobin 7.4% eGFR 79'),
      'Laboratory Report'
    );
    assert.equal(
      classifySyntheticDocument('Abdomen_USG.pdf', 'Ultrasound abdomen impression fatty liver'),
      'Imaging Report'
    );
    assert.equal(
      classifySyntheticDocument('MedPlus_Receipt.pdf', 'Pharmacy dispense refill atorvastatin'),
      'Pharmacy Information'
    );
    assert.ok(SYNTHETIC_DOCUMENT_TEMPLATES.length >= 4);
  });

  it('builds a strictly source-derived Patient Knowledge Graph and separated World Knowledge Reference Layer', () => {
    const state = freshState();
    const sparseGraph = buildPatientKnowledgeGraph(state, 'pat-9');
    assert.equal(sparseGraph.isLimitedGraph, true, 'Sparse synthetic patient must honestly report limited graph');
    assert.match(sparseGraph.honestyNotice, /never fabricates relationships/i);

    const richGraph = buildPatientKnowledgeGraph(state, 'pat-1');
    assert.equal(richGraph.isLimitedGraph, false);
    assert.ok(richGraph.nodes.length >= 5);
    assert.ok(richGraph.edges.length >= 4);

    // World Knowledge Reference entries must explicitly carry curated static disclaimers, accurate versions & market scope
    assert.ok(WORLD_KNOWLEDGE_REFERENCE_ENTRIES.length >= 3);
    for (const ref of WORLD_KNOWLEDGE_REFERENCE_ENTRIES) {
      assert.ok(ref.sourceVersion.length > 3);
      assert.ok(ref.marketApplicability.length > 5);
      assert.match(ref.governanceDisclaimer, /Curated static reference metadata only/i);
      assert.doesNotMatch(
        `${ref.sourceName} ${ref.sourceVersion} ${ref.referenceSummary} ${ref.governanceDisclaimer}`,
        /WHO ICD-10-CM|LOINC v2\.77/i,
        'Must never conflate WHO ICD-10 with US CDC/NCHS ICD-10-CM or cite outdated LOINC v2.77'
      );
    }

    const joinedWorldMeta = WORLD_KNOWLEDGE_REFERENCE_ENTRIES.map(
      (r) => `${r.sourceName} ${r.sourceVersion} ${r.marketApplicability}`
    ).join(' | ');
    assert.match(joinedWorldMeta, /WHO ICD-10/i);
    assert.match(joinedWorldMeta, /US CDC\/NCHS ICD-10-CM/i);
    assert.match(joinedWorldMeta, /LOINC v2\.83 \(Aug 2026\)/i);

    const matchedRefs = findRelatedWorldReferences(state, 'pat-1');
    assert.ok(matchedRefs.length >= 1);
  });

  it('produces explainable AI recommendations with clear scope limits and executes 10-chapter Registration Demo idempotently', () => {
    const run1 = runEntireScenarioSync(REGISTRATION_CONSOLIDATION_SCENARIO, freshState());
    assert.equal(run1.nextPlayback.status, 'COMPLETED');
    assert.equal(run1.nextPlayback.assertionLogs.length, 10);
    assert.ok(run1.nextPlayback.assertionLogs.every((l) => l.passed));

    const aarav = findRegisteredAarav(run1.nextAppState);
    assert.ok(aarav, 'Aarav Mehta must exist after 10-chapter demo');
    assert.equal(aarav.registrationStatus, 'Verified & Ready');
    assert.equal(
      run1.nextAppState.encounters.filter((e) => e.patientId === aarav.id).length,
      0,
      'Focused registration demo must stop cleanly before clinical encounter'
    );

    const recs = buildExplainableRecommendations(run1.nextAppState, aarav.id);
    assert.ok(recs.length >= 2);
    for (const rec of recs) {
      assert.ok(rec.whatSuggested.length > 5);
      assert.ok(rec.whyAppeared.length > 10);
      assert.ok(rec.supportingPatientInfo.length > 5);
      assert.ok(rec.uncertaintyNote.length > 10);
      assert.match(rec.safetyBoundary, /never autonomously diagnoses/i);
    }

    // Double replay idempotency: running again from run1 output creates zero duplicates
    const run2 = runEntireScenarioSync(REGISTRATION_CONSOLIDATION_SCENARIO, run1.nextAppState);
    assert.equal(run2.nextPlayback.status, 'COMPLETED');
    const aaravCount = run2.nextAppState.patients.filter(
      (p) => p.fullName === 'Aarav Mehta' && p.dob === '1979-08-15'
    ).length;
    assert.equal(aaravCount, 1, 'Double replay must produce exactly 1 registered Aarav Mehta (1979-08-15)');
    assert.equal(
      run2.nextAppState.patients.filter((p) => p.id === 'pat-9').length,
      1,
      'Near-match distinct patient pat-9 (DOB 1974-03-22) must remain preserved'
    );
    const aarav2 = findRegisteredAarav(run2.nextAppState)!;
    assert.equal(
      run2.nextAppState.labResults.filter((l) => l.patientId === aarav2.id).length,
      run1.nextAppState.labResults.filter((l) => l.patientId === aarav.id).length
    );

    // Scenario-specific completion summary must reflect Bengaluru Aarav Mehta (never Elena Alvarez)
    const regSummary = buildRegistrationDemoCompletionSummary(run1.nextAppState, aarav.id);
    assert.ok(regSummary, 'Registration completion summary must resolve for Aarav Mehta');
    assert.equal(regSummary.patientName, 'Aarav Mehta');
    assert.equal(regSummary.mrn, aarav.mrn);
    assert.match(regSummary.facilityName, /Bengaluru/i);
    assert.equal(regSummary.registrationStatus, 'Verified & Ready');
    assert.equal(regSummary.encountersCreated, 0);
    assert.ok(regSummary.verifiedFields.length >= 3, 'Should list verified front-desk demographic fields');
    assert.equal(regSummary.acceptedExtractedFields.length, 3, 'Should reflect 3 staff-accepted extracted items');
    assert.equal(regSummary.rejectedExtractedFields.length, 1, 'Should reflect 1 staff-rejected uncertain item');
    assert.equal(regSummary.sourceDocuments.length, 1, 'Should reflect consolidated synthetic lab report');
    assert.ok(regSummary.outstandingItems.length >= 2, 'Should surface remaining pre-visit items transparently');
    assert.ok(regSummary.nextAppointment, 'Should include the scheduled upcoming visit');
    assert.doesNotMatch(
      JSON.stringify(regSummary),
      /Elena Alvarez|MRN-109420/i,
      'Bengaluru registration completion summary must contain zero Elena Alvarez references'
    );
  });
});
