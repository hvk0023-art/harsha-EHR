export type RegionCode = 'US' | 'IN';

export type StaffRole =
  | 'Clinician'
  | 'Nurse Practitioner'
  | 'Medical Assistant'
  | 'Nurse / Care Coordinator'
  | 'Front Desk'
  | 'Supervisor'
  | 'Billing User'
  | 'Administrator'
  | 'Pharmacist'
  | 'Laboratory Staff'
  | 'Hospital Operations'
  | 'Care Manager';

export type PortalShell = 'staff' | 'patient';

export type StaffNavKey =
  | 'home'
  | 'demo-scenarios'
  | 'patients'
  | 'schedule'
  | 'front-desk'
  | 'inbox'
  | 'tasks'
  | 'care-management'
  | 'billing'
  | 'reports'
  | 'hospital'
  | 'administration';

export type PatientTabKey =
  | 'pre-consultation'
  | 'post-consultation'
  | 'pre-visit-intake'
  | 'overview'
  | 'data-inbox'
  | 'knowledge-graph'
  | 'timeline'
  | 'history'
  | 'encounters'
  | 'medications'
  | 'orders-results'
  | 'care-plan'
  | 'communications'
  | 'documents-forms'
  | 'ai-agent'
  | 'account';

export type DataVerificationState =
  | 'Verified'
  | 'Patient-Reported'
  | 'External Awaiting Verification'
  | 'AI-Extracted'
  | 'Missing';

export interface FieldProvenanceEntry {
  status: DataVerificationState;
  source: string;
  updatedAt: string;
  verifiedBy?: string;
}

export type InboxDocumentCategory =
  | 'Previous Medical History'
  | 'Laboratory Report'
  | 'Imaging Report'
  | 'Medication Record'
  | 'Pharmacy Information'
  | 'Discharge Summary'
  | 'Clinical Consultation Note'
  | 'Other Medical Document';

export interface InboxExtractedField {
  id: string;
  label: string;
  value: string;
  correctedValue?: string;
  targetSection: 'Condition' | 'Lab' | 'Imaging' | 'Medication' | 'Allergy' | 'History' | 'Demographics';
  sourceSnippet: string;
  confidence: 'High' | 'Medium' | 'Low';
  uncertain: boolean;
  uncertaintyReason?: string;
  decision: 'Pending' | 'Accepted' | 'Corrected' | 'Rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  metadata?: Record<string, string>;
}

export interface PatientDataInboxItem {
  id: string;
  title: string;
  category: InboxDocumentCategory;
  sourceAdapter: 'Synthetic Local Upload' | 'Patient-Submitted Document (Demo)' | 'External Clinic PDF (Demo)';
  sourceOrganization: string;
  receivedAt: string;
  documentDate: string;
  rawPreviewText: string;
  extractedIdentity: {
    fullName: string;
    dob?: string;
    phone?: string;
    mrnOrExternalId?: string;
    abhaOptional?: string;
  };
  candidatePatientIds: string[];
  confirmedPatientId?: string;
  status: 'Uploaded' | 'Classified' | 'AI Extracted' | 'Verified & Consolidated' | 'Rejected';
  extractedFields: InboxExtractedField[];
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface ClinicalRecommendationDecision {
  recommendationId: string;
  patientId: string;
  status: 'Accepted' | 'Reviewed' | 'Dismissed';
  decidedBy: string;
  decidedRole: StaffRole;
  decidedAt: string;
  note?: string;
}

export type PatientPortalSection =
  | 'summary'
  | 'appointments'
  | 'records'
  | 'medications'
  | 'messages'
  | 'forms'
  | 'bills'
  | 'care-plans'
  | 'sharing';

export interface Facility {
  id: string;
  name: string;
  shortName: string;
  city: string;
  region: RegionCode;
  timezone: string;
  tzAbbr: string;
  currency: 'USD' | 'INR';
  address: string;
  phone: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  specialty?: string;
  facilityId: string;
  initials: string;
  outOfOffice?: boolean;
  delegateId?: string;
}

export interface PatientAllergy {
  id: string;
  substance: string;
  reaction: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
  verified: boolean;
  source: string;
  recordedDate: string;
}

export interface PatientCondition {
  id: string;
  name: string;
  icd10: string;
  status: 'Active' | 'Resolved' | 'Inactive';
  onsetDate: string;
  source: 'Local Verified' | 'External HIE' | 'Patient Reported';
  verified: boolean;
  lastReviewed: string;
}

export interface ClinicalHistoryItem {
  id: string;
  category:
    | 'Medical'
    | 'Surgical'
    | 'Family'
    | 'Social'
    | 'Immunisation'
    | 'Reproductive'
    | 'Social Needs'
    | 'Advance Directives';
  title: string;
  detail: string;
  date: string;
  source: string;
  lastReviewed: string;
  verified: boolean;
}

export interface CaregiverRelationship {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  isEmergencyContact: boolean;
  isGuarantor: boolean;
  portalAccess: 'Full Proxy' | 'View Only' | 'None';
}

export interface VitalObservation {
  id: string;
  patientId: string;
  recordedAt: string;
  bpSystolic: number;
  bpDiastolic: number;
  heartRate: number;
  tempF: number;
  spo2: number;
  weightKg: number;
  heightCm: number;
  painScore: number;
  source: 'Clinic Intake' | 'Home Device' | 'Inpatient Flowsheet';
  recordedBy: string;
}

export interface Patient {
  id: string;
  mrn: string;
  abhaId?: string;
  fullName: string;
  dob: string;
  age: number;
  sex: 'Female' | 'Male' | 'Other';
  phone: string;
  email: string;
  address: string;
  facilityId: string;
  primaryProviderId: string;
  status: 'Active' | 'Inactive' | 'Deceased';
  preferredLanguage: string;
  entryPath: 'Scheduled' | 'Walk-in' | 'Referral' | 'Emergency';
  favourite?: boolean;
  specialtyTags: string[];
  allergies: PatientAllergy[];
  conditions: PatientCondition[];
  historyItems: ClinicalHistoryItem[];
  caregivers: CaregiverRelationship[];
  careTeamIds: string[];
  intakeFormsComplete: boolean;
  photoConsent: boolean;
  researchConsent: 'Consented' | 'Declined' | 'Not Asked';
  chiefConcern?: string;
  customFields?: Record<string, string>;
  registrationStatus?: 'Scheduled Lookup' | 'In Progress' | 'Verified & Ready';
  registrationVerifiedBy?: string;
  registrationVerifiedAt?: string;
  fieldProvenance?: Record<string, FieldProvenanceEntry>;
}

export type AppointmentStatus =
  | 'Scheduled'
  | 'Confirmed'
  | 'Pre-Registered'
  | 'Checked In'
  | 'In Room'
  | 'Completed'
  | 'Cancelled'
  | 'Waitlist';

export type AppointmentSubtype =
  | 'Scheduled Visit'
  | 'Walk-in'
  | 'Referral Consult'
  | 'Emergency Follow-up'
  | 'Recurring Dialysis'
  | 'Group Education'
  | 'Telehealth';

export interface Appointment {
  id: string;
  patientId: string;
  providerId: string;
  facilityId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMin: number;
  type: string;
  subtype: AppointmentSubtype;
  status: AppointmentStatus;
  room?: string;
  reason: string;
  reminderSent: boolean;
  reminderStatus?: 'Not Sent' | 'Simulated Logged';
  calendarSynced: boolean;
  coPayAmount: number;
  coPayCollected: boolean;
  recurringSeriesId?: string;
}

export type NoteStatus = 'Draft' | 'Awaiting Signature' | 'Signed' | 'Amended';

export interface NoteAmendment {
  id: string;
  timestamp: string;
  authorName: string;
  reason: string;
  text: string;
}

export interface Encounter {
  id: string;
  patientId: string;
  appointmentId?: string;
  providerId: string;
  facilityId: string;
  date: string;
  type: string;
  chiefComplaint: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  diagnoses: string[];
  noteStatus: NoteStatus;
  signedBy?: string;
  signedAt?: string;
  coSignedBy?: string;
  amendments: NoteAmendment[];
  comments: { id: string; author: string; timestamp: string; text: string }[];
  scribeTranscript?: string;
  avsReleased: boolean;
  isGroupVisit?: boolean;
}

export type OrderStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Ordered'
  | 'Specimen Collected'
  | 'Scheduled'
  | 'Resulted'
  | 'Cancelled'
  | 'Exception';

export interface ClinicalOrder {
  id: string;
  requisitionId: string;
  patientId: string;
  encounterId?: string;
  orderedById: string;
  facilityId: string;
  category: 'Lab' | 'Imaging' | 'Procedure' | 'Standing';
  name: string;
  code: string;
  priority: 'Routine' | 'Urgent' | 'STAT';
  status: OrderStatus;
  createdAt: string;
  notes?: string;
}

export interface LabResult {
  id: string;
  orderId: string;
  patientId: string;
  facilityId: string;
  testName: string;
  collectionDate: string;
  value: string;
  numericValue?: number;
  unit: string;
  referenceInterval: string;
  flag: 'Normal' | 'Abnormal' | 'Critical';
  status: 'Pending' | 'Final' | 'Corrected' | 'Reviewed';
  reviewOwnerId: string;
  reviewedAt?: string;
  patientReleased: boolean;
  sourceDocumentId?: string;
  sourceLabel?: string;
  priorVersions?: { version: number; value: string; timestamp: string; note: string }[];
}

export interface ImagingReport {
  id: string;
  orderId: string;
  patientId: string;
  facilityId: string;
  studyName: string;
  modality: 'X-Ray' | 'CT' | 'MRI' | 'Ultrasound';
  performedAt: string;
  status: 'Scheduled' | 'Prep Pending' | 'Preliminary' | 'Final' | 'Reviewed';
  findings: string;
  impression: string;
  priorComparison: string;
  radiologist: string;
  patientReleased: boolean;
  sourceDocumentId?: string;
  sourceLabel?: string;
}

export interface Medication {
  id: string;
  patientId: string;
  name: string;
  dose: string;
  route: string;
  frequency: string;
  duration?: string;
  status: 'Active' | 'Discontinued' | 'Draft' | 'Refill Requested';
  prescriberId: string;
  pharmacy: string;
  formularyStatus: 'Tier 1 Preferred' | 'Tier 2 Covered' | 'Prior Auth Required';
  controlled: boolean;
  reconciled: boolean;
  startDate: string;
  lastFilled?: string;
  refillsRemaining: number;
  safetyNote?: string;
}

export interface CareGoal {
  id: string;
  title: string;
  target: string;
  progressPct: number;
  status: 'On Track' | 'At Risk' | 'Achieved';
  ownerId: string;
  dueDate: string;
}

export interface CarePlan {
  id: string;
  patientId: string;
  programme: string;
  status: 'Active' | 'Review Due' | 'Completed';
  lastReview: string;
  goals: CareGoal[];
  interventions: { id: string; description: string; frequency: string; status: 'Active' | 'Done' }[];
  careGaps: { id: string; measure: string; dueDate: string; status: 'Open' | 'Scheduled' | 'Closed' }[];
  transitionSummary?: string;
}

export type ReferralStatus =
  | 'Received'
  | 'Triage'
  | 'Accepted'
  | 'Scheduled'
  | 'Seen'
  | 'Outcome Received'
  | 'Closed';

export interface Referral {
  id: string;
  patientId: string;
  facilityId: string;
  direction: 'Incoming' | 'Outgoing';
  specialty: string;
  referringProvider: string;
  targetProvider: string;
  urgency: 'Routine' | 'Urgent';
  reason: string;
  status: ReferralStatus;
  createdAt: string;
  linkedAppointmentId?: string;
  outcomeSummary?: string;
}

export type TaskStatus = 'To Do' | 'In Progress' | 'Complete';

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  ownerId: string;
  team: string;
  facilityId: string;
  patientId?: string;
  linkedRecord?: { type: string; id: string; label: string };
  dueDate: string;
  recurring?: string;
  patientVisible: boolean;
  timeLoggedMin: number;
  subtasks: { id: string; title: string; done: boolean }[];
  comments: { id: string; author: string; timestamp: string; text: string }[];
  history: { id: string; timestamp: string; event: string }[];
}

export interface MessageThread {
  id: string;
  patientId?: string;
  subject: string;
  channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call';
  ownerId: string;
  priority: 'Normal' | 'Urgent';
  status: 'Open' | 'Waiting on Patient' | 'Resolved';
  tags: string[];
  participants: string[];
  messages: {
    id: string;
    sender: string;
    isPatient: boolean;
    isInternalNote: boolean;
    channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call';
    timestamp: string;
    body: string;
    deliveryStatus: 'Sent' | 'Delivered' | 'Read' | 'Simulated';
  }[];
}

export interface FaxRecord {
  id: string;
  direction: 'Inbound' | 'Outbound';
  patientId?: string;
  recipientOrSender: string;
  faxNumber: string;
  subject: string;
  coverMessage: string;
  documentNames: string[];
  status: 'Queued' | 'Sent' | 'Delivered' | 'Failed' | 'Needs Matching' | 'Matched';
  timestamp: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  title: string;
  category: 'Clinical Note' | 'External Record' | 'Consent' | 'Lab PDF' | 'Imaging' | 'ROI';
  author: string;
  source: string;
  date: string;
  version: number;
  verified: boolean;
  external: boolean;
  summary: string;
  rawPreviewText?: string;
  inboxItemId?: string;
}

export interface FormAssignment {
  id: string;
  patientId: string;
  templateId: string;
  title: string;
  category: 'Intake' | 'Questionnaire' | 'Consent';
  language: string;
  version: string;
  status: 'Assigned' | 'Draft' | 'Submitted' | 'Signed';
  assignedDate: string;
  score?: number;
  responses: Record<string, string>;
  signedBy?: string;
  signedAt?: string;
}

export interface FormTemplate {
  id: string;
  title: string;
  category: 'Intake' | 'Questionnaire' | 'Consent';
  version: string;
  languages: string[];
  fields: { id: string; label: string; type: 'text' | 'select' | 'checkbox'; options?: string[] }[];
}

export interface InsurancePolicy {
  id: string;
  patientId: string;
  payerName: string;
  payerCategory: 'Medicare' | 'Commercial' | 'Medicaid' | 'Self-Pay' | 'ABDM / Ayushman';
  planName: string;
  memberId: string;
  groupNumber: string;
  isPrimary: boolean;
  status: 'Active' | 'Inactive' | 'Pending Verification';
  eligibilityCheckedAt: string;
  eligibilitySummary: {
    partAStatus?: string;
    partBStatus?: string;
    preventiveServices: string;
    nonCoveredNote: string;
    deductibleTotal: number;
    deductibleMet: number;
    coinsurancePct: number;
    copay: number;
  };
}

export interface PriorAuth {
  id: string;
  patientId: string;
  policyId: string;
  serviceName: string;
  authNumber: string;
  status: 'Approved' | 'Pending' | 'Denied' | 'Expiring Soon';
  validFrom: string;
  validTo: string;
  visitsApproved: number;
  visitsUsed: number;
}

export interface ClaimRecord {
  id: string;
  claimNumber: string;
  patientId: string;
  facilityId: string;
  providerId: string;
  encounterId?: string;
  payerName: string;
  payerCategory: 'Medicare' | 'Commercial' | 'Medicaid' | 'Self-Pay';
  isSecondary: boolean;
  primaryClaimId?: string;
  serviceDate: string;
  submittedDate?: string;
  chargeAmount: number;
  paidAmount: number;
  adjustmentAmount: number;
  patientBalance: number;
  status: 'Draft' | 'Validated' | 'Submitted' | 'Paid' | 'Rejected' | 'Denied' | 'Appealed';
  denialReason?: string;
  cptCodes: string[];
}

export interface InvoiceLineItem {
  id: string;
  code: string;
  description: string;
  date: string;
  amount: number;
  insuranceCovered: number;
  patientResponsibility: number;
}

export interface PaymentMethodSaved {
  id: string;
  patientId: string;
  brand: 'Visa' | 'Mastercard' | 'ACH Bank';
  last4: string;
  expiry: string;
  isDefault: boolean;
  autopayAuthorised: boolean;
}

export interface PatientInvoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  facilityId: string;
  issuedDate: string;
  dueDate: string;
  status: 'Open' | 'Partial' | 'Paid' | 'Refunded';
  lineItems: InvoiceLineItem[];
  payments: { id: string; date: string; amount: number; method: string; reference: string }[];
}

export interface BedUnit {
  id: string;
  facilityId: string;
  ward: string;
  bedNumber: string;
  state: 'Available' | 'Occupied' | 'Blocked' | 'Cleaning';
  patientId?: string;
  admittedAt?: string;
  attendingId?: string;
  acuity?: 'General' | 'Telemetry' | 'ICU';
  dischargeTarget?: string;
  handoverNote?: string;
}

export interface EmarDose {
  id: string;
  patientId: string;
  bedId: string;
  medication: string;
  dose: string;
  scheduledTime: string;
  status: 'Due' | 'Administered' | 'Held' | 'Refused';
  barcodeVerified: boolean;
  administeredBy?: string;
  administeredAt?: string;
}

export interface EmergencyOrCase {
  id: string;
  kind: 'Emergency' | 'Surgery';
  patientId: string;
  facilityId: string;
  triageCategory?: 'ESI-1' | 'ESI-2' | 'ESI-3' | 'ESI-4';
  location: string;
  status: 'Waiting' | 'Triage' | 'In Treatment' | 'Pre-Op' | 'In OR' | 'PACU' | 'Discharged';
  chiefOrProcedure: string;
  assignedProviderId: string;
  scheduledTime: string;
  readinessChecklist: { item: string; done: boolean }[];
}

export interface PharmacyInventoryItem {
  id: string;
  facilityId: string;
  ndc: string;
  name: string;
  strength: string;
  batchNumber: string;
  stockQty: number;
  reorderThreshold: number;
  expiryDate: string;
  supplier: string;
  unitCost: number;
  movements: { id: string; date: string; delta: number; reason: string; actor: string }[];
}

export interface DialysisSession {
  id: string;
  patientId: string;
  date: string;
  durationMin: number;
  preWeightKg: number;
  postWeightKg: number;
  ufGoalL: number;
  ufAchievedL: number;
  bpPre: string;
  bpPost: string;
  accessType: 'AV Fistula' | 'Tunneled Catheter';
  status: 'Completed' | 'Scheduled';
  notes: string;
}

export interface RemoteMonitoringDevice {
  id: string;
  patientId: string;
  deviceType: 'BP Cuff' | 'Scale' | 'Pulse Ox' | 'Glucometer';
  serial: string;
  lastReadingDate: string;
  lastValue: string;
  adherencePct: number;
  missingDays: number;
  alertState: 'Normal' | 'Threshold Alert' | 'Missing Readings';
  assignedToId: string;
}

export interface AiProposedAction {
  id: string;
  kind: 'Lab Order' | 'Appointment' | 'Task' | 'Draft Note' | 'Patient Message' | 'Medication Draft' | 'Follow-Up Plan' | 'Referral';
  title: string;
  summary: string;
  status: 'Draft' | 'Awaiting Approval' | 'Executing' | 'Completed' | 'Failed' | 'Cancelled';
  payload: Record<string, string>;
  resultRef?: string;
  whyExplanation?: string;
  supportingRecord?: string;
  source?: string;
  sourceVerified?: boolean;
  confidence?: 'High' | 'Medium' | 'Low';
  uncertaintyNote?: string;
  humanDecisionRequired?: string;
}

export interface IntakeExtractedItem {
  id: string;
  field: string;
  value: string;
  sourceDocument: string;
  sourceSnippet: string;
  confidence: 'High' | 'Medium' | 'Low';
  uncertaintyNote?: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  targetCategory: 'Condition' | 'Medication' | 'Allergy' | 'Lab' | 'History' | 'Insurance';
}

export interface PreVisitIntakeSubmission {
  id: string;
  patientId: string;
  appointmentId?: string;
  submittedAt: string;
  status: 'Pending' | 'Submitted' | 'AI Extracted' | 'Verified';
  reasonForVisit: string;
  symptomsSummary: string;
  reportedMedications: string[];
  reportedAllergies: string[];
  insurancePayer: string;
  insuranceMemberId: string;
  insuranceStatus: 'Simulated Verified' | 'Pending Manual Verification';
  uploadedDocuments: {
    id: string;
    title: string;
    type: 'Lab PDF' | 'External Summary';
    snippet: string;
    date: string;
  }[];
  extractedItems: IntakeExtractedItem[];
}

export interface ClinicalHandoffRecord {
  id: string;
  patientId: string;
  timestamp: string;
  fromRole: StaffRole | 'Patient (Simulated Intake)' | 'AI Assistant (Draft)';
  fromActor: string;
  toRole: StaffRole;
  toOwnerName: string;
  reason: string;
  linkedRecordRef: string;
  status: 'Pending' | 'Accepted' | 'Completed';
}

export interface ExternalDocCandidate {
  id: string;
  title: string;
  sourceOrganization: string;
  receivedAt: string;
  documentType: 'Lab PDF' | 'External Record' | 'Imaging';
  extractedPatientName: string;
  extractedDob: string;
  extractedSummary: string;
  candidatePatientIds: string[];
  matchConfidence: 'Uncertain' | 'Needs Review';
  uncertaintyReason: string;
  status: 'Pending Human Verification' | 'Verified & Filed' | 'Rejected';
  filedPatientId?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface AmbientScribeSession {
  id: string;
  patientId: string;
  encounterId: string;
  status: 'Idle' | 'Recording (Simulated)' | 'Draft Ready' | 'Reviewed';
  transcript: string;
  generatedSoap?: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  proposedActions: AiProposedAction[];
  updatedAt: string;
}

export interface AiConversation {
  id: string;
  patientId: string;
  title: string;
  createdAt: string;
  messages: {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: string;
    sources?: { label: string; tab: PatientTabKey; excerpt: string }[];
    uncertaintyNote?: string;
    actions?: AiProposedAction[];
  }[];
}

export interface AbdmConsentRecord {
  id: string;
  patientId: string;
  abhaAddress: string;
  purpose: string;
  hiTypes: string[];
  status: 'Requested' | 'Granted' | 'Expired' | 'Revoked';
  requestedAt: string;
  expiresAt: string;
  hipName: string;
}

export interface IntegrationSystem {
  id: string;
  name: string;
  category: 'EHR Foundation' | 'Lab Interface' | 'Clearinghouse' | 'HIE / FHIR' | 'ABDM Sandbox';
  status: 'Simulated Connected' | 'Delayed' | 'Failed' | 'Sandbox';
  lastSync: string;
  pendingMessages: number;
  note: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  role: StaffRole;
  facilityId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
}

export interface SupportTicket {
  id: string;
  title: string;
  category: 'Workflow' | 'Access' | 'Bug' | 'Feedback';
  status: 'Open' | 'In Review' | 'Resolved';
  createdAt: string;
  description: string;
}

export interface AdminConfig {
  features: {
    aiAgent: boolean;
    telehealth: boolean;
    abdmWorkspace: boolean;
    remoteMonitoring: boolean;
    researchCohorts: boolean;
  };
  customPageTitle: string;
  customPatientFieldLabel: string;
  workflowAutoTaskOnCriticalLab: boolean;
  brandTagline: string;
}

export interface AppState {
  currentPortal: PortalShell;
  currentNav: StaffNavKey;
  selectedPatientId: string | null;
  selectedPatientTab: PatientTabKey;
  patientPortalSection: PatientPortalSection;
  activeCaregiverProxy: string | null; // null = Self, string = caregiver name
  currentRole: StaffRole;
  currentFacilityId: string;
  currentUserId: string;
  activeScenarioId: string | null;
  unsavedDirty: boolean;

  facilities: Facility[];
  staff: StaffMember[];
  patients: Patient[];
  appointments: Appointment[];
  encounters: Encounter[];
  vitals: VitalObservation[];
  orders: ClinicalOrder[];
  labResults: LabResult[];
  imagingReports: ImagingReport[];
  medications: Medication[];
  carePlans: CarePlan[];
  referrals: Referral[];
  tasks: TaskItem[];
  messages: MessageThread[];
  faxes: FaxRecord[];
  documents: PatientDocument[];
  formAssignments: FormAssignment[];
  formTemplates: FormTemplate[];
  policies: InsurancePolicy[];
  priorAuths: PriorAuth[];
  claims: ClaimRecord[];
  invoices: PatientInvoice[];
  savedPaymentMethods: PaymentMethodSaved[];
  beds: BedUnit[];
  emarDoses: EmarDose[];
  emergencyOrCases: EmergencyOrCase[];
  pharmacyInventory: PharmacyInventoryItem[];
  dialysisSessions: DialysisSession[];
  rpmDevices: RemoteMonitoringDevice[];
  aiConversations: AiConversation[];
  abdmConsents: AbdmConsentRecord[];
  integrations: IntegrationSystem[];
  auditEvents: AuditEvent[];
  supportTickets: SupportTicket[];
  followUpPlans: FollowUpPlan[];
  preVisitIntakes: PreVisitIntakeSubmission[];
  handoffs: ClinicalHandoffRecord[];
  externalDocQueue: ExternalDocCandidate[];
  dataInboxItems: PatientDataInboxItem[];
  recommendationDecisions: Record<string, ClinicalRecommendationDecision>;
  scribeSessions: AmbientScribeSession[];
  adminConfig: AdminConfig;
}

export interface FollowUpPlan {
  id: string;
  patientId: string;
  encounterId?: string;
  providerId: string;
  facilityId: string;
  interval: string;
  instructions: string;
  createdAt: string;
  linkedAppointmentId?: string;
  linkedTaskId?: string;
  reminderChannel: 'Simulated SMS' | 'Simulated Email' | 'Simulated Portal Notice';
  reminderStatus: 'Not Scheduled' | 'Simulated Logged';
  reminderMessage?: string;
}
