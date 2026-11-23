import type {
  AiProposedAction,
  Appointment,
  ClaimRecord,
  Facility,
  Patient,
  PatientInvoice,
  PharmacyInventoryItem,
  TaskItem,
} from '../types/hms';

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function hasAppointmentConflict(
  existing: Appointment[],
  candidate: {
    id?: string;
    facilityId: string;
    providerId: string;
    date: string;
    startTime: string;
    durationMin: number;
    room?: string;
  }
): { conflict: boolean; reason?: string; conflictingAppointmentId?: string } {
  const startA = timeToMinutes(candidate.startTime);
  const endA = startA + candidate.durationMin;

  for (const appt of existing) {
    if (candidate.id && appt.id === candidate.id) continue;
    if (appt.status === 'Cancelled' || appt.status === 'Waitlist') continue;
    if (appt.facilityId !== candidate.facilityId || appt.date !== candidate.date) continue;

    const startB = timeToMinutes(appt.startTime);
    const endB = startB + appt.durationMin;
    const overlaps = startA < endB && startB < endA;
    if (!overlaps) continue;

    if (appt.providerId === candidate.providerId) {
      return {
        conflict: true,
        reason: `Provider already booked ${appt.startTime} (${appt.durationMin} min)`,
        conflictingAppointmentId: appt.id,
      };
    }

    if (candidate.room && appt.room && appt.room === candidate.room) {
      return {
        conflict: true,
        reason: `Room ${candidate.room} already occupied at ${appt.startTime}`,
        conflictingAppointmentId: appt.id,
      };
    }
  }

  return { conflict: false };
}

export interface DuplicateCandidate {
  patient: Patient;
  score: number;
  reasons: string[];
}

export function findDuplicatePatients(
  patients: Patient[],
  input: { fullName: string; dob: string; phone?: string; email?: string }
): DuplicateCandidate[] {
  const normName = input.fullName.trim().toLowerCase();
  const normPhone = (input.phone || '').replace(/\D/g, '');
  const normEmail = (input.email || '').trim().toLowerCase();
  const results: DuplicateCandidate[] = [];

  for (const p of patients) {
    let score = 0;
    const reasons: string[] = [];

    if (normName && p.fullName.toLowerCase() === normName) {
      score += 50;
      reasons.push('Exact name match');
    } else if (normName && normName.length >= 4) {
      const inputLast = normName.split(/\s+/).pop() || '';
      const pLast = p.fullName.toLowerCase().split(/\s+/).pop() || '';
      if (inputLast && inputLast === pLast) {
        score += 20;
        reasons.push('Same surname');
      }
    }

    if (input.dob && p.dob === input.dob) {
      score += 35;
      reasons.push('Same DOB');
    }

    const pPhone = p.phone.replace(/\D/g, '');
    if (normPhone && normPhone.length >= 7 && pPhone === normPhone) {
      score += 30;
      reasons.push('Same phone');
    }

    if (normEmail && p.email.toLowerCase() === normEmail) {
      score += 30;
      reasons.push('Same email');
    }

    if (score >= 50) {
      results.push({ patient: p, score: Math.min(100, score), reasons });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function computeTaskSummary(
  tasks: TaskItem[],
  currentUserId: string,
  facilityId: string,
  todayDate: string
) {
  const scoped = tasks.filter((t) => t.facilityId === facilityId);
  const myTasks = scoped.filter((t) => t.ownerId === currentUserId);
  const teamTasks = scoped.filter((t) => t.ownerId !== currentUserId);
  const openTasks = scoped.filter((t) => t.status !== 'Complete');
  const myOpen = myTasks.filter((t) => t.status !== 'Complete');
  const overdue = openTasks.filter((t) => t.dueDate < todayDate);
  const completed = scoped.filter((t) => t.status === 'Complete');

  return {
    total: scoped.length,
    myTotal: myTasks.length,
    myOpen: myOpen.length,
    teamTotal: teamTasks.length,
    teamOpen: teamTasks.filter((t) => t.status !== 'Complete').length,
    overdue: overdue.length,
    completed: completed.length,
  };
}

export function adjustPharmacyStock(
  item: PharmacyInventoryItem,
  delta: number,
  reason: string,
  actor: string,
  date: string
): { ok: boolean; error?: string; updated?: PharmacyInventoryItem; reorderTriggered?: boolean } {
  const nextQty = item.stockQty + delta;
  if (nextQty < 0) {
    return {
      ok: false,
      error: `Insufficient stock for ${item.name} (available: ${item.stockQty}, requested: ${Math.abs(delta)})`,
    };
  }
  const updated: PharmacyInventoryItem = {
    ...item,
    stockQty: nextQty,
    movements: [
      {
        id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        delta,
        reason,
        actor,
      },
      ...item.movements,
    ],
  };
  return {
    ok: true,
    updated,
    reorderTriggered: nextQty <= item.reorderThreshold,
  };
}

export interface ClaimSubmissionSummaryMetrics {
  totalEncounters: number;
  totalCharges: number;
  primaryClaimsSubmitted: number;
  secondaryClaimsCount: number;
  avgDaysToSubmit: number;
  resubmissionRatePct: number;
  avgChargePerVisit: number;
  weeklyActivity: { weekLabel: string; primaryCount: number; secondaryCount: number; totalCharges: number }[];
}

export function computeClaimSubmissionMetrics(
  claims: ClaimRecord[],
  options: { facilityId?: string; providerId?: string; startDate?: string; endDate?: string }
): ClaimSubmissionSummaryMetrics {
  const filtered = claims.filter((c) => {
    if (options.facilityId && options.facilityId !== 'all' && c.facilityId !== options.facilityId) return false;
    if (options.providerId && options.providerId !== 'all' && c.providerId !== options.providerId) return false;
    const dateKey = c.submittedDate || c.serviceDate;
    if (options.startDate && dateKey < options.startDate) return false;
    if (options.endDate && dateKey > options.endDate) return false;
    return true;
  });

  // Prevent double-counting secondary submissions when counting unique encounters and primary claims
  const primaryClaims = filtered.filter((c) => !c.isSecondary);
  const secondaryClaims = filtered.filter((c) => c.isSecondary);
  const uniqueEncounterIds = new Set(primaryClaims.map((c) => c.encounterId || c.id));
  const submittedPrimary = primaryClaims.filter((c) => c.status !== 'Draft' && c.status !== 'Validated');

  const totalCharges = primaryClaims.reduce((sum, c) => sum + c.chargeAmount, 0);
  const totalEncounters = uniqueEncounterIds.size;

  const daysList = submittedPrimary
    .filter((c) => c.submittedDate)
    .map((c) => {
      const d1 = new Date(c.serviceDate).getTime();
      const d2 = new Date(c.submittedDate!).getTime();
      return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    });
  const avgDaysToSubmit =
    daysList.length > 0 ? Number((daysList.reduce((a, b) => a + b, 0) / daysList.length).toFixed(1)) : 0;

  const resubmittedCount = primaryClaims.filter(
    (c) => c.status === 'Rejected' || c.status === 'Denied' || c.status === 'Appealed'
  ).length;
  const resubmissionRatePct =
    submittedPrimary.length > 0
      ? Number(((resubmittedCount / submittedPrimary.length) * 100).toFixed(1))
      : 0;

  const avgChargePerVisit = totalEncounters > 0 ? Math.round(totalCharges / totalEncounters) : 0;

  const weekMap = new Map<
    string,
    { weekLabel: string; primaryCount: number; secondaryCount: number; totalCharges: number }
  >();

  for (const c of filtered) {
    const dt = new Date(c.submittedDate || c.serviceDate);
    const day = dt.getUTCDay();
    const diffToMon = (day + 6) % 7;
    const mon = new Date(dt);
    mon.setUTCDate(dt.getUTCDate() - diffToMon);
    const weekKey = mon.toISOString().slice(0, 10);
    const cur = weekMap.get(weekKey) || {
      weekLabel: weekKey,
      primaryCount: 0,
      secondaryCount: 0,
      totalCharges: 0,
    };
    if (c.isSecondary) {
      cur.secondaryCount += 1;
    } else {
      cur.primaryCount += 1;
      cur.totalCharges += c.chargeAmount;
    }
    weekMap.set(weekKey, cur);
  }

  const weeklyActivity = Array.from(weekMap.values()).sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));

  return {
    totalEncounters,
    totalCharges,
    primaryClaimsSubmitted: submittedPrimary.length,
    secondaryClaimsCount: secondaryClaims.length,
    avgDaysToSubmit,
    resubmissionRatePct,
    avgChargePerVisit,
    weeklyActivity,
  };
}

export type AgingBucketKey =
  | '0-30'
  | '31-60'
  | '61-90'
  | '91-120'
  | '121-150'
  | '151-180'
  | 'Over 180';

export const AGING_BUCKETS: AgingBucketKey[] = [
  '0-30',
  '31-60',
  '61-90',
  '91-120',
  '121-150',
  '151-180',
  'Over 180',
];

export function getAgingBucket(days: number): AgingBucketKey {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  if (days <= 120) return '91-120';
  if (days <= 150) return '121-150';
  if (days <= 180) return '151-180';
  return 'Over 180';
}

export interface ArAgingRow {
  groupKey: string;
  totalOpen: number;
  buckets: Record<AgingBucketKey, number>;
}

export function computeArAgingReport(
  claims: ClaimRecord[],
  options: {
    asOfDate: string;
    agingBasis: 'serviceDate' | 'submittedDate';
    groupBy: 'payerName' | 'payerCategory';
    facilityId?: string;
    providerId?: string;
    patientId?: string;
  }
) {
  const asOfMs = new Date(options.asOfDate).getTime();
  const emptyBuckets = (): Record<AgingBucketKey, number> => ({
    '0-30': 0,
    '31-60': 0,
    '61-90': 0,
    '91-120': 0,
    '121-150': 0,
    '151-180': 0,
    'Over 180': 0,
  });

  const totalsByBucket = emptyBuckets();
  const groups = new Map<string, ArAgingRow>();
  let totalOpenBalance = 0;
  let over90Balance = 0;
  let over180Balance = 0;

  for (const c of claims) {
    if (options.facilityId && options.facilityId !== 'all' && c.facilityId !== options.facilityId) continue;
    if (options.providerId && options.providerId !== 'all' && c.providerId !== options.providerId) continue;
    if (options.patientId && options.patientId !== 'all' && c.patientId !== options.patientId) continue;
    if (c.isSecondary) continue;

    const open = Math.max(0, c.chargeAmount - c.paidAmount - c.adjustmentAmount);
    if (open <= 0 || c.status === 'Paid') continue;

    const basisDateStr = options.agingBasis === 'submittedDate' ? c.submittedDate || c.serviceDate : c.serviceDate;
    const basisMs = new Date(basisDateStr).getTime();
    const ageDays = Math.max(0, Math.floor((asOfMs - basisMs) / (1000 * 60 * 60 * 24)));
    const bucket = getAgingBucket(ageDays);

    totalOpenBalance += open;
    if (ageDays > 90) over90Balance += open;
    if (ageDays > 180) over180Balance += open;
    totalsByBucket[bucket] += open;

    const groupKey = options.groupBy === 'payerCategory' ? c.payerCategory : c.payerName;
    const row = groups.get(groupKey) || { groupKey, totalOpen: 0, buckets: emptyBuckets() };
    row.totalOpen += open;
    row.buckets[bucket] += open;
    groups.set(groupKey, row);
  }

  const rows = Array.from(groups.values()).sort((a, b) => b.totalOpen - a.totalOpen);
  const largestPayer = rows[0] || null;

  return {
    totalOpenBalance,
    over90Balance,
    over180Balance,
    largestPayerName: largestPayer ? largestPayer.groupKey : 'None',
    largestPayerBalance: largestPayer ? largestPayer.totalOpen : 0,
    totalsByBucket,
    rows,
  };
}

export function deriveAiRequestStatus(
  actions: AiProposedAction[]
): 'No Actions' | 'Awaiting Review' | 'Partially Completed' | 'Completed' | 'Cancelled' {
  if (actions.length === 0) return 'No Actions';
  const pending = actions.filter((a) => a.status === 'Draft' || a.status === 'Awaiting Approval' || a.status === 'Executing');
  const completed = actions.filter((a) => a.status === 'Completed');
  const cancelled = actions.filter((a) => a.status === 'Cancelled');

  if (pending.length > 0 && completed.length > 0) return 'Partially Completed';
  if (pending.length > 0) return 'Awaiting Review';
  if (completed.length > 0) return 'Completed';
  if (cancelled.length === actions.length) return 'Cancelled';
  return 'Awaiting Review';
}

export function computeInvoiceTotals(invoice: PatientInvoice) {
  const subtotal = invoice.lineItems.reduce((sum, li) => sum + li.amount, 0);
  const insuranceCovered = invoice.lineItems.reduce((sum, li) => sum + li.insuranceCovered, 0);
  const patientTotal = invoice.lineItems.reduce((sum, li) => sum + li.patientResponsibility, 0);
  const paid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  const amountDue = Math.max(0, Number((patientTotal - paid).toFixed(2)));
  return {
    subtotal,
    insuranceCovered,
    patientTotal,
    paid,
    amountDue,
  };
}

export function isIndiaFacility(facilities: Facility[], facilityId: string): boolean {
  const fac = facilities.find((f) => f.id === facilityId);
  return fac?.region === 'IN';
}

export function formatCurrency(amount: number, currency: 'USD' | 'INR'): string {
  if (currency === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export interface SuggestedSlot {
  date: string;
  startTime: string;
  durationMin: number;
  label: string;
}

export function findAvailableSlots(
  existing: Appointment[],
  options: {
    facilityId: string;
    providerId: string;
    date: string;
    durationMin?: number;
    maxSuggestions?: number;
  }
): SuggestedSlot[] {
  const durationMin = options.durationMin || 30;
  const maxSuggestions = options.maxSuggestions || 4;
  const candidateTimes = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
  const slots: SuggestedSlot[] = [];

  for (const startTime of candidateTimes) {
    const check = hasAppointmentConflict(existing, {
      facilityId: options.facilityId,
      providerId: options.providerId,
      date: options.date,
      startTime,
      durationMin,
    });
    if (!check.conflict) {
      slots.push({
        date: options.date,
        startTime,
        durationMin,
        label: `${options.date} · ${startTime} (${durationMin} min)`,
      });
    }
    if (slots.length >= maxSuggestions) break;
  }

  return slots;
}

export function checkMedicationAllergyConflict(
  patient: Patient | undefined,
  medicationName: string
): { hasConflict: boolean; matchedAllergy?: string; reaction?: string; severity?: string } {
  if (!patient || !medicationName.trim()) return { hasConflict: false };
  const medLower = medicationName.toLowerCase();

  const classMap: Record<string, string[]> = {
    penicillin: ['penicillin', 'amoxicillin', 'ampicillin', 'augmentin', 'piperacillin'],
    sulfa: ['sulfa', 'sulfamethoxazole', 'bactrim', 'trimethoprim-sulfamethoxazole'],
    aspirin: ['aspirin', 'nsaids', 'ibuprofen', 'naproxen', 'ketorolac'],
    codeine: ['codeine', 'morphine', 'oxycodone', 'hydrocodone'],
  };

  for (const alg of patient.allergies) {
    const sub = alg.substance.toLowerCase();
    if (sub === 'nkda' || sub.includes('no known')) continue;
    if (medLower.includes(sub) || sub.includes(medLower)) {
      return {
        hasConflict: true,
        matchedAllergy: alg.substance,
        reaction: alg.reaction,
        severity: alg.severity,
      };
    }
    for (const [key, members] of Object.entries(classMap)) {
      if (sub.includes(key) && members.some((m) => medLower.includes(m))) {
        return {
          hasConflict: true,
          matchedAllergy: alg.substance,
          reaction: alg.reaction,
          severity: alg.severity,
        };
      }
    }
  }

  return { hasConflict: false };
}

export interface GeneratedScribeDraft {
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  suggestedDiagnoses: string[];
  disclaimer: string;
}

export function generateScribeSoapFromTranscript(
  transcript: string,
  context: {
    chiefComplaint?: string;
    latestVitalsSummary?: string;
    allergySummary?: string;
  }
): GeneratedScribeDraft {
  const clean = transcript.trim();
  const lines = clean
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const patientLines = lines
    .filter((l) => /^(patient|pt):/i.test(l))
    .map((l) => l.replace(/^(patient|pt):\s*/i, ''));
  const clinicianLines = lines
    .filter((l) => /^(clinician|doctor|dr|provider):/i.test(l))
    .map((l) => l.replace(/^(clinician|doctor|dr|provider):\s*/i, ''));

  const subjective =
    patientLines.length > 0
      ? patientLines.join(' ')
      : clean || `Patient presents regarding ${context.chiefComplaint || 'documented concern'}.`;

  const examBits = clinicianLines.filter((l) =>
    /\b(exam|lungs|heart|bp|blood pressure|vital|tender|normal|clear|rhythm|edema|swelling|throat|temp)\b/i.test(l)
  );
  const objectiveParts: string[] = [];
  if (context.latestVitalsSummary) objectiveParts.push(`Recorded Vitals: ${context.latestVitalsSummary}.`);
  if (context.allergySummary) objectiveParts.push(`Allergies: ${context.allergySummary}.`);
  if (examBits.length > 0) objectiveParts.push(`Exam findings from transcript: ${examBits.join(' ')}`);
  if (objectiveParts.length === 0) objectiveParts.push('Clinical examination documented during visit; clinician verification required.');

  const assessmentBits = clinicianLines.filter(
    (l) =>
      !l.trim().endsWith('?') &&
      /\b(likely|consistent with|suspect|hypertension|infection|dizziness|fatigue|palpitation|hyperkalemia|chest|headache|diabetes|asthma|assessment|impression|ckd|renal|elevated)\b/i.test(
        l
      )
  );
  const assessment =
    assessmentBits.length > 0
      ? assessmentBits.join(' ')
      : `Clinical evaluation of ${context.chiefComplaint || 'presenting symptoms'} based on visit transcript (clinician review required).`;

  const planBits = clinicianLines.filter((l) =>
    /\b(order|lab|panel|prescribe|start|medication|follow-?up|return|check|monitor|refer|avoid|Hydration|rest)\b/i.test(l)
  );
  const plan =
    planBits.length > 0
      ? planBits.join(' ')
      : 'Confirm diagnostic orders, medication plan, and outpatient follow-up interval after clinician review.';

  const suggestedDiagnoses: string[] = [];
  const lower = clean.toLowerCase();
  if (lower.includes('dizziness') || lower.includes('lightheaded')) suggestedDiagnoses.push('R42 Dizziness and giddiness');
  if (lower.includes('hypertension') || lower.includes('high blood pressure')) suggestedDiagnoses.push('I10 Essential hypertension');
  if (lower.includes('palpitation')) suggestedDiagnoses.push('R00.2 Palpitations');
  if (lower.includes('fatigue')) suggestedDiagnoses.push('R53.83 Fatigue');
  if (lower.includes('cough') || lower.includes('respiratory')) suggestedDiagnoses.push('J06.9 Acute upper respiratory infection');
  if (suggestedDiagnoses.length === 0 && context.chiefComplaint) {
    suggestedDiagnoses.push(context.chiefComplaint);
  }

  return {
    soap: {
      subjective,
      objective: objectiveParts.join(' '),
      assessment,
      plan,
    },
    suggestedDiagnoses,
    disclaimer: 'Simulated AI Scribe Draft — generated locally from synthetic transcript. Clinician must review, edit, and explicitly sign.',
  };
}

