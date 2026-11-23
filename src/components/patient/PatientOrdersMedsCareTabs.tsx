import React, { useState } from 'react';
import { AlertTriangle, Check, FlaskConical, Plus, Scan } from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { useAppState } from '../../state/AppStateContext';
import { checkMedicationAllergyConflict } from '../../state/domainLogic';
import { canOrderOrPrescribe } from '../../state/permissions';
import type { Patient, ReferralStatus } from '../../types/hms';
import { SimpleLineChart } from '../ui/Charts';
import {
  EmptyState,
  Modal,
  SegmentedTabs,
  StatusBadge,
} from '../ui/Primitives';

const ORDER_CATALOGUE = [
  { name: 'Comprehensive Metabolic Panel (CMP)', code: '80053', category: 'Lab' as const },
  { name: 'Potassium (Serum)', code: '84132', category: 'Lab' as const },
  { name: 'Urine Albumin-to-Creatinine Ratio', code: '82043', category: 'Lab' as const },
  { name: 'PT / INR Coagulation Panel', code: '85610', category: 'Lab' as const },
  { name: 'Chest X-Ray (PA & Lateral)', code: '71046', category: 'Imaging' as const },
  { name: 'Renal Ultrasound Bilateral', code: '76770', category: 'Imaging' as const },
];

export const PatientMedicationsTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    addMedication,
    approveMedication,
    requestMedicationRefill,
    reconcileMedication,
  } = useAppState();

  const [showNewRx, setShowNewRx] = useState(false);
  const [rxName, setRxName] = useState('Amlodipine Besylate');
  const [rxDose, setRxDose] = useState('5 mg');
  const [rxFreq, setRxFreq] = useState('Once daily');
  const [rxPharmacy, setRxPharmacy] = useState('CVS Boylston #0412');
  const [rxControlled, setRxControlled] = useState(false);
  const [rxAsDraft, setRxAsDraft] = useState(true);
  const allergyCheck = checkMedicationAllergyConflict(patient, rxName);
  const canPrescribe = canOrderOrPrescribe(state.currentRole);

  const meds = state.medications.filter((m) => m.patientId === patient.id);

  return (
    <div className="space-y-4 text-xs">
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-[#042C53]">Medications & Prescribing (M10)</span>
          <span className="ml-2 text-[#5F5D56]">
            Synthetic medication records · No external e-prescribing transmission · Safety notes are illustrative only
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowNewRx(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-[#185FA5] rounded-md"
        >
          <Plus className="w-3.5 h-3.5" />
          New Prescription Draft
        </button>
      </div>

      {patient.allergies.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-[#B4321F]">
          <strong>Documented Allergies:</strong>{' '}
          {patient.allergies.map((a) => `${a.substance} (${a.reaction})`).join('; ')}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {meds.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No medications on file" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Medication & Dose</th>
                  <th className="py-2.5 px-3">Pharmacy & Formulary</th>
                  <th className="py-2.5 px-3">Reconciliation</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {meds.map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#042C53]">
                        {m.name} {m.dose}
                      </div>
                      <div className="text-[11px] text-[#5F5D56]">
                        {m.route} · {m.frequency} · Refills: {m.refillsRemaining}
                      </div>
                      {m.safetyNote && (
                        <div className="text-[11px] text-[#9A5B10] mt-0.5">{m.safetyNote}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{m.pharmacy}</div>
                      <div className="text-[11px] text-[#5F5D56]">{m.formularyStatus}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {m.reconciled ? (
                        <StatusBadge label="Reconciled" tone="success" />
                      ) : (
                        <button
                          type="button"
                          data-demo-target="reconcile-med-btn"
                          onClick={() => reconcileMedication(m.id)}
                          className="px-2 py-1 text-[11px] font-medium bg-amber-50 border border-amber-300 text-[#9A5B10] rounded"
                        >
                          Mark Reconciled
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={m.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-1.5">
                      {m.status === 'Draft' && canPrescribe && (
                        <button
                          type="button"
                          onClick={() => approveMedication(m.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded hover:bg-[#042C53]"
                        >
                          <Check className="w-3 h-3" />
                          Approve (Sim)
                        </button>
                      )}
                      {m.status === 'Active' && (
                        <button
                          type="button"
                          onClick={() => requestMedicationRefill(m.id)}
                          className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 rounded hover:bg-slate-50"
                        >
                          Request Refill (Sim)
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

      <Modal
        open={showNewRx}
        onClose={() => setShowNewRx(false)}
        title="New Prescription Draft (Simulated)"
        subtitle="Does not transmit electronically; controlled medications cannot be authorised here"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!rxName.trim()) return;
            addMedication({
              patientId: patient.id,
              name: rxName.trim(),
              dose: rxDose.trim(),
              route: 'Oral',
              frequency: rxFreq.trim(),
              status: rxAsDraft ? 'Draft' : 'Active',
              prescriberId: state.currentUserId,
              pharmacy: rxPharmacy,
              formularyStatus: 'Tier 1 Preferred',
              controlled: rxControlled,
              reconciled: true,
              startDate: TODAY_DATE,
              refillsRemaining: rxControlled ? 0 : 3,
              safetyNote: rxControlled
                ? 'Controlled medication workflow simulated only — EPCS transmission disabled.'
                : undefined,
            });
            setShowNewRx(false);
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rx-name" className="block font-medium text-[#042C53] mb-1">Medication Name *</label>
              <input id="rx-name" type="text" required value={rxName} onChange={(e) => setRxName(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
            </div>
            <div>
              <label htmlFor="rx-dose" className="block font-medium text-[#042C53] mb-1">Dose *</label>
              <input id="rx-dose" type="text" required value={rxDose} onChange={(e) => setRxDose(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
            </div>
            <div>
              <label htmlFor="rx-freq" className="block font-medium text-[#042C53] mb-1">Frequency</label>
              <input id="rx-freq" type="text" value={rxFreq} onChange={(e) => setRxFreq(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
            </div>
            <div>
              <label htmlFor="rx-pharm" className="block font-medium text-[#042C53] mb-1">Pharmacy Directory</label>
              <select id="rx-pharm" value={rxPharmacy} onChange={(e) => setRxPharmacy(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white">
                <option value="CVS Boylston #0412">CVS Boylston #0412</option>
                <option value="Walgreens Back Bay">Walgreens Back Bay</option>
                <option value="Pacific Renal Pharmacy">Pacific Renal Pharmacy</option>
              </select>
            </div>
          </div>
          {allergyCheck.hasConflict && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded text-[#B4321F] flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Potential allergy conflict with documented <strong>{allergyCheck.matchedAllergy}</strong>
                {allergyCheck.reaction ? ` (${allergyCheck.reaction})` : ''}. Clinician verification required.
              </span>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rxControlled} onChange={(e) => setRxControlled(e.target.checked)} />
            Controlled Substance Simulation (EPCS transmission unavailable)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={rxAsDraft} onChange={(e) => setRxAsDraft(e.target.checked)} />
            Save as Draft (requires clinician review)
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setShowNewRx(false)} className="px-3 py-1.5 border border-slate-300 rounded">Cancel</button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded">Save Prescription</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const PatientOrdersResultsTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    createOrder,
    updateOrderStatus,
    simulateLabResult,
    acknowledgeLabResult,
    correctLabResult,
  } = useAppState();

  const [subTab, setSubTab] = useState<'orders' | 'labs' | 'imaging'>('orders');
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [selectedCatalogueIdx, setSelectedCatalogueIdx] = useState(0);
  const [orderPriority, setOrderPriority] = useState<'Routine' | 'Urgent' | 'STAT'>('Routine');
  const [orderAsDraft, setOrderAsDraft] = useState(true);
  const [showMockPacs, setShowMockPacs] = useState<string | null>(null);
  const [correctTarget, setCorrectTarget] = useState<string | null>(null);
  const [correctVal, setCorrectVal] = useState('');
  const [correctNote, setCorrectNote] = useState('');
  const [customLabValue, setCustomLabValue] = useState('4.6');

  const orders = state.orders.filter((o) => o.patientId === patient.id);
  const labs = state.labResults.filter((l) => l.patientId === patient.id);
  const imaging = state.imagingReports.filter((i) => i.patientId === patient.id);
  const egfrPoints = labs
    .filter((l) => l.testName.toLowerCase().includes('egfr') && typeof l.numericValue === 'number')
    .slice()
    .reverse()
    .map((l) => ({ label: l.collectionDate.slice(5), value: l.numericValue! }));

  const pacsStudy = imaging.find((i) => i.id === showMockPacs);

  return (
    <div data-demo-target="orders-results-panel" className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          tabs={[
            { id: 'orders', label: 'Orders & Requisitions (M09)', count: orders.length },
            { id: 'labs', label: 'Lab Results & Trends (M11)', count: labs.length },
            { id: 'imaging', label: 'Imaging & Viewer (M12)', count: imaging.length },
          ]}
          activeId={subTab}
          onChange={(id) => setSubTab(id as typeof subTab)}
        />
        <button
          type="button"
          onClick={() => setShowNewOrder(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-white bg-[#185FA5] rounded-md"
        >
          <Plus className="w-3.5 h-3.5" />
          New Order
        </button>
      </div>

      {/* M09 Orders & Requisitions */}
      {subTab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No orders placed for this patient" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                  <tr>
                    <th className="py-2.5 px-3">Requisition ID</th>
                    <th className="py-2.5 px-3">Order & Code</th>
                    <th className="py-2.5 px-3">Category & Priority</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Lifecycle Simulation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[#042C53]">
                        {o.requisitionId}
                        <div className="text-[11px] font-normal text-[#5F5D56]">{o.createdAt}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-[#042C53]">{o.name}</div>
                        <div className="text-[11px] font-mono text-[#5F5D56]">CPT/LOINC {o.code}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        {o.category} · <StatusBadge label={o.priority} />
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={o.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                        {o.status === 'Draft' && (
                          <button
                            type="button"
                            onClick={() => updateOrderStatus(o.id, 'Ordered')}
                            className="px-2 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                          >
                            Approve & Order
                          </button>
                        )}
                        {o.status === 'Ordered' && o.category === 'Lab' && (
                          <button
                            type="button"
                            data-demo-target="lab-collect-btn"
                            onClick={() => updateOrderStatus(o.id, 'Specimen Collected')}
                            className="px-2 py-1 text-[11px] font-medium border border-slate-300 rounded hover:bg-slate-50"
                          >
                            Collect Specimen
                          </button>
                        )}
                        {(o.status === 'Specimen Collected' || o.status === 'Ordered') && o.category === 'Lab' && (
                          <span className="inline-flex items-center gap-1">
                            <input
                              id={`lab-val-${o.id}`}
                              data-demo-target="lab-result-value-input"
                              aria-label={`Synthetic result value for ${o.name}`}
                              type="text"
                              value={customLabValue}
                              onChange={(e) => setCustomLabValue(e.target.value)}
                              className="w-14 px-1.5 py-1 text-[11px] font-mono border border-slate-300 rounded bg-white text-[#042C53]"
                            />
                            <button
                              type="button"
                              data-demo-target="lab-post-result-btn"
                              onClick={() => {
                                const valStr = customLabValue.trim() || (o.name.toLowerCase().includes('potassium') ? '4.6' : '6.8');
                                const num = Number(valStr);
                                const isK = o.name.toLowerCase().includes('potassium') || o.name.toLowerCase().includes('renal');
                                const flag = isK
                                  ? num >= 6.0 || num <= 2.9
                                    ? 'Critical'
                                    : num > 5.1 || num < 3.5
                                    ? 'Abnormal'
                                    : 'Normal'
                                  : num >= 7.0
                                  ? 'Abnormal'
                                  : 'Normal';
                                simulateLabResult(
                                  o.id,
                                  valStr,
                                  Number.isFinite(num) ? num : undefined,
                                  isK ? 'mmol/L' : '%',
                                  isK ? '3.5–5.1' : '< 7.0',
                                  flag
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#0F6E50] hover:bg-[#042C53] text-white rounded"
                            >
                              <FlaskConical className="w-3 h-3" />
                              Post Result
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* M11 Lab Results & Trends */}
      {subTab === 'labs' && (
        <div className="space-y-4">
          {egfrPoints.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-[#042C53] mb-2">Longitudinal eGFR Trend</div>
              <SimpleLineChart points={egfrPoints} unit="mL/min" referenceMin={60} referenceMax={90} />
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {labs.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No lab results yet" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                    <tr>
                      <th className="py-2.5 px-3">Test & Collection Date</th>
                      <th className="py-2.5 px-3">Result & Units</th>
                      <th className="py-2.5 px-3">Reference Interval</th>
                      <th className="py-2.5 px-3">Flag</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {labs.map((l) => (
                      <tr key={l.id} className={l.flag === 'Critical' ? 'bg-red-50/40' : ''}>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-[#042C53]">{l.testName}</div>
                          <div className="text-[11px] font-mono text-[#5F5D56]">{l.collectionDate}</div>
                          {l.priorVersions && l.priorVersions.length > 0 && (
                            <div className="text-[11px] text-[#9A5B10]">
                              Prior v{l.priorVersions[0].version}: {l.priorVersions[0].value} ({l.priorVersions[0].note})
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold tabular-nums">
                          {l.value} {l.unit}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#5F5D56]">{l.referenceInterval}</td>
                        <td className="py-2.5 px-3"><StatusBadge label={l.flag} /></td>
                        <td className="py-2.5 px-3"><StatusBadge label={l.status} /></td>
                        <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap">
                          {l.status !== 'Reviewed' && (
                            <button
                              type="button"
                              data-demo-target="lab-ack-btn"
                              onClick={() => acknowledgeLabResult(l.id, true)}
                              className="px-2 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                            >
                              Acknowledge + Task
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCorrectTarget(l.id);
                              setCorrectVal(l.value);
                              setCorrectNote('Corrected unit/dilution verification');
                            }}
                            className="px-2 py-1 text-[11px] border border-slate-300 rounded"
                          >
                            Correct
                          </button>
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

      {/* M12 Imaging Reports & Mock Viewer */}
      {subTab === 'imaging' && (
        <div className="space-y-3">
          {imaging.length === 0 ? (
            <EmptyState title="No imaging studies recorded" />
          ) : (
            imaging.map((img) => (
              <div key={img.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[#042C53]">
                      {img.studyName} ({img.modality})
                    </div>
                    <div className="text-[11px] text-[#5F5D56] font-mono">
                      {img.performedAt} · {img.radiologist}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={img.status} />
                    <button
                      type="button"
                      onClick={() => setShowMockPacs(img.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[#042C53] text-white rounded"
                    >
                      <Scan className="w-3.5 h-3.5" />
                      Sample Diagram Viewer
                    </button>
                  </div>
                </div>
                <div className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
                  <div><strong>Findings:</strong> {img.findings}</div>
                  <div><strong>Impression:</strong> {img.impression}</div>
                  <div className="text-[#5F5D56]"><strong>Prior Comparison:</strong> {img.priorComparison}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* New Order Modal */}
      <Modal open={showNewOrder} onClose={() => setShowNewOrder(false)} title="New Clinical Order">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const item = ORDER_CATALOGUE[selectedCatalogueIdx];
            createOrder({
              patientId: patient.id,
              orderedById: state.currentUserId,
              facilityId: patient.facilityId,
              category: item.category,
              name: item.name,
              code: item.code,
              priority: orderPriority,
              status: orderAsDraft ? 'Draft' : 'Ordered',
              createdAt: TODAY_DATE,
            });
            setShowNewOrder(false);
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="ord-cat" className="block font-medium text-[#042C53] mb-1">Order Catalogue</label>
            <select
              id="ord-cat"
              value={selectedCatalogueIdx}
              onChange={(e) => setSelectedCatalogueIdx(Number(e.target.value))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
            >
              {ORDER_CATALOGUE.map((c, idx) => (
                <option key={c.code} value={idx}>
                  [{c.category}] {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ord-pri" className="block font-medium text-[#042C53] mb-1">Priority</label>
            <select
              id="ord-pri"
              value={orderPriority}
              onChange={(e) => setOrderPriority(e.target.value as typeof orderPriority)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="Routine">Routine</option>
              <option value="Urgent">Urgent</option>
              <option value="STAT">STAT</option>
            </select>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={orderAsDraft} onChange={(e) => setOrderAsDraft(e.target.checked)} />
            Save as Draft before approving
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewOrder(false)} className="px-3 py-1.5 border border-slate-300 rounded">Cancel</button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded">Save Order</button>
          </div>
        </form>
      </Modal>

      {/* Mock PACS Diagram Viewer */}
      <Modal
        open={Boolean(pacsStudy)}
        onClose={() => setShowMockPacs(null)}
        title={`Sample Study Diagram — ${pacsStudy?.studyName || ''}`}
        subtitle="Illustrative prototype diagram only — NOT a connected diagnostic PACS"
      >
        {pacsStudy && (
          <div className="space-y-3">
            <div className="bg-[#042C53] text-white p-6 rounded-lg flex flex-col items-center justify-center gap-3">
              <svg viewBox="0 0 280 120" className="w-full max-w-xs h-auto" aria-label="Sample schematic imaging diagram">
                <rect x="10" y="10" width="260" height="100" rx="8" fill="#0B3B6B" stroke="#378ADD" />
                <ellipse cx="95" cy="60" rx="32" ry="22" fill="none" stroke="#85B7EB" strokeWidth="2" />
                <ellipse cx="185" cy="60" rx="30" ry="21" fill="none" stroke="#85B7EB" strokeWidth="2" />
                <text x="140" y="100" textAnchor="middle" fill="#85B7EB" fontSize="9">
                  PROTOTYPE SCHEMATIC VIEW — NOT FOR DIAGNOSTIC USE
                </text>
              </svg>
              <div className="text-[11px] text-slate-300 font-mono">
                Modality: {pacsStudy.modality} · {pacsStudy.performedAt}
              </div>
            </div>
            <div className="text-xs text-slate-700">
              <strong>Prior Comparison:</strong> {pacsStudy.priorComparison}
            </div>
          </div>
        )}
      </Modal>

      {/* Corrected Lab Report Modal */}
      <Modal open={Boolean(correctTarget)} onClose={() => setCorrectTarget(null)} title="Issue Corrected Lab Report">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (correctTarget && correctVal.trim()) {
              correctLabResult(correctTarget, correctVal.trim(), correctNote.trim());
              setCorrectTarget(null);
            }
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="cor-v" className="block font-medium text-[#042C53] mb-1">Corrected Value</label>
            <input id="cor-v" type="text" required value={correctVal} onChange={(e) => setCorrectVal(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono" />
          </div>
          <div>
            <label htmlFor="cor-n" className="block font-medium text-[#042C53] mb-1">Correction Note</label>
            <input id="cor-n" type="text" required value={correctNote} onChange={(e) => setCorrectNote(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCorrectTarget(null)} className="px-3 py-1.5 border border-slate-300 rounded">Cancel</button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded">Save Correction</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const PatientCarePlanTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    advanceReferralStatus,
    createFollowUpPlan,
    bookAppointment,
    logSimulatedReminder,
  } = useAppState();
  const carePlans = state.carePlans.filter((cp) => cp.patientId === patient.id);
  const referrals = state.referrals.filter((r) => r.patientId === patient.id);
  const followUpPlans = (state.followUpPlans || []).filter((fp) => fp.patientId === patient.id);

  const [interval, setIntervalVal] = useState('2 weeks');
  const [instructions, setInstructions] = useState(
    'Complete scheduled lab panel and bring home BP log to follow-up appointment.'
  );
  const [channel, setChannel] = useState<'Simulated SMS' | 'Simulated Email' | 'Simulated Portal Notice'>('Simulated SMS');

  return (
    <div data-demo-target="care-plan-followup-panel" className="space-y-5 text-xs">
      {/* Structured Follow-Up Plans & Simulated Reminder Loop */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <h2 className="text-sm font-semibold text-[#042C53]">Follow-Up Plans & Simulated Reminders</h2>
            <p className="text-[11px] text-[#5F5D56]">
              Book follow-up visits and log simulated reminders locally (labeled &ldquo;Simulated Logged&rdquo; — no external SMS/email delivered).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-2.5">
            {followUpPlans.length === 0 ? (
              <EmptyState title="No follow-up plans recorded yet" description="Create a structured follow-up plan on the right." />
            ) : (
              followUpPlans.map((fp) => {
                const linkedAppt = state.appointments.find((a) => a.id === fp.linkedAppointmentId);
                return (
                  <div key={fp.id} className="p-3 bg-[#F7F7F5] border border-slate-200 rounded-md space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[#042C53]">
                        Follow-Up Interval: {fp.interval} · Created <span className="font-mono">{fp.createdAt}</span>
                      </div>
                      <StatusBadge
                        label={`Reminder: ${fp.reminderStatus}`}
                        tone={fp.reminderStatus === 'Simulated Logged' ? 'success' : 'warning'}
                      />
                    </div>
                    <p className="text-slate-700">{fp.instructions}</p>
                    {linkedAppt && (
                      <div className="text-[11px] font-mono text-[#0F6E50]">
                        Linked Visit: {linkedAppt.date} {linkedAppt.startTime} ({linkedAppt.status})
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {!linkedAppt && (
                        <button
                          type="button"
                          onClick={() => {
                            bookAppointment({
                              patientId: patient.id,
                              providerId: patient.primaryProviderId,
                              facilityId: patient.facilityId,
                              date: '2026-12-02',
                              startTime: '11:30',
                              durationMin: 30,
                              type: `${fp.interval} Follow-Up Visit`,
                              subtype: 'Scheduled Visit',
                              status: 'Scheduled',
                              room: 'Exam 3',
                              reason: fp.instructions,
                              reminderSent: false,
                              reminderStatus: 'Not Sent',
                              calendarSynced: true,
                              coPayAmount: 25,
                              coPayCollected: false,
                            });
                          }}
                          className="px-2.5 py-1 bg-[#185FA5] text-white text-[11px] font-medium rounded"
                        >
                          Book Follow-Up Slot
                        </button>
                      )}
                      {fp.reminderStatus !== 'Simulated Logged' && (
                        <button
                          type="button"
                          onClick={() =>
                            logSimulatedReminder({
                              followUpPlanId: fp.id,
                              appointmentId: fp.linkedAppointmentId,
                              patientId: patient.id,
                              channel: fp.reminderChannel,
                              message: `Reminder for ${patient.fullName}: ${fp.interval} follow-up — ${fp.instructions}`,
                            })
                          }
                          className="px-2.5 py-1 border border-[#185FA5] text-[#185FA5] text-[11px] font-medium rounded hover:bg-[#E6F1FB]"
                        >
                          Log Simulated Reminder
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!interval.trim()) return;
              createFollowUpPlan({
                patientId: patient.id,
                providerId: state.currentUserId,
                facilityId: patient.facilityId,
                interval: interval.trim(),
                instructions: instructions.trim(),
                reminderChannel: channel,
                reminderStatus: 'Not Scheduled',
              });
            }}
            className="p-3 bg-[#F7F7F5] border border-slate-200 rounded-md space-y-2.5"
          >
            <div className="font-semibold text-[#042C53]">Create Follow-Up Plan</div>
            <div>
              <label htmlFor="fp-int" className="block text-[11px] font-medium text-[#042C53] mb-1">
                Interval
              </label>
              <select
                id="fp-int"
                value={interval}
                onChange={(e) => setIntervalVal(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="1 week">1 week</option>
                <option value="2 weeks">2 weeks</option>
                <option value="4 weeks">4 weeks</option>
                <option value="3 months">3 months</option>
              </select>
            </div>
            <div>
              <label htmlFor="fp-chan" className="block text-[11px] font-medium text-[#042C53] mb-1">
                Reminder Channel (Simulated)
              </label>
              <select
                id="fp-chan"
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="Simulated SMS">Simulated SMS</option>
                <option value="Simulated Email">Simulated Email</option>
                <option value="Simulated Portal Notice">Simulated Portal Notice</option>
              </select>
            </div>
            <div>
              <label htmlFor="fp-inst" className="block text-[11px] font-medium text-[#042C53] mb-1">
                Patient Follow-Up Instructions
              </label>
              <textarea
                id="fp-inst"
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              />
            </div>
            <button type="submit" className="w-full py-1.5 bg-[#042C53] text-white font-medium rounded">
              Save Follow-Up Plan
            </button>
          </form>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#042C53]">Active Care Plans & Goals (M14)</h2>
          {carePlans.length === 0 ? (
            <EmptyState title="No active care plan enrolled" />
          ) : (
            carePlans.map((cp) => (
              <div key={cp.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-[#042C53]">{cp.programme}</div>
                  <StatusBadge label={cp.status} />
                </div>
                {cp.goals.map((g) => (
                  <div key={g.id} className="p-2.5 bg-[#F7F7F5] rounded">
                    <div className="flex justify-between font-medium">
                      <span>{g.title}</span>
                      <StatusBadge label={g.status} />
                    </div>
                    <div className="text-[11px] text-[#5F5D56] mt-1">
                      Target: {g.target} · Progress {g.progressPct}% · Due {g.dueDate}
                    </div>
                  </div>
                ))}
                {cp.transitionSummary && (
                  <div className="text-[11px] text-[#5F5D56] pt-2 border-t border-slate-100">
                    <strong>Transition Summary:</strong> {cp.transitionSummary}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#042C53]">Patient Referrals (M15)</h2>
          {referrals.length === 0 ? (
            <EmptyState title="No referrals on file" />
          ) : (
            referrals.map((r) => (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#042C53]">{r.direction} · {r.specialty}</span>
                  <StatusBadge label={r.status} />
                </div>
                <div className="text-[#5F5D56]">{r.reason}</div>
                <div className="text-[11px] text-[#5F5D56]">
                  {r.referringProvider} → {r.targetProvider}
                </div>
                {r.status !== 'Closed' && (
                  <button
                    type="button"
                    onClick={() => advanceReferralStatus(r.id, 'Closed' as ReferralStatus, 'Closed from patient chart')}
                    className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                  >
                    Close Referral Loop
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
