import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, HeartPulse, ShieldCheck } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import type { ReferralStatus } from '../types/hms';
import {
  EmptyState,
  MetricTile,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

const REFERRAL_FLOW: ReferralStatus[] = [
  'Received',
  'Triage',
  'Accepted',
  'Scheduled',
  'Seen',
  'Outcome Received',
  'Closed',
];

export const CareManagementPage: React.FC = () => {
  const {
    state,
    advanceReferralStatus,
    createReferral,
    logRpmOutreach,
    openPatient,
    notify,
  } = useAppState();

  const [tab, setTab] = useState<'care-plans' | 'referrals' | 'rpm' | 'population'>('care-plans');
  const [showNewRef, setShowNewRef] = useState(false);
  const [refPatient, setRefPatient] = useState(state.patients[0]?.id || '');
  const [refSpec, setRefSpec] = useState('Nephrology');
  const [refTarget, setRefTarget] = useState('Dr. Marcus Chen, MD');
  const [refReason, setRefReason] = useState('');
  const [cohortFilter, setCohortFilter] = useState<'all' | 'ckd' | 'afib' | 'research'>('all');

  const cohortPatients = useMemo(() => {
    return state.patients.filter((p) => {
      if (cohortFilter === 'ckd') {
        return p.conditions.some((c) => c.name.toLowerCase().includes('kidney') || c.name.toLowerCase().includes('renal'));
      }
      if (cohortFilter === 'afib') {
        return p.conditions.some((c) => c.name.toLowerCase().includes('fibrillation') || c.name.toLowerCase().includes('angina'));
      }
      if (cohortFilter === 'research') {
        return p.researchConsent === 'Consented';
      }
      return true;
    });
  }, [cohortFilter, state.patients]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Care Management, Referrals & Population Health"
        subtitle="M14 Care Plans · M15 Closed-Loop Referrals · M23 Remote Monitoring · M31 Population & Research"
        primaryAction={
          tab === 'referrals' ? (
            <button
              type="button"
              onClick={() => setShowNewRef(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
            >
              Create Outgoing Referral
            </button>
          ) : undefined
        }
      />

      <SegmentedTabs
        tabs={[
          { id: 'care-plans', label: 'Care Plans & Gaps (M14)', count: state.carePlans.length },
          { id: 'referrals', label: 'Referrals Closed-Loop (M15)', count: state.referrals.length },
          { id: 'rpm', label: 'Remote Monitoring (M23)', count: state.rpmDevices.length },
          { id: 'population', label: 'Population & Research (M31)', count: cohortPatients.length },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {/* M14 Care Plans */}
      {tab === 'care-plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.carePlans.map((cp) => (
            <div key={cp.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <PatientLink patientId={cp.patientId} tab="care-plan" showMrn />
                  <div className="text-xs font-semibold text-[#042C53] mt-0.5">{cp.programme}</div>
                </div>
                <StatusBadge label={cp.status} />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[#5F5D56]">Goals & Outcomes</div>
                {cp.goals.map((g) => (
                  <div key={g.id} className="p-2.5 bg-[#F7F7F5] rounded border border-slate-200/80 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#042C53]">{g.title}</span>
                      <StatusBadge label={g.status} />
                    </div>
                    <div className="mt-1.5 w-full bg-slate-200 h-1.5 rounded overflow-hidden">
                      <div className="bg-[#1D9E75] h-full" style={{ width: `${g.progressPct}%` }} />
                    </div>
                    <div className="text-[11px] text-[#5F5D56] mt-1 font-mono">
                      Target: {g.target} · Due {g.dueDate} ({g.progressPct}%)
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#5F5D56]">Care Gaps</div>
                {cp.careGaps.map((gap) => (
                  <div key={gap.id} className="flex items-center justify-between text-xs py-1">
                    <span>{gap.measure}</span>
                    <StatusBadge label={gap.status} />
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => openPatient(cp.patientId, 'care-plan')}
                  className="text-xs font-medium text-[#185FA5] hover:underline"
                >
                  Open Patient Care Plan →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* M15 Referrals Closed Loop */}
      {tab === 'referrals' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Direction & Specialty</th>
                  <th className="py-2.5 px-3">From → To</th>
                  <th className="py-2.5 px-3">Reason</th>
                  <th className="py-2.5 px-3">Closed-Loop Status</th>
                  <th className="py-2.5 px-3 text-right">Advance Loop</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {state.referrals.map((r) => {
                  const idx = REFERRAL_FLOW.indexOf(r.status);
                  const nextStatus = idx >= 0 && idx < REFERRAL_FLOW.length - 1 ? REFERRAL_FLOW[idx + 1] : null;
                  return (
                    <tr key={r.id} className="hover:bg-[#E6F1FB]/25">
                      <td className="py-2.5 px-3">
                        <PatientLink patientId={r.patientId} tab="care-plan" showMrn />
                        <div className="text-[11px] font-mono text-[#5F5D56]">{r.createdAt}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#042C53]">
                          {r.direction} · {r.specialty}
                        </div>
                        <StatusBadge label={r.urgency} className="mt-1" />
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-700">
                        <div>{r.referringProvider}</div>
                        <div className="text-[#5F5D56]">→ {r.targetProvider}</div>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs">
                        <div>{r.reason}</div>
                        {r.outcomeSummary && (
                          <div className="text-[11px] text-[#0F6E50] mt-0.5">
                            Outcome: {r.outcomeSummary}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={r.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {nextStatus ? (
                          <button
                            type="button"
                            onClick={() =>
                              advanceReferralStatus(
                                r.id,
                                nextStatus,
                                nextStatus === 'Outcome Received'
                                  ? 'Consult note & treatment plan synced (demo).'
                                  : undefined
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded hover:bg-[#042C53]"
                          >
                            Mark {nextStatus}
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#0F6E50] font-medium">Loop Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* M23 Remote Monitoring */}
      {tab === 'rpm' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {state.rpmDevices.map((d) => {
            const owner = state.staff.find((s) => s.id === d.assignedToId);
            return (
              <div key={d.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <PatientLink patientId={d.patientId} tab="encounters" showMrn />
                    <div className="text-xs font-medium text-[#042C53] mt-0.5">
                      {d.deviceType} · <span className="font-mono text-[#5F5D56]">{d.serial}</span>
                    </div>
                  </div>
                  <StatusBadge label={d.alertState} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs bg-[#F7F7F5] p-2.5 rounded">
                  <div>
                    <div className="text-[11px] text-[#5F5D56]">Last Reading</div>
                    <div className="font-mono font-semibold text-[#042C53]">{d.lastValue}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F5D56]">Adherence</div>
                    <div className="font-mono font-semibold text-[#042C53]">{d.adherencePct}%</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#5F5D56]">Missing Days</div>
                    <div className="font-mono font-semibold text-[#042C53]">{d.missingDays}d</div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#5F5D56]">Owner: {owner?.name}</span>
                  {d.alertState !== 'Normal' && (
                    <button
                      type="button"
                      onClick={() => logRpmOutreach(d.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-[#185FA5] text-white rounded-md"
                    >
                      Log Outreach & Clear Alert
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* M31 Population Health & Research */}
      {tab === 'population' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile label="Total Registry Cohort" value={state.patients.length} detail="Synthetic cross-facility" />
            <MetricTile
              label="CKD / Renal Registry"
              value={state.patients.filter((p) => p.conditions.some((c) => c.name.toLowerCase().includes('kidney') || c.name.toLowerCase().includes('renal'))).length}
              detail="eGFR monitoring"
            />
            <MetricTile
              label="Open Care Gaps"
              value={state.carePlans.reduce((s, cp) => s + cp.careGaps.filter((g) => g.status !== 'Closed').length, 0)}
              tone="warning"
            />
            <MetricTile
              label="Research Consented"
              value={state.patients.filter((p) => p.researchConsent === 'Consented').length}
              detail="Separate research consent state"
              tone="success"
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              tabs={[
                { id: 'all', label: 'All Cohort' },
                { id: 'ckd', label: 'CKD / Dialysis Registry' },
                { id: 'afib', label: 'Cardiovascular Registry' },
                { id: 'research', label: 'Research Consented Only' },
              ]}
              activeId={cohortFilter}
              onChange={(id) => setCohortFilter(id as typeof cohortFilter)}
            />
            <button
              type="button"
              onClick={() => notify('info', 'Care-gap outreach batch queued for selected cohort (simulated)')}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Queue Cohort Outreach (Sim)
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Primary Registry Condition</th>
                  <th className="py-2.5 px-3">Research Consent (Separate Access)</th>
                  <th className="py-2.5 px-3 text-right">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cohortPatients.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3">
                      <PatientLink patientId={p.id} tab="overview" showMrn />
                    </td>
                    <td className="py-2.5 px-3">{p.conditions[0]?.name || 'General Wellness'}</td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={p.researchConsent} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => openPatient(p.id, 'care-plan')}
                        className="text-[#185FA5] hover:underline font-medium"
                      >
                        Review Care Plan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showNewRef} onClose={() => setShowNewRef(false)} title="Create Outgoing Referral">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!refReason.trim()) return;
            createReferral({
              patientId: refPatient,
              facilityId: state.currentFacilityId,
              direction: 'Outgoing',
              specialty: refSpec,
              referringProvider: state.staff.find((s) => s.id === state.currentUserId)?.name || 'Clinician',
              targetProvider: refTarget,
              urgency: 'Routine',
              reason: refReason.trim(),
              status: 'Received',
            });
            setRefReason('');
            setShowNewRef(false);
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="ref-pat" className="block text-xs font-medium text-[#042C53] mb-1">
              Patient
            </label>
            <select
              id="ref-pat"
              value={refPatient}
              onChange={(e) => setRefPatient(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ref-sp" className="block text-xs font-medium text-[#042C53] mb-1">
                Specialty
              </label>
              <input
                id="ref-sp"
                type="text"
                value={refSpec}
                onChange={(e) => setRefSpec(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="ref-tgt" className="block text-xs font-medium text-[#042C53] mb-1">
                Target Provider
              </label>
              <input
                id="ref-tgt"
                type="text"
                value={refTarget}
                onChange={(e) => setRefTarget(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label htmlFor="ref-rsn" className="block text-xs font-medium text-[#042C53] mb-1">
              Clinical Reason *
            </label>
            <textarea
              id="ref-rsn"
              rows={2}
              required
              value={refReason}
              onChange={(e) => setRefReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewRef(false)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md">
              Create Referral
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
