import React, { useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, RefreshCw } from 'lucide-react';
import { computeInvoiceTotals, formatCurrency } from '../state/domainLogic';
import { useAppState } from '../state/AppStateContext';
import {
  EmptyState,
  MetricTile,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const BillingPage: React.FC = () => {
  const {
    state,
    currentFacility,
    submitOrUpdateClaim,
    createClaimFromEncounter,
    collectInvoicePayment,
    runEligibilityCheck,
    openPatient,
  } = useAppState();

  const [tab, setTab] = useState<'claims' | 'invoices' | 'eligibility' | 'charge-capture'>('claims');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEncId, setSelectedEncId] = useState(state.encounters[0]?.id || '');
  const [cptInput, setCptInput] = useState('99214, 80053');
  const [chargeAmt, setChargeAmt] = useState('285');
  const [appealTargetId, setAppealTargetId] = useState<string | null>(null);
  const [appealNote, setAppealNote] = useState('');

  const scopedClaims = useMemo(
    () =>
      state.claims.filter(
        (c) =>
          c.facilityId === state.currentFacilityId &&
          (statusFilter === 'all' || c.status === statusFilter)
      ),
    [state.claims, state.currentFacilityId, statusFilter]
  );

  const scopedInvoices = useMemo(
    () => state.invoices.filter((i) => i.facilityId === state.currentFacilityId),
    [state.currentFacilityId, state.invoices]
  );

  const totalCharges = scopedClaims
    .filter((c) => !c.isSecondary)
    .reduce((s, c) => s + c.chargeAmount, 0);
  const totalPaid = scopedClaims.reduce((s, c) => s + c.paidAmount, 0);
  const exceptionsCount = scopedClaims.filter(
    (c) => c.status === 'Rejected' || c.status === 'Denied'
  ).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing, Eligibility & Revenue Cycle"
        subtitle={`M24 Insurance & Auth · M25 Claims, Invoices & Payments (${currentFacility.shortName}) · Simulated RCM only`}
        primaryAction={
          <button
            type="button"
            onClick={() => setTab('charge-capture')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            New Charge / Claim
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricTile
          label="Facility Charges (Primary)"
          value={formatCurrency(totalCharges, currentFacility.currency)}
          detail={`${scopedClaims.filter((c) => !c.isSecondary).length} primary claims`}
        />
        <MetricTile
          label="Remitted Payments"
          value={formatCurrency(totalPaid, currentFacility.currency)}
          tone="success"
        />
        <MetricTile
          label="Rejections & Denials"
          value={exceptionsCount}
          tone={exceptionsCount > 0 ? 'danger' : 'default'}
          detail="Requires coding/appeal"
        />
        <MetricTile
          label="Open Patient Invoices"
          value={scopedInvoices.filter((i) => i.status !== 'Paid').length}
          detail="See D05 inside Patient Account"
        />
      </div>

      <SegmentedTabs
        tabs={[
          { id: 'claims', label: 'Claims & Denials', count: scopedClaims.length },
          { id: 'invoices', label: 'Invoices & Payments', count: scopedInvoices.length },
          { id: 'eligibility', label: 'Eligibility & Prior Auth (M24)', count: state.policies.length },
          { id: 'charge-capture', label: 'Charge Capture & Coding' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {tab === 'claims' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Filter claims by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="Validated">Validated</option>
              <option value="Submitted">Submitted</option>
              <option value="Paid">Paid</option>
              <option value="Rejected">Rejected</option>
              <option value="Denied">Denied</option>
              <option value="Appealed">Appealed</option>
            </select>
            <span className="text-[11px] text-[#5F5D56]">
              Simulated claim submission never transmits to an external clearinghouse.
            </span>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {scopedClaims.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No claims match filter" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                    <tr>
                      <th className="py-2.5 px-3">Claim #</th>
                      <th className="py-2.5 px-3">Patient & DOS</th>
                      <th className="py-2.5 px-3">Payer & CPTs</th>
                      <th className="py-2.5 px-3 text-right">Charges</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Workflow Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scopedClaims.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#042C53]">
                          {c.claimNumber}
                          {c.isSecondary && <div className="text-[10px] text-[#5F5D56]">Secondary</div>}
                        </td>
                        <td className="py-2.5 px-3">
                          <PatientLink patientId={c.patientId} tab="account" />
                          <div className="text-[11px] font-mono text-[#5F5D56]">{c.serviceDate}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{c.payerName}</div>
                          <div className="text-[11px] font-mono text-[#5F5D56]">{c.cptCodes.join(', ')}</div>
                          {c.denialReason && (
                            <div className="text-[11px] text-[#B4321F] mt-0.5">{c.denialReason}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(c.chargeAmount, currentFacility.currency)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(c.paidAmount, currentFacility.currency)}
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge label={c.status} />
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                          {(c.status === 'Draft' || c.status === 'Validated') && (
                            <button
                              type="button"
                              onClick={() => submitOrUpdateClaim(c.id, 'Submitted')}
                              className="px-2 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                            >
                              Submit (Sim)
                            </button>
                          )}
                          {(c.status === 'Submitted' || c.status === 'Appealed') && (
                            <button
                              type="button"
                              onClick={() => submitOrUpdateClaim(c.id, 'Paid')}
                              className="px-2 py-1 text-[11px] font-medium bg-[#0F6E50] text-white rounded"
                            >
                              Post Payment
                            </button>
                          )}
                          {(c.status === 'Rejected' || c.status === 'Denied') && (
                            <button
                              type="button"
                              onClick={() => {
                                setAppealTargetId(c.id);
                                setAppealNote('Corrected modifier / attached clinical notes.');
                              }}
                              className="px-2 py-1 text-[11px] font-medium border border-[#C97A1B] text-[#9A5B10] rounded hover:bg-amber-50"
                            >
                              Appeal / Resubmit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
              <tr>
                <th className="py-2.5 px-3">Invoice #</th>
                <th className="py-2.5 px-3">Patient</th>
                <th className="py-2.5 px-3 text-right">Patient Total</th>
                <th className="py-2.5 px-3 text-right">Amount Due</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scopedInvoices.map((inv) => {
                const totals = computeInvoiceTotals(inv);
                return (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#042C53]">{inv.invoiceNumber}</td>
                    <td className="py-2.5 px-3">
                      <PatientLink patientId={inv.patientId} tab="account" showMrn />
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatCurrency(totals.patientTotal, currentFacility.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                      {formatCurrency(totals.amountDue, currentFacility.currency)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={inv.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openPatient(inv.patientId, 'account')}
                        className="text-[#185FA5] hover:underline font-medium"
                      >
                        Open D05 Invoice
                      </button>
                      {totals.amountDue > 0 && (
                        <button
                          type="button"
                          onClick={() => collectInvoicePayment(inv.id, totals.amountDue, 'Simulated Card •••• 4242')}
                          className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                        >
                          Simulate Full Payment
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'eligibility' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.policies.map((pol) => (
            <div key={pol.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <PatientLink patientId={pol.patientId} tab="account" showMrn />
                  <div className="font-semibold text-[#042C53] mt-0.5">{pol.payerName}</div>
                  <div className="text-[11px] font-mono text-[#5F5D56]">
                    Member: {pol.memberId} · Group: {pol.groupNumber}
                  </div>
                </div>
                <StatusBadge label={pol.status} />
              </div>
              <div className="p-2.5 bg-[#F7F7F5] rounded text-[11px] space-y-1">
                <div>Last Checked: {pol.eligibilityCheckedAt}</div>
                <div>Deductible Met: ${pol.eligibilitySummary.deductibleMet} / ${pol.eligibilitySummary.deductibleTotal}</div>
                <div className="text-[#5F5D56]">Eligibility confirmation does not guarantee payment.</div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => openPatient(pol.patientId, 'account')}
                  className="text-[#185FA5] hover:underline font-medium"
                >
                  Open Full Eligibility (D06)
                </button>
                <button
                  type="button"
                  onClick={() => runEligibilityCheck(pol.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-check (Sim)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'charge-capture' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-xl space-y-3">
          <h2 className="text-sm font-semibold text-[#042C53]">Create Claim from Encounter</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const enc = state.encounters.find((x) => x.id === selectedEncId);
              if (!enc) return;
              const codes = cptInput.split(',').map((s) => s.trim()).filter(Boolean);
              const amt = Number(chargeAmt) || 250;
              createClaimFromEncounter(enc.patientId, enc.id, codes, amt);
              setTab('claims');
            }}
            className="space-y-3 text-xs"
          >
            <div>
              <label htmlFor="cc-enc" className="block font-medium text-[#042C53] mb-1">
                Encounter
              </label>
              <select
                id="cc-enc"
                value={selectedEncId}
                onChange={(e) => setSelectedEncId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white"
              >
                {state.encounters.map((enc) => {
                  const pat = state.patients.find((p) => p.id === enc.patientId);
                  return (
                    <option key={enc.id} value={enc.id}>
                      {pat?.fullName} — {enc.date} ({enc.type})
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cc-cpt" className="block font-medium text-[#042C53] mb-1">
                  CPT / HCPCS Codes
                </label>
                <input
                  id="cc-cpt"
                  type="text"
                  value={cptInput}
                  onChange={(e) => setCptInput(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label htmlFor="cc-amt" className="block font-medium text-[#042C53] mb-1">
                  Charge Amount ({currentFacility.currency})
                </label>
                <input
                  id="cc-amt"
                  type="number"
                  min={1}
                  value={chargeAmt}
                  onChange={(e) => setChargeAmt(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium text-white bg-[#185FA5] rounded-md"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Validate & Stage Claim
            </button>
          </form>
        </div>
      )}

      <Modal open={Boolean(appealTargetId)} onClose={() => setAppealTargetId(null)} title="Appeal / Resubmit Claim (Sim)">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (appealTargetId) {
              submitOrUpdateClaim(appealTargetId, 'Appealed', appealNote);
              setAppealTargetId(null);
            }
          }}
          className="space-y-3 text-xs"
        >
          <label htmlFor="ap-note" className="block font-medium text-[#042C53]">
            Appeal / Correction Rationale
          </label>
          <textarea
            id="ap-note"
            rows={3}
            required
            value={appealNote}
            onChange={(e) => setAppealNote(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAppealTargetId(null)} className="px-3 py-1.5 border border-slate-300 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded-md">
              Submit Appeal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
