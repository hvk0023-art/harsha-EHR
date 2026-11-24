import React from 'react';
import { AlertTriangle, ArrowLeft, Star } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { PatientTabKey } from '../../types/hms';
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

const PATIENT_TABS: { key: PatientTabKey; label: string; featured?: boolean }[] = [
  { key: 'pre-consultation', label: 'Pre-Consultation', featured: true },
  { key: 'post-consultation', label: 'Post-Consultation', featured: true },
  { key: 'pre-visit-intake', label: 'Pre-Visit Intake' },
  { key: 'overview', label: 'Patient 360°' },
  { key: 'data-inbox', label: 'Data Inbox', featured: true },
  { key: 'knowledge-graph', label: 'Knowledge Graph', featured: true },
  { key: 'timeline', label: 'Timeline' },
  { key: 'history', label: 'History' },
  { key: 'encounters', label: 'Encounters' },
  { key: 'medications', label: 'Medications' },
  { key: 'orders-results', label: 'Orders & Results' },
  { key: 'care-plan', label: 'Care Plan' },
  { key: 'communications', label: 'Communications' },
  { key: 'documents-forms', label: 'Documents & Forms' },
  { key: 'ai-agent', label: 'AI Agent' },
  { key: 'account', label: 'Account' },
];

export const PatientWorkspace: React.FC = () => {
  const {
    state,
    closePatientWorkspace,
    setPatientTab,
    togglePatientFavourite,
  } = useAppState();

  const patient = state.patients.find((p) => p.id === state.selectedPatientId);
  if (!patient) return null;

  const facility = state.facilities.find((f) => f.id === patient.facilityId);
  const primaryProvider = state.staff.find((s) => s.id === patient.primaryProviderId);
  const currentEncounter = state.encounters.find(
    (e) => e.patientId === patient.id && (e.noteStatus === 'Draft' || e.noteStatus === 'Awaiting Signature')
  );

  const visibleTabs = PATIENT_TABS.filter(
    (t) => t.key !== 'ai-agent' || state.adminConfig.features.aiAgent
  );

  return (
    <div className="space-y-4">
      {/* Persistent Sticky Patient Banner */}
      <section
        aria-label="Patient chart header"
        className="sticky top-14 z-20 bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={closePatientWorkspace}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#185FA5] hover:underline mr-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <h1 className="text-xl font-semibold text-[#042C53] tracking-tight">
                {patient.fullName}
              </h1>
              <button
                type="button"
                onClick={() => togglePatientFavourite(patient.id)}
                aria-label="Toggle favourite patient"
                className="p-1 text-[#C97A1B]"
              >
                <Star className={`w-4 h-4 ${patient.favourite ? 'fill-[#C97A1B]' : 'opacity-40'}`} />
              </button>
              <StatusBadge label={patient.status} />
            </div>

            <div className="text-xs text-[#5F5D56] flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono font-medium text-[#042C53]">{patient.mrn}</span>
              {patient.abhaId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">ABHA {patient.abhaId}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                DOB {patient.dob} ({patient.age}y {patient.sex})
              </span>
              <span aria-hidden="true">·</span>
              <span>PCP: {primaryProvider?.name || 'Unassigned'}</span>
              <span aria-hidden="true">·</span>
              <span>{facility?.shortName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {patient.allergies.length > 0 ? (
              <div className="px-2.5 py-1 bg-red-50 border border-red-200 rounded text-[#B4321F] inline-flex items-center gap-1.5 font-medium">
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
                onClick={() => setPatientTab('encounters')}
                className="px-2.5 py-1 bg-[#E6F1FB] border border-[#85B7EB] rounded text-[#042C53] font-medium"
              >
                Encounter: {currentEncounter.noteStatus}
              </button>
            )}
          </div>
        </div>

        {/* Persistent 11 Patient Chart Tabs */}
        <nav
          aria-label="Patient chart tabs"
          className="flex items-center gap-1 overflow-x-auto pt-2 border-t border-slate-200 eigen-scroll"
        >
          {visibleTabs.map((t) => {
            const active = state.selectedPatientTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                data-demo-target={`patient-tab-${t.key}`}
                onClick={() => setPatientTab(t.key)}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-[#042C53] text-white'
                    : 'text-[#5F5D56] hover:bg-slate-100 hover:text-[#042C53]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      </section>

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
