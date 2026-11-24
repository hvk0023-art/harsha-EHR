import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_APP_STATE } from '../data/seedData';
import type { AppState } from '../types/hms';
import {
  advanceToNextFilteredScene,
  computePacedDurationMs,
  computeWorkflowEfficiencyMetrics,
  getFilteredSceneIndices,
  prepareScenarioBeforeIndex,
  runEntireScenarioSync,
  seekScenarioToIndex,
  startScenarioAtIndex,
  stepToPreviousFilteredScene,
} from './demoEngine';
import { DEMO_IDS, DEMO_PATIENT_ID } from './demoFixtures';
import {
  ALL_ACADEMY_SCENARIOS,
  DEMO_DIRECTOR_SCENARIOS,
  ROLE_TUTORIAL_SCENARIOS,
  getScenarioById,
} from './demoScenarios';
import { ROLE_TUTORIAL_CARDS } from './roleWorkflowRegistry';
import {
  buildTypingFrames,
  computeTypingFrameDelayMs,
  resolveDemoSelector,
} from './visibleTypingController';

function freshState(): AppState {
  return structuredClone(INITIAL_APP_STATE);
}

describe('EigenH Guided Demo Academy V2 Engine', () => {
  it('registers all 11 Library scenarios + all 8 dedicated Role Workflow Tutorials', () => {
    assert.equal(DEMO_DIRECTOR_SCENARIOS.length, 11);
    assert.equal(ROLE_TUTORIAL_SCENARIOS.length, 8);
    assert.equal(ROLE_TUTORIAL_CARDS.length, 8);
    assert.equal(ALL_ACADEMY_SCENARIOS.length, 19);

    for (const card of ROLE_TUTORIAL_CARDS) {
      const scen = getScenarioById(card.scenarioId);
      assert.ok(scen, `Role card ${card.roleKey} must map to scenario ${card.scenarioId}`);
      assert.equal(scen.status, 'Ready');
      assert.equal(scen.isRoleTutorial, true);
      assert.ok(scen.scenes.length >= 8, `Role tutorial ${card.scenarioId} should have >=8 granular steps`);
    }

    // Verify exact required step counts on Reference Front Desk (10) & Clinician Flagship (12)
    assert.equal(getScenarioById('role-front-desk')?.scenes.length, 10);
    assert.equal(getScenarioById('role-clinician')?.scenes.length, 12);
  });

  it('executes every single one of the 19 Academy scenarios (11 Library + 8 Role Tutorials) with 100% passing assertions', () => {
    for (const scenario of ALL_ACADEMY_SCENARIOS) {
      const result = runEntireScenarioSync(scenario, freshState());
      assert.equal(
        result.nextPlayback.status,
        'COMPLETED',
        `Scenario ${scenario.id} failed: ${result.nextPlayback.errorMessage || 'unknown error'}`
      );
      assert.equal(
        result.nextPlayback.assertionLogs.length,
        scenario.scenes.length,
        `Scenario ${scenario.id} should log every step assertion`
      );
      for (const log of result.nextPlayback.assertionLogs) {
        assert.equal(
          log.passed,
          true,
          `Scenario ${scenario.id} Step ${log.sceneNumber} (${log.title}) failed: ${log.detail}`
        );
      }
    }
  });

  it('enforces real state mutations and strict human-in-the-loop AI boundaries across all 14 scenes of Scenario 01', () => {
    const scenario = getScenarioById('demo-01-scheduled-journey');
    assert.ok(scenario, 'Flagship Scenario 01 must exist');
    assert.equal(scenario.scenes.length, 14);

    // Stop at Scene 9 (index 8): AI Clinical Action Composer generated proposals,
    // clinician has NOT yet signed note or approved orders/meds.
    const atScene9 = startScenarioAtIndex(scenario, freshState(), { startIndex: 8, autoPlay: false });
    assert.equal(atScene9.nextPlayback.status, 'PAUSED');
    assert.equal(atScene9.nextPlayback.activeSceneIndex, 8);

    const encBeforeApproval = atScene9.nextAppState.encounters.find((e) => e.id === DEMO_IDS.encounter);
    assert.ok(encBeforeApproval, 'Draft encounter must exist at Scene 9');
    assert.equal(encBeforeApproval.noteStatus, 'Draft', 'AI Scribe must NEVER autonomously sign the clinical note');

    const scribeBeforeApproval = atScene9.nextAppState.scribeSessions.find((s) => s.id === DEMO_IDS.scribe);
    assert.ok(scribeBeforeApproval, 'Simulated ambient scribe session must exist');
    assert.equal(scribeBeforeApproval.proposedActions.length, 5);
    assert.ok(
      scribeBeforeApproval.proposedActions.every(
        (a) => a.status === 'Awaiting Approval' && Boolean(a.whyExplanation && a.whyExplanation.length > 10)
      ),
      'Every AI proposal must await human approval with an explicit Why? rationale'
    );

    const ordersBeforeApproval = atScene9.nextAppState.orders.filter((o) => o.patientId === DEMO_PATIENT_ID);
    assert.equal(ordersBeforeApproval.length, 0, 'AI must not create approved lab orders before clinician approval');

    // Advance to Scene 10 (index 9): Clinician explicitly reviews, signs SOAP note, and approves actions
    const atScene10 = seekScenarioToIndex(atScene9.nextPlayback, atScene9.nextAppState, 9);
    assert.ok(atScene10);
    const encAfterApproval = atScene10.nextAppState.encounters.find((e) => e.id === DEMO_IDS.encounter);
    assert.equal(encAfterApproval?.noteStatus, 'Signed', 'Clinician sign-off transitions SOAP note to Signed');

    const ordersAfterApproval = atScene10.nextAppState.orders.filter((o) => o.patientId === DEMO_PATIENT_ID);
    assert.ok(ordersAfterApproval.length >= 1, 'Clinician approval creates active lab order');

    // Complete through Scene 14
    const finalRes = seekScenarioToIndex(atScene10.nextPlayback, atScene10.nextAppState, 13);
    assert.ok(finalRes);
    assert.equal(finalRes.nextPlayback.status, 'COMPLETED');

    const s = finalRes.nextAppState;
    assert.equal(s.patients.filter((p) => p.id === DEMO_PATIENT_ID).length, 1);
    assert.equal(s.appointments.filter((a) => a.patientId === DEMO_PATIENT_ID).length, 2);
    assert.equal(s.preVisitIntakes.filter((i) => i.patientId === DEMO_PATIENT_ID).length, 1);
    assert.ok(s.labResults.some((l) => l.id === DEMO_IDS.labResult && l.status === 'Reviewed'));
    assert.ok(s.followUpPlans.some((f) => f.id === DEMO_IDS.followUpPlan && f.reminderStatus === 'Simulated Logged'));

    const efficiency = computeWorkflowEfficiencyMetrics(s, finalRes.nextPlayback, DEMO_PATIENT_ID);
    assert.equal(efficiency.totalScenesExecuted, 14);
    assert.equal(efficiency.passedAssertions, 14);
    assert.match(efficiency.methodologyNote, /No unmeasured time-savings percentages/i);
  });

  it('guarantees idempotent double-replay with zero duplicate records across Complete Journey, Front Desk, and Clinician tutorials', () => {
    const ids = ['demo-01-scheduled-journey', 'role-front-desk', 'role-clinician'];
    for (const id of ids) {
      const scenario = getScenarioById(id)!;
      const run1 = runEntireScenarioSync(scenario, freshState());
      assert.equal(run1.nextPlayback.status, 'COMPLETED', `${id} run1 must complete`);

      const run2 = runEntireScenarioSync(scenario, run1.nextAppState);
      assert.equal(run2.nextPlayback.status, 'COMPLETED', `${id} run2 must complete`);

      const snapshotCounts = (st: typeof run1.nextAppState) => ({
        patients: st.patients.filter((p) => p.id === DEMO_PATIENT_ID).length,
        appointments: st.appointments.filter((a) => a.patientId === DEMO_PATIENT_ID).length,
        encounters: st.encounters.filter((e) => e.patientId === DEMO_PATIENT_ID).length,
        orders: st.orders.filter((o) => o.patientId === DEMO_PATIENT_ID).length,
        labs: st.labResults.filter((l) => l.patientId === DEMO_PATIENT_ID).length,
        meds: st.medications.filter((m) => m.patientId === DEMO_PATIENT_ID).length,
        handoffs: st.handoffs.filter((h) => h.patientId === DEMO_PATIENT_ID).length,
        intakes: st.preVisitIntakes.filter((i) => i.patientId === DEMO_PATIENT_ID).length,
        followUps: st.followUpPlans.filter((f) => f.patientId === DEMO_PATIENT_ID).length,
      });

      assert.deepEqual(
        snapshotCounts(run2.nextAppState),
        snapshotCounts(run1.nextAppState),
        `Double replay of ${id} must produce zero duplicate records`
      );
    }
  });

  it('supports Guided Practice pre-step preparation, Executive Demo filtering, and deterministic backward seeking', () => {
    const fd = getScenarioById('role-front-desk')!;
    const practicePrep = prepareScenarioBeforeIndex(fd, freshState(), {
      startIndex: 0,
      learningMode: 'practice',
    });
    assert.equal(practicePrep.nextPlayback.status, 'WAITING_FOR_USER');
    assert.equal(practicePrep.nextPlayback.learningMode, 'practice');
    assert.equal(practicePrep.preStepAppState.currentRole, 'Front Desk');
    assert.equal(practicePrep.preStepAppState.currentNav, 'front-desk');

    // Executive Demo skips fine-grained steps marked executiveInclude === false
    const journey = getScenarioById('demo-01-scheduled-journey')!;
    const fullIndices = getFilteredSceneIndices(journey, 'full', 'watch');
    const execIndices = getFilteredSceneIndices(journey, 'full', 'executive');
    assert.equal(fullIndices.length, 14);
    assert.ok(execIndices.length < fullIndices.length && execIndices.length >= 8);

    // Speed pacing changes delay only, never clinical timestamps
    assert.equal(computePacedDurationMs(4000, 0.5), 8000);
    assert.equal(computePacedDurationMs(4000, 1), 4000);
    assert.equal(computePacedDurationMs(4000, 2), 2000);

    const fastRun = startScenarioAtIndex(journey, freshState(), { startIndex: 13, speed: 2, autoPlay: false });
    const rewound = seekScenarioToIndex(fastRun.nextPlayback, fastRun.nextAppState, 4);
    assert.ok(rewound);
    assert.equal(rewound.nextPlayback.activeSceneIndex, 4);
    assert.equal(rewound.nextAppState.encounters.some((e) => e.id === DEMO_IDS.encounter), false);

    // AI-only filter forward & backward step
    const aiIndices = getFilteredSceneIndices(journey, 'ai-only', 'watch');
    const aiStart = startScenarioAtIndex(journey, freshState(), {
      startIndex: aiIndices[0],
      filterMode: 'ai-only',
      autoPlay: false,
    });
    const aiNext = advanceToNextFilteredScene(aiStart.nextPlayback, aiStart.nextAppState);
    assert.ok(aiNext);
    assert.equal(aiNext.nextPlayback.activeSceneIndex, aiIndices[1]);
    const aiPrev = stepToPreviousFilteredScene(aiNext.nextPlayback, aiNext.nextAppState);
    assert.ok(aiPrev);
    assert.equal(aiPrev.nextPlayback.activeSceneIndex, aiIndices[0]);
  });

  it('generates progressive visible typing frames distinctly for manual entry vs AI-prepared autofill', () => {
    const manualVital = buildTypingFrames('146', { mode: 'manual' });
    assert.deepEqual(manualVital, ['1', '14', '146']);

    const appendedNote = buildTypingFrames(' Verify home BP log.', {
      mode: 'manual',
      existingValue: 'Start Amlodipine 5 mg.',
      append: true,
    });
    assert.equal(appendedNote[appendedNote.length - 1], 'Start Amlodipine 5 mg. Verify home BP log.');
    assert.ok(appendedNote.length >= 4);

    const aiFill = buildTypingFrames('Elevated home BP readings averaging 146/88 mmHg with CKD stage 3a', {
      mode: 'ai-autofill',
    });
    assert.ok(aiFill.length >= 3 && aiFill.length <= 10);
    assert.equal(
      aiFill[aiFill.length - 1],
      'Elevated home BP readings averaging 146/88 mmHg with CKD stage 3a'
    );

    assert.ok(computeTypingFrameDelayMs('manual', 3, 2) < computeTypingFrameDelayMs('manual', 3, 1));
    assert.equal(resolveDemoSelector('fd-checkin-btn-elena'), '[data-demo-target="fd-checkin-btn-elena"]');
    assert.equal(resolveDemoSelector('#post-soap-plan'), '#post-soap-plan');
  });

  it('recovers missing canonical seed patients (including pat-9) from stale localStorage without duplicating existing records', async () => {
    const { rehydratePersistedAppState } = await import('../state/AppStateContext');
    const stale = freshState();
    stale.patients = stale.patients.filter((p) => p.id !== 'pat-9');
    stale.externalDocQueue = [];

    const recovered = rehydratePersistedAppState(stale);
    const matchingAarav1974 = recovered.patients.filter(
      (p) => p.fullName === 'Aarav Mehta' && p.dob === '1974-03-22'
    );
    assert.equal(matchingAarav1974.length, 1, 'Stale session must recover exactly one near-match Aarav Mehta (1974-03-22)');
    assert.equal(matchingAarav1974[0].mrn, 'MRN-208612');
    assert.ok(recovered.externalDocQueue.some((d) => d.id === 'extdoc-1'));

    // Rehydrating a second time must never duplicate any patient
    const recoveredTwice = rehydratePersistedAppState(recovered);
    assert.equal(recoveredTwice.patients.length, recovered.patients.length);
  });

  it('reconstructs missing Bengaluru near-match fixture inside isolated Registration Demo sandbox and enforces real Step 2 Name-Only duplicate guard', async () => {
    const {
      buildCleanRegistrationDemoState,
      findNearMatchAarav,
      findRegisteredAarav,
      REG_DEMO_NEAR_MATCH_MRN,
    } = await import('./registrationConsolidationScenario');

    const regScenario = getScenarioById('demo-00-registration-consolidation')!;
    assert.ok(regScenario);

    // Strip pat-9, Bengaluru facility, and Bengaluru staff to simulate worst-case stale workspace
    const degraded = freshState();
    degraded.patients = degraded.patients.filter((p) => p.id !== 'pat-9');
    degraded.facilities = degraded.facilities.filter((f) => f.id !== 'fac-bengaluru');
    degraded.staff = degraded.staff.filter((s) => s.facilityId !== 'fac-bengaluru');

    const prepared = buildCleanRegistrationDemoState(degraded);
    const nearMatch = findNearMatchAarav(prepared);
    assert.ok(nearMatch, 'Prepared registration sandbox must reconstruct Bengaluru near-match fixture');
    assert.equal(nearMatch.mrn, REG_DEMO_NEAR_MATCH_MRN);
    assert.equal(nearMatch.dob, '1974-03-22');
    assert.equal(prepared.currentFacilityId, 'fac-bengaluru');
    assert.equal(prepared.currentRole, 'Front Desk');

    // Step 2 validator MUST still honestly fail if near-match is removed from the validated state
    const step2 = regScenario.scenes[1];
    const withoutNearMatch: AppState = {
      ...prepared,
      patients: prepared.patients.filter((p) => p.id !== nearMatch.id),
    };
    const negativeCheck = step2.validate(withoutNearMatch);
    assert.equal(negativeCheck.passed, false, 'Step 2 post-check must NOT be weakened; it must fail if near-match is absent');

    // Running full 10-chapter registration demo from degraded state completes 10/10
    const run1 = runEntireScenarioSync(regScenario, degraded);
    assert.equal(run1.nextPlayback.status, 'COMPLETED', run1.nextPlayback.errorMessage || 'reg run1 failed');
    assert.equal(run1.nextPlayback.assertionLogs.length, 10);
    assert.ok(run1.nextPlayback.assertionLogs.every((l) => l.passed));

    const registeredAarav = findRegisteredAarav(run1.nextAppState);
    assert.ok(registeredAarav, 'Registered Aarav Mehta (1979-08-15) must exist after completion');
    assert.equal(
      run1.nextAppState.patients.filter((p) => p.fullName === 'Aarav Mehta').length,
      2,
      'Must keep both distinct Aarav Mehta records separate (1974-03-22 near-match + 1979-08-15 registered)'
    );

    // Double replay must produce zero duplicates across all collections
    const run2 = runEntireScenarioSync(regScenario, run1.nextAppState);
    assert.equal(run2.nextPlayback.status, 'COMPLETED');
    const regCounts = (st: AppState) => ({
      patients: st.patients.length,
      nearMatches: st.patients.filter((p) => p.dob === '1974-03-22' && p.fullName === 'Aarav Mehta').length,
      registered: st.patients.filter((p) => p.dob === '1979-08-15' && p.fullName === 'Aarav Mehta').length,
      appointments: st.appointments.length,
      documents: st.documents.length,
      labs: st.labResults.length,
      meds: st.medications.length,
      inbox: st.dataInboxItems.length,
      audits: st.auditEvents.filter((a) => a.id.startsWith('aud-regdemo-')).length,
    });
    assert.deepEqual(regCounts(run2.nextAppState), regCounts(run1.nextAppState));
  });

  it('executes all 19 Academy scenarios to 100% completion even from a stale state missing pat-9, pat-1, and extdoc-1', () => {
    const stale = freshState();
    stale.patients = stale.patients.filter((p) => p.id !== 'pat-9' && p.id !== 'pat-1');
    stale.externalDocQueue = [];
    stale.currentFacilityId = 'fac-bengaluru';

    for (const scenario of ALL_ACADEMY_SCENARIOS) {
      const result = runEntireScenarioSync(scenario, structuredClone(stale));
      assert.equal(
        result.nextPlayback.status,
        'COMPLETED',
        `Scenario ${scenario.id} failed from stale state: ${result.nextPlayback.errorMessage || 'unknown'}`
      );
      assert.ok(
        result.nextPlayback.assertionLogs.every((l) => l.passed),
        `Scenario ${scenario.id} had failing assertions from stale state`
      );
    }
  });
});
