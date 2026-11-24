import React, { useMemo, useState } from 'react';
import { Star, UserPlus } from 'lucide-react';
import { findDuplicatePatients } from '../state/domainLogic';
import { canSwitchFacility, filterPatientsForRole } from '../state/permissions';
import { useAppState } from '../state/AppStateContext';
import { RegisterPatientModal } from '../components/modals/QuickActionModals';
import { IntelligentRegistrationModal } from '../components/registration/IntelligentRegistrationModal';
import {
  EmptyState,
  Modal,
  PageHeader,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const PatientsDirectoryPage: React.FC = () => {
  const {
    state,
    currentFacility,
    openPatient,
    togglePatientFavourite,
    mergeDuplicatePatient,
  } = useAppState();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [scopeAllFacilities, setScopeAllFacilities] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showIntelligentReg, setShowIntelligentReg] = useState(false);
  const [showDupReview, setShowDupReview] = useState(false);

  const allowAllFacilities = canSwitchFacility(state.currentRole);
  const effectiveAllFacilities = allowAllFacilities && scopeAllFacilities;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const scoped = filterPatientsForRole(state.patients, {
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
      includeAllFacilities: effectiveAllFacilities,
    });
    return scoped.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q) ||
        p.dob.includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        (p.abhaId && p.abhaId.includes(q))
      );
    });
  }, [effectiveAllFacilities, query, state.currentFacilityId, state.currentRole, state.currentUserId, state.patients, statusFilter]);

  const potentialDuplicatePairs = useMemo(() => {
    const pairs: { a: (typeof state.patients)[0]; b: (typeof state.patients)[0]; reason: string }[] = [];
    for (let i = 0; i < state.patients.length; i++) {
      const rest = state.patients.slice(i + 1);
      const matches = findDuplicatePatients(rest, state.patients[i]);
      for (const m of matches) {
        pairs.push({ a: state.patients[i], b: m.patient, reason: m.reasons.join(', ') });
      }
    }
    return pairs;
  }, [state.patients]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patient Directory & Registration"
        subtitle={`M02 · ${filtered.length} patients shown (${scopeAllFacilities ? 'All Facilities' : currentFacility.shortName})`}
        secondaryActions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDupReview(true)}
              className="px-3 py-1.5 text-xs font-medium text-[#042C53] bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Duplicate Review ({potentialDuplicatePairs.length})
            </button>
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#042C53] bg-white border border-slate-300 hover:bg-slate-50 rounded-md"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              Quick Register
            </button>
          </div>
        }
        primaryAction={
          <button
            type="button"
            data-demo-target="scheduled-registration-btn"
            onClick={() => setShowIntelligentReg(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#042C53] hover:bg-[#185FA5] rounded-md"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Scheduled Registration
          </button>
        }
      />

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
          <input
            type="search"
            aria-label="Filter patient directory"
            placeholder="Search by name, MRN, DOB, phone, or ABHA ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full sm:w-80 px-3 py-1.5 text-xs border border-slate-300 rounded-md"
          />
          <SegmentedTabs
            tabs={[
              { id: 'All', label: 'All' },
              { id: 'Active', label: 'Active' },
              { id: 'Inactive', label: 'Inactive' },
            ]}
            activeId={statusFilter}
            onChange={(id) => setStatusFilter(id as typeof statusFilter)}
          />
        </div>

        {allowAllFacilities ? (
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={scopeAllFacilities}
              onChange={(e) => setScopeAllFacilities(e.target.checked)}
            />
            Show all facilities
          </label>
        ) : (
          <span className="text-[11px] text-[#5F5D56]">
            Scoped to {currentFacility.shortName} ({state.currentRole})
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching patients"
              description="Try clearing filters or register a new synthetic patient."
              action={
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
                >
                  Register Patient
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Patient / MRN</th>
                  <th className="py-2.5 px-3">DOB / Age</th>
                  <th className="py-2.5 px-3">Primary Provider</th>
                  <th className="py-2.5 px-3">Entry Path</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.map((p) => {
                  const prov = state.staff.find((s) => s.id === p.primaryProviderId);
                  const fac = state.facilities.find((f) => f.id === p.facilityId);
                  return (
                    <tr key={p.id} className="hover:bg-[#E6F1FB]/25">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => togglePatientFavourite(p.id)}
                            aria-label={`Toggle favourite for ${p.fullName}`}
                            className="text-[#C97A1B]"
                          >
                            <Star className={`w-3.5 h-3.5 ${p.favourite ? 'fill-[#C97A1B]' : 'opacity-40'}`} />
                          </button>
                          <div>
                            <button
                              type="button"
                              onClick={() => openPatient(p.id, 'overview')}
                              className="font-medium text-[#185FA5] hover:underline text-left"
                            >
                              {p.fullName}
                            </button>
                            <div className="text-[11px] text-[#5F5D56] font-mono">
                              {p.mrn}
                              {p.abhaId ? ` · ABHA ${p.abhaId}` : ''} · {fac?.shortName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                        {p.dob} ({p.age}y {p.sex[0]})
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{prov?.name || 'Unassigned'}</td>
                      <td className="py-2.5 px-3 text-slate-700">{p.entryPath}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={p.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openPatient(p.id, 'overview')}
                          className="px-2.5 py-1 text-xs font-medium text-[#042C53] bg-[#E6F1FB] hover:bg-[#85B7EB]/40 rounded"
                        >
                          Open Chart
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RegisterPatientModal open={showRegister} onClose={() => setShowRegister(false)} />
      <IntelligentRegistrationModal
        open={showIntelligentReg}
        onClose={() => setShowIntelligentReg(false)}
      />

      <Modal
        open={showDupReview}
        onClose={() => setShowDupReview(false)}
        title="Duplicate Patient Review & Merge"
        subtitle="Compare candidate records with matching demographics before merging"
      >
        {potentialDuplicatePairs.length === 0 ? (
          <EmptyState
            title="No duplicate candidates detected"
            description="Registering a patient with an existing name and DOB will trigger candidate review here."
          />
        ) : (
          <div className="space-y-3">
            {potentialDuplicatePairs.map((pair) => (
              <div
                key={`${pair.a.id}-${pair.b.id}`}
                className="p-3 border border-slate-200 rounded-md flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-semibold text-[#042C53]">
                    {pair.a.fullName} ({pair.a.mrn}) ↔ {pair.b.fullName} ({pair.b.mrn})
                  </div>
                  <div className="text-[#5F5D56] mt-0.5">Match basis: {pair.reason}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    mergeDuplicatePatient(pair.a.id, pair.b.id);
                    setShowDupReview(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md shrink-0"
                >
                  Merge into {pair.a.mrn}
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
