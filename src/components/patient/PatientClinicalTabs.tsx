import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  FileSignature,
  Mic,
  Plus,
  Sparkles,
  Video,
} from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { buildPatientTimeline, filterTimelineEvents } from '../../state/clinicalEvents';
import { useAppState } from '../../state/AppStateContext';
import type { Encounter, Patient } from '../../types/hms';
import { SimpleLineChart } from '../ui/Charts';
import {
  EmptyState,
  Modal,
  SegmentedTabs,
  StatusBadge,
} from '../ui/Primitives';

const SMART_PHRASES = [
  { label: 'CKD Monitoring Plan', text: 'Counselled on low-sodium (<2g/day) & potassium-aware diet; avoid NSAIDs; repeat BMP in 4 weeks.' },
  { label: 'Hypertension Home Log', text: 'Reviewed 14-day home BP log; continue daily morning cuff measurement and bring log to next visit.' },
  { label: 'Telehealth Consent', text: 'Patient consented to simulated telehealth demonstration; identity and physical location verified.' },
];

export const PatientOverviewTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { state, setPatientTab, verifyExternalCondition, notify } = useAppState();

  const patientMeds = state.medications.filter((m) => m.patientId === patient.id && m.status !== 'Discontinued');
  const patientLabs = state.labResults.filter((l) => l.patientId === patient.id);
  const patientAppts = state.appointments.filter((a) => a.patientId === patient.id && a.status !== 'Cancelled');
  const latestVitals = state.vitals.find((v) => v.patientId === patient.id);
  const careTeam = state.staff.filter((s) => patient.careTeamIds.includes(s.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
      {/* Left 2 Columns */}
      <div className="lg:col-span-2 space-y-4">
        {/* Active Problems (Distinguishing Verified vs External) */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53]">Active Problems & Conditions</h2>
            <button
              type="button"
              onClick={() => setPatientTab('history')}
              className="text-xs text-[#185FA5] hover:underline"
            >
              Manage History
            </button>
          </div>
          {patient.conditions.length === 0 ? (
            <p className="text-[#5F5D56]">No active conditions recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {patient.conditions.map((c) => (
                <div key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#042C53]">
                      {c.name}{' '}
                      <span className="font-mono text-[11px] text-[#5F5D56]">{c.icd10}</span>
                    </div>
                    <div className="text-[11px] text-[#5F5D56]">
                      Source: {c.source} · Onset {c.onsetDate} · Reviewed {c.lastReviewed}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={c.verified ? 'Local Verified' : 'External Unverified'}
                      tone={c.verified ? 'success' : 'warning'}
                    />
                    {!c.verified && (
                      <button
                        type="button"
                        onClick={() => verifyExternalCondition(patient.id, c.id)}
                        className="px-2 py-0.5 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                      >
                        Verify & Reconcile
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Medications & Allergies */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#042C53]">Current Medications ({patientMeds.length})</h2>
              <button
                type="button"
                onClick={() => setPatientTab('medications')}
                className="text-xs text-[#185FA5] hover:underline"
              >
                Prescribe / Reconcile
              </button>
            </div>
            {patientMeds.length === 0 ? (
              <p className="text-[#5F5D56]">No active medications.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {patientMeds.map((m) => (
                  <div key={m.id} className="py-2">
                    <div className="font-medium text-[#042C53]">
                      {m.name} {m.dose}
                    </div>
                    <div className="text-[11px] text-[#5F5D56]">
                      {m.route} · {m.frequency} · {m.reconciled ? 'Reconciled' : 'Needs reconciliation'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-[#042C53]">Allergies & Precautions</h2>
            {patient.allergies.length === 0 ? (
              <p className="text-[#5F5D56]">No known drug allergies (NKDA) documented.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {patient.allergies.map((a) => (
                  <div key={a.id} className="py-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#B4321F]">{a.substance}</div>
                      <div className="text-[11px] text-[#5F5D56]">
                        {a.reaction} · {a.source} ({a.recordedDate})
                      </div>
                    </div>
                    <StatusBadge label={a.severity} />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Recent Results */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53]">Recent Lab Results</h2>
            <button
              type="button"
              onClick={() => setPatientTab('orders-results')}
              className="text-xs text-[#185FA5] hover:underline"
            >
              Orders & Trends
            </button>
          </div>
          {patientLabs.length === 0 ? (
            <p className="text-[#5F5D56]">No lab results recorded.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {patientLabs.slice(0, 4).map((l) => (
                <div key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#042C53]">{l.testName}</div>
                    <div className="text-[11px] font-mono text-[#5F5D56]">
                      {l.collectionDate} · Ref {l.referenceInterval}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold tabular-nums">
                      {l.value} {l.unit}
                    </span>
                    <StatusBadge label={l.flag} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Right Column: Latest Vitals, Upcoming Visit, Care Team, Record Provenance */}
      <div className="space-y-4">
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53]">Latest Vitals</h2>
            <button
              type="button"
              onClick={() => setPatientTab('encounters')}
              className="text-xs text-[#185FA5] hover:underline"
            >
              Flowsheet
            </button>
          </div>
          {latestVitals ? (
            <div className="grid grid-cols-2 gap-2 bg-[#F7F7F5] p-3 rounded font-mono tabular-nums">
              <div>
                <div className="text-[10px] font-sans text-[#5F5D56]">BP</div>
                <div className="font-semibold text-[#042C53]">
                  {latestVitals.bpSystolic}/{latestVitals.bpDiastolic}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-sans text-[#5F5D56]">Heart Rate</div>
                <div className="font-semibold text-[#042C53]">{latestVitals.heartRate} bpm</div>
              </div>
              <div>
                <div className="text-[10px] font-sans text-[#5F5D56]">SpO2</div>
                <div className="font-semibold text-[#042C53]">{latestVitals.spo2}%</div>
              </div>
              <div>
                <div className="text-[10px] font-sans text-[#5F5D56]">Weight</div>
                <div className="font-semibold text-[#042C53]">{latestVitals.weightKg} kg</div>
              </div>
            </div>
          ) : (
            <p className="text-[#5F5D56]">No vitals recorded yet.</p>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-[#042C53]">Appointments</h2>
          {patientAppts.length === 0 ? (
            <p className="text-[#5F5D56]">No upcoming appointments.</p>
          ) : (
            <div className="space-y-2">
              {patientAppts.slice(0, 3).map((a) => (
                <div key={a.id} className="p-2.5 bg-[#F7F7F5] rounded flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-[#042C53]">{a.type}</div>
                    <div className="text-[11px] font-mono text-[#5F5D56]">
                      {a.date} · {a.startTime}
                    </div>
                  </div>
                  <StatusBadge label={a.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold text-[#042C53]">Care Team & Custom Field</h2>
          <div className="space-y-1.5">
            {careTeam.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#042C53]">{s.name}</span>
                <span className="text-[11px] text-[#5F5D56]">{s.specialty || s.role}</span>
              </div>
            ))}
          </div>
          {patient.customFields && (
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#5F5D56]">
              {state.adminConfig.customPatientFieldLabel}:{' '}
              <span className="text-[#042C53] font-medium">
                {Object.values(patient.customFields)[0]}
              </span>
            </div>
          )}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-[#5F5D56]">Chart Sources: Local + HIE Demo</span>
            <button
              type="button"
              onClick={() => notify('info', 'External record refresh simulated (no live FHIR connection)')}
              className="text-[#185FA5] hover:underline"
            >
              Refresh Sources
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

export const PatientTimelineTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { state, setPatientTab } = useAppState();
  const [filter, setFilter] = useState<'all' | 'critical' | 'encounter' | 'lab' | 'order' | 'doc'>('all');

  const allTimelineEvents = useMemo(
    () => buildPatientTimeline(state, patient.id),
    [patient.id, state]
  );

  const criticalCount = useMemo(
    () => allTimelineEvents.filter((e) => e.isCritical).length,
    [allTimelineEvents]
  );

  const events = useMemo(() => {
    if (filter === 'all' || filter === 'critical') {
      return filterTimelineEvents(allTimelineEvents, filter);
    }
    return allTimelineEvents.filter((ev) => {
      if (filter === 'encounter') return ev.category === 'Encounter' || ev.category === 'Vitals';
      if (filter === 'lab') return ev.category === 'Laboratory' || ev.category === 'Imaging';
      if (filter === 'order') return ev.category === 'Order' || ev.category === 'Medication';
      if (filter === 'doc') return ev.category === 'Care Plan' || ev.category === 'Condition' || ev.category === 'Procedure / Acute Care';
      return true;
    });
  }, [allTimelineEvents, filter]);

  return (
    <div data-demo-target="patient-timeline-panel" className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          tabs={[
            { id: 'all', label: 'All Events', count: allTimelineEvents.length },
            { id: 'critical', label: 'Critical Events', count: criticalCount },
            { id: 'encounter', label: 'Encounters' },
            { id: 'lab', label: 'Results' },
            { id: 'order', label: 'Orders' },
            { id: 'doc', label: 'Care & History' },
          ]}
          activeId={filter}
          onChange={(id) => setFilter(id as typeof filter)}
        />
        <span className="text-xs text-[#5F5D56] font-mono tabular-nums">
          {events.length} timeline event{events.length === 1 ? '' : 's'}
        </span>
      </div>

      {filter === 'critical' && (
        <div className="px-3.5 py-2.5 bg-[#F1EFE8] border border-slate-200 rounded-lg text-[11px] text-[#444441]">
          <strong className="text-[#042C53]">Clinical Critical Events Criteria:</strong> Surfaces documented significant clinical events (acute stroke/MI, emergency admission, severe hypotension, critical laboratory values, major surgery) and formal medical-care adverse events. Routine visits, chronic diagnoses, and non-critical abnormal results are excluded.
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {events.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title={filter === 'critical' ? 'No critical clinical events documented' : 'No timeline events match filter'}
              description={
                filter === 'critical'
                  ? 'Routine outpatient encounters, chronic conditions, and non-critical abnormal labs remain under All Events.'
                  : undefined
              }
            />
          </div>
        ) : (
          events.map((ev) => (
            <div
              key={ev.id}
              className={`p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                ev.isCritical ? 'bg-red-50/30' : ''
              }`}
            >
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[#5F5D56]">
                  <span>{ev.date}</span>
                  {ev.isCritical && (
                    <StatusBadge
                      label={ev.eventNature}
                      tone={ev.eventNature === 'Formal Adverse Event (Medical Care)' ? 'danger' : 'warning'}
                    />
                  )}
                </div>
                <div className="font-semibold text-[#042C53]">{ev.title}</div>
                <div className="text-[#5F5D56]">{ev.summary}</div>
                {ev.criticalReason && (
                  <div className="text-[11px] text-[#B4321F] font-medium">
                    Criteria: {ev.criticalReason}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge label={ev.category} tone={ev.isCritical ? 'danger' : 'neutral'} />
                <button
                  type="button"
                  onClick={() => setPatientTab(ev.targetTab)}
                  className="text-[#185FA5] hover:underline font-medium"
                >
                  Open
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const PatientHistoryTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { updatePatientDemographics } = useAppState();
  const [cat, setCat] = useState<string>('All');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [newCategory, setNewCategory] = useState<'Medical' | 'Surgical' | 'Family' | 'Social' | 'Immunisation' | 'Reproductive' | 'Social Needs' | 'Advance Directives'>('Medical');

  const categories = ['All', 'Medical', 'Surgical', 'Family', 'Social', 'Immunisation', 'Reproductive', 'Social Needs', 'Advance Directives'];
  const items = patient.historyItems.filter((h) => cat === 'All' || h.category === cat);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
      <div className="lg:col-span-2 space-y-3">
        <div className="flex flex-wrap gap-1 p-1 bg-[#F1EFE8] rounded-lg">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                cat === c ? 'bg-white text-[#042C53] shadow-xs' : 'text-[#5F5D56]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No history entries in this category" />
            </div>
          ) : (
            items.map((h) => (
              <div key={h.id} className="p-3.5 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] text-[#5F5D56]">
                    {h.category} · {h.date} · Source: {h.source} · Reviewed {h.lastReviewed}
                  </div>
                  <div className="font-semibold text-[#042C53] mt-0.5">{h.title}</div>
                  <div className="text-slate-700 mt-0.5">{h.detail}</div>
                </div>
                <StatusBadge label={h.verified ? 'Verified' : 'Needs Review'} />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit">
        <h2 className="text-sm font-semibold text-[#042C53]">Add Clinical History Entry</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            updatePatientDemographics(patient.id, {
              historyItems: [
                {
                  id: `hist-${Date.now()}`,
                  category: newCategory,
                  title: title.trim(),
                  detail: detail.trim() || 'Documented in chart.',
                  date: TODAY_DATE,
                  source: 'Local Verified',
                  lastReviewed: TODAY_DATE,
                  verified: true,
                },
                ...patient.historyItems,
              ],
            });
            setTitle('');
            setDetail('');
          }}
          className="space-y-2.5"
        >
          <div>
            <label htmlFor="hist-cat" className="block font-medium text-[#042C53] mb-1">
              Category
            </label>
            <select
              id="hist-cat"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as typeof newCategory)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              {categories.filter((c) => c !== 'All').map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hist-t" className="block font-medium text-[#042C53] mb-1">
              Summary Title *
            </label>
            <input
              id="hist-t"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
            />
          </div>
          <div>
            <label htmlFor="hist-d" className="block font-medium text-[#042C53] mb-1">
              Details
            </label>
            <textarea
              id="hist-d"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
            />
          </div>
          <button type="submit" className="w-full py-2 font-medium text-white bg-[#185FA5] rounded-md">
            Save History Entry
          </button>
        </form>
      </div>
    </div>
  );
};

export const PatientEncountersTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    setUnsavedDirty,
    saveEncounterDraft,
    createEncounter,
    signEncounter,
    amendEncounter,
    addEncounterComment,
    recordVitals,
    notify,
  } = useAppState();

  const patientEncounters = state.encounters.filter((e) => e.patientId === patient.id);
  const [selectedId, setSelectedId] = useState<string>(patientEncounters[0]?.id || '');
  const activeEnc = patientEncounters.find((e) => e.id === selectedId) || patientEncounters[0];

  const [subMode, setSubMode] = useState<'note' | 'vitals' | 'telehealth'>('note');
  const [editSoap, setEditSoap] = useState(activeEnc?.soap || { subjective: '', objective: '', assessment: '', plan: '' });
  const [viewOnly, setViewOnly] = useState(false);
  const [showAmend, setShowAmend] = useState(false);
  const [amendReason, setAmendReason] = useState('');
  const [amendText, setAmendText] = useState('');
  const [showAvs, setShowAvs] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [scribeActive, setScribeActive] = useState(false);

  // Vitals state (M08)
  const [bpSys, setBpSys] = useState('130');
  const [bpDia, setBpDia] = useState('80');
  const [hr, setHr] = useState('72');
  const [spo2, setSpo2] = useState('98');
  const [wt, setWt] = useState('69.0');

  // Telehealth state (M21)
  const [teleStage, setTeleStage] = useState<'waiting' | 'device-check' | 'in-visit'>('waiting');
  const [micTested, setMicTested] = useState(false);

  const selectEncounter = (enc: Encounter) => {
    setSelectedId(enc.id);
    setEditSoap(enc.soap);
    setUnsavedDirty(false);
  };

  const isLockedSigned = activeEnc ? activeEnc.noteStatus === 'Signed' || activeEnc.noteStatus === 'Amended' : false;
  const patientVitals = state.vitals.filter((v) => v.patientId === patient.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          tabs={[
            { id: 'note', label: 'Encounters & SOAP Notes (M07)', count: patientEncounters.length },
            { id: 'vitals', label: 'Vitals & Flowsheets (M08)', count: patientVitals.length },
            { id: 'telehealth', label: 'Telehealth Waiting Room (M21)' },
          ]}
          activeId={subMode}
          onChange={(id) => setSubMode(id as typeof subMode)}
        />
        <button
          type="button"
          onClick={() => {
            const created = createEncounter({
              patientId: patient.id,
              providerId: state.currentUserId,
              facilityId: patient.facilityId,
              date: TODAY_DATE,
              type: 'Outpatient Follow-up',
              chiefComplaint: 'New clinical evaluation',
              soap: {
                subjective: '',
                objective: '',
                assessment: '',
                plan: '',
              },
              diagnoses: patient.conditions.slice(0, 2).map((c) => `${c.icd10} ${c.name}`),
              noteStatus: 'Draft',
              amendments: [],
              comments: [],
              avsReleased: false,
            });
            selectEncounter(created);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
        >
          <Plus className="w-3.5 h-3.5" />
          Start New Encounter
        </button>
      </div>

      {/* M07 SOAP Note Workspace */}
      {subMode === 'note' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 text-xs">
          {/* Encounter History */}
          <div className="bg-white border border-slate-200 rounded-lg p-2 space-y-1 h-fit">
            <div className="px-2 py-1 text-[11px] font-semibold text-[#5F5D56]">Encounter History</div>
            {patientEncounters.length === 0 ? (
              <div className="p-3 text-[#5F5D56]">No encounters yet.</div>
            ) : (
              patientEncounters.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectEncounter(e)}
                  className={`w-full text-left p-2.5 rounded-md border ${
                    activeEnc?.id === e.id
                      ? 'bg-[#E6F1FB]/60 border-[#85B7EB]'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-semibold text-[#042C53]">{e.date}</span>
                    <StatusBadge label={e.noteStatus} />
                  </div>
                  <div className="font-medium text-slate-800 mt-0.5 truncate">{e.type}</div>
                  <div className="text-[11px] text-[#5F5D56] truncate">{e.chiefComplaint}</div>
                </button>
              ))
            )}
          </div>

          {/* Note Editor */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            {!activeEnc ? (
              <EmptyState title="Select or start an encounter" />
            ) : (
              <>
                {/* Top Note Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#042C53]">{activeEnc.type}</span>
                      <StatusBadge label={activeEnc.noteStatus} />
                      {state.unsavedDirty && <StatusBadge label="Unsaved Changes" tone="warning" />}
                    </div>
                    <div className="text-[11px] text-[#5F5D56] mt-0.5">
                      Chief Complaint: {activeEnc.chiefComplaint}
                      {activeEnc.signedBy ? ` · Signed by ${activeEnc.signedBy} (${activeEnc.signedAt})` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setScribeActive((v) => !v);
                        notify('info', 'Simulated AI Scribe demo toggled (no real audio recording)');
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded border font-medium ${
                        scribeActive ? 'bg-amber-50 border-amber-300 text-[#9A5B10]' : 'border-slate-300 text-[#042C53]'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      {scribeActive ? 'Scribe Demo Active' : 'Scribe Now (Demo)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isLockedSigned) return;
                        setEditSoap((prev) => ({
                          ...prev,
                          plan:
                            prev.plan +
                            (prev.plan ? '\n' : '') +
                            '[AI Review Suggestion] Consider confirming serum potassium before repeating ACEi/ARB dosing.',
                        }));
                        setUnsavedDirty(true);
                        notify('info', 'AI review suggestion inserted into draft plan for clinician review');
                      }}
                      disabled={isLockedSigned}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-[#042C53] disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-[#185FA5]" />
                      Review with AI
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewOnly((v) => !v)}
                      className="px-2.5 py-1.5 rounded border border-slate-300 text-[#042C53]"
                    >
                      {viewOnly ? 'Edit Mode' : 'View Mode'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAvs(true)}
                      className="px-2.5 py-1.5 rounded border border-slate-300 text-[#042C53]"
                    >
                      After-Visit Summary
                    </button>
                  </div>
                </div>

                {/* Smart Phrases */}
                {!isLockedSigned && !viewOnly && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[#5F5D56]">Smart Phrases:</span>
                    {SMART_PHRASES.map((sp) => (
                      <button
                        key={sp.label}
                        type="button"
                        onClick={() => {
                          setEditSoap((prev) => ({
                            ...prev,
                            plan: prev.plan ? `${prev.plan}\n${sp.text}` : sp.text,
                          }));
                          setUnsavedDirty(true);
                        }}
                        className="px-2 py-1 text-[11px] bg-[#F7F7F5] hover:bg-[#E6F1FB] border border-slate-200 rounded text-[#042C53]"
                      >
                        + {sp.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* SOAP Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
                    <div key={field}>
                      <label
                        htmlFor={`soap-${field}`}
                        className="block text-xs font-semibold text-[#042C53] capitalize mb-1"
                      >
                        {field}
                      </label>
                      <textarea
                        id={`soap-${field}`}
                        rows={4}
                        readOnly={isLockedSigned || viewOnly}
                        value={editSoap[field]}
                        onChange={(e) => {
                          setEditSoap((prev) => ({ ...prev, [field]: e.target.value }));
                          setUnsavedDirty(true);
                        }}
                        className={`w-full px-3 py-2 text-xs border rounded-md ${
                          isLockedSigned || viewOnly
                            ? 'bg-[#F7F7F5] border-slate-200 text-slate-700'
                            : 'bg-white border-slate-300'
                        }`}
                      />
                    </div>
                  ))}
                </div>

                {/* Amendments if signed/amended */}
                {activeEnc.amendments.length > 0 && (
                  <div className="p-3 bg-[#F1EFE8] border border-slate-200 rounded-md space-y-2">
                    <div className="font-semibold text-[#042C53]">Amendments / Addenda (Original Signed Content Preserved)</div>
                    {activeEnc.amendments.map((amd) => (
                      <div key={amd.id} className="text-xs border-t border-slate-200 pt-1.5">
                        <div className="font-medium text-[#042C53]">
                          {amd.authorName} · <span className="font-mono text-[11px]">{amd.timestamp}</span> · Reason: {amd.reason}
                        </div>
                        <p className="text-slate-700 mt-0.5">{amd.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Bottom Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                  <div className="text-[11px] text-[#5F5D56]">
                    Diagnoses: {activeEnc.diagnoses.join(' · ') || 'None linked'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!isLockedSigned ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEncounterDraft(activeEnc.id, { soap: editSoap })}
                          className="px-3 py-1.5 font-medium border border-slate-300 rounded-md hover:bg-slate-50"
                        >
                          Save Draft
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            saveEncounterDraft(activeEnc.id, { soap: editSoap });
                            signEncounter(activeEnc.id, false);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-1.5 font-medium text-white bg-[#042C53] hover:bg-[#185FA5] rounded-md"
                        >
                          <FileSignature className="w-3.5 h-3.5" />
                          Sign & Lock Note
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAmend(true)}
                        className="px-3.5 py-1.5 font-medium text-[#042C53] bg-[#E6F1FB] border border-[#85B7EB] rounded-md"
                      >
                        Add Amendment / Addendum
                      </button>
                    )}
                  </div>
                </div>

                {/* Note Comments */}
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <div className="font-semibold text-[#042C53]">Comments ({activeEnc.comments.length})</div>
                  {activeEnc.comments.map((c) => (
                    <div key={c.id} className="p-2 bg-[#F7F7F5] rounded text-xs">
                      <span className="font-medium text-[#042C53]">{c.author}</span>{' '}
                      <span className="font-mono text-[11px] text-[#5F5D56]">{c.timestamp}</span>: {c.text}
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!commentInput.trim()) return;
                      addEncounterComment(activeEnc.id, commentInput.trim());
                      setCommentInput('');
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Add chart comment..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                    <button type="submit" className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium">
                      Comment
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* M08 Vitals & Flowsheets */}
      {subMode === 'vitals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h2 className="text-sm font-semibold text-[#042C53]">Record Vital Signs (M08)</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const s = Number(bpSys);
                const d = Number(bpDia);
                const h = Number(hr);
                if (s < 50 || s > 260 || d < 30 || d > 160) {
                  notify('error', 'Blood pressure outside valid physiological range');
                  return;
                }
                recordVitals({
                  patientId: patient.id,
                  recordedAt: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`,
                  bpSystolic: s,
                  bpDiastolic: d,
                  heartRate: h,
                  tempF: 98.4,
                  spo2: Number(spo2),
                  weightKg: Number(wt),
                  heightCm: 165,
                  painScore: 0,
                  source: 'Clinic Intake',
                  recordedBy: state.staff.find((st) => st.id === state.currentUserId)?.name || 'RN',
                });
              }}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="vit-sys" className="block font-medium mb-1">Systolic (mmHg)</label>
                  <input id="vit-sys" type="number" value={bpSys} onChange={(e) => setBpSys(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono" />
                </div>
                <div>
                  <label htmlFor="vit-dia" className="block font-medium mb-1">Diastolic (mmHg)</label>
                  <input id="vit-dia" type="number" value={bpDia} onChange={(e) => setBpDia(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono" />
                </div>
                <div>
                  <label htmlFor="vit-hr" className="block font-medium mb-1">Heart Rate (bpm)</label>
                  <input id="vit-hr" type="number" value={hr} onChange={(e) => setHr(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono" />
                </div>
                <div>
                  <label htmlFor="vit-spo2" className="block font-medium mb-1">SpO2 (%)</label>
                  <input id="vit-spo2" type="number" value={spo2} onChange={(e) => setSpo2(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono" />
                </div>
              </div>
              <div>
                <label htmlFor="vit-wt" className="block font-medium mb-1">Weight (kg)</label>
                <input id="vit-wt" type="number" step="0.1" value={wt} onChange={(e) => setWt(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono" />
              </div>
              <button type="submit" className="w-full py-2 font-medium text-white bg-[#185FA5] rounded-md">
                Save Observation
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <h2 className="text-sm font-semibold text-[#042C53]">Longitudinal Systolic BP Flowsheet</h2>
            <SimpleLineChart
              points={patientVitals
                .slice()
                .reverse()
                .map((v) => ({ label: v.recordedAt.slice(5, 10), value: v.bpSystolic }))}
              unit="mmHg"
              referenceMin={100}
              referenceMax={130}
            />
            <div className="overflow-x-auto border border-slate-200 rounded">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] text-[#5F5D56]">
                  <tr>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">BP</th>
                    <th className="py-2 px-3">HR</th>
                    <th className="py-2 px-3">SpO2</th>
                    <th className="py-2 px-3">Weight</th>
                    <th className="py-2 px-3">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {patientVitals.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2 px-3">{v.recordedAt}</td>
                      <td className="py-2 px-3">{v.bpSystolic}/{v.bpDiastolic}</td>
                      <td className="py-2 px-3">{v.heartRate}</td>
                      <td className="py-2 px-3">{v.spo2}%</td>
                      <td className="py-2 px-3">{v.weightKg} kg</td>
                      <td className="py-2 px-3 font-sans">{v.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* M21 Telehealth Waiting Room */}
      {subMode === 'telehealth' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-[#185FA5]" />
              <h2 className="text-sm font-semibold text-[#042C53]">Telehealth Virtual Waiting Room (Simulated Demo)</h2>
            </div>
            <StatusBadge label="Simulated Video — No Live Connection" tone="warning" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-[#042C53] text-white rounded-lg md:col-span-2 space-y-3 flex flex-col justify-between min-h-[220px]">
              <div>
                <div className="text-[11px] text-[#85B7EB]">Virtual Room Status: {teleStage.toUpperCase()}</div>
                <div className="text-base font-semibold mt-1">
                  {teleStage === 'waiting' && `Waiting for ${patient.fullName} to complete pre-visit check`}
                  {teleStage === 'device-check' && 'Audio / Video / Interpreter Check (Simulated)'}
                  {teleStage === 'in-visit' && `Simulated Virtual Consultation with ${patient.fullName}`}
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Prototype simulation only — no live WebRTC camera or microphone stream is active.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMicTested(true);
                    setTeleStage('device-check');
                  }}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded text-xs font-medium"
                >
                  Run Device Check (Sim)
                </button>
                <button
                  type="button"
                  onClick={() => setTeleStage('in-visit')}
                  className="px-3 py-1.5 bg-[#1D9E75] hover:bg-[#0F6E50] rounded text-xs font-medium"
                >
                  Join Simulated Visit
                </button>
              </div>
            </div>

            <div className="p-4 bg-[#F7F7F5] border border-slate-200 rounded-lg space-y-2">
              <div className="font-semibold text-[#042C53]">Session Readiness</div>
              <div>Patient: {patient.fullName}</div>
              <div>Preferred Language: {patient.preferredLanguage}</div>
              <div>Device Check: {micTested ? 'Passed (Simulated)' : 'Not tested'}</div>
              <div>Interpreter Requested: No</div>
            </div>
          </div>
        </div>
      )}

      {/* Amendment Modal */}
      <Modal open={showAmend} onClose={() => setShowAmend(false)} title="Add Clinical Note Amendment">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!activeEnc || !amendReason.trim() || !amendText.trim()) return;
            amendEncounter(activeEnc.id, amendReason.trim(), amendText.trim());
            setAmendReason('');
            setAmendText('');
            setShowAmend(false);
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label htmlFor="amd-rsn" className="block font-medium text-[#042C53] mb-1">Reason for Amendment *</label>
            <input id="amd-rsn" type="text" required value={amendReason} onChange={(e) => setAmendReason(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
          </div>
          <div>
            <label htmlFor="amd-txt" className="block font-medium text-[#042C53] mb-1">Addendum Text *</label>
            <textarea id="amd-txt" rows={3} required value={amendText} onChange={(e) => setAmendText(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAmend(false)} className="px-3 py-1.5 border border-slate-300 rounded">Cancel</button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded">Save Addendum</button>
          </div>
        </form>
      </Modal>

      {/* After-Visit Summary Modal */}
      <Modal open={showAvs} onClose={() => setShowAvs(false)} title="After-Visit Summary (AVS)" subtitle={`${patient.fullName} · ${activeEnc?.date || TODAY_DATE}`}>
        {activeEnc && (
          <div className="space-y-3 text-xs">
            <div>
              <div className="font-semibold text-[#042C53]">Visit Reason</div>
              <p className="text-slate-700">{activeEnc.chiefComplaint}</p>
            </div>
            <div>
              <div className="font-semibold text-[#042C53]">Assessment & Care Plan</div>
              <pre className="whitespace-pre-wrap font-sans text-slate-700 bg-[#F7F7F5] p-3 rounded">{editSoap.plan}</pre>
            </div>
            <div className="text-[11px] text-[#5F5D56]">
              Status: {activeEnc.avsReleased ? 'Released to Patient Portal' : 'Draft — releases when note is signed'}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
