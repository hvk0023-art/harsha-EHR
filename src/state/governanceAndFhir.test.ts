import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INITIAL_APP_STATE } from '../data/seedData';
import type { AppState } from '../types/hms';
import { buildPatientTimeline, filterTimelineEvents } from './clinicalEvents';

function createInitialState(): AppState {
  return structuredClone(INITIAL_APP_STATE);
}
import {
  buildClinicalSafetyRadar,
  buildJourneyTimeMachine,
  buildPreVisitReadiness,
  buildWhatMattersToday,
} from './clinicalIntelligence';
import { executeAuthorizedFhirExport, fromBase64Utf8 } from './fhirExport';
import {
  ALL_STAFF_ROLES,
  canAccessNav,
  canExportPatientFhir,
  canManageAdministration,
  canOrderOrPrescribe,
  canRecordIntakeVitals,
  canSignClinicalNote,
  canSwitchFacility,
  canViewTeamWork,
  getRoleCapabilities,
} from './permissions';
import { runEntireScenarioSync } from '../demo/demoEngine';
import { DEMO_PATIENT_ID } from '../demo/demoFixtures';
import { getScenarioById } from '../demo/demoScenarios';

describe('RBAC Governance & Role Capability Matrix', () => {
  it('enforces Administrator-only FHIR export and Administration access across all 12 roles', () => {
    assert.equal(ALL_STAFF_ROLES.length, 12);
    for (const role of ALL_STAFF_ROLES) {
      const isAdmin = role === 'Administrator';
      assert.equal(canExportPatientFhir(role), isAdmin, `${role} FHIR export mismatch`);
      assert.equal(canManageAdministration(role), isAdmin, `${role} admin access mismatch`);
      assert.equal(canAccessNav(role, 'administration'), isAdmin, `${role} admin nav mismatch`);

      const summary = getRoleCapabilities(role);
      assert.ok(summary.allowedActions.length > 0, `${role} should list allowed actions`);
    }
  });

  it('restricts Team Work and unrestricted Facility Switching to authorized supervisory/admin roles', () => {
    assert.equal(canViewTeamWork('Clinician'), false);
    assert.equal(canViewTeamWork('Medical Assistant'), false);
    assert.equal(canViewTeamWork('Front Desk'), false);
    assert.equal(canViewTeamWork('Nurse Practitioner'), false);
    assert.equal(canViewTeamWork('Supervisor'), true);
    assert.equal(canViewTeamWork('Administrator'), true);

    assert.equal(canSwitchFacility('Clinician'), false);
    assert.equal(canSwitchFacility('Medical Assistant'), false);
    assert.equal(canSwitchFacility('Supervisor'), true);
    assert.equal(canSwitchFacility('Administrator'), true);

    assert.equal(canSignClinicalNote('Medical Assistant'), false);
    assert.equal(canOrderOrPrescribe('Medical Assistant'), false);
    assert.equal(canSignClinicalNote('Front Desk'), false);
    assert.equal(canOrderOrPrescribe('Front Desk'), false);
    assert.equal(canSignClinicalNote('Supervisor'), false);
    assert.equal(canOrderOrPrescribe('Supervisor'), false);
    assert.equal(canExportPatientFhir('Supervisor'), false);
    assert.equal(canRecordIntakeVitals('Medical Assistant'), true);
    assert.equal(canSignClinicalNote('Nurse Practitioner'), true);
    assert.equal(canSignClinicalNote('Clinician'), true);
    assert.equal(canOrderOrPrescribe('Clinician'), true);
  });
});

describe('Critical Clinical Events Timeline Non-Inflation', () => {
  it('excludes routine outpatient visits and non-critical abnormal labs while flagging true critical events', () => {
    const scenario1 = getScenarioById('demo-01-scheduled-journey')!;
    const completed = runEntireScenarioSync(scenario1, createInitialState());
    const timeline = buildPatientTimeline(completed.nextAppState, DEMO_PATIENT_ID);
    const critical = filterTimelineEvents(timeline, 'critical');

    assert.ok(timeline.length >= 6, 'Completed Scenario 01 patient should have rich timeline events');
    assert.equal(
      critical.length,
      0,
      'Routine outpatient HTN follow-up with non-critical HbA1c 6.9% must NOT inflate Critical Events'
    );

    // Now run Scenario 09 (Critical STAT Potassium 6.1 mmol/L)
    const scenario9 = getScenarioById('demo-09-safety-exception')!;
    const critRun = runEntireScenarioSync(scenario9, createInitialState());
    const critTimeline = buildPatientTimeline(critRun.nextAppState, DEMO_PATIENT_ID);
    const critOnly = filterTimelineEvents(critTimeline, 'critical');
    assert.ok(
      critOnly.some((e) => e.category === 'Laboratory' && e.title.includes('Potassium')),
      'Critical STAT Potassium 6.1 mmol/L MUST appear in Critical Events'
    );
    assert.equal(
      critOnly.find((e) => e.title.includes('Potassium'))?.eventNature,
      'Significant Clinical Event',
      'Disease/lab critical value is distinguished from Formal Adverse Event (Medical Care)'
    );
  });
});

describe('Administrator-Only HL7 FHIR R4 Export & PII Redaction', () => {
  it('blocks Clinician, Supervisor, and Front Desk export attempts', () => {
    const state = createInitialState();
    for (const role of ['Clinician', 'Supervisor', 'Front Desk', 'Medical Assistant', 'Nurse Practitioner'] as const) {
      const outcome = executeAuthorizedFhirExport(state, {
        role,
        actorName: `Test ${role}`,
        patientId: 'pat-1',
        mode: 'masked',
      });
      assert.equal(outcome.ok, false, `${role} must be blocked from FHIR R4 export`);
      assert.match(outcome.error || '', /Unauthorized/i);
    }
  });

  it('produces structurally valid masked R4 Bundle with zero PII leaks across JSON and decoded base64 attachments', () => {
    const scenario1 = getScenarioById('demo-01-scheduled-journey')!;
    const completed = runEntireScenarioSync(scenario1, createInitialState());
    const patient = completed.nextAppState.patients.find((p) => p.id === DEMO_PATIENT_ID)!;

    const maskedOutcome = executeAuthorizedFhirExport(completed.nextAppState, {
      role: 'Administrator',
      actorName: 'Priya Nair, MHA',
      patientId: DEMO_PATIENT_ID,
      mode: 'masked',
    });

    assert.equal(maskedOutcome.ok, true, `Masked export failed: ${maskedOutcome.error}`);
    assert.ok(maskedOutcome.validation?.valid);
    assert.equal(maskedOutcome.validation?.errors.length, 0);
    assert.ok(maskedOutcome.bundle && maskedOutcome.bundle.entry.length >= 8);

    // Double-check decoded attachments and raw JSON contain zero direct identifiers
    const rawJson = (maskedOutcome.json || '').toLowerCase();
    assert.equal(rawJson.includes(patient.fullName.toLowerCase()), false, 'Full name must be redacted');
    assert.equal(rawJson.includes(patient.mrn.toLowerCase()), false, 'MRN must be redacted');
    assert.equal(rawJson.includes(patient.phone.toLowerCase()), false, 'Phone must be redacted');
    assert.equal(rawJson.includes(patient.email.toLowerCase()), false, 'Email must be redacted');

    for (const entry of maskedOutcome.bundle.entry) {
      if (entry.resource.resourceType === 'DocumentReference' && Array.isArray(entry.resource.content)) {
        for (const c of entry.resource.content as { attachment?: { data?: string } }[]) {
          if (c.attachment?.data) {
            const decoded = fromBase64Utf8(c.attachment.data).toLowerCase();
            assert.equal(decoded.includes(patient.fullName.toLowerCase()), false, 'Base64 attachment leaked name');
            assert.equal(decoded.includes(patient.mrn.toLowerCase()), false, 'Base64 attachment leaked MRN');
          }
        }
      }
    }
  });

  it('requires explicit confirmation for identifiable synthetic export and succeeds when confirmed', () => {
    const state = createInitialState();
    const unconfirmed = executeAuthorizedFhirExport(state, {
      role: 'Administrator',
      actorName: 'Priya Nair, MHA',
      patientId: 'pat-1',
      mode: 'identifiable',
      confirmedIdentifiable: false,
    });
    assert.equal(unconfirmed.ok, false);
    assert.match(unconfirmed.error || '', /confirmation is required/i);

    const confirmed = executeAuthorizedFhirExport(state, {
      role: 'Administrator',
      actorName: 'Priya Nair, MHA',
      patientId: 'pat-1',
      mode: 'identifiable',
      confirmedIdentifiable: true,
    });
    assert.equal(confirmed.ok, true, `Identifiable export failed: ${confirmed.error}`);
    assert.equal(confirmed.validation?.valid, true);
  });
});

describe('AI-Native Clinical Intelligence Engines', () => {
  it('builds explicit documented Pre-Visit Readiness, What Matters Today, Clinical Safety Radar, and Journey Time Machine', () => {
    const scenario1 = getScenarioById('demo-01-scheduled-journey')!;
    const completed = runEntireScenarioSync(scenario1, createInitialState());
    const state = completed.nextAppState;

    const readiness = buildPreVisitReadiness(state, DEMO_PATIENT_ID);
    assert.ok(readiness.totalCount >= 5);
    assert.equal(readiness.completedCount, readiness.totalCount, 'Completed journey should satisfy all readiness criteria');

    const whatMatters = buildWhatMattersToday(state, DEMO_PATIENT_ID);
    assert.ok(whatMatters.length >= 3);
    assert.ok(whatMatters.every((item) => item.provenance && item.sourceLabel));

    const timeMachine = buildJourneyTimeMachine(state, DEMO_PATIENT_ID);
    assert.ok(timeMachine.length >= 6, 'Journey Time Machine should trace intake, vitals, scribe, sign-off, handoffs, labs');

    // Scenario 09 critical potassium triggers Critical Safety Radar alert
    const scenario9 = getScenarioById('demo-09-safety-exception')!;
    const atCritDetected = runEntireScenarioSync(scenario9, createInitialState());
    // Check radar on Scenario 09 Scene 1 checkpoint (before acknowledgement)
    const preAckState = atCritDetected.nextPlayback.completedSnapshots[0];
    assert.ok(preAckState);
    const radar = buildClinicalSafetyRadar(preAckState, DEMO_PATIENT_ID);
    assert.ok(
      radar.some((a) => a.category === 'Critical Lab Result' && a.severity === 'Critical'),
      'Clinical Safety Radar must surface unreviewed critical potassium alert'
    );
  });
});
