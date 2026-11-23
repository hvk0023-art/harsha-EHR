import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustPharmacyStock,
  computeArAgingReport,
  computeClaimSubmissionMetrics,
  computeInvoiceTotals,
  computeTaskSummary,
  deriveAiRequestStatus,
  findDuplicatePatients,
  hasAppointmentConflict,
} from './domainLogic';
import type {
  AiProposedAction,
  Appointment,
  ClaimRecord,
  Patient,
  PatientInvoice,
  PharmacyInventoryItem,
  TaskItem,
} from '../types/hms';

test('hasAppointmentConflict detects overlapping provider and room slots but ignores cancelled', () => {
  const existing: Appointment[] = [
    {
      id: 'a1',
      patientId: 'p1',
      providerId: 'prov-1',
      facilityId: 'fac-boston',
      date: '2026-11-18',
      startTime: '09:00',
      durationMin: 30,
      type: 'Follow-up',
      subtype: 'Scheduled Visit',
      status: 'Confirmed',
      room: 'Exam 2',
      reason: 'Checkup',
      reminderSent: true,
      calendarSynced: true,
      coPayAmount: 25,
      coPayCollected: false,
    },
    {
      id: 'a2',
      patientId: 'p2',
      providerId: 'prov-2',
      facilityId: 'fac-boston',
      date: '2026-11-18',
      startTime: '10:00',
      durationMin: 30,
      type: 'Follow-up',
      subtype: 'Scheduled Visit',
      status: 'Cancelled',
      room: 'Exam 3',
      reason: 'Cancelled',
      reminderSent: false,
      calendarSynced: false,
      coPayAmount: 0,
      coPayCollected: false,
    },
  ];

  const overlapProvider = hasAppointmentConflict(existing, {
    facilityId: 'fac-boston',
    providerId: 'prov-1',
    date: '2026-11-18',
    startTime: '09:15',
    durationMin: 30,
  });
  assert.equal(overlapProvider.conflict, true);

  const overlapRoom = hasAppointmentConflict(existing, {
    facilityId: 'fac-boston',
    providerId: 'prov-3',
    date: '2026-11-18',
    startTime: '09:00',
    durationMin: 20,
    room: 'Exam 2',
  });
  assert.equal(overlapRoom.conflict, true);

  const ignoredCancelled = hasAppointmentConflict(existing, {
    facilityId: 'fac-boston',
    providerId: 'prov-2',
    date: '2026-11-18',
    startTime: '10:00',
    durationMin: 30,
    room: 'Exam 3',
  });
  assert.equal(ignoredCancelled.conflict, false);
});

test('findDuplicatePatients detects matching name and DOB', () => {
  const patients = [
    {
      id: 'p1',
      fullName: 'Eleanor Vance',
      dob: '1958-04-12',
      phone: '(617) 555-0142',
      email: 'eleanor.vance@example.org',
    },
  ] as Patient[];

  const matches = findDuplicatePatients(patients, {
    fullName: 'Eleanor Vance',
    dob: '1958-04-12',
  });
  assert.equal(matches.length, 1);
  assert.ok(matches[0].score >= 85);

  const nonMatch = findDuplicatePatients(patients, {
    fullName: 'Samuel Park',
    dob: '1980-01-01',
  });
  assert.equal(nonMatch.length, 0);
});

test('computeTaskSummary separates my tasks vs team tasks and counts overdue accurately', () => {
  const tasks: TaskItem[] = [
    {
      id: 't1',
      title: 'Sign note',
      status: 'To Do',
      priority: 'High',
      ownerId: 'u1',
      team: 'Primary Care',
      facilityId: 'fac-1',
      dueDate: '2026-11-17',
      patientVisible: false,
      timeLoggedMin: 0,
      subtasks: [],
      comments: [],
      history: [],
    },
    {
      id: 't2',
      title: 'Team outreach',
      status: 'In Progress',
      priority: 'Medium',
      ownerId: 'u2',
      team: 'Care Coord',
      facilityId: 'fac-1',
      dueDate: '2026-11-19',
      patientVisible: false,
      timeLoggedMin: 10,
      subtasks: [],
      comments: [],
      history: [],
    },
    {
      id: 't3',
      title: 'Completed task',
      status: 'Complete',
      priority: 'Low',
      ownerId: 'u1',
      team: 'Primary Care',
      facilityId: 'fac-1',
      dueDate: '2026-11-16',
      patientVisible: false,
      timeLoggedMin: 15,
      subtasks: [],
      comments: [],
      history: [],
    },
  ];

  const summary = computeTaskSummary(tasks, 'u1', 'fac-1', '2026-11-18');
  assert.equal(summary.myTotal, 2);
  assert.equal(summary.myOpen, 1);
  assert.equal(summary.teamOpen, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.completed, 1);
});

test('adjustPharmacyStock prevents negative inventory and triggers reorder threshold', () => {
  const item: PharmacyInventoryItem = {
    id: 'ph1',
    facilityId: 'fac-1',
    ndc: '00093-1040',
    name: 'Lisinopril',
    strength: '10 mg',
    batchNumber: 'B100',
    stockQty: 25,
    reorderThreshold: 20,
    expiryDate: '2027-06-01',
    supplier: 'McKesson Demo',
    unitCost: 4,
    movements: [],
  };

  const fail = adjustPharmacyStock(item, -30, 'Dispense', 'Pharm', '2026-11-18');
  assert.equal(fail.ok, false);

  const ok = adjustPharmacyStock(item, -10, 'Dispense', 'Pharm', '2026-11-18');
  assert.equal(ok.ok, true);
  assert.equal(ok.updated?.stockQty, 15);
  assert.equal(ok.reorderTriggered, true);
});

test('computeClaimSubmissionMetrics avoids double-counting secondary claims', () => {
  const claims: ClaimRecord[] = [
    {
      id: 'c1',
      claimNumber: 'CLM-1',
      patientId: 'p1',
      facilityId: 'fac-1',
      providerId: 'prov-1',
      encounterId: 'enc-1',
      payerName: 'Medicare',
      payerCategory: 'Medicare',
      isSecondary: false,
      serviceDate: '2026-11-10',
      submittedDate: '2026-11-12',
      chargeAmount: 400,
      paidAmount: 250,
      adjustmentAmount: 50,
      patientBalance: 100,
      status: 'Submitted',
      cptCodes: ['99214'],
    },
    {
      id: 'c2',
      claimNumber: 'CLM-1-SEC',
      patientId: 'p1',
      facilityId: 'fac-1',
      providerId: 'prov-1',
      encounterId: 'enc-1',
      payerName: 'Aetna Supp',
      payerCategory: 'Commercial',
      isSecondary: true,
      primaryClaimId: 'c1',
      serviceDate: '2026-11-10',
      submittedDate: '2026-11-14',
      chargeAmount: 400,
      paidAmount: 0,
      adjustmentAmount: 0,
      patientBalance: 100,
      status: 'Submitted',
      cptCodes: ['99214'],
    },
  ];

  const metrics = computeClaimSubmissionMetrics(claims, {});
  assert.equal(metrics.totalEncounters, 1);
  assert.equal(metrics.primaryClaimsSubmitted, 1);
  assert.equal(metrics.secondaryClaimsCount, 1);
  assert.equal(metrics.totalCharges, 400);
  assert.equal(metrics.avgDaysToSubmit, 2);
});

test('computeArAgingReport aligns bucket totals across rows and summary cards', () => {
  const claims: ClaimRecord[] = [
    {
      id: 'c1',
      claimNumber: 'CLM-10',
      patientId: 'p1',
      facilityId: 'fac-1',
      providerId: 'prov-1',
      payerName: 'Medicare',
      payerCategory: 'Medicare',
      isSecondary: false,
      serviceDate: '2026-07-01', // >120 days from 2026-11-18 (140 days)
      submittedDate: '2026-07-05',
      chargeAmount: 500,
      paidAmount: 100,
      adjustmentAmount: 50,
      patientBalance: 350,
      status: 'Submitted',
      cptCodes: ['99214'],
    },
    {
      id: 'c2',
      claimNumber: 'CLM-11',
      patientId: 'p2',
      facilityId: 'fac-1',
      providerId: 'prov-1',
      payerName: 'BlueCross',
      payerCategory: 'Commercial',
      isSecondary: false,
      serviceDate: '2026-04-01', // >180 days from 2026-11-18 (231 days)
      submittedDate: '2026-04-04',
      chargeAmount: 200,
      paidAmount: 0,
      adjustmentAmount: 0,
      patientBalance: 200,
      status: 'Denied',
      cptCodes: ['99213'],
    },
  ];

  const ar = computeArAgingReport(claims, {
    asOfDate: '2026-11-18',
    agingBasis: 'serviceDate',
    groupBy: 'payerName',
  });
  assert.equal(ar.totalOpenBalance, 550);
  assert.equal(ar.over90Balance, 550);
  assert.equal(ar.over180Balance, 200);
  assert.equal(ar.totalsByBucket['121-150'], 350);
  assert.equal(ar.totalsByBucket['Over 180'], 200);
  assert.equal(ar.largestPayerName, 'Medicare');
});

test('deriveAiRequestStatus never reports Completed while any action remains pending', () => {
  const actions: AiProposedAction[] = [
    { id: '1', kind: 'Task', title: 'Task', summary: '', status: 'Completed', payload: {} },
    { id: '2', kind: 'Lab Order', title: 'Lab', summary: '', status: 'Draft', payload: {} },
    { id: '3', kind: 'Appointment', title: 'Appt', summary: '', status: 'Awaiting Approval', payload: {} },
  ];
  assert.equal(deriveAiRequestStatus(actions), 'Partially Completed');

  const allDone = actions.map((a) => ({ ...a, status: 'Completed' as const }));
  assert.equal(deriveAiRequestStatus(allDone), 'Completed');
});

test('computeInvoiceTotals calculates balance after partial payment', () => {
  const inv: PatientInvoice = {
    id: 'inv1',
    invoiceNumber: 'INV-100',
    patientId: 'p1',
    facilityId: 'fac-1',
    issuedDate: '2026-11-10',
    dueDate: '2026-12-10',
    status: 'Partial',
    lineItems: [
      { id: 'l1', code: '99214', description: 'Office visit', date: '2026-11-10', amount: 220, insuranceCovered: 170, patientResponsibility: 50 },
      { id: 'l2', code: '80053', description: 'CMP Lab', date: '2026-11-10', amount: 80, insuranceCovered: 60, patientResponsibility: 20 },
    ],
    payments: [{ id: 'pay1', date: '2026-11-12', amount: 30, method: 'Visa •••• 4242', reference: 'SIM-101' }],
  };
  const totals = computeInvoiceTotals(inv);
  assert.equal(totals.subtotal, 300);
  assert.equal(totals.insuranceCovered, 230);
  assert.equal(totals.patientTotal, 70);
  assert.equal(totals.paid, 30);
  assert.equal(totals.amountDue, 40);
});
