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
  it('registers all 10 Library scenarios + all 8 dedicated Role Workflow Tutorials', () => {
    assert.equal(DEMO_DIRECTOR_SCENARIOS.length, 10);
    assert.equal(ROLE_TUTORIAL_SCENARIOS.length, 8);
    assert.equal(ROLE_TUTORIAL_CARDS.length, 8);
    assert.equal(ALL_ACADEMY_SCENARIOS.length, 18);

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

  it('executes every single one of the 18 Academy scenarios (10 Library + 8 Role Tutorials) with 100% passing assertions', () => {
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
});
