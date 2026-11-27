import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  ChevronDown,
  Search,
  Sparkles,
  Star,
  UserRound,
} from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { useDemoDirector } from '../../demo/DemoDirectorContext';
import { useAppState } from '../../state/AppStateContext';
import { canSignClinicalNote, filterAppointmentsForRole } from '../../state/permissions';
import type { PatientTabKey } from '../../types/hms';
import { AskEigenHPanel } from '../ai/AskEigenHPanel';
import { StatusBadge } from '../ui/Primitives';
import {
  PatientEncountersTab,
  PatientHistoryTab,
  PatientOverviewTab,
  PatientTimelineTab,
} from './PatientClinicalTabs';
import {
  PatientCarePlanTab,
  PatientMedicationsTab,
  PatientOrdersResultsTab,
} from './PatientOrdersMedsCareTabs';
import {
  PatientAccountTab,
  PatientAiAgentTab,
  PatientCommsTab,
  PatientDocsFormsTab,
} from './PatientCommsDocsAiAccountTabs';
import {
  PostConsultationTab,
  PreConsultationTab,
  PreVisitIntakeTab,
} from './PrePostConsultationTabs';
import { PatientDataInboxTab } from './PatientDataInboxTab';
import { PatientKnowledgeGraphTab } from './PatientKnowledgeGraphTab';

const PRIMARY_PATIENT_TABS: { key: PatientTabKey; label: string }[] = [
  { key: 'overview', label: 'Patient Summary' },
  { key: 'post-consultation', label: 'Consultation & Sign' },
  { key: 'pre-consultation', label: 'Pre-Consultation' },
  { key: 'orders-results', label: 'Orders & Results' },
  { key: 'data-inbox', label: 'Data Inbox' },
  { key: 'timeline', label: 'Timeline' },
];

const SECONDARY_PATIENT_TABS: { key: PatientTabKey; label: string; advanced?: boolean }[] = [
  { key: 'history', label: 'History' },
  { key: 'medications', label: 'Medications' },
  { key: 'encounters', label: 'Encounters' },
  { key: 'care-plan', label: 'Care Plan' },
  { key: 'pre-visit-intake', label: 'Pre-Visit Intake' },
  { key: 'documents-forms', label: 'Documents & Forms' },
  { key: 'communications', label: 'Communications' },
  { key: 'account', label: 'Account' },
  { key: 'ai-agent', label: 'AI Agent' },
  { key: 'knowledge-graph', label: 'Knowledge Graph (Advanced)', advanced: true },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

export const PatientWorkspace: React.FC = () => {
  const {
    state,
    closePatientWorkspace,
    openPatient,
    setPatientTab,
    togglePatientFavourite,
  } = useAppState();
  const { isDemoMode } = useDemoDirector();

  const [askOpen, setAskOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const patient = state.patients.find((p) => p.id === state.selectedPatientId);

  const nextScheduledPatient = useMemo(() => {
    if (!patient) return null;
    const todayAppts = filterAppointmentsForRole(state.appointments, {
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
      teamScope: false,
    })
      .filter((a) => a.date === TODAY_DATE && a.status !== 'Cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const uniqueIds: string[] = [];
    for (const a of todayAppts) {
      if (!uniqueIds.includes(a.patientId)) uniqueIds.push(a.patientId);
    }
    if (uniqueIds.length <= 1) return null;
    const currentIdx = uniqueIds.indexOf(patient.id);
    const nextId = uniqueIds[(currentIdx + 1) % uniqueIds.length];
    if (!nextId || nextId === patient.id) return null;
    return state.patients.find((p) => p.id === nextId) || null;
  }, [patient, state.appointments, state.currentFacilityId, state.currentRole, state.currentUserId, state.patients]);

  if (!patient) return null;

  const facility = state.facilities.find((f) => f.id === patient.facilityId);
  const primaryProvider = state.staff.find((s) => s.id === patient.primaryProviderId);
  const currentEncounter = state.encounters.find(
    (e) => e.patientId === patient.id && (e.noteStatus === 'Draft' || e.noteStatus === 'Awaiting Signature')
  );
  const canDocument = canSignClinicalNote(state.currentRole);

  const visibleSecondaryTabs = SECONDARY_PATIENT_TABS.filter(
    (t) => t.key !== 'ai-agent' || state.adminConfig.features.aiAgent
  );
  const activeSecondaryTab = visibleSecondaryTabs.find((t) => t.key === state.selectedPatientTab);

  // During Demo Academy playback, keep all tabs rendered flat so automated scenario clicks remain 100% deterministic.
  const tabsToRender = isDemoMode
    ? [...PRIMARY_PATIENT_TABS, ...visibleSecondaryTabs]
    : activeSecondaryTab
    ? [...PRIMARY_PATIENT_TABS, activeSecondaryTab]
    : PRIMARY_PATIENT_TABS;

  return (
    <div className="space-y-5">
      {/* Persistent Sticky Patient Context Header */}
      <section
        aria-label="Patient chart header"
        className="sticky top-15 z-20 eigen-card px-5 pt-4 pb-3 space-y-3.5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <button
              type="button"
              onClick={closePatientWorkspace}
              aria-label="Back to workspace"
              className="mt-0.5 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#5F5D56] hover:text-[#042C53] bg-[#F6F6F2] hover:bg-[#E6F1FB]/70 rounded-xl transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Today’s Patients</span>
            </button>

            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-xl bg-[#042C53] text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-2xs"
            >
              {getInitials(patient.fullName)}
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-lg sm:text-xl font-semibold text-[#042C53] tracking-[-0.02em] leading-tight">
                  {patient.fullName}
                </h1>
                <button
                  type="button"
                  onClick={() => togglePatientFavourite(patient.id)}
                  aria-label="Toggle favourite patient"
                  className="p-1 text-[#C97A1B] hover:bg-[#FEF5E7] rounded-lg transition-colors"
                >
                  <Star className={`w-4 h-4 ${patient.favourite ? 'fill-[#C97A1B]' : 'opacity-35'}`} />
                </button>
                <StatusBadge label={patient.status} />
                {patient.registrationStatus && (
                  <StatusBadge
                    label={patient.registrationStatus}
                    tone={patient.registrationStatus === 'Verified & Ready' ? 'success' : 'warning'}
                  />
                )}
              </div>

              <div className="text-xs text-[#5F5D56] flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono font-semibold text-[#042C53] bg-[#F8F8F5] border border-[#042C53]/[0.08] px-2 py-0.5 rounded-md">
                  {patient.mrn}
                </span>
                {patient.abhaId && (
                  <span className="font-mono text-[11px] text-[#042C53]">ABHA {patient.abhaId}</span>
                )}
                <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px]">
                  <Calendar className="w-3 h-3 text-[#5F5D56]" />
                  DOB {patient.dob} ({patient.age}y {patient.sex})
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <UserRound className="w-3 h-3 text-[#5F5D56]" />
                  PCP: {primaryProvider?.name || 'Unassigned'}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px]">
                  <Building2 className="w-3 h-3 text-[#5F5D56]" />
                  {facility?.shortName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {patient.allergies.length > 0 ? (
              <div className="px-3 py-1.5 bg-[#FDF0EE] border border-[#B4321F]/25 rounded-xl text-[#B4321F] inline-flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Allergies: {patient.allergies.map((a) => a.substance).join(', ')}
              </div>
            ) : patient.registrationStatus === 'Verified & Ready' ? (
              <StatusBadge label="Allergies: Missing (Confirm NKDA)" tone="warning" />
            ) : (
              <StatusBadge label="NKDA (Verified)" tone="success" />
            )}
            {currentEncounter && (
              <button
                type="button"
                onClick={() => setPatientTab('post-consultation')}
                className="px-3 py-1.5 bg-[#E6F1FB] hover:bg-[#85B7EB]/35 border border-[#85B7EB]/60 rounded-xl text-[#042C53] font-medium transition-colors"
              >
                Encounter: {currentEncounter.noteStatus}
              </button>
            )}
            <button
              type="button"
              data-demo-target="ask-eigenh-open-btn"
              onClick={() => setAskOpen((v) => !v)}
              aria-expanded={askOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold transition-colors ${
                askOpen
                  ? 'bg-[#042C53] text-white'
                  : 'bg-[#EFF6FC] hover:bg-[#E6F1FB] border border-[#185FA5]/30 text-[#185FA5]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <Search className="w-3 h-3" />
              Ask EigenH
            </button>
            {canDocument && nextScheduledPatient && (
              <button
                type="button"
                data-demo-target="next-patient-btn"
                onClick={() => openPatient(nextScheduledPatient.id, 'overview')}
                title={`Move to next scheduled patient: ${nextScheduledPatient.fullName}`}
                className="eigen-btn-secondary px-3 py-1.5 text-xs"
              >
                Next Patient
                <ArrowRight className="w-3.5 h-3.5 text-[#185FA5]" />
              </button>
            )}
          </div>
        </div>

        {/* Streamlined Patient Chart Navigation Strip */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-[#042C53]/[0.07]">
          <nav
            aria-label="Patient chart tabs"
            className="flex items-center gap-1 overflow-x-auto eigen-scroll pb-0.5 flex-1 min-w-0"
          >
            {tabsToRender.map((t) => {
              const active = state.selectedPatientTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  data-demo-target={`patient-tab-${t.key}`}
                  onClick={() => {
                    setPatientTab(t.key);
                    setMoreMenuOpen(false);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-all ${
                    active
                      ? 'bg-[#042C53] text-white shadow-2xs'
                      : 'text-[#5F5D56] hover:bg-[#F6F6F2] hover:text-[#042C53]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {!isDemoMode && (
            <div className="relative shrink-0">
              <button
                type="button"
                data-demo-target="patient-tabs-more-btn"
                aria-expanded={moreMenuOpen}
                onClick={() => setMoreMenuOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  moreMenuOpen
                    ? 'bg-[#042C53] text-white border-[#042C53]'
                    : 'bg-white text-[#5F5D56] border-[#042C53]/12 hover:bg-[#F6F6F2] hover:text-[#042C53]'
                }`}
              >
                <span>More</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {moreMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-56 bg-white border border-[#042C53]/12 rounded-xl shadow-[0_14px_34px_-8px_rgba(4,44,83,0.22)] z-40 py-1.5"
                >
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                    Additional Chart Sections
                  </div>
                  {visibleSecondaryTabs
                    .filter((t) => !t.advanced)
                    .map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="menuitem"
                        data-demo-target={`patient-more-tab-${t.key}`}
                        onClick={() => {
                          setPatientTab(t.key);
                          setMoreMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          state.selectedPatientTab === t.key
                            ? 'bg-[#E6F1FB] text-[#042C53] font-semibold'
                            : 'text-[#444441] hover:bg-[#F6F6F2] hover:text-[#042C53]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  <div className="my-1.5 border-t border-[#042C53]/[0.08]" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                    Advanced Reference
                  </div>
                  {visibleSecondaryTabs
                    .filter((t) => t.advanced)
                    .map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        role="menuitem"
                        data-demo-target={`patient-more-tab-${t.key}`}
                        onClick={() => {
                          setPatientTab(t.key);
                          setMoreMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                          state.selectedPatientTab === t.key
                            ? 'bg-[#E6F1FB] text-[#042C53] font-semibold'
                            : 'text-[#5F5D56] hover:bg-[#F6F6F2] hover:text-[#042C53]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Context-Aware Ask EigenH Chart Search Panel */}
      {askOpen && (
        <AskEigenHPanel patient={patient} onClose={() => setAskOpen(false)} />
      )}

      {/* Active Tab Body */}
      <div>
        {state.selectedPatientTab === 'pre-consultation' && <PreConsultationTab patient={patient} />}
        {state.selectedPatientTab === 'post-consultation' && <PostConsultationTab patient={patient} />}
        {state.selectedPatientTab === 'pre-visit-intake' && <PreVisitIntakeTab patient={patient} />}
        {state.selectedPatientTab === 'overview' && <PatientOverviewTab patient={patient} />}
        {state.selectedPatientTab === 'data-inbox' && <PatientDataInboxTab patient={patient} />}
        {state.selectedPatientTab === 'knowledge-graph' && (
          <PatientKnowledgeGraphTab patient={patient} />
        )}
        {state.selectedPatientTab === 'timeline' && <PatientTimelineTab patient={patient} />}
        {state.selectedPatientTab === 'history' && <PatientHistoryTab patient={patient} />}
        {state.selectedPatientTab === 'encounters' && <PatientEncountersTab patient={patient} />}
        {state.selectedPatientTab === 'medications' && <PatientMedicationsTab patient={patient} />}
        {state.selectedPatientTab === 'orders-results' && <PatientOrdersResultsTab patient={patient} />}
        {state.selectedPatientTab === 'care-plan' && <PatientCarePlanTab patient={patient} />}
        {state.selectedPatientTab === 'communications' && <PatientCommsTab patient={patient} />}
        {state.selectedPatientTab === 'documents-forms' && <PatientDocsFormsTab patient={patient} />}
        {state.selectedPatientTab === 'ai-agent' && <PatientAiAgentTab patient={patient} />}
        {state.selectedPatientTab === 'account' && <PatientAccountTab patient={patient} />}
      </div>
    </div>
  );
};
