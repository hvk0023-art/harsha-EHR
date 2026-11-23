import type { Appointment, Patient, StaffNavKey, StaffRole, TaskItem } from '../types/hms';

export const ALL_STAFF_ROLES: StaffRole[] = [
  'Clinician',
  'Nurse Practitioner',
  'Medical Assistant',
  'Nurse / Care Coordinator',
  'Front Desk',
  'Supervisor',
  'Billing User',
  'Administrator',
  'Pharmacist',
  'Laboratory Staff',
  'Hospital Operations',
  'Care Manager',
];

const NAV_PERMISSIONS: Record<StaffNavKey, StaffRole[]> = {
  home: ALL_STAFF_ROLES,
  'demo-scenarios': ALL_STAFF_ROLES,
  patients: ALL_STAFF_ROLES,
  schedule: [
    'Clinician',
    'Nurse Practitioner',
    'Medical Assistant',
    'Nurse / Care Coordinator',
    'Front Desk',
    'Supervisor',
    'Administrator',
    'Hospital Operations',
    'Care Manager',
  ],
  'front-desk': [
    'Front Desk',
    'Medical Assistant',
    'Nurse Practitioner',
    'Nurse / Care Coordinator',
    'Clinician',
    'Supervisor',
    'Administrator',
  ],
  inbox: ALL_STAFF_ROLES,
  tasks: ALL_STAFF_ROLES,
  'care-management': [
    'Clinician',
    'Nurse Practitioner',
    'Nurse / Care Coordinator',
    'Care Manager',
    'Supervisor',
    'Administrator',
  ],
  billing: ['Billing User', 'Front Desk', 'Supervisor', 'Administrator'],
  reports: ['Supervisor', 'Billing User', 'Hospital Operations', 'Administrator'],
  hospital: [
    'Clinician',
    'Nurse Practitioner',
    'Nurse / Care Coordinator',
    'Pharmacist',
    'Laboratory Staff',
    'Hospital Operations',
    'Supervisor',
    'Administrator',
  ],
  administration: ['Administrator'],
};

export function canAccessNav(role: StaffRole, nav: StaffNavKey): boolean {
  const allowed = NAV_PERMISSIONS[nav];
  return Array.isArray(allowed) ? allowed.includes(role) : false;
}

export function getAllowedNavs(role: StaffRole): StaffNavKey[] {
  return (Object.keys(NAV_PERMISSIONS) as StaffNavKey[]).filter((nav) => canAccessNav(role, nav));
}

/**
 * Team-wide operational/work queue visibility is limited to Supervisory, Operations, and Admin scopes.
 * Regular clinicians, nurses, medical assistants, front-desk, and billing staff see their assigned scope.
 */
export function canViewTeamWork(role: StaffRole): boolean {
  return role === 'Supervisor' || role === 'Administrator' || role === 'Hospital Operations';
}

/**
 * Unrestricted facility switching is restricted to Administrator and Supervisor roles.
 * Regular staff operate within their assigned facility context.
 */
export function canSwitchFacility(role: StaffRole): boolean {
  return role === 'Administrator' || role === 'Supervisor';
}

/**
 * HL7 FHIR R4 patient export is strictly Administrator-only in this prototype.
 * Supervisors, Clinicians, NPs, MAs, Nurses, Front Desk, and Patients are explicitly blocked.
 */
export function canExportPatientFhir(role: StaffRole): boolean {
  return role === 'Administrator';
}

export function canManageAdministration(role: StaffRole): boolean {
  return role === 'Administrator';
}

export function canSignClinicalNote(role: StaffRole): boolean {
  return (
    role === 'Clinician' ||
    role === 'Nurse Practitioner' ||
    role === 'Supervisor' ||
    role === 'Administrator'
  );
}

export function canOrderOrPrescribe(role: StaffRole): boolean {
  return (
    role === 'Clinician' ||
    role === 'Nurse Practitioner' ||
    role === 'Supervisor' ||
    role === 'Administrator'
  );
}

export function canRecordIntakeVitals(role: StaffRole): boolean {
  return (
    role === 'Medical Assistant' ||
    role === 'Nurse Practitioner' ||
    role === 'Nurse / Care Coordinator' ||
    role === 'Clinician' ||
    role === 'Supervisor' ||
    role === 'Administrator'
  );
}

export function canAdvanceLabOrder(role: StaffRole): boolean {
  return (
    role === 'Laboratory Staff' ||
    role === 'Clinician' ||
    role === 'Nurse Practitioner' ||
    role === 'Nurse / Care Coordinator' ||
    role === 'Supervisor' ||
    role === 'Administrator'
  );
}

export function canRegisterOrCheckIn(role: StaffRole): boolean {
  return (
    role === 'Front Desk' ||
    role === 'Medical Assistant' ||
    role === 'Nurse Practitioner' ||
    role === 'Nurse / Care Coordinator' ||
    role === 'Clinician' ||
    role === 'Supervisor' ||
    role === 'Administrator'
  );
}

export interface RoleCapabilitySummary {
  role: StaffRole;
  allowedActions: string[];
  restrictedActions: string[];
}

export function getRoleCapabilities(role: StaffRole): RoleCapabilitySummary {
  switch (role) {
    case 'Front Desk':
      return {
        role,
        allowedActions: ['Schedule & check in visits', 'Verify demographics & intake status', 'Hand off to Medical Assistant'],
        restrictedActions: ['Cannot sign clinical notes', 'Cannot approve prescriptions or lab orders', 'Cannot export FHIR R4 bundles'],
      };
    case 'Medical Assistant':
      return {
        role,
        allowedActions: ['Record vitals & room patients', 'Verify allergies & medication list prep', 'Review intake readiness & hand off to NP/Clinician'],
        restrictedActions: ['Cannot sign clinical notes', 'Cannot approve prescriptions or finalize orders', 'Cannot export FHIR R4 bundles'],
      };
    case 'Nurse Practitioner':
      return {
        role,
        allowedActions: ['Clinical prep & pre-visit verification', 'Draft & sign clinical notes within scope', 'Review AI drafts & prepare orders'],
        restrictedActions: ['Cannot access Administration console', 'Cannot export FHIR R4 bundles', 'Facility locked to assignment'],
      };
    case 'Clinician':
      return {
        role,
        allowedActions: ['Pre/Post-Consultation AI summaries', 'Sign clinical notes & approve orders/medications', 'Review & acknowledge lab results'],
        restrictedActions: ['Cannot access Administration console', 'Cannot view unauthorized team-wide queues', 'Cannot export FHIR R4 bundles'],
      };
    case 'Laboratory Staff':
      return {
        role,
        allowedActions: ['Process authorized lab orders', 'Log specimen collection', 'Enter synthetic lab results into patient chart'],
        restrictedActions: ['Cannot sign clinical encounter notes', 'Cannot prescribe medications', 'Cannot export FHIR R4 bundles'],
      };
    case 'Nurse / Care Coordinator':
      return {
        role,
        allowedActions: ['Execute approved post-visit handoff tasks', 'Schedule follow-up visits & log simulated reminders', 'Coordinate care plans & inbox outreach'],
        restrictedActions: ['Cannot sign provider encounter notes', 'Cannot approve prescriptions', 'Cannot export FHIR R4 bundles'],
      };
    case 'Supervisor':
      return {
        role,
        allowedActions: ['Authorized team work queue oversight', 'Multi-facility clinical supervision', 'Sign/co-sign notes & review alerts'],
        restrictedActions: ['Cannot access Administration configuration', 'Cannot export HL7 FHIR R4 patient bundles'],
      };
    case 'Administrator':
      return {
        role,
        allowedActions: ['System configuration & AI governance', 'Audit trail oversight', 'Authorized HL7 FHIR R4 patient export (masked default)'],
        restrictedActions: ['All prototype exports remain simulated synthetic records'],
      };
    default:
      return {
        role,
        allowedActions: ['Assigned facility workspace & role-scoped queues'],
        restrictedActions: ['Cannot export HL7 FHIR R4 patient bundles', 'Cannot modify system administration'],
      };
  }
}

export function getRoleScopeDescription(role: StaffRole): string {
  switch (role) {
    case 'Clinician':
      return 'Assigned patients, personal schedule, clinical summaries, documentation & order approval (assigned facility)';
    case 'Nurse Practitioner':
      return 'Clinical preparation, intake verification, pre-consultation readiness & provider handoff (assigned facility)';
    case 'Medical Assistant':
      return 'Patient rooming, vitals capture, allergy/medication prep & simulated eligibility check (assigned facility)';
    case 'Nurse / Care Coordinator':
      return 'Post-visit handoffs, care coordination tasks, follow-up scheduling & patient outreach (assigned facility)';
    case 'Front Desk':
      return 'Appointment scheduling, walk-in registration, arrival verification & check-in (assigned facility)';
    case 'Supervisor':
      return 'Authorized team work queues, multi-facility oversight & clinical supervision (no Admin/FHIR export)';
    case 'Administrator':
      return 'Full administrative configuration, audit oversight & Administrator-only HL7 FHIR R4 export';
    case 'Billing User':
      return 'Claims, invoices, eligibility & billing reports at assigned facility';
    case 'Pharmacist':
      return 'Medication review, pharmacy inventory & hospital operations at assigned facility';
    case 'Laboratory Staff':
      return 'Lab orders, specimen collection & result lifecycle at assigned facility';
    case 'Hospital Operations':
      return 'Inpatient beds, ED/OR board & operational team metrics';
    case 'Care Manager':
      return 'Assigned care management cohorts, RPM & chronic care plans';
    default:
      return 'Assigned facility workspace';
  }
}

export function filterPatientsForRole(
  patients: Patient[],
  options: {
    role: StaffRole;
    userId: string;
    facilityId: string;
    includeAllFacilities?: boolean;
    includeTeamScope?: boolean;
  }
): Patient[] {
  const allowAllFac = Boolean(options.includeAllFacilities) && canSwitchFacility(options.role);
  const byFacility = allowAllFac ? patients : patients.filter((p) => p.facilityId === options.facilityId);

  if (options.role === 'Clinician') {
    return byFacility.filter(
      (p) => p.primaryProviderId === options.userId || p.careTeamIds.includes(options.userId)
    );
  }
  if (options.role === 'Care Manager') {
    return byFacility.filter((p) => p.careTeamIds.includes(options.userId));
  }
  if (options.role === 'Nurse / Care Coordinator') {
    const assigned = byFacility.filter((p) => p.careTeamIds.includes(options.userId) || p.entryPath === 'Walk-in');
    return assigned.length > 0 ? assigned : byFacility;
  }
  return byFacility;
}

export function filterAppointmentsForRole(
  appointments: Appointment[],
  options: {
    role: StaffRole;
    userId: string;
    facilityId: string;
    teamScope?: boolean;
  }
): Appointment[] {
  const facScoped = appointments.filter((a) => a.facilityId === options.facilityId);
  if (options.role === 'Clinician') {
    return facScoped.filter((a) => a.providerId === options.userId);
  }
  if (options.teamScope && !canViewTeamWork(options.role)) {
    return facScoped.filter((a) => a.providerId === options.userId);
  }
  return facScoped;
}

export function filterTasksForRole(
  tasks: TaskItem[],
  options: {
    role: StaffRole;
    userId: string;
    facilityId: string;
    scope: 'mine' | 'team' | 'all';
  }
): TaskItem[] {
  const facScoped = tasks.filter((t) => t.facilityId === options.facilityId);
  if (!canViewTeamWork(options.role)) {
    return facScoped.filter((t) => t.ownerId === options.userId);
  }
  if (options.scope === 'mine') {
    return facScoped.filter((t) => t.ownerId === options.userId);
  }
  if (options.scope === 'team') {
    return facScoped.filter((t) => t.ownerId !== options.userId);
  }
  return facScoped;
}
