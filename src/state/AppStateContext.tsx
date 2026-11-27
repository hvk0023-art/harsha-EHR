import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEMO_SCENARIOS, INITIAL_APP_STATE, TODAY_DATE } from '../data/seedData';
import { adjustPharmacyStock, hasAppointmentConflict } from './domainLogic';
import {
  canAccessNav,
  canExportPatientFhir,
  canOrderOrPrescribe,
  canSignClinicalNote,
  canSwitchFacility,
} from './permissions';
import {
  executeAuthorizedFhirExport,
  type AuthorizedFhirExportOutcome,
  type FhirExportMode,
} from './fhirExport';
import type {
  AbdmConsentRecord,
  AdminConfig,
  AiProposedAction,
  AppState,
  Appointment,
  AppointmentStatus,
  BedUnit,
  ClaimRecord,
  ClinicalOrder,
  ClinicalRecommendationDecision,
  Encounter,
  Facility,
  FaxRecord,
  FollowUpPlan,
  FormAssignment,
  FormTemplate,
  InsurancePolicy,
  LabResult,
  Medication,
  Patient,
  PatientAllergy,
  PatientDataInboxItem,
  PatientPortalSection,
  PatientTabKey,
  PortalShell,
  Referral,
  ReferralStatus,
  StaffNavKey,
  StaffRole,
  SupportTicket,
  TaskItem,
  TaskStatus,
  VitalObservation,
} from '../types/hms';

const STORAGE_KEY = 'eigenh_hms_prototype_v1';

export interface ToastNotice {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface UnsavedPromptState {
  pendingAction: () => void;
  label: string;
}

interface AppContextValue {
  state: AppState;
  currentFacility: Facility;
  toasts: ToastNotice[];
  dismissToast: (id: string) => void;
  notify: (tone: ToastNotice['tone'], message: string) => void;
  unsavedPrompt: UnsavedPromptState | null;
  confirmUnsaved: () => void;
  cancelUnsaved: () => void;
  setUnsavedDirty: (dirty: boolean) => void;

  // Navigation & Context
  setPortal: (portal: PortalShell) => void;
  setNav: (nav: StaffNavKey) => void;
  openPatient: (patientId: string, tab?: PatientTabKey) => void;
  closePatientWorkspace: () => void;
  setPatientTab: (tab: PatientTabKey) => void;
  setPatientPortalSection: (section: PatientPortalSection) => void;
  setActiveCaregiverProxy: (proxyName: string | null) => void;
  setRole: (role: StaffRole) => void;
  setFacility: (facilityId: string) => void;
  runScenario: (scenarioId: string) => void;
  clearScenario: () => void;
  resetDemoData: () => void;

  // Patient & Directory Actions
  registerPatient: (patient: Omit<Patient, 'id' | 'mrn'>) => { ok: boolean; patient?: Patient; error?: string };
  updatePatientDemographics: (patientId: string, patch: Partial<Patient>) => void;
  mergeDuplicatePatient: (keepId: string, duplicateId: string) => void;
  togglePatientFavourite: (patientId: string) => void;

  // Scheduling & Front Desk
  bookAppointment: (input: Omit<Appointment, 'id'>) => { ok: boolean; error?: string; appointment?: Appointment };
  updateAppointmentStatus: (appointmentId: string, status: AppointmentStatus, extra?: Partial<Appointment>) => void;
  rescheduleAppointment: (appointmentId: string, date: string, startTime: string, room?: string) => { ok: boolean; error?: string };

  // Clinical: Encounters, Vitals, Orders, Labs, Meds
  saveEncounterDraft: (encounterId: string, patch: Partial<Encounter>) => void;
  createEncounter: (input: Omit<Encounter, 'id'>) => Encounter;
  signEncounter: (encounterId: string, coSign?: boolean) => void;
  amendEncounter: (encounterId: string, reason: string, text: string) => void;
  addEncounterComment: (encounterId: string, text: string) => void;
  recordVitals: (vitals: Omit<VitalObservation, 'id'>) => void;
  createOrder: (order: Omit<ClinicalOrder, 'id' | 'requisitionId'>) => ClinicalOrder;
  updateOrderStatus: (orderId: string, status: ClinicalOrder['status']) => void;
  simulateLabResult: (orderId: string, value: string, numericValue: number | undefined, unit: string, refRange: string, flag: LabResult['flag']) => void;
  acknowledgeLabResult: (labId: string, createFollowUpTask?: boolean) => void;
  correctLabResult: (labId: string, newValue: string, note: string) => void;
  addMedication: (med: Omit<Medication, 'id'>) => void;
  approveMedication: (medId: string) => { ok: boolean; error?: string };
  requestMedicationRefill: (medId: string) => void;
  reconcileMedication: (medId: string) => void;
  addPatientAllergy: (patientId: string, allergy: Omit<PatientAllergy, 'id'>) => void;
  addInsurancePolicy: (policy: Omit<InsurancePolicy, 'id'>) => InsurancePolicy;
  createFollowUpPlan: (plan: Omit<FollowUpPlan, 'id' | 'createdAt'>) => FollowUpPlan;
  logSimulatedReminder: (params: { followUpPlanId?: string; appointmentId?: string; patientId: string; channel: FollowUpPlan['reminderChannel']; message: string }) => void;
  exportPatientFhir: (patientId: string, mode?: FhirExportMode, confirmedIdentifiable?: boolean) => AuthorizedFhirExportOutcome;

  // Tasks, Messages, Referrals, Faxes, Forms, Documents
  createTask: (task: Omit<TaskItem, 'id' | 'history' | 'comments'>) => TaskItem;
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  updateTask: (taskId: string, patch: Partial<TaskItem>) => void;
  addTaskComment: (taskId: string, text: string) => void;
  sendMessageInThread: (threadId: string, body: string, channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call', isPatient?: boolean) => void;
  createMessageThread: (patientId: string | undefined, subject: string, body: string, channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call', isPatient?: boolean) => void;
  advanceReferralStatus: (referralId: string, status: ReferralStatus, outcomeSummary?: string, linkedAppointmentId?: string) => void;
  createReferral: (ref: Omit<Referral, 'id' | 'createdAt'>) => void;
  sendFax: (fax: Omit<FaxRecord, 'id' | 'timestamp'>) => void;
  retryFax: (faxId: string) => void;
  matchInboundFax: (faxId: string, patientId: string) => void;
  submitFormAssignment: (assignmentId: string, responses: Record<string, string>, signName?: string) => void;
  assignFormToPatient: (patientId: string, templateId: string) => void;
  createFormTemplate: (tpl: Omit<FormTemplate, 'id'>) => void;
  verifyExternalCondition: (patientId: string, conditionId: string) => void;
  addPatientDocument: (doc: { patientId: string; title: string; category: 'Clinical Note' | 'External Record' | 'Consent' | 'Lab PDF' | 'Imaging' | 'ROI'; summary: string }) => void;

  // Billing, Invoices, Claims, Auth
  submitOrUpdateClaim: (claimId: string, status: ClaimRecord['status'], note?: string) => void;
  createClaimFromEncounter: (patientId: string, encounterId: string, cptCodes: string[], chargeAmount: number) => void;
  collectInvoicePayment: (invoiceId: string, amount: number, methodLabel: string) => void;
  toggleAutopayAuthorisation: (paymentMethodId: string) => void;
  runEligibilityCheck: (policyId: string) => void;

  // Hospital Ops: Beds, eMAR, OR/ED, Pharmacy, RPM, ABDM, Admin, Support
  updateBedState: (bedId: string, patch: Partial<BedUnit>) => void;
  administerEmarDose: (doseId: string) => void;
  toggleEmergencyChecklist: (caseId: string, index: number) => void;
  updateEmergencyStatus: (caseId: string, status: AppState['emergencyOrCases'][number]['status']) => void;
  dispenseOrRestockPharmacy: (itemId: string, delta: number, reason: string) => { ok: boolean; error?: string };
  logRpmOutreach: (deviceId: string) => void;
  updateAbdmConsent: (consentId: string, status: AbdmConsentRecord['status']) => void;
  requestAbdmConsent: (patientId: string, purpose: string, hipName: string) => void;
  retryIntegration: (integrationId: string) => void;
  updateAdminConfig: (patch: Partial<AdminConfig>) => void;
  createSupportTicket: (ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'status'>) => void;

  // AI Agent (D01)
  submitAiPrompt: (patientId: string, conversationId: string | null, prompt: string) => string;
  handleAiActionDecision: (conversationId: string, messageId: string, actionId: string, decision: 'approve' | 'cancel') => void;

  // AI-Native Clinical Workflows & Demo Director Snapshot Adapter
  submitPreVisitIntake: (input: {
    patientId: string;
    appointmentId?: string;
    reasonForVisit: string;
    symptomsSummary: string;
    reportedMedications: string[];
    reportedAllergies: string[];
    insurancePayer: string;
    insuranceMemberId: string;
    uploadedDocuments: { id: string; title: string; type: 'Lab PDF' | 'External Summary'; snippet: string; date: string }[];
  }) => void;
  runAiIntakeExtraction: (intakeId: string) => void;
  verifyIntakeExtractedItem: (intakeId: string, itemId: string) => void;
  recordClinicalHandoff: (handoff: Omit<AppState['handoffs'][number], 'id' | 'timestamp'>) => void;
  reconcileExternalDocument: (extDocId: string, targetPatientId: string, decision: 'file' | 'reject') => void;
  runSimulatedAmbientScribe: (patientId: string, encounterId: string, transcript: string) => void;
  decideComposerAction: (scribeSessionId: string, actionId: string, decision: 'approve' | 'cancel') => { ok: boolean; error?: string };
  addDataInboxItem: (item: PatientDataInboxItem) => void;
  confirmInboxItemPatient: (itemId: string, patientId: string) => void;
  runDataInboxExtraction: (itemId: string) => void;
  decideInboxExtractedField: (
    itemId: string,
    fieldId: string,
    decision: 'Accepted' | 'Corrected' | 'Rejected',
    correctedValue?: string
  ) => void;
  commitVerifiedInboxItem: (itemId: string) => { ok: boolean; error?: string; consolidatedCount?: number };
  decideClinicalRecommendation: (
    recommendationId: string,
    patientId: string,
    status: ClinicalRecommendationDecision['status'],
    note?: string
  ) => void;
  applyAiDocumentAnalysis: (
    itemId: string,
    analysis: {
      documentType: PatientDataInboxItem['category'];
      documentDate?: string;
      laboratoryOrFacilityIdentity?: string;
      extractedPatientIdentity: PatientDataInboxItem['extractedIdentity'];
      summary: string;
      labMeasurements: NonNullable<PatientDataInboxItem['aiLabMeasurements']>;
      extractedFields: PatientDataInboxItem['extractedFields'];
      missingOrAmbiguousFlags: string[];
      identitySafetyNote?: string;
      executionMode: 'live-ai' | 'deterministic-demo';
      modelId: string;
      requestId: string;
    }
  ) => void;
  stageAiComposerProposals: (params: {
    patientId: string;
    encounterId: string;
    transcript?: string;
    soap?: Encounter['soap'];
    proposals?: AiProposedAction[];
    executionMode: 'live-ai' | 'deterministic-demo';
    modelId: string;
    requestId: string;
  }) => void;
  updateComposerProposal: (
    scribeSessionId: string,
    actionId: string,
    patch: { title?: string; summary?: string; payload?: Record<string, string> }
  ) => void;
  recordClinicalAiAudit: (action: string, targetType: string, targetId: string, detail: string) => void;
  replaceEntireState: (nextState: AppState) => void;
}

const AppStateContext = createContext<AppContextValue | null>(null);

/**
 * Safely rehydrates persisted localStorage state while backfilling any newly added
 * canonical seed facilities, staff, patients (such as near-match Bengaluru Aarav Mehta
 * MRN-208612), and external document queue fixtures without duplicating or overwriting
 * user-modified records.
 */
export function rehydratePersistedAppState(parsed: unknown): AppState {
  if (!parsed || typeof parsed !== 'object') return INITIAL_APP_STATE;
  const candidate = parsed as Partial<AppState>;
  if (!Array.isArray(candidate.patients) || !Array.isArray(candidate.facilities)) {
    return INITIAL_APP_STATE;
  }

  const existingFacilityIds = new Set(candidate.facilities.map((f) => f.id));
  const mergedFacilities = [
    ...candidate.facilities,
    ...INITIAL_APP_STATE.facilities.filter((f) => !existingFacilityIds.has(f.id)),
  ];

  const existingStaff = Array.isArray(candidate.staff) ? candidate.staff : [];
  const existingStaffIds = new Set(existingStaff.map((s) => s.id));
  const mergedStaff = [
    ...existingStaff,
    ...INITIAL_APP_STATE.staff.filter((s) => !existingStaffIds.has(s.id)),
  ];

  const existingPatientIds = new Set(candidate.patients.map((p) => p.id));
  const existingPatientMrns = new Set(
    candidate.patients.map((p) => (p.mrn || '').trim().toUpperCase()).filter(Boolean)
  );
  const missingSeedPatients = INITIAL_APP_STATE.patients.filter(
    (seedPat) =>
      !existingPatientIds.has(seedPat.id) &&
      !existingPatientMrns.has(seedPat.mrn.trim().toUpperCase())
  );
  const mergedPatients = [...candidate.patients, ...missingSeedPatients];

  const existingExtDocs = Array.isArray(candidate.externalDocQueue)
    ? candidate.externalDocQueue
    : [];
  const existingExtDocIds = new Set(existingExtDocs.map((d) => d.id));
  const mergedExtDocs =
    existingExtDocs.length > 0
      ? [
          ...existingExtDocs,
          ...INITIAL_APP_STATE.externalDocQueue.filter((d) => !existingExtDocIds.has(d.id)),
        ]
      : INITIAL_APP_STATE.externalDocQueue;

  return {
    ...INITIAL_APP_STATE,
    ...candidate,
    facilities: mergedFacilities,
    staff: mergedStaff,
    patients: mergedPatients,
    followUpPlans: Array.isArray(candidate.followUpPlans) ? candidate.followUpPlans : [],
    preVisitIntakes: Array.isArray(candidate.preVisitIntakes) ? candidate.preVisitIntakes : [],
    handoffs: Array.isArray(candidate.handoffs) ? candidate.handoffs : [],
    externalDocQueue: mergedExtDocs,
    dataInboxItems: Array.isArray(candidate.dataInboxItems) ? candidate.dataInboxItems : [],
    recommendationDecisions:
      candidate.recommendationDecisions && typeof candidate.recommendationDecisions === 'object'
        ? candidate.recommendationDecisions
        : {},
    scribeSessions: Array.isArray(candidate.scribeSessions) ? candidate.scribeSessions : [],
    unsavedDirty: false,
  };
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return rehydratePersistedAppState(JSON.parse(raw));
    }
  } catch {
    // ignore corrupted local storage
  }
  return INITIAL_APP_STATE;
}

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(loadInitialState);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [unsavedPrompt, setUnsavedPrompt] = useState<UnsavedPromptState | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, unsavedDirty: false }));
    } catch {
      // ignore storage quota errors
    }
  }, [state]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((tone: ToastNotice['tone'], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.filter((t) => t.message !== message).slice(-2), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2800);
  }, []);

  const currentFacility =
    state.facilities.find((f) => f.id === state.currentFacilityId) || state.facilities[0];

  const appendAudit = useCallback(
    (prev: AppState, action: string, targetType: string, targetId: string, detail: string) => {
      const actor = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Prototype User';
      const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
      const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'EST'}`;
      return [
        {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          timestamp: ts,
          actor,
          role: prev.currentRole,
          facilityId: prev.currentFacilityId,
          action,
          targetType,
          targetId,
          detail,
        },
        ...prev.auditEvents,
      ].slice(0, 80);
    },
    []
  );

  const guardUnsaved = useCallback(
    (label: string, action: () => void) => {
      if (state.unsavedDirty) {
        setUnsavedPrompt({ label, pendingAction: action });
      } else {
        action();
      }
    },
    [state.unsavedDirty]
  );

  const confirmUnsaved = useCallback(() => {
    if (unsavedPrompt) {
      setState((prev) => ({ ...prev, unsavedDirty: false }));
      unsavedPrompt.pendingAction();
      setUnsavedPrompt(null);
    }
  }, [unsavedPrompt]);

  const cancelUnsaved = useCallback(() => {
    setUnsavedPrompt(null);
  }, []);

  const setUnsavedDirty = useCallback((dirty: boolean) => {
    setState((prev) => (prev.unsavedDirty === dirty ? prev : { ...prev, unsavedDirty: dirty }));
  }, []);

  const setPortal = useCallback(
    (portal: PortalShell) => {
      guardUnsaved('Switch portal view', () => {
        setState((prev) => ({
          ...prev,
          currentPortal: portal,
          unsavedDirty: false,
          selectedPatientId: portal === 'patient' ? prev.selectedPatientId || 'pat-1' : prev.selectedPatientId,
        }));
      });
    },
    [guardUnsaved]
  );

  const setNav = useCallback(
    (nav: StaffNavKey) => {
      if (!canAccessNav(state.currentRole, nav)) {
        notify('error', `Access denied for ${state.currentRole}: "${nav}" is outside this role's authorized scope.`);
        return;
      }
      guardUnsaved(`Navigate to ${nav}`, () => {
        setState((prev) => ({
          ...prev,
          currentPortal: 'staff',
          currentNav: nav,
          selectedPatientId: null,
          unsavedDirty: false,
        }));
      });
    },
    [guardUnsaved, notify, state.currentRole]
  );

  const openPatient = useCallback(
    (patientId: string, tab: PatientTabKey = 'overview') => {
      guardUnsaved('Open patient chart', () => {
        setState((prev) => ({
          ...prev,
          currentPortal: 'staff',
          selectedPatientId: patientId,
          selectedPatientTab: tab,
          unsavedDirty: false,
          auditEvents: appendAudit(prev, 'Open Chart', 'Patient', patientId, `Opened ${tab} tab`),
        }));
      });
    },
    [appendAudit, guardUnsaved]
  );

  const closePatientWorkspace = useCallback(() => {
    guardUnsaved('Exit patient chart', () => {
      setState((prev) => ({ ...prev, selectedPatientId: null, unsavedDirty: false }));
    });
  }, [guardUnsaved]);

  const setPatientTab = useCallback(
    (tab: PatientTabKey) => {
      guardUnsaved(`Switch to ${tab} tab`, () => {
        setState((prev) => ({ ...prev, selectedPatientTab: tab, unsavedDirty: false }));
      });
    },
    [guardUnsaved]
  );

  const setPatientPortalSection = useCallback((section: PatientPortalSection) => {
    setState((prev) => ({ ...prev, patientPortalSection: section }));
  }, []);

  const setActiveCaregiverProxy = useCallback((proxyName: string | null) => {
    setState((prev) => ({ ...prev, activeCaregiverProxy: proxyName }));
  }, []);

  const setRole = useCallback(
    (role: StaffRole) => {
      setState((prev) => {
        const matchingStaff =
          prev.staff.find((s) => s.role === role && s.facilityId === prev.currentFacilityId) ||
          prev.staff.find((s) => s.role === role) ||
          prev.staff[0];
        const nextFacilityId = canSwitchFacility(role)
          ? prev.currentFacilityId
          : matchingStaff?.facilityId || prev.currentFacilityId;
        const nextNav = canAccessNav(role, prev.currentNav) ? prev.currentNav : 'home';
        return {
          ...prev,
          currentRole: role,
          currentUserId: matchingStaff?.id || prev.currentUserId,
          currentFacilityId: nextFacilityId,
          currentNav: nextNav,
          auditEvents: appendAudit(
            prev,
            'Role Preview Switch',
            'Session',
            role,
            `Switched prototype role preview to ${role} (${matchingStaff?.name || 'Staff'})`
          ),
        };
      });
      notify('info', `Prototype role preview: ${role} (not real authentication)`);
    },
    [appendAudit, notify]
  );

  const setFacility = useCallback(
    (facilityId: string) => {
      if (!canSwitchFacility(state.currentRole)) {
        setState((prev) => ({
          ...prev,
          auditEvents: appendAudit(
            prev,
            'Denied Facility Switch',
            'Facility',
            facilityId,
            `${prev.currentRole} attempted unauthorized facility switch`
          ),
        }));
        notify('error', `Facility context is locked to your assigned facility for role ${state.currentRole}.`);
        return;
      }
      setState((prev) => {
        const fac = prev.facilities.find((f) => f.id === facilityId);
        return {
          ...prev,
          currentFacilityId: facilityId,
          selectedPatientId: null,
          auditEvents: appendAudit(prev, 'Switch Facility', 'Facility', facilityId, `Active facility: ${fac?.name}`),
        };
      });
    },
    [appendAudit, notify, state.currentRole]
  );

  const runScenario = useCallback(
    (scenarioId: string) => {
      const scen = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
      if (!scen) return;
      setState((prev) => ({
        ...prev,
        currentPortal: 'staff',
        currentRole: scen.role,
        currentFacilityId: scen.facilityId,
        currentNav: scen.nav,
        selectedPatientId: scen.patientId,
        selectedPatientTab: scen.patientTab,
        activeScenarioId: scen.id,
        unsavedDirty: false,
      }));
      notify('info', `Scenario active: ${scen.title}`);
    },
    [notify]
  );

  const clearScenario = useCallback(() => {
    setState((prev) => ({ ...prev, activeScenarioId: null }));
  }, []);

  const resetDemoData = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_APP_STATE);
    notify('success', 'Demo dataset reset to canonical initial state');
  }, [notify]);

  const registerPatient = useCallback(
    (input: Omit<Patient, 'id' | 'mrn'>) => {
      if (!input.fullName.trim() || !input.dob) {
        return { ok: false, error: 'Full name and date of birth are required.' };
      }
      const existingNums = state.patients
        .map((p) => Number(p.mrn.replace(/\D/g, '')))
        .filter((n) => Number.isFinite(n));
      const nextNum = Math.max(105600, ...existingNums) + 1;
      const newPatient: Patient = {
        ...input,
        id: `pat-${Date.now()}`,
        mrn: `MRN-${nextNum}`,
      };
      setState((prev) => ({
        ...prev,
        patients: [newPatient, ...prev.patients],
        auditEvents: appendAudit(
          prev,
          'Register Patient',
          'Patient',
          newPatient.id,
          `Registered ${newPatient.fullName} (${newPatient.mrn}) via ${newPatient.entryPath}`
        ),
      }));
      notify('success', `Registered ${newPatient.fullName} (${newPatient.mrn})`);
      return { ok: true, patient: newPatient };
    },
    [appendAudit, notify, state.patients]
  );

  const updatePatientDemographics = useCallback(
    (patientId: string, patch: Partial<Patient>) => {
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) => (p.id === patientId ? { ...p, ...patch } : p)),
        auditEvents: appendAudit(prev, 'Update Demographics', 'Patient', patientId, 'Updated patient demographics/status'),
      }));
      notify('success', 'Patient record updated');
    },
    [appendAudit, notify]
  );

  const mergeDuplicatePatient = useCallback(
    (keepId: string, duplicateId: string) => {
      setState((prev) => ({
        ...prev,
        patients: prev.patients.filter((p) => p.id !== duplicateId),
        appointments: prev.appointments.map((a) => (a.patientId === duplicateId ? { ...a, patientId: keepId } : a)),
        tasks: prev.tasks.map((t) => (t.patientId === duplicateId ? { ...t, patientId: keepId } : t)),
        auditEvents: appendAudit(prev, 'Merge Duplicate', 'Patient', keepId, `Merged duplicate record ${duplicateId} into ${keepId}`),
      }));
      notify('success', 'Duplicate patient record merged into primary chart');
    },
    [appendAudit, notify]
  );

  const togglePatientFavourite = useCallback((patientId: string) => {
    setState((prev) => ({
      ...prev,
      patients: prev.patients.map((p) => (p.id === patientId ? { ...p, favourite: !p.favourite } : p)),
    }));
  }, []);

  const bookAppointment = useCallback(
    (input: Omit<Appointment, 'id'>) => {
      if (!input.patientId || !input.providerId || !input.date || !input.startTime) {
        return { ok: false, error: 'Patient, provider, date, and start time are required.' };
      }
      if (input.status !== 'Waitlist') {
        const conflict = hasAppointmentConflict(state.appointments, input);
        if (conflict.conflict) {
          return { ok: false, error: conflict.reason || 'Scheduling conflict detected.' };
        }
      }
      const created: Appointment = { ...input, id: `apt-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        appointments: [...prev.appointments, created],
        auditEvents: appendAudit(prev, 'Book Appointment', 'Appointment', created.id, `${created.type} on ${created.date} at ${created.startTime}`),
      }));
      notify('success', `Appointment booked for ${created.date} at ${created.startTime}`);
      return { ok: true, appointment: created };
    },
    [appendAudit, notify, state.appointments]
  );

  const updateAppointmentStatus = useCallback(
    (appointmentId: string, status: AppointmentStatus, extra?: Partial<Appointment>) => {
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((a) => (a.id === appointmentId ? { ...a, status, ...extra } : a)),
        auditEvents: appendAudit(prev, 'Appointment Status', 'Appointment', appointmentId, `Updated status to ${status}`),
      }));
      notify('success', `Appointment updated: ${status}`);
    },
    [appendAudit, notify]
  );

  const rescheduleAppointment = useCallback(
    (appointmentId: string, date: string, startTime: string, room?: string) => {
      const existing = state.appointments.find((a) => a.id === appointmentId);
      if (!existing) return { ok: false, error: 'Appointment not found.' };
      const conflict = hasAppointmentConflict(state.appointments, {
        id: appointmentId,
        facilityId: existing.facilityId,
        providerId: existing.providerId,
        date,
        startTime,
        durationMin: existing.durationMin,
        room: room ?? existing.room,
      });
      if (conflict.conflict) {
        return { ok: false, error: conflict.reason };
      }
      setState((prev) => ({
        ...prev,
        appointments: prev.appointments.map((a) =>
          a.id === appointmentId ? { ...a, date, startTime, room: room ?? a.room, status: 'Confirmed' } : a
        ),
        auditEvents: appendAudit(prev, 'Reschedule', 'Appointment', appointmentId, `Moved to ${date} ${startTime}`),
      }));
      notify('success', `Appointment rescheduled to ${date} at ${startTime}`);
      return { ok: true };
    },
    [appendAudit, notify, state.appointments]
  );

  const saveEncounterDraft = useCallback(
    (encounterId: string, patch: Partial<Encounter>) => {
      setState((prev) => ({
        ...prev,
        unsavedDirty: false,
        encounters: prev.encounters.map((e) => (e.id === encounterId ? { ...e, ...patch } : e)),
        auditEvents: appendAudit(prev, 'Save Encounter Draft', 'Encounter', encounterId, 'Saved clinical note draft'),
      }));
      notify('success', 'Encounter draft saved');
    },
    [appendAudit, notify]
  );

  const createEncounter = useCallback(
    (input: Omit<Encounter, 'id'>) => {
      const created: Encounter = { ...input, id: `enc-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        encounters: [created, ...prev.encounters],
        auditEvents: appendAudit(prev, 'Start Encounter', 'Encounter', created.id, `Started ${created.type}`),
      }));
      return created;
    },
    [appendAudit]
  );

  const signEncounter = useCallback(
    (encounterId: string, coSign = false) => {
      if (!canSignClinicalNote(state.currentRole)) {
        setState((prev) => ({
          ...prev,
          auditEvents: appendAudit(
            prev,
            'Unauthorized Sign Blocked',
            'Encounter',
            encounterId,
            `Blocked clinical note sign-off attempt by role "${prev.currentRole}"`
          ),
        }));
        notify('error', `Role "${state.currentRole}" is not authorized to sign clinical notes.`);
        return;
      }
      setState((prev) => {
        const signer = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Clinician';
        const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'EST'}`;
        return {
          ...prev,
          unsavedDirty: false,
          encounters: prev.encounters.map((e) =>
            e.id === encounterId
              ? {
                  ...e,
                  noteStatus: 'Signed',
                  signedBy: e.signedBy || signer,
                  signedAt: e.signedAt || ts,
                  coSignedBy: coSign ? signer : e.coSignedBy,
                  avsReleased: true,
                }
              : e
          ),
          auditEvents: appendAudit(prev, 'Sign Note', 'Encounter', encounterId, `Note signed by ${signer}; locked read-only`),
        };
      });
      notify('success', 'Clinical note signed and locked read-only');
    },
    [appendAudit, notify, state.currentRole]
  );

  const amendEncounter = useCallback(
    (encounterId: string, reason: string, text: string) => {
      setState((prev) => {
        const authorName = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Clinician';
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
        return {
          ...prev,
          encounters: prev.encounters.map((e) =>
            e.id === encounterId
              ? {
                  ...e,
                  noteStatus: 'Amended',
                  amendments: [...e.amendments, { id: `amd-${Date.now()}`, timestamp: ts, authorName, reason, text }],
                }
              : e
          ),
          auditEvents: appendAudit(prev, 'Amend Note', 'Encounter', encounterId, `Addendum added: ${reason}`),
        };
      });
      notify('success', 'Amendment recorded; original signed note preserved');
    },
    [appendAudit, notify]
  );

  const addEncounterComment = useCallback((encounterId: string, text: string) => {
    setState((prev) => {
      const author = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Staff';
      const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
      return {
        ...prev,
        encounters: prev.encounters.map((e) =>
          e.id === encounterId
            ? { ...e, comments: [...e.comments, { id: `nc-${Date.now()}`, author, timestamp: ts, text }] }
            : e
        ),
      };
    });
  }, []);

  const recordVitals = useCallback(
    (vitals: Omit<VitalObservation, 'id'>) => {
      const created: VitalObservation = { ...vitals, id: `vit-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        vitals: [created, ...prev.vitals],
        auditEvents: appendAudit(prev, 'Record Vitals', 'Patient', vitals.patientId, `BP ${vitals.bpSystolic}/${vitals.bpDiastolic}, HR ${vitals.heartRate}`),
      }));
      notify('success', 'Vital signs recorded');
    },
    [appendAudit, notify]
  );

  const createOrder = useCallback(
    (order: Omit<ClinicalOrder, 'id' | 'requisitionId'>) => {
      const effectiveStatus =
        order.status === 'Ordered' && !canOrderOrPrescribe(state.currentRole) ? 'Draft' : order.status;
      if (order.status === 'Ordered' && !canOrderOrPrescribe(state.currentRole)) {
        notify('error', `Role "${state.currentRole}" cannot authorize clinical orders directly; saved as Draft only.`);
      }
      const created: ClinicalOrder = {
        ...order,
        status: effectiveStatus,
        id: `ord-${Date.now()}`,
        requisitionId: `REQ-${Math.floor(88300 + Math.random() * 900)}`,
      };
      setState((prev) => ({
        ...prev,
        orders: [created, ...prev.orders],
        auditEvents: appendAudit(prev, 'Create Order', 'Order', created.id, `${created.category}: ${created.name} (${created.status})`),
      }));
      if (effectiveStatus === order.status) {
        notify('success', `Order ${created.requisitionId} saved (${created.status})`);
      }
      return created;
    },
    [appendAudit, notify, state.currentRole]
  );

  const updateOrderStatus = useCallback(
    (orderId: string, status: ClinicalOrder['status']) => {
      if (status === 'Ordered' && !canOrderOrPrescribe(state.currentRole)) {
        setState((prev) => ({
          ...prev,
          auditEvents: appendAudit(
            prev,
            'Unauthorized Order Blocked',
            'Order',
            orderId,
            `Blocked clinical order authorization attempt by role "${prev.currentRole}"`
          ),
        }));
        notify('error', `Role "${state.currentRole}" is not authorized to approve clinical orders.`);
        return;
      }
      setState((prev) => ({
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        auditEvents: appendAudit(prev, 'Update Order', 'Order', orderId, `Status changed to ${status}`),
      }));
      notify('info', `Order status updated to ${status}`);
    },
    [appendAudit, notify, state.currentRole]
  );

  const simulateLabResult = useCallback(
    (
      orderId: string,
      value: string,
      numericValue: number | undefined,
      unit: string,
      refRange: string,
      flag: LabResult['flag']
    ) => {
      setState((prev) => {
        const order = prev.orders.find((o) => o.id === orderId);
        if (!order) return prev;
        const newResult: LabResult = {
          id: `lab-${Date.now()}`,
          orderId,
          patientId: order.patientId,
          facilityId: order.facilityId,
          testName: order.name,
          collectionDate: TODAY_DATE,
          value,
          numericValue,
          unit,
          referenceInterval: refRange,
          flag,
          status: 'Final',
          reviewOwnerId: order.orderedById,
          patientReleased: false,
        };
        let nextTasks = prev.tasks;
        if (flag === 'Critical' && prev.adminConfig.workflowAutoTaskOnCriticalLab) {
          const autoTask: TaskItem = {
            id: `tsk-${Date.now()}`,
            title: `Critical result follow-up: ${order.name} (${value} ${unit})`,
            status: 'To Do',
            priority: 'Urgent',
            ownerId: order.orderedById,
            team: 'Clinical Review',
            facilityId: order.facilityId,
            patientId: order.patientId,
            linkedRecord: { type: 'Lab Result', id: newResult.id, label: `${order.name}: ${value}` },
            dueDate: TODAY_DATE,
            patientVisible: false,
            timeLoggedMin: 0,
            subtasks: [],
            comments: [],
            history: [{ id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} 12:00`, event: 'Auto-created by Critical Lab workflow rule' }],
          };
          nextTasks = [autoTask, ...nextTasks];
        }
        return {
          ...prev,
          orders: prev.orders.map((o) => (o.id === orderId ? { ...o, status: 'Resulted' } : o)),
          labResults: [newResult, ...prev.labResults],
          tasks: nextTasks,
          auditEvents: appendAudit(prev, 'Simulate Lab Result', 'LabResult', newResult.id, `${order.name} = ${value} ${unit} (${flag})`),
        };
      });
      notify(flag === 'Critical' ? 'warning' : 'success', `Simulated ${flag} lab result recorded`);
    },
    [appendAudit, notify]
  );

  const acknowledgeLabResult = useCallback(
    (labId: string, createFollowUpTask = false) => {
      setState((prev) => {
        const lab = prev.labResults.find((l) => l.id === labId);
        if (!lab) return prev;
        let nextTasks = prev.tasks;
        if (createFollowUpTask) {
          const task: TaskItem = {
            id: `tsk-${Date.now()}`,
            title: `Follow up ${lab.testName} (${lab.value} ${lab.unit})`,
            status: 'To Do',
            priority: lab.flag === 'Critical' ? 'Urgent' : 'High',
            ownerId: prev.currentUserId,
            team: 'Clinical Review',
            facilityId: lab.facilityId,
            patientId: lab.patientId,
            linkedRecord: { type: 'Lab Result', id: lab.id, label: `${lab.testName} ${lab.value}` },
            dueDate: TODAY_DATE,
            patientVisible: false,
            timeLoggedMin: 0,
            subtasks: [],
            comments: [],
            history: [{ id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} 12:15`, event: 'Created during result sign-off' }],
          };
          nextTasks = [task, ...nextTasks];
        }
        return {
          ...prev,
          labResults: prev.labResults.map((l) =>
            l.id === labId ? { ...l, status: 'Reviewed', reviewedAt: TODAY_DATE, patientReleased: true } : l
          ),
          tasks: nextTasks,
          auditEvents: appendAudit(prev, 'Acknowledge Result', 'LabResult', labId, `Reviewed & released ${lab.testName}`),
        };
      });
      notify('success', 'Result acknowledged and released to patient view');
    },
    [appendAudit, notify]
  );

  const correctLabResult = useCallback(
    (labId: string, newValue: string, note: string) => {
      setState((prev) => ({
        ...prev,
        labResults: prev.labResults.map((l) => {
          if (l.id !== labId) return l;
          const prevList = l.priorVersions || [];
          return {
            ...l,
            value: newValue,
            numericValue: Number.isFinite(Number(newValue)) ? Number(newValue) : l.numericValue,
            status: 'Corrected',
            priorVersions: [
              ...prevList,
              { version: prevList.length + 1, value: l.value, timestamp: `${TODAY_DATE} 12:30`, note },
            ],
          };
        }),
        auditEvents: appendAudit(prev, 'Correct Lab Report', 'LabResult', labId, `Corrected to ${newValue}: ${note}`),
      }));
      notify('info', 'Corrected report saved; prior version preserved');
    },
    [appendAudit, notify]
  );

  const addMedication = useCallback(
    (med: Omit<Medication, 'id'>) => {
      const created: Medication = { ...med, id: `med-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        medications: [created, ...prev.medications],
        auditEvents: appendAudit(
          prev,
          'Medication Entry',
          'Medication',
          created.id,
          `${created.name} ${created.dose} (${created.status} — simulated, not transmitted)`
        ),
      }));
      notify('success', `${created.name} saved as ${created.status} (simulated — not transmitted externally)`);
    },
    [appendAudit, notify]
  );

  const approveMedication = useCallback(
    (medId: string) => {
      if (!canOrderOrPrescribe(state.currentRole)) {
        const error = `Role "${state.currentRole}" cannot approve prescriptions.`;
        notify('error', error);
        return { ok: false, error };
      }
      setState((prev) => ({
        ...prev,
        medications: prev.medications.map((m) =>
          m.id === medId ? { ...m, status: 'Active', reconciled: true } : m
        ),
        auditEvents: appendAudit(
          prev,
          'Approve Medication',
          'Medication',
          medId,
          'Clinician approved synthetic prescription Draft -> Active (not transmitted to real pharmacy)'
        ),
      }));
      notify('success', 'Medication approved and set Active (simulated — not transmitted)');
      return { ok: true };
    },
    [appendAudit, notify, state.currentRole]
  );

  const requestMedicationRefill = useCallback(
    (medId: string) => {
      setState((prev) => ({
        ...prev,
        medications: prev.medications.map((m) => (m.id === medId ? { ...m, status: 'Refill Requested' } : m)),
        auditEvents: appendAudit(prev, 'Refill Request', 'Medication', medId, 'Submitted simulated refill request'),
      }));
      notify('success', 'Refill request logged for pharmacy/clinician review');
    },
    [appendAudit, notify]
  );

  const reconcileMedication = useCallback(
    (medId: string) => {
      setState((prev) => ({
        ...prev,
        medications: prev.medications.map((m) => (m.id === medId ? { ...m, reconciled: true } : m)),
        auditEvents: appendAudit(prev, 'Medication Reconciliation', 'Medication', medId, 'Marked reconciled'),
      }));
      notify('success', 'Medication marked reconciled');
    },
    [appendAudit, notify]
  );

  const addPatientAllergy = useCallback(
    (patientId: string, allergy: Omit<PatientAllergy, 'id'>) => {
      const created: PatientAllergy = { ...allergy, id: `alg-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === patientId ? { ...p, allergies: [created, ...p.allergies] } : p
        ),
        auditEvents: appendAudit(
          prev,
          'Record Allergy',
          'Patient',
          patientId,
          `Recorded allergy: ${created.substance} (${created.severity})`
        ),
      }));
      notify('success', `Allergy recorded: ${created.substance}`);
    },
    [appendAudit, notify]
  );

  const addInsurancePolicy = useCallback(
    (policy: Omit<InsurancePolicy, 'id'>) => {
      const created: InsurancePolicy = { ...policy, id: `pol-${Date.now()}` };
      setState((prev) => ({
        ...prev,
        policies: [created, ...prev.policies],
        auditEvents: appendAudit(
          prev,
          'Add Coverage',
          'Policy',
          created.id,
          `${created.payerName} (${created.status} — simulated)`
        ),
      }));
      return created;
    },
    [appendAudit]
  );

  const createFollowUpPlan = useCallback(
    (plan: Omit<FollowUpPlan, 'id' | 'createdAt'>) => {
      const created: FollowUpPlan = {
        ...plan,
        id: `fp-${Date.now()}`,
        createdAt: TODAY_DATE,
      };
      setState((prev) => ({
        ...prev,
        followUpPlans: [created, ...(prev.followUpPlans || [])],
        auditEvents: appendAudit(
          prev,
          'Create Follow-Up Plan',
          'FollowUpPlan',
          created.id,
          `Interval: ${created.interval} · Reminder: ${created.reminderStatus}`
        ),
      }));
      notify('success', `Follow-up plan saved (${created.interval})`);
      return created;
    },
    [appendAudit, notify]
  );

  const logSimulatedReminder = useCallback(
    (params: {
      followUpPlanId?: string;
      appointmentId?: string;
      patientId: string;
      channel: FollowUpPlan['reminderChannel'];
      message: string;
    }) => {
      setState((prev) => {
        const pat = prev.patients.find((p) => p.id === params.patientId);
        const sender = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Care Team';
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
        const nextPlans = (prev.followUpPlans || []).map((fp) =>
          fp.id === params.followUpPlanId
            ? { ...fp, reminderStatus: 'Simulated Logged' as const, reminderChannel: params.channel, reminderMessage: params.message }
            : fp
        );
        const nextAppts = prev.appointments.map((a) =>
          a.id === params.appointmentId
            ? { ...a, reminderSent: true, reminderStatus: 'Simulated Logged' as const }
            : a
        );
        const reminderThread = {
          id: `msg-rem-${Date.now()}`,
          patientId: params.patientId,
          subject: `Follow-Up Reminder (${params.channel} — Simulated Logged)`,
          channel: 'Text' as const,
          ownerId: prev.currentUserId,
          priority: 'Normal' as const,
          status: 'Resolved' as const,
          tags: ['Follow-Up Reminder', 'Simulated Logged'],
          participants: [pat?.fullName || 'Patient', sender],
          messages: [
            {
              id: `m-rem-${Date.now()}`,
              sender,
              isPatient: false,
              isInternalNote: false,
              channel: 'Text' as const,
              timestamp: ts,
              body: `${params.message} [Status: Simulated Logged — no external SMS/email sent]`,
              deliveryStatus: 'Simulated' as const,
            },
          ],
        };
        return {
          ...prev,
          followUpPlans: nextPlans,
          appointments: nextAppts,
          messages: [reminderThread, ...prev.messages],
          auditEvents: appendAudit(
            prev,
            'Log Follow-Up Reminder (Sim)',
            'Patient',
            params.patientId,
            `${params.channel} logged locally (Simulated Logged — no external delivery)`
          ),
        };
      });
      notify('info', 'Follow-up reminder marked "Simulated Logged" (no real SMS/email delivered)');
    },
    [appendAudit, notify]
  );

  const exportPatientFhir = useCallback(
    (patientId: string, mode: FhirExportMode = 'masked', confirmedIdentifiable = false): AuthorizedFhirExportOutcome => {
      const actor = state.staff.find((s) => s.id === state.currentUserId)?.name || state.currentRole;
      const outcome = executeAuthorizedFhirExport(state, {
        role: state.currentRole,
        actorName: actor,
        patientId,
        mode,
        confirmedIdentifiable,
      });

      if (!outcome.ok) {
        const deniedAuth = !canExportPatientFhir(state.currentRole);
        setState((prev) => ({
          ...prev,
          auditEvents: appendAudit(
            prev,
            deniedAuth ? 'Denied FHIR Export Attempt' : 'FHIR Export Blocked',
            'Patient',
            patientId,
            outcome.error || 'FHIR export blocked'
          ),
        }));
        notify('error', outcome.error || 'FHIR export failed');
        return outcome;
      }

      setState((prev) => ({
        ...prev,
        auditEvents: appendAudit(
          prev,
          `Export FHIR R4 Bundle (${mode === 'masked' ? 'Masked' : 'Identifiable'})`,
          'Patient',
          patientId,
          `Generated & validated ${outcome.bundle?.entry.length || 0} FHIR R4 resources (${mode})`
        ),
      }));
      notify(
        'success',
        `FHIR R4 Bundle generated (${mode === 'masked' ? 'Masked / Pseudonymized' : 'Identifiable Synthetic'}, ${outcome.bundle?.entry.length || 0} resources)`
      );
      return outcome;
    },
    [appendAudit, notify, state]
  );

  const createTask = useCallback(
    (input: Omit<TaskItem, 'id' | 'history' | 'comments'>) => {
      const created: TaskItem = {
        ...input,
        id: `tsk-${Date.now()}`,
        comments: [],
        history: [{ id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`, event: 'Task created' }],
      };
      setState((prev) => ({
        ...prev,
        tasks: [created, ...prev.tasks],
        auditEvents: appendAudit(prev, 'Create Task', 'Task', created.id, created.title),
      }));
      notify('success', 'Task created');
      return created;
    },
    [appendAudit, notify]
  );

  const updateTaskStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                history: [
                  { id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`, event: `Status changed to ${status}` },
                  ...t.history,
                ],
              }
            : t
        ),
        auditEvents: appendAudit(prev, 'Task Status', 'Task', taskId, `Changed status to ${status}`),
      }));
    },
    [appendAudit]
  );

  const updateTask = useCallback((taskId: string, patch: Partial<TaskItem>) => {
    setState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
    }));
  }, []);

  const addTaskComment = useCallback((taskId: string, text: string) => {
    setState((prev) => {
      const author = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Staff';
      const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId
            ? { ...t, comments: [...t.comments, { id: `tc-${Date.now()}`, author, timestamp: ts, text }] }
            : t
        ),
      };
    });
  }, []);

  const sendMessageInThread = useCallback(
    (
      threadId: string,
      body: string,
      channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call',
      isPatient = false
    ) => {
      setState((prev) => {
        const sender = isPatient
          ? prev.activeCaregiverProxy || prev.patients.find((p) => p.id === (prev.selectedPatientId || 'pat-1'))?.fullName || 'Patient'
          : prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Staff';
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
        return {
          ...prev,
          messages: prev.messages.map((th) =>
            th.id === threadId
              ? {
                  ...th,
                  messages: [
                    ...th.messages,
                    {
                      id: `m-${Date.now()}`,
                      sender,
                      isPatient,
                      isInternalNote: channel === 'Internal Note',
                      channel,
                      timestamp: ts,
                      body,
                      deliveryStatus: 'Simulated',
                    },
                  ],
                }
              : th
          ),
          auditEvents: appendAudit(prev, 'Send Message', 'MessageThread', threadId, `${channel} sent (simulated)`),
        };
      });
      notify('success', channel === 'Internal Note' ? 'Internal staff note saved' : `${channel} simulated delivery recorded`);
    },
    [appendAudit, notify]
  );

  const createMessageThread = useCallback(
    (
      patientId: string | undefined,
      subject: string,
      body: string,
      channel: 'In-App' | 'Text' | 'Internal Note' | 'Page' | 'Call',
      isPatient = false
    ) => {
      setState((prev) => {
        const pat = prev.patients.find((p) => p.id === patientId);
        const sender = isPatient
          ? prev.activeCaregiverProxy || pat?.fullName || 'Patient'
          : prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Staff';
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`;
        return {
          ...prev,
          messages: [
            {
              id: `msg-${Date.now()}`,
              patientId,
              subject,
              channel,
              ownerId: prev.currentUserId,
              priority: 'Normal',
              status: 'Open',
              tags: [channel],
              participants: [pat?.fullName || 'Team', sender],
              messages: [
                {
                  id: `m-${Date.now()}`,
                  sender,
                  isPatient,
                  isInternalNote: channel === 'Internal Note',
                  channel,
                  timestamp: ts,
                  body,
                  deliveryStatus: 'Simulated',
                },
              ],
            },
            ...prev.messages,
          ],
        };
      });
      notify('success', 'New conversation created');
    },
    [notify]
  );

  const advanceReferralStatus = useCallback(
    (referralId: string, status: ReferralStatus, outcomeSummary?: string, linkedAppointmentId?: string) => {
      setState((prev) => ({
        ...prev,
        referrals: prev.referrals.map((r) =>
          r.id === referralId
            ? {
                ...r,
                status,
                outcomeSummary: outcomeSummary ?? r.outcomeSummary,
                linkedAppointmentId: linkedAppointmentId ?? r.linkedAppointmentId,
              }
            : r
        ),
        auditEvents: appendAudit(prev, 'Referral Update', 'Referral', referralId, `Status advanced to ${status}`),
      }));
      notify('success', `Referral status updated to ${status}`);
    },
    [appendAudit, notify]
  );

  const createReferral = useCallback(
    (ref: Omit<Referral, 'id' | 'createdAt'>) => {
      setState((prev) => ({
        ...prev,
        referrals: [{ ...ref, id: `ref-${Date.now()}`, createdAt: TODAY_DATE }, ...prev.referrals],
      }));
      notify('success', 'Referral created');
    },
    [notify]
  );

  const sendFax = useCallback(
    (fax: Omit<FaxRecord, 'id' | 'timestamp'>) => {
      const created: FaxRecord = {
        ...fax,
        id: `fax-${Date.now()}`,
        timestamp: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`,
      };
      setState((prev) => ({
        ...prev,
        faxes: [created, ...prev.faxes],
        auditEvents: appendAudit(prev, 'Send Fax (Sim)', 'Fax', created.id, `To ${created.recipientOrSender} (${created.status})`),
      }));
      notify('info', `Simulated fax ${created.status.toLowerCase()} (never transmitted externally)`);
    },
    [appendAudit, notify]
  );

  const retryFax = useCallback(
    (faxId: string) => {
      setState((prev) => ({
        ...prev,
        faxes: prev.faxes.map((f) => (f.id === faxId ? { ...f, status: 'Delivered' } : f)),
      }));
      notify('success', 'Simulated fax retry delivered');
    },
    [notify]
  );

  const matchInboundFax = useCallback(
    (faxId: string, patientId: string) => {
      setState((prev) => ({
        ...prev,
        faxes: prev.faxes.map((f) => (f.id === faxId ? { ...f, patientId, status: 'Matched' } : f)),
      }));
      notify('success', 'Inbound fax matched to patient chart');
    },
    [notify]
  );

  const submitFormAssignment = useCallback(
    (assignmentId: string, responses: Record<string, string>, signName?: string) => {
      setState((prev) => ({
        ...prev,
        formAssignments: prev.formAssignments.map((fa) =>
          fa.id === assignmentId
            ? {
                ...fa,
                responses,
                status: signName ? 'Signed' : 'Submitted',
                signedBy: signName || fa.signedBy,
                signedAt: signName ? `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}` : fa.signedAt,
              }
            : fa
        ),
        auditEvents: appendAudit(prev, 'Submit Form', 'FormAssignment', assignmentId, signName ? `Signed by ${signName}` : 'Submitted'),
      }));
      notify('success', signName ? 'Form electronically signed' : 'Form submitted');
    },
    [appendAudit, notify]
  );

  const assignFormToPatient = useCallback(
    (patientId: string, templateId: string) => {
      const tpl = state.formTemplates.find((t) => t.id === templateId);
      if (!tpl) return;
      const newAssign: FormAssignment = {
        id: `fa-${Date.now()}`,
        patientId,
        templateId,
        title: tpl.title,
        category: tpl.category,
        language: tpl.languages[0] || 'English',
        version: tpl.version,
        status: 'Assigned',
        assignedDate: TODAY_DATE,
        responses: {},
      };
      setState((prev) => ({ ...prev, formAssignments: [newAssign, ...prev.formAssignments] }));
      notify('success', `Assigned "${tpl.title}" to patient`);
    },
    [notify, state.formTemplates]
  );

  const createFormTemplate = useCallback(
    (tpl: Omit<FormTemplate, 'id'>) => {
      setState((prev) => ({
        ...prev,
        formTemplates: [{ ...tpl, id: `ft-${Date.now()}` }, ...prev.formTemplates],
      }));
      notify('success', `Form template "${tpl.title}" created`);
    },
    [notify]
  );

  const verifyExternalCondition = useCallback(
    (patientId: string, conditionId: string) => {
      setState((prev) => ({
        ...prev,
        patients: prev.patients.map((p) =>
          p.id === patientId
            ? {
                ...p,
                conditions: p.conditions.map((c) =>
                  c.id === conditionId
                    ? { ...c, verified: true, source: 'Local Verified', lastReviewed: TODAY_DATE }
                    : c
                ),
              }
            : p
        ),
        auditEvents: appendAudit(prev, 'Verify External Condition', 'Patient', patientId, `Promoted external condition ${conditionId} to Local Verified`),
      }));
      notify('success', 'External condition verified and reconciled');
    },
    [appendAudit, notify]
  );

  const addPatientDocument = useCallback(
    (doc: {
      patientId: string;
      title: string;
      category: 'Clinical Note' | 'External Record' | 'Consent' | 'Lab PDF' | 'Imaging' | 'ROI';
      summary: string;
    }) => {
      setState((prev) => {
        const author = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Staff';
        return {
          ...prev,
          documents: [
            {
              id: `doc-${Date.now()}`,
              patientId: doc.patientId,
              title: doc.title,
              category: doc.category,
              author,
              source: 'Local Upload Demo',
              date: TODAY_DATE,
              version: 1,
              verified: true,
              external: doc.category === 'External Record',
              summary: doc.summary,
            },
            ...prev.documents,
          ],
        };
      });
      notify('success', 'Document indexed to patient library');
    },
    [notify]
  );

  const submitOrUpdateClaim = useCallback(
    (claimId: string, status: ClaimRecord['status'], note?: string) => {
      setState((prev) => ({
        ...prev,
        claims: prev.claims.map((c) =>
          c.id === claimId
            ? {
                ...c,
                status,
                submittedDate: status === 'Submitted' && !c.submittedDate ? TODAY_DATE : c.submittedDate,
                denialReason: note ?? c.denialReason,
                paidAmount: status === 'Paid' ? c.chargeAmount - c.adjustmentAmount : c.paidAmount,
                patientBalance: status === 'Paid' ? 0 : c.patientBalance,
              }
            : c
        ),
        auditEvents: appendAudit(prev, 'Claim Workflow', 'Claim', claimId, `Updated claim status to ${status}`),
      }));
      notify('success', `Claim updated: ${status} (simulated)`);
    },
    [appendAudit, notify]
  );

  const createClaimFromEncounter = useCallback(
    (patientId: string, encounterId: string, cptCodes: string[], chargeAmount: number) => {
      setState((prev) => {
        const enc = prev.encounters.find((e) => e.id === encounterId);
        const pol = prev.policies.find((p) => p.patientId === patientId && p.isPrimary);
        const num = `CLM-2026-0${860 + prev.claims.length}`;
        const newClaim: ClaimRecord = {
          id: `clm-${Date.now()}`,
          claimNumber: num,
          patientId,
          facilityId: enc?.facilityId || prev.currentFacilityId,
          providerId: enc?.providerId || prev.currentUserId,
          encounterId,
          payerName: pol?.payerName || 'Self-Pay',
          payerCategory: (pol?.payerCategory === 'ABDM / Ayushman' ? 'Commercial' : pol?.payerCategory) || 'Self-Pay',
          isSecondary: false,
          serviceDate: enc?.date || TODAY_DATE,
          chargeAmount,
          paidAmount: 0,
          adjustmentAmount: 0,
          patientBalance: chargeAmount,
          status: 'Validated',
          cptCodes,
        };
        return {
          ...prev,
          claims: [newClaim, ...prev.claims],
          auditEvents: appendAudit(prev, 'Create Claim', 'Claim', newClaim.id, `Prepared ${num} for $${chargeAmount}`),
        };
      });
      notify('success', 'Claim prepared and validated');
    },
    [appendAudit, notify]
  );

  const collectInvoicePayment = useCallback(
    (invoiceId: string, amount: number, methodLabel: string) => {
      setState((prev) => ({
        ...prev,
        invoices: prev.invoices.map((inv) => {
          if (inv.id !== invoiceId) return inv;
          const totalResp = inv.lineItems.reduce((s, li) => s + li.patientResponsibility, 0);
          const alreadyPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
          const nextPaid = alreadyPaid + amount;
          const nextStatus = nextPaid >= totalResp ? 'Paid' : 'Partial';
          return {
            ...inv,
            status: nextStatus,
            payments: [
              ...inv.payments,
              {
                id: `pay-${Date.now()}`,
                date: TODAY_DATE,
                amount,
                method: methodLabel,
                reference: `SIM-TX-${Math.floor(1000 + Math.random() * 9000)}`,
              },
            ],
          };
        }),
        auditEvents: appendAudit(prev, 'Simulated Payment', 'Invoice', invoiceId, `Recorded simulated payment $${amount} via ${methodLabel}`),
      }));
      notify('success', `Simulated payment of $${amount.toFixed(2)} recorded`);
    },
    [appendAudit, notify]
  );

  const toggleAutopayAuthorisation = useCallback(
    (paymentMethodId: string) => {
      setState((prev) => ({
        ...prev,
        savedPaymentMethods: prev.savedPaymentMethods.map((pm) =>
          pm.id === paymentMethodId ? { ...pm, autopayAuthorised: !pm.autopayAuthorised } : pm
        ),
      }));
      notify('info', 'Automatic collection authorisation updated');
    },
    [notify]
  );

  const runEligibilityCheck = useCallback(
    (policyId: string) => {
      setState((prev) => {
        const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'EST'}`;
        return {
          ...prev,
          policies: prev.policies.map((p) =>
            p.id === policyId ? { ...p, eligibilityCheckedAt: ts, status: 'Active' } : p
          ),
          auditEvents: appendAudit(prev, 'Eligibility Check (Sim)', 'Policy', policyId, 'Simulated eligibility inquiry completed'),
        };
      });
      notify('success', 'Simulated eligibility response refreshed (does not guarantee payment)');
    },
    [appendAudit, notify]
  );

  const updateBedState = useCallback(
    (bedId: string, patch: Partial<BedUnit>) => {
      setState((prev) => ({
        ...prev,
        beds: prev.beds.map((b) => (b.id === bedId ? { ...b, ...patch } : b)),
        auditEvents: appendAudit(prev, 'Bed Board Update', 'Bed', bedId, `State: ${patch.state || 'updated'}`),
      }));
      notify('success', 'Bed unit updated');
    },
    [appendAudit, notify]
  );

  const administerEmarDose = useCallback(
    (doseId: string) => {
      setState((prev) => {
        const nurse = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'RN';
        const ts = new Date().toTimeString().slice(0, 5);
        return {
          ...prev,
          emarDoses: prev.emarDoses.map((d) =>
            d.id === doseId
              ? { ...d, status: 'Administered', barcodeVerified: true, administeredBy: nurse, administeredAt: ts }
              : d
          ),
          auditEvents: appendAudit(prev, 'eMAR Administration', 'EmarDose', doseId, `Simulated barcode scan & administration by ${nurse}`),
        };
      });
      notify('success', 'Simulated barcode verified and medication dose charted');
    },
    [appendAudit, notify]
  );

  const toggleEmergencyChecklist = useCallback((caseId: string, index: number) => {
    setState((prev) => ({
      ...prev,
      emergencyOrCases: prev.emergencyOrCases.map((c) => {
        if (c.id !== caseId) return c;
        const next = c.readinessChecklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
        return { ...c, readinessChecklist: next };
      }),
    }));
  }, []);

  const updateEmergencyStatus = useCallback(
    (caseId: string, status: AppState['emergencyOrCases'][number]['status']) => {
      setState((prev) => ({
        ...prev,
        emergencyOrCases: prev.emergencyOrCases.map((c) => (c.id === caseId ? { ...c, status } : c)),
      }));
      notify('info', `Case status updated to ${status}`);
    },
    [notify]
  );

  const dispenseOrRestockPharmacy = useCallback(
    (itemId: string, delta: number, reason: string) => {
      const item = state.pharmacyInventory.find((i) => i.id === itemId);
      if (!item) return { ok: false, error: 'Inventory item not found.' };
      const actor = state.staff.find((s) => s.id === state.currentUserId)?.name || 'Pharmacist';
      const result = adjustPharmacyStock(item, delta, reason, actor, TODAY_DATE);
      if (!result.ok || !result.updated) {
        notify('error', result.error || 'Adjustment failed');
        return { ok: false, error: result.error };
      }
      setState((prev) => ({
        ...prev,
        pharmacyInventory: prev.pharmacyInventory.map((i) => (i.id === itemId ? result.updated! : i)),
        auditEvents: appendAudit(prev, 'Pharmacy Stock', 'PharmacyItem', itemId, `${reason}: delta ${delta}`),
      }));
      if (result.reorderTriggered) {
        notify('warning', `${item.name} dropped to ${result.updated.stockQty} (below reorder threshold ${item.reorderThreshold})`);
      } else {
        notify('success', `${item.name} stock updated to ${result.updated.stockQty}`);
      }
      return { ok: true };
    },
    [appendAudit, notify, state.currentUserId, state.pharmacyInventory, state.staff]
  );

  const logRpmOutreach = useCallback(
    (deviceId: string) => {
      setState((prev) => ({
        ...prev,
        rpmDevices: prev.rpmDevices.map((d) =>
          d.id === deviceId ? { ...d, alertState: 'Normal', missingDays: 0, lastReadingDate: TODAY_DATE } : d
        ),
      }));
      notify('success', 'Outreach logged and RPM device alert cleared');
    },
    [notify]
  );

  const updateAbdmConsent = useCallback(
    (consentId: string, status: AbdmConsentRecord['status']) => {
      setState((prev) => ({
        ...prev,
        abdmConsents: prev.abdmConsents.map((c) => (c.id === consentId ? { ...c, status } : c)),
        auditEvents: appendAudit(prev, 'ABDM Consent', 'ABDMConsent', consentId, `Simulated consent state -> ${status}`),
      }));
      notify('info', `ABDM consent marked ${status} (sandbox simulation)`);
    },
    [appendAudit, notify]
  );

  const requestAbdmConsent = useCallback(
    (patientId: string, purpose: string, hipName: string) => {
      const pat = state.patients.find((p) => p.id === patientId);
      const created: AbdmConsentRecord = {
        id: `abdm-${Date.now()}`,
        patientId,
        abhaAddress: pat?.abhaId ? `${pat.fullName.toLowerCase().replace(/\s+/g, '.')}@abdm` : 'demo.patient@abdm',
        purpose,
        hiTypes: ['OP Consultation', 'Diagnostic Report'],
        status: 'Requested',
        requestedAt: TODAY_DATE,
        expiresAt: '2026-12-18',
        hipName,
      };
      setState((prev) => ({ ...prev, abdmConsents: [created, ...prev.abdmConsents] }));
      notify('success', 'Simulated ABDM consent request created');
    },
    [notify, state.patients]
  );

  const retryIntegration = useCallback(
    (integrationId: string) => {
      setState((prev) => ({
        ...prev,
        integrations: prev.integrations.map((intg) =>
          intg.id === integrationId
            ? { ...intg, status: 'Simulated Connected', pendingMessages: 0, lastSync: `${TODAY_DATE} 12:00` }
            : intg
        ),
      }));
      notify('success', 'Simulated interface retry succeeded');
    },
    [notify]
  );

  const updateAdminConfig = useCallback(
    (patch: Partial<AdminConfig>) => {
      setState((prev) => ({
        ...prev,
        adminConfig: { ...prev.adminConfig, ...patch },
        auditEvents: appendAudit(prev, 'Admin Config', 'AdminConfig', 'global', 'Updated prototype feature/workflow settings'),
      }));
      notify('success', 'Configuration updated');
    },
    [appendAudit, notify]
  );

  const createSupportTicket = useCallback(
    (ticket: Omit<SupportTicket, 'id' | 'createdAt' | 'status'>) => {
      setState((prev) => ({
        ...prev,
        supportTickets: [
          { ...ticket, id: `sup-${Date.now()}`, createdAt: TODAY_DATE, status: 'Open' },
          ...prev.supportTickets,
        ],
      }));
      notify('success', 'Support request logged locally');
    },
    [notify]
  );

  const submitAiPrompt = useCallback(
    (patientId: string, conversationId: string | null, prompt: string) => {
      const pat = state.patients.find((p) => p.id === patientId);
      const labs = state.labResults.filter((l) => l.patientId === patientId);
      const latestLab = labs[0];
      const lower = prompt.toLowerCase();

      const actions: AiProposedAction[] = [];
      if (lower.includes('lab') || lower.includes('order') || lower.includes('potassium') || lower.includes('cmp') || lower.includes('prepare')) {
        actions.push({
          id: `act-${Date.now()}-1`,
          kind: 'Lab Order',
          title: 'Draft Lab Order: Comprehensive Metabolic Panel',
          summary: `Routine CMP linked to ${pat?.conditions[0]?.name || 'active chart'}`,
          status: 'Awaiting Approval',
          payload: { name: 'Comprehensive Metabolic Panel (CMP)', code: '80053', priority: 'Routine' },
        });
      }
      if (lower.includes('follow') || lower.includes('schedule') || lower.includes('appointment') || lower.includes('visit') || lower.includes('prepare')) {
        actions.push({
          id: `act-${Date.now()}-2`,
          kind: 'Appointment',
          title: 'Schedule Follow-up Visit (2026-12-09 at 11:00)',
          summary: '30 min outpatient follow-up · Requires slot approval',
          status: 'Awaiting Approval',
          payload: { date: '2026-12-09', startTime: '11:00', durationMin: '30', type: 'Follow-up Visit' },
        });
      }
      if (lower.includes('task') || lower.includes('care') || lower.includes('nurse') || lower.includes('prepare')) {
        actions.push({
          id: `act-${Date.now()}-3`,
          kind: 'Task',
          title: `Create Task: Follow up ${pat?.fullName || 'patient'} care coordination`,
          summary: 'Assign to Jordan Lee, RN · Due 2026-11-24',
          status: 'Draft',
          payload: { ownerId: 'staff-2', dueDate: '2026-11-24', priority: 'Medium' },
        });
      }
      if (lower.includes('message') || lower.includes('notify')) {
        actions.push({
          id: `act-${Date.now()}-4`,
          kind: 'Patient Message',
          title: 'Draft Patient Message: Lab & Visit Summary',
          summary: 'In-app message awaiting review before sending',
          status: 'Awaiting Approval',
          payload: { subject: 'Follow-up & Lab Plan', body: `Hello ${pat?.fullName}, we prepared your follow-up plan.` },
        });
      }
      if (actions.length === 0) {
        actions.push({
          id: `act-${Date.now()}-5`,
          kind: 'Task',
          title: `Create Follow-up Review Task for ${pat?.fullName || 'Patient'}`,
          summary: 'Assign to Care Team · Due 2026-11-24',
          status: 'Awaiting Approval',
          payload: { ownerId: state.currentUserId, dueDate: '2026-11-24', priority: 'Medium' },
        });
      }

      const convId = conversationId || `aiconv-${Date.now()}`;
      const ts = new Date().toTimeString().slice(0, 5);
      const assistantMsg = {
        id: `aim-${Date.now()}-a`,
        role: 'assistant' as const,
        text: `Based on ${pat?.fullName}'s local chart (${pat?.conditions.length || 0} conditions, ${pat?.allergies.length || 0} allergies${latestLab ? `, latest ${latestLab.testName}: ${latestLab.value} ${latestLab.unit}` : ''}), I staged ${actions.length} separate action(s). Approve or cancel each individually below.`,
        timestamp: ts,
        sources: [
          {
            label: `Problems: ${pat?.conditions[0]?.name || 'Active Chart'}`,
            tab: 'overview' as PatientTabKey,
            excerpt: pat?.conditions.map((c) => `${c.name} (${c.icd10})`).join('; ') || 'No active problems',
          },
          ...(latestLab
            ? [
                {
                  label: `Lab: ${latestLab.testName} (${latestLab.collectionDate})`,
                  tab: 'orders-results' as PatientTabKey,
                  excerpt: `${latestLab.value} ${latestLab.unit} · Ref ${latestLab.referenceInterval} (${latestLab.flag})`,
                },
              ]
            : []),
        ],
        uncertaintyNote: 'Simulated AI interpretation — verify clinical appropriateness before approving any proposed action.',
        actions,
      };

      const userMsg = {
        id: `aim-${Date.now()}-u`,
        role: 'user' as const,
        text: prompt,
        timestamp: ts,
      };

      setState((prev) => {
        const exists = prev.aiConversations.some((c) => c.id === convId);
        const nextConvs = exists
          ? prev.aiConversations.map((c) =>
              c.id === convId ? { ...c, messages: [...c.messages, userMsg, assistantMsg] } : c
            )
          : [
              {
                id: convId,
                patientId,
                title: prompt.slice(0, 42) + (prompt.length > 42 ? '…' : ''),
                createdAt: `${TODAY_DATE} ${ts}`,
                messages: [userMsg, assistantMsg],
              },
              ...prev.aiConversations,
            ];
        return {
          ...prev,
          aiConversations: nextConvs,
          auditEvents: appendAudit(prev, 'AI Agent Query', 'Patient', patientId, `Staged ${actions.length} proposed actions`),
        };
      });
      return convId;
    },
    [appendAudit, state.currentUserId, state.labResults, state.patients]
  );

  const handleAiActionDecision = useCallback(
    (conversationId: string, messageId: string, actionId: string, decision: 'approve' | 'cancel') => {
      const conv = state.aiConversations.find((c) => c.id === conversationId);
      const msg = conv?.messages.find((m) => m.id === messageId);
      const action = msg?.actions?.find((a) => a.id === actionId);
      if (!conv || !action) return;

      if (decision === 'cancel') {
        setState((prev) => ({
          ...prev,
          aiConversations: prev.aiConversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          actions: m.actions?.map((a) => (a.id === actionId ? { ...a, status: 'Cancelled' } : a)),
                        }
                      : m
                  ),
                }
              : c
          ),
          auditEvents: appendAudit(prev, 'AI Action Cancelled', 'AiAction', actionId, action.title),
        }));
        notify('info', `Cancelled: ${action.title}`);
        return;
      }

      // Approve and execute synthetic action into canonical records
      const pat = state.patients.find((p) => p.id === conv.patientId);
      let resultRef = '';
      setState((prev) => {
        let nextOrders = prev.orders;
        let nextAppointments = prev.appointments;
        let nextTasks = prev.tasks;
        let nextMessages = prev.messages;
        let failedReason: string | null = null;

        if (action.kind === 'Lab Order') {
          const reqId = `REQ-${Math.floor(88500 + Math.random() * 400)}`;
          const newOrder: ClinicalOrder = {
            id: `ord-${Date.now()}`,
            requisitionId: reqId,
            patientId: conv.patientId,
            orderedById: prev.currentUserId,
            facilityId: pat?.facilityId || prev.currentFacilityId,
            category: 'Lab',
            name: action.payload.name || 'Potassium & Urine ACR Panel',
            code: action.payload.code || '84132',
            priority: (action.payload.priority as ClinicalOrder['priority']) || 'Routine',
            status: 'Ordered',
            createdAt: TODAY_DATE,
          };
          nextOrders = [newOrder, ...nextOrders];
          resultRef = `Order ${reqId}`;
        } else if (action.kind === 'Appointment') {
          const candidate = {
            patientId: conv.patientId,
            providerId: pat?.primaryProviderId || prev.currentUserId,
            facilityId: pat?.facilityId || prev.currentFacilityId,
            date: action.payload.date || '2026-12-16',
            startTime: action.payload.startTime || '10:00',
            durationMin: Number(action.payload.durationMin) || 30,
          };
          const conflict = hasAppointmentConflict(prev.appointments, candidate);
          if (conflict.conflict) {
            failedReason = conflict.reason || 'Slot conflict';
          } else {
            const newAppt: Appointment = {
              ...candidate,
              id: `apt-${Date.now()}`,
              type: action.payload.type || 'Follow-up Visit',
              subtype: 'Scheduled Visit',
              status: 'Scheduled',
              reason: 'Scheduled via approved AI Agent proposal',
              reminderSent: false,
              calendarSynced: false,
              coPayAmount: 25,
              coPayCollected: false,
            };
            nextAppointments = [...nextAppointments, newAppt];
            resultRef = `${newAppt.date} ${newAppt.startTime}`;
          }
        } else if (action.kind === 'Task') {
          const newTask: TaskItem = {
            id: `tsk-${Date.now()}`,
            title: action.title.replace(/^Create Task:\s*/i, ''),
            status: 'To Do',
            priority: (action.payload.priority as TaskItem['priority']) || 'Medium',
            ownerId: action.payload.ownerId || prev.currentUserId,
            team: 'Care Coordination',
            facilityId: pat?.facilityId || prev.currentFacilityId,
            patientId: conv.patientId,
            dueDate: action.payload.dueDate || '2026-11-25',
            patientVisible: false,
            timeLoggedMin: 0,
            subtasks: [],
            comments: [],
            history: [{ id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} 12:00`, event: 'Created via approved AI Agent action' }],
          };
          nextTasks = [newTask, ...nextTasks];
          resultRef = `Task queued (${newTask.dueDate})`;
        } else if (action.kind === 'Patient Message') {
          nextMessages = [
            {
              id: `msg-${Date.now()}`,
              patientId: conv.patientId,
              subject: action.payload.subject || 'Care Update',
              channel: 'In-App',
              ownerId: prev.currentUserId,
              priority: 'Normal',
              status: 'Open',
              tags: ['AI Drafted'],
              participants: [pat?.fullName || 'Patient', 'Care Team'],
              messages: [
                {
                  id: `m-${Date.now()}`,
                  sender: prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Clinician',
                  isPatient: false,
                  isInternalNote: false,
                  channel: 'In-App',
                  timestamp: `${TODAY_DATE} 12:00`,
                  body: action.payload.body || 'Follow-up plan prepared.',
                  deliveryStatus: 'Simulated',
                },
              ],
            },
            ...nextMessages,
          ];
          resultRef = 'Message thread created';
        }

        return {
          ...prev,
          orders: nextOrders,
          appointments: nextAppointments,
          tasks: nextTasks,
          messages: nextMessages,
          aiConversations: prev.aiConversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          actions: m.actions?.map((a) =>
                            a.id === actionId
                              ? {
                                  ...a,
                                  status: failedReason ? 'Failed' : 'Completed',
                                  resultRef: failedReason || resultRef,
                                }
                              : a
                          ),
                        }
                      : m
                  ),
                }
              : c
          ),
          auditEvents: appendAudit(
            prev,
            failedReason ? 'AI Action Failed' : 'AI Action Approved',
            'AiAction',
            actionId,
            failedReason ? `${action.title}: ${failedReason}` : `Executed ${action.title} -> ${resultRef}`
          ),
        };
      });
      notify('success', `Approved & executed: ${action.title}`);
    },
    [appendAudit, notify, state.aiConversations, state.patients]
  );

  const submitPreVisitIntake = useCallback(
    (input: {
      patientId: string;
      appointmentId?: string;
      reasonForVisit: string;
      symptomsSummary: string;
      reportedMedications: string[];
      reportedAllergies: string[];
      insurancePayer: string;
      insuranceMemberId: string;
      uploadedDocuments: { id: string; title: string; type: 'Lab PDF' | 'External Summary'; snippet: string; date: string }[];
    }) => {
      const intakeId = `intake-${Date.now()}`;
      setState((prev) => {
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`;
        const newIntake = {
          id: intakeId,
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          submittedAt: ts,
          status: 'Submitted' as const,
          reasonForVisit: input.reasonForVisit,
          symptomsSummary: input.symptomsSummary,
          reportedMedications: input.reportedMedications,
          reportedAllergies: input.reportedAllergies,
          insurancePayer: input.insurancePayer,
          insuranceMemberId: input.insuranceMemberId,
          insuranceStatus: 'Pending Manual Verification' as const,
          uploadedDocuments: input.uploadedDocuments,
          extractedItems: [],
        };
        const newDocs = input.uploadedDocuments.map((u) => ({
          id: `doc-up-${Date.now()}-${u.id}`,
          patientId: input.patientId,
          title: u.title,
          category: (u.type === 'Lab PDF' ? 'Lab PDF' : 'External Record') as 'Lab PDF' | 'External Record',
          author: 'Patient Pre-Visit Upload (Simulated)',
          source: 'Pre-Visit Intake Link',
          date: u.date || TODAY_DATE,
          version: 1,
          verified: false,
          external: true,
          summary: u.snippet,
        }));
        return {
          ...prev,
          preVisitIntakes: [newIntake, ...(prev.preVisitIntakes || [])],
          documents: [...newDocs, ...prev.documents],
          patients: prev.patients.map((p) =>
            p.id === input.patientId ? { ...p, intakeFormsComplete: true, chiefConcern: input.reasonForVisit } : p
          ),
          appointments: prev.appointments.map((a) =>
            a.id === input.appointmentId ? { ...a, status: 'Pre-Registered' as const } : a
          ),
          auditEvents: appendAudit(
            prev,
            'Pre-Visit Intake Submitted',
            'Patient',
            input.patientId,
            `Submitted pre-visit intake with ${input.uploadedDocuments.length} uploaded document(s)`
          ),
        };
      });
      notify('success', 'Pre-visit intake submitted into patient chart (ready for AI extraction & staff review)');
    },
    [appendAudit, notify]
  );

  const runAiIntakeExtraction = useCallback(
    (intakeId: string) => {
      setState((prev) => {
        const intake = (prev.preVisitIntakes || []).find((i) => i.id === intakeId);
        if (!intake) return prev;
        const extracted = [
          ...intake.uploadedDocuments.map((doc, idx) => ({
            id: `ext-${intakeId}-doc-${idx}`,
            field: doc.type === 'Lab PDF' ? 'Outside Laboratory Findings' : 'External Clinical Summary',
            value: doc.snippet,
            sourceDocument: doc.title,
            sourceSnippet: doc.snippet,
            confidence: 'High' as const,
            verified: false,
            targetCategory: (doc.type === 'Lab PDF' ? 'Lab' : 'History') as 'Lab' | 'History',
          })),
          {
            id: `ext-${intakeId}-meds`,
            field: 'Patient-Reported Medications',
            value: intake.reportedMedications.join('; ') || 'None reported',
            sourceDocument: 'Pre-Visit Intake Questionnaire',
            sourceSnippet: intake.reportedMedications.join('; ') || 'No medications entered',
            confidence: 'High' as const,
            verified: false,
            targetCategory: 'Medication' as const,
          },
          {
            id: `ext-${intakeId}-symp`,
            field: 'Reported Symptoms & Concerns',
            value: intake.symptomsSummary || intake.reasonForVisit,
            sourceDocument: 'Pre-Visit Intake Questionnaire',
            sourceSnippet: intake.symptomsSummary || intake.reasonForVisit,
            confidence: 'Medium' as const,
            uncertaintyNote: 'Self-reported symptom summary; requires clinician physical confirmation.',
            verified: false,
            targetCategory: 'Condition' as const,
          },
        ];
        return {
          ...prev,
          preVisitIntakes: (prev.preVisitIntakes || []).map((i) =>
            i.id === intakeId ? { ...i, status: 'AI Extracted' as const, extractedItems: extracted } : i
          ),
          auditEvents: appendAudit(
            prev,
            'AI Intake Extraction',
            'Patient',
            intake.patientId,
            `Extracted ${extracted.length} draft clinical fields with source snippets (verification required)`
          ),
        };
      });
      notify('info', 'AI extracted source-linked intake fields (staff verification required)');
    },
    [appendAudit, notify]
  );

  const verifyIntakeExtractedItem = useCallback(
    (intakeId: string, itemId: string) => {
      setState((prev) => {
        const verifier = prev.staff.find((s) => s.id === prev.currentUserId)?.name || prev.currentRole;
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`;
        const nextIntakes = (prev.preVisitIntakes || []).map((intake) => {
          if (intake.id !== intakeId) return intake;
          const nextItems = intake.extractedItems.map((it) =>
            it.id === itemId ? { ...it, verified: true, verifiedBy: verifier, verifiedAt: ts } : it
          );
          const allVerified = nextItems.length > 0 && nextItems.every((x) => x.verified);
          return {
            ...intake,
            status: allVerified ? ('Verified' as const) : intake.status,
            extractedItems: nextItems,
          };
        });
        const targetIntake = nextIntakes.find((i) => i.id === intakeId);
        return {
          ...prev,
          preVisitIntakes: nextIntakes,
          auditEvents: appendAudit(
            prev,
            'Verify Intake Extraction',
            'Patient',
            targetIntake?.patientId || intakeId,
            `${verifier} verified extracted intake item ${itemId}`
          ),
        };
      });
      notify('success', 'Extracted field verified by staff');
    },
    [appendAudit, notify]
  );

  const recordClinicalHandoff = useCallback(
    (handoff: Omit<AppState['handoffs'][number], 'id' | 'timestamp'>) => {
      const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`;
      const created = {
        ...handoff,
        id: `ho-${Date.now()}`,
        timestamp: ts,
      };
      setState((prev) => ({
        ...prev,
        handoffs: [created, ...(prev.handoffs || [])],
        auditEvents: appendAudit(
          prev,
          'Clinical Handoff',
          'Patient',
          handoff.patientId,
          `${handoff.fromRole} -> ${handoff.toRole} (${handoff.toOwnerName}): ${handoff.reason}`
        ),
      }));
      notify('success', `Handoff recorded to ${handoff.toRole} (${handoff.toOwnerName})`);
    },
    [appendAudit, notify]
  );

  const reconcileExternalDocument = useCallback(
    (extDocId: string, targetPatientId: string, decision: 'file' | 'reject') => {
      setState((prev) => {
        const doc = (prev.externalDocQueue || []).find((d) => d.id === extDocId);
        if (!doc) return prev;
        const verifier = prev.staff.find((s) => s.id === prev.currentUserId)?.name || prev.currentRole;
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`;
        const nextQueue = (prev.externalDocQueue || []).map((d) =>
          d.id === extDocId
            ? {
                ...d,
                status: decision === 'file' ? ('Verified & Filed' as const) : ('Rejected' as const),
                filedPatientId: decision === 'file' ? targetPatientId : undefined,
                verifiedBy: verifier,
                verifiedAt: ts,
              }
            : d
        );
        const nextDocs =
          decision === 'file'
            ? [
                {
                  id: `doc-ext-${Date.now()}`,
                  patientId: targetPatientId,
                  title: doc.title,
                  category: doc.documentType,
                  author: `Verified by ${verifier}`,
                  source: doc.sourceOrganization,
                  date: TODAY_DATE,
                  version: 1,
                  verified: true,
                  external: true,
                  summary: doc.extractedSummary,
                },
                ...prev.documents,
              ]
            : prev.documents;
        return {
          ...prev,
          externalDocQueue: nextQueue,
          documents: nextDocs,
          auditEvents: appendAudit(
            prev,
            decision === 'file' ? 'Verify & File External Document' : 'Reject External Document',
            'Patient',
            targetPatientId,
            `${verifier} ${decision === 'file' ? 'verified identity and filed' : 'rejected'} "${doc.title}"`
          ),
        };
      });
      notify(
        decision === 'file' ? 'success' : 'info',
        decision === 'file'
          ? 'External document verified by clinician and filed with source provenance'
          : 'Uncertain external document rejected and kept out of chart'
      );
    },
    [appendAudit, notify]
  );

  const runSimulatedAmbientScribe = useCallback(
    (patientId: string, encounterId: string, transcript: string) => {
      setState((prev) => {
        const pat = prev.patients.find((p) => p.id === patientId);
        if (!pat) return prev;
        const enc = prev.encounters.find((e) => e.id === encounterId);
        const latestVital = prev.vitals.find((v) => v.patientId === patientId);
        const lines = transcript
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        const patientLines = lines.filter((l) => l.toLowerCase().includes('patient'));
        const subjective =
          patientLines.length > 0
            ? `[Simulated Scribe Draft — Review Required]\n${patientLines.join(' ')}`
            : `[Simulated Scribe Draft — Review Required]\n${transcript.slice(0, 260)}`;
        const objective = latestVital
          ? `Vitals: BP ${latestVital.bpSystolic}/${latestVital.bpDiastolic} mmHg, HR ${latestVital.heartRate} bpm, SpO2 ${latestVital.spo2}%, Wt ${latestVital.weightKg} kg.`
          : 'Objective exam pending clinician confirmation.';
        const assessment = `Active conditions: ${pat.conditions.map((c) => `${c.name} (${c.icd10})`).join('; ')}. [Draft — clinician verification required]`;
        const plan =
          '1. Review proposed lab order and antihypertensive adjustment.\n2. Confirm allergy safety check before activating any medication draft.\n3. Schedule follow-up visit and review after-visit instructions.';
        const soap = { subjective, objective, assessment, plan };

        const proposals: AiProposedAction[] = [
          {
            id: `comp-lab-${Date.now()}`,
            kind: 'Lab Order',
            title: 'Order Renal Function & Serum Potassium Panel (LOINC 80048)',
            summary: 'Routine metabolic & potassium panel aligned with documented consultation.',
            status: 'Awaiting Approval',
            payload: { name: 'Renal Function & Serum Potassium Panel', code: '80048', priority: 'Routine' },
            whyExplanation: 'Extracted from simulated consultation transcript and CKD/hypertension history.',
            supportingRecord: enc ? `Encounter ${enc.id}` : 'Simulated Scribe Transcript',
            source: 'Simulated Ambient AI Scribe',
            sourceVerified: true,
            confidence: 'High',
            humanDecisionRequired: 'Authorized Clinician must approve before requisition becomes Ordered.',
          },
          {
            id: `comp-med-${Date.now() + 1}`,
            kind: 'Medication Draft',
            title: 'Draft Prescription: Amlodipine Besylate 5 mg PO Daily',
            summary: 'Low-dose CCB draft for elevated BP (simulated — no external eRx transmission).',
            status: 'Awaiting Approval',
            payload: { name: 'Amlodipine Besylate', dose: '5 mg', frequency: 'Once daily', duration: '30 days', pharmacy: 'CVS Boylston #0412' },
            whyExplanation: 'Elevated BP noted in transcript/vitals; no documented CCB allergy.',
            supportingRecord: `Vitals + Allergy List (${pat.allergies.map((a) => a.substance).join(', ') || 'NKDA'})`,
            source: 'Simulated Ambient AI Scribe',
            sourceVerified: true,
            confidence: 'Medium',
            uncertaintyNote: 'Confirm peripheral edema exam before activating.',
            humanDecisionRequired: 'Authorized Clinician approval required before Draft -> Active.',
          },
          {
            id: `comp-fp-${Date.now() + 2}`,
            kind: 'Follow-Up Plan',
            title: 'Follow-Up Plan: 2-Week Lab & Blood Pressure Recheck',
            summary: 'Create structured follow-up plan and route Care Coordinator scheduling task.',
            status: 'Awaiting Approval',
            payload: {
              interval: '2 weeks',
              instructions: 'Complete renal/potassium blood work within 5 days and bring home BP log to 2-week follow-up.',
            },
            whyExplanation: 'Matches clinician verbal plan in simulated transcript.',
            supportingRecord: 'Simulated Scribe Transcript',
            source: 'Simulated Ambient AI Scribe',
            sourceVerified: true,
            confidence: 'High',
            humanDecisionRequired: 'Clinician approves plan; Care Coordinator books slot.',
          },
          {
            id: `comp-task-${Date.now() + 3}`,
            kind: 'Task',
            title: 'Care Coordinator Handoff: Track Lab & Schedule 2-Week Follow-Up',
            summary: 'Routes post-visit follow-through to Jordan Lee, RN (Care Coordinator).',
            status: 'Awaiting Approval',
            payload: { ownerId: 'staff-2', dueDate: '2026-11-23', priority: 'High' },
            whyExplanation: 'Prevents dropped lab follow-through after checkout.',
            supportingRecord: 'Smart Role Handoff Policy',
            source: 'AI Action Composer (Simulated)',
            sourceVerified: true,
            confidence: 'High',
            humanDecisionRequired: 'Clinician approves to enqueue Care Coordinator task.',
          },
        ];

        const session = {
          id: `scribe-${Date.now()}`,
          patientId,
          encounterId,
          status: 'Draft Ready' as const,
          transcript,
          generatedSoap: soap,
          proposedActions: proposals,
          updatedAt: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`,
        };

        return {
          ...prev,
          scribeSessions: [session, ...(prev.scribeSessions || []).filter((s) => s.encounterId !== encounterId)],
          encounters: prev.encounters.map((e) =>
            e.id === encounterId ? { ...e, scribeTranscript: transcript, soap, noteStatus: 'Draft' as const } : e
          ),
          auditEvents: appendAudit(
            prev,
            'Simulated Ambient Scribe',
            'Encounter',
            encounterId,
            `Generated SOAP draft & ${proposals.length} explainable proposals (simulated transcript; review required)`
          ),
        };
      });
      notify('info', 'Simulated SOAP draft & proposals ready for individual clinician review');
    },
    [appendAudit, notify]
  );

  const decideComposerAction = useCallback(
    (scribeSessionId: string, actionId: string, decision: 'approve' | 'cancel'): { ok: boolean; error?: string } => {
      if (decision === 'approve' && !canOrderOrPrescribe(state.currentRole)) {
        const error = `Role "${state.currentRole}" is not authorized to approve clinical consultation actions.`;
        notify('error', error);
        return { ok: false, error };
      }
      const session = (state.scribeSessions || []).find((s) => s.id === scribeSessionId);
      const action = session?.proposedActions.find((a) => a.id === actionId);
      if (!session || !action) return { ok: false, error: 'Proposed action not found.' };

      // Idempotency guard: never execute duplicate chart writes when an already-completed action is retried
      if (decision === 'approve' && action.status === 'Completed') {
        notify('info', `Already approved (idempotent replay prevented duplicate write): ${action.title}`);
        return { ok: true };
      }

      if (decision === 'cancel') {
        setState((prev) => ({
          ...prev,
          scribeSessions: (prev.scribeSessions || []).map((s) =>
            s.id === scribeSessionId
              ? {
                  ...s,
                  proposedActions: s.proposedActions.map((a) =>
                    a.id === actionId ? { ...a, status: 'Cancelled' as const } : a
                  ),
                }
              : s
          ),
          auditEvents: appendAudit(prev, 'Cancel Proposed Action', 'AiAction', actionId, `Cancelled: ${action.title}`),
        }));
        notify('info', `Cancelled proposal: ${action.title}`);
        return { ok: true };
      }

      setState((prev) => {
        // Secondary state-level idempotency check in case of rapid double-clicks
        const liveSession = (prev.scribeSessions || []).find((s) => s.id === scribeSessionId);
        const liveAction = liveSession?.proposedActions.find((a) => a.id === actionId);
        if (!liveSession || !liveAction || liveAction.status === 'Completed') {
          return prev;
        }

        const pat = prev.patients.find((p) => p.id === session.patientId);
        let nextOrders = prev.orders;
        let nextMeds = prev.medications;
        let nextPlans = prev.followUpPlans || [];
        let nextTasks = prev.tasks;
        let nextMessages = prev.messages;
        let nextReferrals = prev.referrals;
        let resultRef = 'Approved';
        const dedupeTag = action.idempotencyKey ? `[idemp:${action.idempotencyKey}]` : `[act:${action.id}]`;

        if (action.kind === 'Lab Order') {
          const existing = nextOrders.find(
            (o) =>
              o.patientId === session.patientId &&
              o.encounterId === session.encounterId &&
              ((o.notes || '').includes(dedupeTag) ||
                o.name.toLowerCase() === (action.payload.name || action.title).toLowerCase())
          );
          if (existing) {
            resultRef = `Ordered (${existing.requisitionId}) — deduplicated`;
          } else {
            const reqId = `REQ-${Math.floor(88600 + Math.random() * 350)}`;
            nextOrders = [
              {
                id: `ord-${Date.now()}`,
                requisitionId: reqId,
                patientId: session.patientId,
                encounterId: session.encounterId,
                orderedById: prev.currentUserId,
                facilityId: pat?.facilityId || prev.currentFacilityId,
                category: 'Lab',
                name: action.payload.name || 'Renal Function & Serum Potassium Panel',
                code: action.payload.code || '80048',
                priority: (action.payload.priority as ClinicalOrder['priority']) || 'Routine',
                status: 'Ordered',
                createdAt: TODAY_DATE,
                notes: `Clinician approved via Action Composer ${dedupeTag}`,
              },
              ...nextOrders,
            ];
            resultRef = `Ordered (${reqId})`;
          }
        } else if (action.kind === 'Medication Draft') {
          const medName = action.payload.name || 'Amlodipine Besylate';
          const existing = nextMeds.find(
            (m) => m.patientId === session.patientId && (m.safetyNote || '').includes(dedupeTag)
          );
          if (existing) {
            resultRef = `Active (${existing.name}) — deduplicated`;
          } else {
            nextMeds = [
              {
                id: `med-${Date.now()}`,
                patientId: session.patientId,
                name: medName,
                dose: action.payload.dose || '5 mg',
                route: 'Oral',
                frequency: action.payload.frequency || 'Once daily',
                duration: action.payload.duration || '30 days',
                status: 'Active',
                prescriberId: prev.currentUserId,
                pharmacy: action.payload.pharmacy || 'CVS Boylston #0412',
                formularyStatus: 'Tier 1 Preferred',
                controlled: false,
                reconciled: true,
                startDate: TODAY_DATE,
                refillsRemaining: 2,
                safetyNote: `Clinician approved synthetic medication (not transmitted externally). ${dedupeTag}`,
              },
              ...nextMeds,
            ];
            resultRef = 'Active (Simulated — not transmitted)';
          }
        } else if (action.kind === 'Follow-Up Plan') {
          const existing = nextPlans.find(
            (fp) => fp.patientId === session.patientId && fp.encounterId === session.encounterId && fp.interval === (action.payload.interval || '2 weeks')
          );
          if (existing) {
            resultRef = `Follow-Up Plan (${existing.interval}) — deduplicated`;
          } else {
            nextPlans = [
              {
                id: `fp-${Date.now()}`,
                patientId: session.patientId,
                encounterId: session.encounterId,
                providerId: prev.currentUserId,
                facilityId: pat?.facilityId || prev.currentFacilityId,
                interval: action.payload.interval || '2 weeks',
                instructions: action.payload.instructions || 'Follow up with labs and home BP log.',
                createdAt: TODAY_DATE,
                reminderChannel: 'Simulated SMS',
                reminderStatus: 'Not Scheduled',
              },
              ...nextPlans,
            ];
            resultRef = `Follow-Up Plan (${action.payload.interval || '2 weeks'})`;
          }
        } else if (action.kind === 'Task') {
          const existing = nextTasks.find(
            (t) => t.patientId === session.patientId && (t.description || '').includes(dedupeTag)
          );
          if (existing) {
            resultRef = 'Handoff task already queued — deduplicated';
          } else {
            nextTasks = [
              {
                id: `tsk-${Date.now()}`,
                title: action.title,
                description: `${action.summary} ${dedupeTag}`,
                status: 'To Do',
                priority: (action.payload.priority as TaskItem['priority']) || 'High',
                ownerId: action.payload.ownerId || 'staff-2',
                team: 'Care Coordination',
                facilityId: pat?.facilityId || prev.currentFacilityId,
                patientId: session.patientId,
                dueDate: action.payload.dueDate || '2026-11-23',
                patientVisible: false,
                timeLoggedMin: 0,
                subtasks: [],
                comments: [],
                history: [{ id: `th-${Date.now()}`, timestamp: `${TODAY_DATE} 11:30`, event: 'Approved via Post-Consultation Composer' }],
              },
              ...nextTasks,
            ];
            resultRef = 'Handoff task queued';
          }
        } else if (action.kind === 'Patient Message') {
          nextMessages = [
            {
              id: `msg-${Date.now()}`,
              patientId: session.patientId,
              subject: action.payload.subject || 'After-Visit Summary',
              channel: 'In-App',
              ownerId: prev.currentUserId,
              priority: 'Normal',
              status: 'Open',
              tags: ['After-Visit Summary', 'Clinician Approved'],
              participants: [pat?.fullName || 'Patient', 'Clinician'],
              messages: [
                {
                  id: `m-${Date.now()}`,
                  sender: prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Clinician',
                  isPatient: false,
                  isInternalNote: false,
                  channel: 'In-App',
                  timestamp: `${TODAY_DATE} 11:30`,
                  body: action.payload.body || action.payload.instructions || 'After-visit instructions reviewed.',
                  deliveryStatus: 'Simulated',
                },
              ],
            },
            ...nextMessages,
          ];
          resultRef = 'AVS message created';
        } else if (action.kind === 'Referral') {
          const specialty = action.payload.specialty || 'Specialty Consultation';
          const existing = nextReferrals.find(
            (r) => r.patientId === session.patientId && r.reason.includes(dedupeTag)
          );
          if (existing) {
            resultRef = `Referral (${existing.specialty}) — deduplicated`;
          } else {
            const actorName = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Clinician';
            nextReferrals = [
              {
                id: `ref-${Date.now()}`,
                patientId: session.patientId,
                facilityId: pat?.facilityId || prev.currentFacilityId,
                direction: 'Outgoing',
                specialty,
                referringProvider: actorName,
                targetProvider: `${specialty} Consult Service`,
                urgency: action.payload.priority === 'Urgent' ? 'Urgent' : 'Routine',
                reason: `${action.summary} ${dedupeTag}`,
                status: 'Received',
                createdAt: TODAY_DATE,
              },
              ...nextReferrals,
            ];
            resultRef = `Outgoing Referral queued (${specialty})`;
          }
        }

        return {
          ...prev,
          orders: nextOrders,
          medications: nextMeds,
          followUpPlans: nextPlans,
          tasks: nextTasks,
          messages: nextMessages,
          referrals: nextReferrals,
          scribeSessions: (prev.scribeSessions || []).map((s) =>
            s.id === scribeSessionId
              ? {
                  ...s,
                  proposedActions: s.proposedActions.map((a) =>
                    a.id === actionId ? { ...a, status: 'Completed' as const, resultRef } : a
                  ),
                }
              : s
          ),
          auditEvents: appendAudit(
            prev,
            'Approve Consultation Action',
            'AiAction',
            actionId,
            `Clinician approved ${action.kind}: ${action.title} -> ${resultRef}`
          ),
        };
      });
      notify('success', `Approved: ${action.title}`);
      return { ok: true };
    },
    [appendAudit, notify, state.currentRole, state.scribeSessions]
  );

  const addDataInboxItem = useCallback(
    (item: PatientDataInboxItem) => {
      setState((prev) => ({
        ...prev,
        dataInboxItems: [item, ...(prev.dataInboxItems || []).filter((x) => x.id !== item.id)],
        auditEvents: appendAudit(
          prev,
          'Ingest Patient Data Inbox Document',
          'Document',
          item.id,
          `Added "${item.title}" (${item.category}) from ${item.sourceOrganization}`
        ),
      }));
      notify('success', `Document added to Patient Data Inbox: ${item.title}`);
    },
    [appendAudit, notify]
  );

  const confirmInboxItemPatient = useCallback(
    (itemId: string, patientId: string) => {
      setState((prev) => {
        const pat = prev.patients.find((p) => p.id === patientId);
        return {
          ...prev,
          dataInboxItems: (prev.dataInboxItems || []).map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  confirmedPatientId: patientId,
                  candidatePatientIds: Array.from(new Set([patientId, ...item.candidatePatientIds])),
                }
              : item
          ),
          auditEvents: appendAudit(
            prev,
            'Confirm Inbox Document Patient',
            'Document',
            itemId,
            `Staff confirmed patient match: ${pat?.fullName || patientId} (${pat?.mrn || ''})`
          ),
        };
      });
      notify('info', 'Patient match confirmed for incoming document');
    },
    [appendAudit, notify]
  );

  const runDataInboxExtraction = useCallback(
    (itemId: string) => {
      setState((prev) => ({
        ...prev,
        dataInboxItems: (prev.dataInboxItems || []).map((item) =>
          item.id === itemId ? { ...item, status: 'AI Extracted' as const } : item
        ),
        auditEvents: appendAudit(
          prev,
          'Run AI Document Extraction (Synthetic)',
          'Document',
          itemId,
          'Extracted candidate clinical fields with source snippets and uncertainty flags (human verification required)'
        ),
      }));
      notify('info', 'AI-assisted extraction complete — review highlighted fields before saving');
    },
    [appendAudit, notify]
  );

  const decideInboxExtractedField = useCallback(
    (
      itemId: string,
      fieldId: string,
      decision: 'Accepted' | 'Corrected' | 'Rejected',
      correctedValue?: string
    ) => {
      setState((prev) => {
        const actor = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Authorized Staff';
        const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'IST'}`;
        return {
          ...prev,
          dataInboxItems: (prev.dataInboxItems || []).map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  extractedFields: item.extractedFields.map((f) =>
                    f.id === fieldId
                      ? {
                          ...f,
                          decision,
                          correctedValue: decision === 'Corrected' ? correctedValue ?? f.value : f.correctedValue,
                          reviewedBy: actor,
                          reviewedAt: ts,
                        }
                      : f
                  ),
                }
              : item
          ),
        };
      });
    },
    []
  );

  const commitVerifiedInboxItem = useCallback(
    (itemId: string): { ok: boolean; error?: string; consolidatedCount?: number } => {
      const targetItem = (state.dataInboxItems || []).find((x) => x.id === itemId);
      if (!targetItem) return { ok: false, error: 'Document not found in Data Inbox.' };
      if (!targetItem.confirmedPatientId) {
        notify('error', 'Confirm the matching patient before saving verified records.');
        return { ok: false, error: 'Confirm the matching patient first.' };
      }

      const approvedFields = targetItem.extractedFields.filter(
        (f) => f.decision === 'Accepted' || f.decision === 'Corrected'
      );
      if (approvedFields.length === 0) {
        notify('warning', 'Accept or correct at least one extracted field before consolidating.');
        return { ok: false, error: 'No accepted or corrected fields to save.' };
      }

      const patientId = targetItem.confirmedPatientId;
      const docId = `doc-inbox-${targetItem.id}`;

      setState((prev) => {
        const actor = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Authorized Staff';
        const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'IST'}`;
        const patient = prev.patients.find((p) => p.id === patientId);
        if (!patient) return prev;

        const docCategory: AppState['documents'][number]['category'] =
          targetItem.category === 'Laboratory Report'
            ? 'Lab PDF'
            : targetItem.category === 'Imaging Report'
            ? 'Imaging'
            : 'External Record';

        const newDoc = {
          id: docId,
          patientId,
          title: targetItem.title,
          category: docCategory,
          author: targetItem.sourceOrganization,
          source: `${targetItem.sourceOrganization} (${targetItem.sourceAdapter})`,
          date: targetItem.documentDate,
          version: 1,
          verified: true,
          external: true,
          summary: `Verified & consolidated ${approvedFields.length} field(s) by ${actor} on ${ts}.`,
          rawPreviewText: targetItem.rawPreviewText,
          inboxItemId: targetItem.id,
        };

        const addedLabs = [...prev.labResults];
        const addedImaging = [...prev.imagingReports];
        const addedMeds = [...prev.medications];
        let nextConditions = [...patient.conditions];
        let nextHistory = [...patient.historyItems];

        for (const f of approvedFields) {
          const finalValue = (f.decision === 'Corrected' && f.correctedValue ? f.correctedValue : f.value).trim();
          const meta = f.metadata || {};

          if (f.targetSection === 'Lab') {
            const labId = `lab-inbox-${f.id}`;
            if (!addedLabs.some((l) => l.id === labId)) {
              const parsedNum = Number(meta.numericValue || finalValue.match(/[\d.]+/)?.[0]);
              addedLabs.unshift({
                id: labId,
                orderId: `ord-ext-${targetItem.id}`,
                patientId,
                facilityId: patient.facilityId,
                testName: meta.testName || f.label,
                collectionDate: targetItem.documentDate,
                value: meta.value || finalValue,
                numericValue: Number.isFinite(parsedNum) ? parsedNum : undefined,
                unit: meta.unit || '',
                referenceInterval: meta.referenceInterval || 'See external lab report',
                flag:
                  meta.flag === 'Critical' || meta.flag === 'Abnormal' || meta.flag === 'Normal'
                    ? meta.flag
                    : 'Normal',
                status: 'Final',
                reviewOwnerId: patient.primaryProviderId,
                patientReleased: false,
                sourceDocumentId: docId,
                sourceLabel: targetItem.title,
              });
            }
          } else if (f.targetSection === 'Imaging') {
            const imgId = `img-inbox-${f.id}`;
            if (!addedImaging.some((i) => i.id === imgId)) {
              const mod = (meta.modality as AppState['imagingReports'][number]['modality']) || 'Ultrasound';
              addedImaging.unshift({
                id: imgId,
                orderId: `ord-img-${targetItem.id}`,
                patientId,
                facilityId: patient.facilityId,
                studyName: meta.studyName || f.label,
                modality: mod,
                performedAt: targetItem.documentDate,
                status: 'Final',
                findings: meta.findings || finalValue,
                impression: meta.impression || finalValue,
                priorComparison: 'Consolidated from external report',
                radiologist: meta.radiologist || targetItem.sourceOrganization,
                patientReleased: false,
                sourceDocumentId: docId,
                sourceLabel: targetItem.title,
              });
            }
          } else if (f.targetSection === 'Condition') {
            const condId = `cnd-inbox-${f.id}`;
            if (!nextConditions.some((c) => c.id === condId)) {
              nextConditions = [
                {
                  id: condId,
                  name: meta.conditionName || finalValue,
                  icd10: meta.icd10 || 'Z00.00',
                  status: 'Active',
                  onsetDate: meta.onsetDate || targetItem.documentDate,
                  source: 'External HIE',
                  verified: true,
                  lastReviewed: TODAY_DATE,
                },
                ...nextConditions,
              ];
            }
          } else if (f.targetSection === 'Medication') {
            const medId = `med-inbox-${f.id}`;
            if (!addedMeds.some((m) => m.id === medId)) {
              addedMeds.unshift({
                id: medId,
                patientId,
                name: meta.medName || finalValue,
                dose: meta.dose || 'Verify dose',
                route: 'Oral',
                frequency: meta.frequency || 'Per external summary',
                status: 'Active',
                prescriberId: patient.primaryProviderId,
                pharmacy: meta.pharmacy || targetItem.sourceOrganization,
                formularyStatus: 'Tier 1 Preferred',
                controlled: false,
                reconciled: false,
                startDate: targetItem.documentDate,
                refillsRemaining: 0,
                safetyNote: `Imported from ${targetItem.title} — verified at intake, pending clinician medication reconciliation`,
              });
            }
          } else if (f.targetSection === 'History') {
            const histId = `hist-inbox-${f.id}`;
            if (!nextHistory.some((h) => h.id === histId)) {
              nextHistory = [
                {
                  id: histId,
                  category: (meta.historyCategory as Patient['historyItems'][number]['category']) || 'Medical',
                  title: meta.title || f.label,
                  detail: finalValue,
                  date: targetItem.documentDate,
                  source: targetItem.title,
                  lastReviewed: TODAY_DATE,
                  verified: true,
                },
                ...nextHistory,
              ];
            }
          }
        }

        const nextPatients = prev.patients.map((p) =>
          p.id === patientId
            ? {
                ...p,
                conditions: nextConditions,
                historyItems: nextHistory,
              }
            : p
        );

        const nextDocuments = [newDoc, ...prev.documents.filter((d) => d.id !== docId)];

        return {
          ...prev,
          patients: nextPatients,
          labResults: addedLabs,
          imagingReports: addedImaging,
          medications: addedMeds,
          documents: nextDocuments,
          dataInboxItems: (prev.dataInboxItems || []).map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'Verified & Consolidated' as const,
                  verifiedBy: actor,
                  verifiedAt: ts,
                }
              : item
          ),
          auditEvents: appendAudit(
            prev,
            'Verify & Consolidate Inbox Document',
            'Patient',
            patientId,
            `Consolidated ${approvedFields.length} verified field(s) from "${targetItem.title}" into ${patient.fullName} (${patient.mrn})`
          ),
        };
      });

      notify('success', `Consolidated ${approvedFields.length} verified field(s) into patient profile & timeline`);
      return { ok: true, consolidatedCount: approvedFields.length };
    },
    [appendAudit, notify, state.dataInboxItems]
  );

  const decideClinicalRecommendation = useCallback(
    (
      recommendationId: string,
      patientId: string,
      status: ClinicalRecommendationDecision['status'],
      note?: string
    ) => {
      setState((prev) => {
        const actor = prev.staff.find((s) => s.id === prev.currentUserId)?.name || 'Authorized Staff';
        const fac = prev.facilities.find((f) => f.id === prev.currentFacilityId);
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} ${fac?.tzAbbr || 'IST'}`;
        return {
          ...prev,
          recommendationDecisions: {
            ...(prev.recommendationDecisions || {}),
            [recommendationId]: {
              recommendationId,
              patientId,
              status,
              decidedBy: actor,
              decidedRole: prev.currentRole,
              decidedAt: ts,
              note,
            },
          },
          auditEvents: appendAudit(
            prev,
            `Clinical Intelligence Recommendation ${status}`,
            'Patient',
            patientId,
            `${actor} (${prev.currentRole}) marked recommendation ${recommendationId} as ${status}${note ? `: ${note}` : ''}`
          ),
        };
      });
      notify('success', `Recommendation marked as ${status}`);
    },
    [appendAudit, notify]
  );

  const applyAiDocumentAnalysis = useCallback(
    (
      itemId: string,
      analysis: {
        documentType: PatientDataInboxItem['category'];
        documentDate?: string;
        laboratoryOrFacilityIdentity?: string;
        extractedPatientIdentity: PatientDataInboxItem['extractedIdentity'];
        summary: string;
        labMeasurements: NonNullable<PatientDataInboxItem['aiLabMeasurements']>;
        extractedFields: PatientDataInboxItem['extractedFields'];
        missingOrAmbiguousFlags: string[];
        identitySafetyNote?: string;
        executionMode: 'live-ai' | 'deterministic-demo';
        modelId: string;
        requestId: string;
      }
    ) => {
      setState((prev) => ({
        ...prev,
        dataInboxItems: (prev.dataInboxItems || []).map((item) =>
          item.id === itemId
            ? {
                ...item,
                category: analysis.documentType || item.category,
                documentDate: analysis.documentDate || item.documentDate,
                sourceOrganization: analysis.laboratoryOrFacilityIdentity || item.sourceOrganization,
                extractedIdentity: {
                  ...item.extractedIdentity,
                  ...analysis.extractedPatientIdentity,
                },
                status: 'AI Extracted' as const,
                extractedFields:
                  analysis.extractedFields.length > 0 ? analysis.extractedFields : item.extractedFields,
                aiExecutionMode: analysis.executionMode,
                aiModelId: analysis.modelId,
                aiRequestId: analysis.requestId,
                aiSummary: analysis.summary,
                aiLabMeasurements: analysis.labMeasurements,
                aiMissingFlags: analysis.missingOrAmbiguousFlags,
                aiIdentitySafetyNote: analysis.identitySafetyNote,
              }
            : item
        ),
        auditEvents: appendAudit(
          prev,
          `AI Document Intelligence (${analysis.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'})`,
          'Document',
          itemId,
          `Model ${analysis.modelId} (${analysis.requestId}) extracted ${analysis.extractedFields.length} reviewable field(s) & ${analysis.labMeasurements.length} lab line(s); human review required`
        ),
      }));
      notify(
        'info',
        `${analysis.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'} extracted ${analysis.extractedFields.length} candidate field(s) — human review required`
      );
    },
    [appendAudit, notify]
  );

  const stageAiComposerProposals = useCallback(
    (params: {
      patientId: string;
      encounterId: string;
      transcript?: string;
      soap?: Encounter['soap'];
      proposals?: AiProposedAction[];
      executionMode: 'live-ai' | 'deterministic-demo';
      modelId: string;
      requestId: string;
    }) => {
      setState((prev) => {
        const existingSession = (prev.scribeSessions || []).find(
          (s) => s.encounterId === params.encounterId && s.patientId === params.patientId
        );
        const ts = `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)} EST`;
        const nextSession = {
          id: existingSession?.id || `scribe-ai-${Date.now()}`,
          patientId: params.patientId,
          encounterId: params.encounterId,
          status: 'Draft Ready' as const,
          transcript: params.transcript ?? existingSession?.transcript ?? '',
          generatedSoap: params.soap ?? existingSession?.generatedSoap,
          proposedActions: params.proposals ?? existingSession?.proposedActions ?? [],
          updatedAt: ts,
        };
        return {
          ...prev,
          scribeSessions: [
            nextSession,
            ...(prev.scribeSessions || []).filter((s) => s.id !== nextSession.id),
          ],
          encounters: params.soap
            ? prev.encounters.map((e) =>
                e.id === params.encounterId
                  ? {
                      ...e,
                      scribeTranscript: params.transcript ?? e.scribeTranscript,
                      soap: params.soap!,
                      // Strictly NEVER auto-sign an AI draft
                      noteStatus: e.noteStatus === 'Signed' ? 'Signed' : ('Draft' as const),
                    }
                  : e
              )
            : prev.encounters,
          auditEvents: appendAudit(
            prev,
            params.proposals
              ? `AI Action Composer (${params.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'})`
              : `Ambient Scribe V2 (${params.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'})`,
            'Encounter',
            params.encounterId,
            `Model ${params.modelId} (${params.requestId})${
              params.proposals ? ` staged ${params.proposals.length} reviewable action(s)` : ' generated editable SOAP draft (unsigned)'
            }`
          ),
        };
      });
    },
    [appendAudit]
  );

  const updateComposerProposal = useCallback(
    (
      scribeSessionId: string,
      actionId: string,
      patch: { title?: string; summary?: string; payload?: Record<string, string> }
    ) => {
      setState((prev) => ({
        ...prev,
        scribeSessions: (prev.scribeSessions || []).map((s) =>
          s.id === scribeSessionId
            ? {
                ...s,
                proposedActions: s.proposedActions.map((a) =>
                  a.id === actionId
                    ? {
                        ...a,
                        ...(patch.title !== undefined ? { title: patch.title } : {}),
                        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
                        ...(patch.payload !== undefined ? { payload: { ...a.payload, ...patch.payload } } : {}),
                      }
                    : a
                ),
              }
            : s
        ),
        auditEvents: appendAudit(
          prev,
          'Edit Proposed Action Draft',
          'AiAction',
          actionId,
          `Clinician edited proposal draft before approval`
        ),
      }));
      notify('info', 'Updated proposed action draft — still awaiting explicit approval');
    },
    [appendAudit, notify]
  );

  const recordClinicalAiAudit = useCallback(
    (action: string, targetType: string, targetId: string, detail: string) => {
      setState((prev) => ({
        ...prev,
        auditEvents: appendAudit(prev, action, targetType, targetId, detail),
      }));
    },
    [appendAudit]
  );

  const replaceEntireState = useCallback((nextState: AppState) => {
    setState({ ...nextState, unsavedDirty: false });
  }, []);

  return (
    <AppStateContext.Provider
      value={{
        state,
        currentFacility,
        toasts,
        dismissToast,
        notify,
        unsavedPrompt,
        confirmUnsaved,
        cancelUnsaved,
        setUnsavedDirty,
        setPortal,
        setNav,
        openPatient,
        closePatientWorkspace,
        setPatientTab,
        setPatientPortalSection,
        setActiveCaregiverProxy,
        setRole,
        setFacility,
        runScenario,
        clearScenario,
        resetDemoData,
        registerPatient,
        updatePatientDemographics,
        mergeDuplicatePatient,
        togglePatientFavourite,
        bookAppointment,
        updateAppointmentStatus,
        rescheduleAppointment,
        saveEncounterDraft,
        createEncounter,
        signEncounter,
        amendEncounter,
        addEncounterComment,
        recordVitals,
        createOrder,
        updateOrderStatus,
        simulateLabResult,
        acknowledgeLabResult,
        correctLabResult,
        addMedication,
        approveMedication,
        requestMedicationRefill,
        reconcileMedication,
        addPatientAllergy,
        addInsurancePolicy,
        createFollowUpPlan,
        logSimulatedReminder,
        exportPatientFhir,
        createTask,
        updateTaskStatus,
        updateTask,
        addTaskComment,
        sendMessageInThread,
        createMessageThread,
        advanceReferralStatus,
        createReferral,
        sendFax,
        retryFax,
        matchInboundFax,
        submitFormAssignment,
        assignFormToPatient,
        createFormTemplate,
        verifyExternalCondition,
        addPatientDocument,
        submitOrUpdateClaim,
        createClaimFromEncounter,
        collectInvoicePayment,
        toggleAutopayAuthorisation,
        runEligibilityCheck,
        updateBedState,
        administerEmarDose,
        toggleEmergencyChecklist,
        updateEmergencyStatus,
        dispenseOrRestockPharmacy,
        logRpmOutreach,
        updateAbdmConsent,
        requestAbdmConsent,
        retryIntegration,
        updateAdminConfig,
        createSupportTicket,
        submitAiPrompt,
        handleAiActionDecision,
        submitPreVisitIntake,
        runAiIntakeExtraction,
        verifyIntakeExtractedItem,
        recordClinicalHandoff,
        reconcileExternalDocument,
        runSimulatedAmbientScribe,
        decideComposerAction,
        addDataInboxItem,
        confirmInboxItemPatient,
        runDataInboxExtraction,
        decideInboxExtractedField,
        commitVerifiedInboxItem,
        decideClinicalRecommendation,
        applyAiDocumentAnalysis,
        stageAiComposerProposals,
        updateComposerProposal,
        recordClinicalAiAudit,
        replaceEntireState,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
};

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
