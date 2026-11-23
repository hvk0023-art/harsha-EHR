import type { AppState, Patient, StaffRole } from '../types/hms';
import { buildPatientTimeline } from './clinicalEvents';
import { canExportPatientFhir } from './permissions';

export type FhirExportMode = 'masked' | 'identifiable';

export interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface FhirBundleEntry {
  fullUrl: string;
  resource: FhirResource;
}

export interface FhirR4Bundle {
  resourceType: 'Bundle';
  id: string;
  meta: {
    lastUpdated: string;
    profile: string[];
    security?: { system: string; code: string; display: string }[];
  };
  identifier: {
    system: string;
    value: string;
  };
  type: 'collection';
  timestamp: string;
  total: number;
  entry: FhirBundleEntry[];
}

export interface FhirValidationCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface FhirValidationResult {
  valid: boolean;
  checkedAt: string;
  mode: FhirExportMode;
  resourceCounts: Record<string, number>;
  checks: FhirValidationCheck[];
  errors: string[];
  validationScopeNote: string;
}

export interface ReadableExportSummary {
  patientDisplay: string;
  identifierDisplay: string;
  mode: FhirExportMode;
  generatedAt: string;
  counts: {
    appointments: number;
    encounters: number;
    conditions: number;
    allergies: number;
    observations: number;
    orders: number;
    diagnosticReports: number;
    medications: number;
    carePlans: number;
    tasks: number;
    documents: number;
  };
  timelineHighlights: { date: string; category: string; title: string; isCritical: boolean; nature: string }[];
  privacyNotice: string;
}

export interface AuthorizedFhirExportOutcome {
  ok: boolean;
  error?: string;
  bundle?: FhirR4Bundle;
  json?: string;
  validation?: FhirValidationResult;
  summary?: ReadableExportSummary;
}

function toBase64Utf8(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64Utf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function deterministicHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface PiiScrubContext {
  pseudoId: string;
  pseudoPatientName: string;
  tokens: { pattern: RegExp; replacement: string; raw: string }[];
}

function buildPiiScrubContext(patient: Patient): PiiScrubContext {
  const hash = deterministicHash(`${patient.id}:${patient.mrn}`);
  const pseudoId = `PSEUDO-PAT-${hash.slice(0, 6)}`;
  const pseudoPatientName = `Pseudonymized Patient ${pseudoId}`;
  const rawEntries: { raw: string; replacement: string }[] = [];

  const pushToken = (raw: string | undefined, replacement: string) => {
    const clean = (raw || '').trim();
    if (clean.length >= 3) {
      rawEntries.push({ raw: clean, replacement });
    }
  };

  pushToken(patient.fullName, `[REDACTED-NAME:${pseudoId}]`);
  // Split individual name parts (first & last name >= 3 chars)
  patient.fullName
    .split(/\s+/)
    .filter((part) => part.length >= 3)
    .forEach((part) => pushToken(part, `[REDACTED-NAME:${pseudoId}]`));

  pushToken(patient.mrn, `[REDACTED-MRN:${pseudoId}]`);
  if (patient.abhaId) pushToken(patient.abhaId, '[REDACTED-ABHA]');
  pushToken(patient.email, '[REDACTED-EMAIL]');
  pushToken(patient.phone, '[REDACTED-PHONE]');
  const phoneDigits = patient.phone.replace(/\D/g, '');
  if (phoneDigits.length >= 7) {
    pushToken(phoneDigits, '[REDACTED-PHONE]');
    pushToken(phoneDigits.slice(-7), '[REDACTED-PHONE]');
  }
  pushToken(patient.address, '[REDACTED-ADDRESS]');
  const streetPart = patient.address.split(',')[0]?.trim();
  if (streetPart && streetPart.length >= 5) {
    pushToken(streetPart, '[REDACTED-ADDRESS]');
  }
  if (patient.dob) {
    pushToken(patient.dob, `${patient.dob.slice(0, 4)}-XX-XX`);
  }

  patient.caregivers.forEach((cg, idx) => {
    pushToken(cg.name, `[REDACTED-CONTACT-${idx + 1}]`);
    cg.name
      .split(/\s+/)
      .filter((part) => part.length >= 3)
      .forEach((part) => pushToken(part, `[REDACTED-CONTACT-${idx + 1}]`));
    pushToken(cg.phone, '[REDACTED-PHONE]');
  });

  // Sort longest first so full names/addresses are replaced before substrings
  const uniqueMap = new Map<string, string>();
  rawEntries
    .sort((a, b) => b.raw.length - a.raw.length)
    .forEach((item) => {
      const key = item.raw.toLowerCase();
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item.replacement);
      }
    });

  const tokens = Array.from(uniqueMap.entries()).map(([lowerRaw, replacement]) => ({
    raw: lowerRaw,
    replacement,
    pattern: new RegExp(escapeRegExp(lowerRaw), 'gi'),
  }));

  return { pseudoId, pseudoPatientName, tokens };
}

function scrubString(text: string, ctx: PiiScrubContext): string {
  let result = text;
  for (const t of ctx.tokens) {
    result = result.replace(t.pattern, t.replacement);
  }
  return result;
}

function deepScrubValue(value: unknown, ctx: PiiScrubContext, keyName?: string): unknown {
  if (typeof value === 'string') {
    if (keyName === 'data' && value.length > 0) {
      // Base64-encoded DocumentReference attachment content: decode, scrub, re-encode
      try {
        const decoded = fromBase64Utf8(value);
        const scrubbed = scrubString(decoded, ctx);
        return toBase64Utf8(scrubbed);
      } catch {
        return toBase64Utf8('[REDACTED-BINARY-CONTENT]');
      }
    }
    return scrubString(value, ctx);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepScrubValue(item, ctx));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = deepScrubValue(v, ctx, k);
    }
    return out;
  }
  return value;
}

function mapAppointmentStatus(status: string): string {
  switch (status) {
    case 'Scheduled':
    case 'Confirmed':
    case 'Pre-Registered':
      return 'booked';
    case 'Checked In':
    case 'In Room':
      return 'arrived';
    case 'Completed':
      return 'fulfilled';
    case 'Cancelled':
      return 'cancelled';
    case 'Waitlist':
      return 'waitlist';
    default:
      return 'booked';
  }
}

function mapOrderStatus(status: string): string {
  switch (status) {
    case 'Draft':
      return 'draft';
    case 'Pending Review':
    case 'Ordered':
    case 'Specimen Collected':
    case 'Scheduled':
      return 'active';
    case 'Resulted':
      return 'completed';
    case 'Cancelled':
      return 'revoked';
    default:
      return 'active';
  }
}

function mapMedicationStatus(status: string): string {
  switch (status) {
    case 'Draft':
      return 'draft';
    case 'Active':
    case 'Refill Requested':
      return 'active';
    case 'Discontinued':
      return 'stopped';
    default:
      return 'active';
  }
}

function mapTaskStatus(status: string): string {
  switch (status) {
    case 'To Do':
      return 'requested';
    case 'In Progress':
      return 'in-progress';
    case 'Complete':
      return 'completed';
    default:
      return 'requested';
  }
}

function mapGender(sex: Patient['sex']): 'female' | 'male' | 'other' | 'unknown' {
  if (sex === 'Female') return 'female';
  if (sex === 'Male') return 'male';
  if (sex === 'Other') return 'other';
  return 'unknown';
}

export function buildPatientFhirBundle(
  state: AppState,
  patientId: string,
  mode: FhirExportMode = 'masked',
  exportedByActor = 'Administrator'
): FhirR4Bundle | null {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return null;

  const isMasked = mode === 'masked';
  const scrubCtx = buildPiiScrubContext(patient);
  const patResourceId = isMasked ? scrubCtx.pseudoId.toLowerCase() : patient.id;
  const patRef = `Patient/${patResourceId}`;
  const patDisplay = isMasked ? scrubCtx.pseudoPatientName : patient.fullName;
  const nowIso = new Date().toISOString();

  const entries: FhirBundleEntry[] = [];
  const referencedStaffIds = new Set<string>();
  const addEntry = (resource: FhirResource) => {
    entries.push({
      fullUrl: `urn:eigenh:fhir:r4:${resource.resourceType}:${resource.id}`,
      resource,
    });
  };

  // Track primary provider
  if (patient.primaryProviderId) referencedStaffIds.add(patient.primaryProviderId);

  // 1. Patient Resource
  const patientIdentifiers: { system: string; value: string; use?: string }[] = isMasked
    ? [
        {
          system: 'urn:eigenh:pseudonymized-id',
          value: scrubCtx.pseudoId,
          use: 'secondary',
        },
      ]
    : [
        {
          system: 'urn:eigenh:mrn',
          value: patient.mrn,
          use: 'usual',
        },
        ...(patient.abhaId
          ? [{ system: 'https://healthid.abdm.gov.in', value: patient.abhaId, use: 'official' }]
          : []),
      ];

  const facility = state.facilities.find((f) => f.id === patient.facilityId);
  const patientResource: FhirResource = {
    resourceType: 'Patient',
    id: patResourceId,
    meta: {
      security: isMasked
        ? [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'PSEUDED', display: 'pseudonymized' }]
        : [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'SYNTH', display: 'synthetic-demo' }],
    },
    identifier: patientIdentifiers,
    active: patient.status === 'Active',
    name: [
      isMasked
        ? { use: 'anonymous', text: scrubCtx.pseudoPatientName }
        : {
            use: 'official',
            text: patient.fullName,
            family: patient.fullName.split(/\s+/).slice(-1)[0] || patient.fullName,
            given: patient.fullName.split(/\s+/).slice(0, -1),
          },
    ],
    gender: mapGender(patient.sex),
    // In masked mode, restrict DOB to birth year only (FHIR R4 allows YYYY)
    birthDate: isMasked ? patient.dob.slice(0, 4) : patient.dob,
    ...(isMasked
      ? {
          address: facility ? [{ city: facility.city, country: facility.region }] : undefined,
        }
      : {
          telecom: [
            { system: 'phone', value: patient.phone, use: 'mobile' },
            { system: 'email', value: patient.email, use: 'home' },
          ],
          address: [{ text: patient.address, city: facility?.city, country: facility?.region }],
          ...(patient.caregivers.length > 0
            ? {
                contact: patient.caregivers.map((cg) => ({
                  relationship: [{ text: cg.relationship }],
                  name: { text: cg.name },
                  telecom: [{ system: 'phone', value: cg.phone }],
                })),
              }
            : {}),
        }),
  };
  addEntry(patientResource);

  // 2. Appointments
  const patientAppointments = state.appointments.filter((a) => a.patientId === patientId);
  patientAppointments.forEach((appt) => {
    referencedStaffIds.add(appt.providerId);
    const prov = state.staff.find((s) => s.id === appt.providerId);
    addEntry({
      resourceType: 'Appointment',
      id: appt.id,
      status: mapAppointmentStatus(appt.status),
      appointmentType: { text: appt.subtype },
      description: `${appt.type}: ${appt.reason}`,
      start: `${appt.date}T${appt.startTime}:00Z`,
      minutesDuration: appt.durationMin,
      participant: [
        { actor: { reference: patRef, display: patDisplay }, status: 'accepted' },
        { actor: { reference: `Practitioner/${appt.providerId}`, display: prov?.name || appt.providerId }, status: 'accepted' },
      ],
    });
  });

  // 3. Encounters & DocumentReference for Clinical Notes
  const patientEncounters = state.encounters.filter((e) => e.patientId === patientId);
  patientEncounters.forEach((enc) => {
    referencedStaffIds.add(enc.providerId);
    const prov = state.staff.find((s) => s.id === enc.providerId);
    const isEmergency = /emergency|ed\b/i.test(enc.type);
    addEntry({
      resourceType: 'Encounter',
      id: enc.id,
      status: enc.noteStatus === 'Signed' || enc.noteStatus === 'Amended' ? 'finished' : 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: isEmergency ? 'EMER' : 'AMB',
        display: isEmergency ? 'emergency' : 'ambulatory',
      },
      type: [{ text: enc.type }],
      subject: { reference: patRef, display: patDisplay },
      participant: [
        { individual: { reference: `Practitioner/${enc.providerId}`, display: prov?.name || enc.providerId } },
      ],
      period: { start: `${enc.date}T00:00:00Z` },
      reasonCode: [{ text: enc.chiefComplaint }],
      ...(enc.appointmentId && patientAppointments.some((a) => a.id === enc.appointmentId)
        ? { appointment: [{ reference: `Appointment/${enc.appointmentId}` }] }
        : {}),
    });

    // DocumentReference containing the structured SOAP note & addenda
    const soapText = [
      `Encounter Type: ${enc.type}`,
      `Date: ${enc.date}`,
      `Status: ${enc.noteStatus}`,
      `Chief Complaint: ${enc.chiefComplaint}`,
      `Subjective: ${enc.soap.subjective}`,
      `Objective: ${enc.soap.objective}`,
      `Assessment: ${enc.soap.assessment}`,
      `Plan: ${enc.soap.plan}`,
      ...(enc.amendments.length > 0
        ? [
            'Amendments:',
            ...enc.amendments.map((a) => `- [${a.timestamp}] ${a.authorName} (${a.reason}): ${a.text}`),
          ]
        : []),
    ].join('\n');

    addEntry({
      resourceType: 'DocumentReference',
      id: `doc-enc-${enc.id}`,
      status: 'current',
      type: {
        coding: [{ system: 'http://loinc.org', code: '11506-3', display: 'Progress note' }],
        text: `${enc.type} Clinical Note`,
      },
      subject: { reference: patRef, display: patDisplay },
      date: `${enc.date}T00:00:00Z`,
      author: [{ reference: `Practitioner/${enc.providerId}`, display: prov?.name || enc.providerId }],
      description: `${enc.type} SOAP Note (${enc.noteStatus})`,
      context: { encounter: [{ reference: `Encounter/${enc.id}` }] },
      content: [
        {
          attachment: {
            contentType: 'text/plain; charset=utf-8',
            data: toBase64Utf8(soapText),
            title: `${enc.type} Note (${enc.date})`,
          },
        },
      ],
    });
  });

  // 4. Conditions
  patient.conditions.forEach((cond) => {
    addEntry({
      resourceType: 'Condition',
      id: cond.id,
      clinicalStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
            code: cond.status === 'Active' ? 'active' : cond.status === 'Resolved' ? 'resolved' : 'inactive',
          },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: cond.verified ? 'confirmed' : 'unconfirmed',
          },
        ],
      },
      code: {
        coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: cond.icd10, display: cond.name }],
        text: cond.name,
      },
      subject: { reference: patRef, display: patDisplay },
      onsetDateTime: cond.onsetDate,
    });
  });

  // 5. AllergyIntolerance
  patient.allergies.forEach((alg) => {
    addEntry({
      resourceType: 'AllergyIntolerance',
      id: alg.id,
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
            code: alg.verified ? 'confirmed' : 'unconfirmed',
          },
        ],
      },
      criticality: alg.severity === 'Severe' ? 'high' : 'low',
      code: { text: alg.substance },
      patient: { reference: patRef, display: patDisplay },
      recordedDate: alg.recordedDate,
      reaction: [
        {
          manifestation: [{ text: alg.reaction }],
          severity: alg.severity.toLowerCase(),
        },
      ],
    });
  });

  // 6. Observations (Vitals)
  state.vitals
    .filter((v) => v.patientId === patientId)
    .forEach((vit) => {
      addEntry({
        resourceType: 'Observation',
        id: `obs-bp-${vit.id}`,
        status: 'final',
        category: [
          {
            coding: [
              { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' },
            ],
          },
        ],
        code: {
          coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }],
          text: 'Blood Pressure',
        },
        subject: { reference: patRef, display: patDisplay },
        effectiveDateTime: vit.recordedAt.slice(0, 10),
        component: [
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }] },
            valueQuantity: { value: vit.bpSystolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
          },
          {
            code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }] },
            valueQuantity: { value: vit.bpDiastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
          },
        ],
      });

      addEntry({
        resourceType: 'Observation',
        id: `obs-hr-${vit.id}`,
        status: 'final',
        category: [
          {
            coding: [
              { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' },
            ],
          },
        ],
        code: {
          coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
          text: 'Heart Rate',
        },
        subject: { reference: patRef, display: patDisplay },
        effectiveDateTime: vit.recordedAt.slice(0, 10),
        valueQuantity: { value: vit.heartRate, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
      });

      addEntry({
        resourceType: 'Observation',
        id: `obs-spo2-${vit.id}`,
        status: 'final',
        category: [
          {
            coding: [
              { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' },
            ],
          },
        ],
        code: {
          coding: [{ system: 'http://loinc.org', code: '59408-5', display: 'Oxygen saturation in Arterial blood by Pulse oximetry' }],
          text: 'SpO2',
        },
        subject: { reference: patRef, display: patDisplay },
        effectiveDateTime: vit.recordedAt.slice(0, 10),
        valueQuantity: { value: vit.spo2, unit: '%', system: 'http://unitsofmeasure.org', code: '%' },
      });
    });

  // 7. ServiceRequests (Clinical Orders)
  const patientOrders = state.orders.filter((o) => o.patientId === patientId);
  patientOrders.forEach((ord) => {
    referencedStaffIds.add(ord.orderedById);
    const prov = state.staff.find((s) => s.id === ord.orderedById);
    addEntry({
      resourceType: 'ServiceRequest',
      id: ord.id,
      identifier: [{ system: 'urn:eigenh:requisition', value: ord.requisitionId }],
      status: mapOrderStatus(ord.status),
      intent: 'order',
      priority: ord.priority.toLowerCase(),
      category: [{ text: ord.category }],
      code: {
        coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: ord.code, display: ord.name }],
        text: ord.name,
      },
      subject: { reference: patRef, display: patDisplay },
      authoredOn: ord.createdAt,
      requester: { reference: `Practitioner/${ord.orderedById}`, display: prov?.name || ord.orderedById },
      ...(ord.encounterId && patientEncounters.some((e) => e.id === ord.encounterId)
        ? { encounter: { reference: `Encounter/${ord.encounterId}` } }
        : {}),
    });
  });

  // 8. Laboratory Observations & DiagnosticReports
  const patientLabs = state.labResults.filter((l) => l.patientId === patientId);
  patientLabs.forEach((lab) => {
    const obsId = `obs-lab-${lab.id}`;
    const interpCode = lab.flag === 'Critical' ? 'AA' : lab.flag === 'Abnormal' ? 'A' : 'N';
    const interpDisplay = lab.flag === 'Critical' ? 'Critical abnormal' : lab.flag === 'Abnormal' ? 'Abnormal' : 'Normal';

    addEntry({
      resourceType: 'Observation',
      id: obsId,
      status: lab.status === 'Corrected' ? 'amended' : lab.status === 'Pending' ? 'preliminary' : 'final',
      category: [
        {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory', display: 'Laboratory' },
          ],
        },
      ],
      code: { text: lab.testName },
      subject: { reference: patRef, display: patDisplay },
      effectiveDateTime: lab.collectionDate,
      ...(typeof lab.numericValue === 'number' && Number.isFinite(lab.numericValue)
        ? { valueQuantity: { value: lab.numericValue, unit: lab.unit } }
        : { valueString: `${lab.value} ${lab.unit}`.trim() }),
      interpretation: [
        {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: interpCode, display: interpDisplay },
          ],
        },
      ],
      referenceRange: [{ text: lab.referenceInterval }],
    });

    addEntry({
      resourceType: 'DiagnosticReport',
      id: `dr-lab-${lab.id}`,
      status: lab.status === 'Corrected' ? 'amended' : lab.status === 'Pending' ? 'preliminary' : 'final',
      category: [
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] },
      ],
      code: { text: lab.testName },
      subject: { reference: patRef, display: patDisplay },
      effectiveDateTime: lab.collectionDate,
      result: [{ reference: `Observation/${obsId}` }],
      ...(patientOrders.some((o) => o.id === lab.orderId)
        ? { basedOn: [{ reference: `ServiceRequest/${lab.orderId}` }] }
        : {}),
      conclusion: `${lab.testName}: ${lab.value} ${lab.unit} (${lab.flag}; ref ${lab.referenceInterval})`,
    });
  });

  // 8b. Imaging DiagnosticReports
  state.imagingReports
    .filter((img) => img.patientId === patientId)
    .forEach((img) => {
      addEntry({
        resourceType: 'DiagnosticReport',
        id: `dr-img-${img.id}`,
        status: img.status === 'Preliminary' ? 'preliminary' : 'final',
        category: [
          { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'RAD', display: 'Radiology' }] },
        ],
        code: { text: `${img.modality} — ${img.studyName}` },
        subject: { reference: patRef, display: patDisplay },
        effectiveDateTime: img.performedAt,
        conclusion: `${img.impression} (${img.findings})`,
      });
    });

  // 9. MedicationRequests
  state.medications
    .filter((m) => m.patientId === patientId)
    .forEach((med) => {
      referencedStaffIds.add(med.prescriberId);
      const prov = state.staff.find((s) => s.id === med.prescriberId);
      addEntry({
        resourceType: 'MedicationRequest',
        id: med.id,
        status: mapMedicationStatus(med.status),
        intent: 'order',
        medicationCodeableConcept: { text: `${med.name} ${med.dose}` },
        subject: { reference: patRef, display: patDisplay },
        authoredOn: med.startDate,
        requester: { reference: `Practitioner/${med.prescriberId}`, display: prov?.name || med.prescriberId },
        dosageInstruction: [
          {
            text: `${med.dose} ${med.route} ${med.frequency}${med.duration ? ` for ${med.duration}` : ''}`,
            route: { text: med.route },
          },
        ],
      });
    });

  // 10. CarePlans (chronic care plans + follow-up plans)
  state.carePlans
    .filter((cp) => cp.patientId === patientId)
    .forEach((cp) => {
      addEntry({
        resourceType: 'CarePlan',
        id: cp.id,
        status: cp.status === 'Completed' ? 'completed' : 'active',
        intent: 'plan',
        title: cp.programme,
        description: cp.goals.map((g) => `${g.title} (${g.target})`).join('; ') || cp.programme,
        subject: { reference: patRef, display: patDisplay },
        activity: cp.interventions.map((iv) => ({
          detail: {
            status: iv.status === 'Done' ? 'completed' : 'in-progress',
            description: `${iv.description} (${iv.frequency})`,
          },
        })),
      });
    });

  (state.followUpPlans || [])
    .filter((fp) => fp.patientId === patientId)
    .forEach((fp) => {
      referencedStaffIds.add(fp.providerId);
      addEntry({
        resourceType: 'CarePlan',
        id: fp.id,
        status: 'active',
        intent: 'plan',
        title: `Outpatient Follow-Up Plan (${fp.interval})`,
        description: `${fp.instructions} · Reminder status: ${fp.reminderStatus} (${fp.reminderChannel})`,
        subject: { reference: patRef, display: patDisplay },
        created: fp.createdAt,
        ...(fp.encounterId && patientEncounters.some((e) => e.id === fp.encounterId)
          ? { encounter: { reference: `Encounter/${fp.encounterId}` } }
          : {}),
      });
    });

  // 11. Tasks
  state.tasks
    .filter((t) => t.patientId === patientId)
    .forEach((tsk) => {
      referencedStaffIds.add(tsk.ownerId);
      const owner = state.staff.find((s) => s.id === tsk.ownerId);
      addEntry({
        resourceType: 'Task',
        id: tsk.id,
        status: mapTaskStatus(tsk.status),
        intent: 'order',
        priority: tsk.priority === 'Urgent' ? 'stat' : tsk.priority === 'High' ? 'urgent' : 'routine',
        description: tsk.title,
        for: { reference: patRef, display: patDisplay },
        owner: { reference: `Practitioner/${tsk.ownerId}`, display: owner?.name || tsk.ownerId },
        restriction: { period: { end: tsk.dueDate } },
      });
    });

  // 12. Patient Documents -> DocumentReference
  state.documents
    .filter((d) => d.patientId === patientId)
    .forEach((doc) => {
      addEntry({
        resourceType: 'DocumentReference',
        id: doc.id,
        status: 'current',
        type: { text: doc.category },
        subject: { reference: patRef, display: patDisplay },
        date: `${doc.date}T00:00:00Z`,
        description: doc.title,
        content: [
          {
            attachment: {
              contentType: 'text/plain; charset=utf-8',
              data: toBase64Utf8(`${doc.title}\nSource: ${doc.source}\nSummary: ${doc.summary}`),
              title: doc.title,
            },
          },
        ],
      });
    });

  // 13. Referenced Practitioners (so 100% of internal Practitioner/* references resolve within Bundle)
  referencedStaffIds.forEach((staffId) => {
    const member = state.staff.find((s) => s.id === staffId);
    addEntry({
      resourceType: 'Practitioner',
      id: staffId,
      active: true,
      name: [{ text: member?.name || staffId }],
      ...(member?.specialty ? { qualification: [{ code: { text: member.specialty } }] } : {}),
    });
  });

  // 14. Provenance (Export provenance record)
  addEntry({
    resourceType: 'Provenance',
    id: `prov-export-${Date.now()}`,
    target: [{ reference: patRef }],
    recorded: nowIso,
    activity: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
          code: isMasked ? 'PSEUDED' : 'EXPORT',
          display: isMasked ? 'Pseudonymized FHIR R4 Export' : 'Synthetic Identifiable FHIR R4 Export',
        },
      ],
    },
    agent: [
      {
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'assembler' }],
        },
        who: { display: `${exportedByActor} (Administrator Prototype Export)` },
      },
    ],
  });

  const rawBundle: FhirR4Bundle = {
    resourceType: 'Bundle',
    id: `bundle-${patResourceId}-${Date.now()}`,
    meta: {
      lastUpdated: nowIso,
      profile: ['http://hl7.org/fhir/StructureDefinition/Bundle'],
      security: isMasked
        ? [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'PSEUDED', display: 'Pseudonymized / Masked Export' }]
        : [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'SYNTH', display: 'Identifiable Synthetic Record' }],
    },
    identifier: {
      system: 'urn:eigenh:fhir-export',
      value: isMasked ? `EXP-${scrubCtx.pseudoId}` : `EXP-${patient.mrn}`,
    },
    type: 'collection',
    timestamp: nowIso,
    total: entries.length,
    entry: entries,
  };

  if (isMasked) {
    return deepScrubValue(rawBundle, scrubCtx) as FhirR4Bundle;
  }
  return rawBundle;
}

const VALID_R4_RESOURCE_TYPES = new Set([
  'Patient',
  'Practitioner',
  'Appointment',
  'Encounter',
  'Condition',
  'AllergyIntolerance',
  'Observation',
  'ServiceRequest',
  'DiagnosticReport',
  'MedicationRequest',
  'CarePlan',
  'Task',
  'DocumentReference',
  'Provenance',
]);

const VALID_STATUS_BY_TYPE: Record<string, Set<string>> = {
  Appointment: new Set(['proposed', 'pending', 'booked', 'arrived', 'fulfilled', 'cancelled', 'noshow', 'entered-in-error', 'checked-in', 'waitlist']),
  Encounter: new Set(['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled']),
  Observation: new Set(['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled']),
  ServiceRequest: new Set(['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown']),
  DiagnosticReport: new Set(['registered', 'partial', 'preliminary', 'final', 'amended', 'corrected', 'appended', 'cancelled']),
  MedicationRequest: new Set(['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown']),
  CarePlan: new Set(['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown']),
  Task: new Set(['draft', 'requested', 'received', 'accepted', 'rejected', 'ready', 'cancelled', 'in-progress', 'on-hold', 'failed', 'completed']),
  DocumentReference: new Set(['current', 'superseded', 'entered-in-error']),
};

function collectReferences(obj: unknown, out: string[]) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => collectReferences(item, out));
    return;
  }
  const rec = obj as Record<string, unknown>;
  if (typeof rec.reference === 'string') {
    out.push(rec.reference);
  }
  Object.values(rec).forEach((v) => collectReferences(v, out));
}

export function validateFhirR4Bundle(
  bundle: FhirR4Bundle,
  options: { mode: FhirExportMode; sourcePatient?: Patient }
): FhirValidationResult {
  const errors: string[] = [];
  const checks: FhirValidationCheck[] = [];
  const resourceCounts: Record<string, number> = {};

  // Check 1: Root Bundle structure
  const rootOk =
    bundle.resourceType === 'Bundle' &&
    bundle.type === 'collection' &&
    typeof bundle.id === 'string' &&
    typeof bundle.timestamp === 'string' &&
    Array.isArray(bundle.entry) &&
    bundle.entry.length > 0;
  checks.push({
    name: 'FHIR R4 Bundle Root Structure',
    passed: rootOk,
    detail: rootOk
      ? `Bundle/${bundle.id} (type: collection, ${bundle.entry.length} entries)`
      : 'Invalid root Bundle metadata or empty entry array',
  });
  if (!rootOk) errors.push('Root Bundle structure is invalid.');

  // Check 2: Resource Types, IDs, Required Fields, Status Enums
  const idIndex = new Set<string>();
  let badResources = 0;
  for (const entry of bundle.entry) {
    const res = entry.resource;
    if (!res || !VALID_R4_RESOURCE_TYPES.has(res.resourceType) || typeof res.id !== 'string' || !res.id) {
      badResources += 1;
      errors.push(`Invalid resource entry: ${JSON.stringify(res?.resourceType)} / ${JSON.stringify(res?.id)}`);
      continue;
    }
    resourceCounts[res.resourceType] = (resourceCounts[res.resourceType] || 0) + 1;
    idIndex.add(`${res.resourceType}/${res.id}`);

    const statusSet = VALID_STATUS_BY_TYPE[res.resourceType];
    if (statusSet) {
      if (typeof res.status !== 'string' || !statusSet.has(res.status)) {
        badResources += 1;
        errors.push(`${res.resourceType}/${res.id} has invalid FHIR R4 status "${String(res.status)}"`);
      }
    }

    // Minimal required fields per R4 core spec
    if (res.resourceType === 'Condition' && (!res.subject || !res.code)) {
      badResources += 1;
      errors.push(`Condition/${res.id} missing required subject or code`);
    }
    if (res.resourceType === 'AllergyIntolerance' && (!res.patient || !res.code)) {
      badResources += 1;
      errors.push(`AllergyIntolerance/${res.id} missing required patient or code`);
    }
    if (res.resourceType === 'Observation' && (!res.code || !res.subject)) {
      badResources += 1;
      errors.push(`Observation/${res.id} missing required code or subject`);
    }
    if (res.resourceType === 'MedicationRequest' && (!res.intent || !res.subject || !res.medicationCodeableConcept)) {
      badResources += 1;
      errors.push(`MedicationRequest/${res.id} missing required intent, subject, or medicationCodeableConcept`);
    }
    if (res.resourceType === 'ServiceRequest' && (!res.intent || !res.subject)) {
      badResources += 1;
      errors.push(`ServiceRequest/${res.id} missing required intent or subject`);
    }
    if (res.resourceType === 'DiagnosticReport' && (!res.code || !res.subject)) {
      badResources += 1;
      errors.push(`DiagnosticReport/${res.id} missing required code or subject`);
    }
    if (res.resourceType === 'Provenance' && (!res.target || !res.recorded || !res.agent)) {
      badResources += 1;
      errors.push(`Provenance/${res.id} missing required target, recorded, or agent`);
    }
  }
  const hasPatient = (resourceCounts.Patient || 0) === 1;
  if (!hasPatient) {
    errors.push('Bundle must contain exactly 1 Patient resource.');
  }
  checks.push({
    name: 'R4 Resource Types, Required Fields & Status Codes',
    passed: badResources === 0 && hasPatient,
    detail:
      badResources === 0 && hasPatient
        ? `${Object.keys(resourceCounts).length} FHIR R4 resource types verified across ${bundle.entry.length} resources`
        : `${badResources} resource schema error(s)`,
  });

  // Check 3: Internal Reference Integrity
  const allRefs: string[] = [];
  collectReferences(bundle.entry, allRefs);
  const brokenRefs = allRefs.filter((ref) => !idIndex.has(ref));
  if (brokenRefs.length > 0) {
    errors.push(`Unresolved internal references: ${brokenRefs.slice(0, 5).join(', ')}`);
  }
  checks.push({
    name: 'Internal Reference Integrity',
    passed: brokenRefs.length === 0,
    detail:
      brokenRefs.length === 0
        ? `All ${allRefs.length} internal references resolve to resources in Bundle`
        : `${brokenRefs.length} unresolved reference(s)`,
  });

  // Check 4: Valid JSON Serialization
  let serialized = '';
  let jsonOk = false;
  try {
    serialized = JSON.stringify(bundle);
    JSON.parse(serialized);
    jsonOk = serialized.length > 0;
  } catch {
    errors.push('Bundle failed JSON serialization round-trip.');
  }
  checks.push({
    name: 'JSON Serialization Integrity',
    passed: jsonOk,
    detail: jsonOk ? `${(serialized.length / 1024).toFixed(1)} KB valid JSON` : 'JSON serialization failed',
  });

  // Check 5: Masked PII Leak Inspection (including base64-decoded DocumentReference attachments)
  if (options.mode === 'masked' && options.sourcePatient) {
    const p = options.sourcePatient;
    const forbiddenValues: { label: string; value: string }[] = [
      { label: 'Full Name', value: p.fullName },
      { label: 'MRN', value: p.mrn },
      { label: 'Phone', value: p.phone },
      { label: 'Email', value: p.email },
      { label: 'Exact DOB', value: p.dob },
      { label: 'Street Address', value: p.address.split(',')[0]?.trim() || p.address },
      ...(p.abhaId ? [{ label: 'ABHA ID', value: p.abhaId }] : []),
      ...p.caregivers.map((cg) => ({ label: 'Emergency Contact', value: cg.name })),
    ].filter((item) => item.value && item.value.trim().length >= 3);

    // Combine raw JSON + all decoded base64 attachments
    const decodedAttachments: string[] = [];
    for (const entry of bundle.entry) {
      if (entry.resource.resourceType === 'DocumentReference' && Array.isArray(entry.resource.content)) {
        for (const c of entry.resource.content as { attachment?: { data?: string } }[]) {
          if (c.attachment?.data) {
            try {
              decodedAttachments.push(fromBase64Utf8(c.attachment.data));
            } catch {
              // ignore non-utf8
            }
          }
        }
      }
    }
    const inspectionCorpus = `${serialized}\n${decodedAttachments.join('\n')}`.toLowerCase();
    const leaked = forbiddenValues.filter((item) => inspectionCorpus.includes(item.value.trim().toLowerCase()));
    if (leaked.length > 0) {
      errors.push(`Masked export leaked PII fields: ${leaked.map((l) => l.label).join(', ')}`);
    }
    checks.push({
      name: 'Masked Export PII Redaction (Including Attachments & Notes)',
      passed: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `0 direct PII leaks across JSON and ${decodedAttachments.length} base64 attachment(s)`
          : `Detected leaks: ${leaked.map((l) => l.label).join(', ')}`,
    });
  }

  return {
    valid: errors.length === 0,
    checkedAt: new Date().toISOString(),
    mode: options.mode,
    resourceCounts,
    checks,
    errors,
    validationScopeNote:
      'Structural FHIR R4 checks passed locally (Bundle shape, R4 resourceTypes, required properties, status enums, internal Reference integrity, JSON serialization, and masked PII redaction). Full conformance against an official external HL7 FHIR Terminology/IG Validator server is not executed in this local prototype.',
  };
}

export function buildReadableExportSummary(
  state: AppState,
  patientId: string,
  mode: FhirExportMode
): ReadableExportSummary | null {
  const patient = state.patients.find((p) => p.id === patientId);
  if (!patient) return null;

  const isMasked = mode === 'masked';
  const scrubCtx = buildPiiScrubContext(patient);
  const timeline = buildPatientTimeline(state, patientId);

  return {
    patientDisplay: isMasked ? scrubCtx.pseudoPatientName : patient.fullName,
    identifierDisplay: isMasked ? `${scrubCtx.pseudoId} (DOB year ${patient.dob.slice(0, 4)})` : `${patient.mrn} · DOB ${patient.dob}`,
    mode,
    generatedAt: new Date().toISOString(),
    counts: {
      appointments: state.appointments.filter((a) => a.patientId === patientId).length,
      encounters: state.encounters.filter((e) => e.patientId === patientId).length,
      conditions: patient.conditions.length,
      allergies: patient.allergies.length,
      observations:
        state.vitals.filter((v) => v.patientId === patientId).length * 3 +
        state.labResults.filter((l) => l.patientId === patientId).length,
      orders: state.orders.filter((o) => o.patientId === patientId).length,
      diagnosticReports:
        state.labResults.filter((l) => l.patientId === patientId).length +
        state.imagingReports.filter((i) => i.patientId === patientId).length,
      medications: state.medications.filter((m) => m.patientId === patientId).length,
      carePlans:
        state.carePlans.filter((cp) => cp.patientId === patientId).length +
        (state.followUpPlans || []).filter((fp) => fp.patientId === patientId).length,
      tasks: state.tasks.filter((t) => t.patientId === patientId).length,
      documents:
        state.encounters.filter((e) => e.patientId === patientId).length +
        state.documents.filter((d) => d.patientId === patientId).length,
    },
    timelineHighlights: timeline.slice(0, 12).map((ev) => ({
      date: ev.date,
      category: ev.category,
      title: isMasked ? scrubString(ev.title, scrubCtx) : ev.title,
      isCritical: ev.isCritical,
      nature: ev.eventNature,
    })),
    privacyNotice: isMasked
      ? 'Masked / pseudonymized export (default): names, MRN, ABHA, phone, email, address, exact DOB, emergency contacts, and PII embedded in SOAP notes or base64 attachments are redacted while preserving internal FHIR references.'
      : 'Identifiable synthetic export (Administrator confirmed): contains synthetic demo demographics and clinical narratives. Never use with real patient data.',
  };
}

export function executeAuthorizedFhirExport(
  state: AppState,
  options: {
    role: StaffRole;
    actorName: string;
    patientId: string;
    mode: FhirExportMode;
    confirmedIdentifiable?: boolean;
  }
): AuthorizedFhirExportOutcome {
  if (!canExportPatientFhir(options.role)) {
    return {
      ok: false,
      error: `Unauthorized (${options.role}): HL7 FHIR R4 patient export is restricted strictly to Administrator role.`,
    };
  }
  if (options.mode === 'identifiable' && !options.confirmedIdentifiable) {
    return {
      ok: false,
      error: 'Explicit Administrator confirmation is required before exporting identifiable synthetic patient records.',
    };
  }
  const patient = state.patients.find((p) => p.id === options.patientId);
  if (!patient) {
    return { ok: false, error: 'Selected patient record not found.' };
  }

  const bundle = buildPatientFhirBundle(state, options.patientId, options.mode, options.actorName);
  if (!bundle) {
    return { ok: false, error: 'Unable to build FHIR R4 Bundle for this patient.' };
  }
  const validation = validateFhirR4Bundle(bundle, { mode: options.mode, sourcePatient: patient });
  const summary = buildReadableExportSummary(state, options.patientId, options.mode) || undefined;
  const json = JSON.stringify(bundle, null, 2);

  return {
    ok: validation.valid,
    bundle,
    json,
    validation,
    summary,
    error: validation.valid ? undefined : `FHIR structural validation failed: ${validation.errors.join('; ')}`,
  };
}
