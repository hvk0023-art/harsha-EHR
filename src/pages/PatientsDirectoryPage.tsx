import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, ShieldCheck, Star, UserPlus } from 'lucide-react';
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

function patientInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
}

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
    <div className="space-y-5">
      <PageHeader
        title="Patient Directory & Registration"
        subtitle={`${filtered.length} patient${filtered.length === 1 ? '' : 's'} shown · ${scopeAllFacilities ? 'All Facilities' : currentFacility.name}`}
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDupReview(true)}
              className="eigen-btn-secondary px-3 py-2 text-xs"
            >
              Duplicate Review ({potentialDuplicatePairs.length})
            </button>
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="eigen-btn-secondary px-3 py-2 text-xs"
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
            className="eigen-btn-navy px-4 py-2 text-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#85B7EB]" />
            Scheduled Registration
          </button>
        }
      />

      {/* Search & Filters */}
      <div className="eigen-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
          <div className="relative w-full sm:w-88">
            <Search className="w-3.5 h-3.5 text-[#5F5D56] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Filter patient directory"
              placeholder="Search by name, MRN, DOB, phone, or ABHA ID..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs eigen-input"
            />
          </div>
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
          <label className="flex items-center gap-2 text-xs font-medium text-[#042C53] cursor-pointer px-2">
            <input
              type="checkbox"
              checked={scopeAllFacilities}
              onChange={(e) => setScopeAllFacilities(e.target.checked)}
              className="rounded border-[#042C53]/25 text-[#185FA5]"
            />
            Show all facilities
          </label>
        ) : (
          <span className="text-[11px] text-[#5F5D56] bg-[#F8F8F5] border border-[#042C53]/[0.07] rounded-full px-3 py-1">
            Scoped to {currentFacility.shortName} ({state.currentRole})
          </span>
        )}
      </div>

      {/* Table */}
      <div className="eigen-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching patients"
              description="Try clearing search filters or register a new synthetic patient."
              action={
                <button
                  type="button"
                  onClick={() => setShowRegister(true)}
                  className="eigen-btn-primary px-4 py-2 text-xs"
                >
                  Register Patient
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="eigen-table-head">
                <tr>
                  <th className="py-3 px-4">Patient / MRN</th>
                  <th className="py-3 px-3">DOB / Age</th>
                  <th className="py-3 px-3">Primary Provider</th>
                  <th className="py-3 px-3">Entry Path</th>
                  <th className="py-3 px-3">Registration / Status</th>
                  <th className="py-3 px-4 text-right">Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#042C53]/[0.055] text-xs">
                {filtered.map((p) => {
                  const prov = state.staff.find((s) => s.id === p.primaryProviderId);
                  const fac = state.facilities.find((f) => f.id === p.facilityId);
                  return (
                    <tr key={p.id} className="hover:bg-[#E6F1FB]/28 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => togglePatientFavourite(p.id)}
                            aria-label={`Toggle favourite for ${p.fullName}`}
                            className="p-1 text-[#C97A1B] hover:bg-[#FEF5E7] rounded-lg transition-colors"
                          >
                            <Star className={`w-3.5 h-3.5 ${p.favourite ? 'fill-[#C97A1B]' : 'opacity-35'}`} />
                          </button>
                          <div
                            aria-hidden="true"
                            className="w-8 h-8 rounded-full bg-[#E6F1FB] text-[#042C53] text-[11px] font-semibold flex items-center justify-center shrink-0"
                          >
                            {patientInitials(p.fullName)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openPatient(p.id, 'overview')}
                              className="font-semibold text-[#042C53] hover:text-[#185FA5] hover:underline underline-offset-2 text-left transition-colors"
                            >
                              {p.fullName}
                            </button>
                            <div className="text-[11px] text-[#5F5D56] font-mono tabular-nums mt-0.5">
                              {p.mrn}
                              {p.abhaId ? ` · ABHA ${p.abhaId}` : ''} · {fac?.shortName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {p.dob} <span className="text-[#5F5D56]">({p.age}y {p.sex[0]})</span>
                      </td>
                      <td className="py-3.5 px-3 text-slate-800">{prov?.name || 'Unassigned'}</td>
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#F8F8F5] border border-[#042C53]/[0.07] text-[11px] text-[#444441] font-medium">
                          {p.entryPath}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge label={p.status} />
                          {p.registrationStatus && p.registrationStatus !== 'Verified & Ready' && (
                            <StatusBadge label={p.registrationStatus} tone="warning" />
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openPatient(p.id, 'overview')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#042C53] bg-[#E6F1FB] hover:bg-[#185FA5] hover:text-white rounded-lg transition-colors"
                        >
                          Open Chart
                          <ArrowUpRight className="w-3.5 h-3.5" />
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
                className="p-3.5 eigen-card-subtle flex items-center justify-between gap-3 text-xs"
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
                  className="eigen-btn-primary px-3 py-1.5 text-xs shrink-0"
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
