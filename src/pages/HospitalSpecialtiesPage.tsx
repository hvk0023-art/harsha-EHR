import React, { useMemo, useState } from 'react';
import {
  Activity,
  BedDouble,
  FlaskConical,
  Pill,
  QrCode,
  ScanBarcode,
  Siren,
  Stethoscope,
} from 'lucide-react';
import { isIndiaFacility } from '../state/domainLogic';
import { useAppState } from '../state/AppStateContext';
import { SimpleLineChart } from '../components/ui/Charts';
import {
  EmptyState,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

const SPECIALTIES = [
  'Nephrology / Dialysis',
  'Cardiology',
  'Paediatrics',
  'Obstetrics & Gynaecology',
  'Behavioural Health',
  'Oncology',
  'Orthopaedics / Rehabilitation',
  'Ophthalmology',
  'Dental',
  'Dermatology',
  'Fertility',
  'Palliative Care',
] as const;

export const HospitalSpecialtiesPage: React.FC = () => {
  const {
    state,
    currentFacility,
    setFacility,
    openPatient,
    updateBedState,
    administerEmarDose,
    toggleEmergencyChecklist,
    updateEmergencyStatus,
    dispenseOrRestockPharmacy,
    updateAbdmConsent,
    requestAbdmConsent,
    notify,
  } = useAppState();

  const indiaActive = isIndiaFacility(state.facilities, state.currentFacilityId);

  const [tab, setTab] = useState<'beds' | 'nursing' | 'ed-or' | 'pharmacy' | 'specialties' | 'abdm'>(
    indiaActive ? 'abdm' : state.currentRole === 'Pharmacist' ? 'pharmacy' : 'beds'
  );
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('Nephrology / Dialysis');
  const [admitBedId, setAdmitBedId] = useState<string | null>(null);
  const [admitPatientId, setAdmitPatientId] = useState(state.patients[0]?.id || '');
  const [admitAcuity, setAdmitAcuity] = useState<'General' | 'Telemetry' | 'ICU'>('General');
  const [deptSubTab, setDeptSubTab] = useState<'pharmacy' | 'lab' | 'radiology' | 'blood-steril'>('pharmacy');

  // ABDM form
  const [abdmPatientId, setAbdmPatientId] = useState('pat-5');
  const [abdmPurpose, setAbdmPurpose] = useState('Longitudinal Cardiac & Thyroid Review');
  const [abdmHip, setAbdmHip] = useState('Manipal Diagnostics Bengaluru');

  const facilityBeds = useMemo(
    () => state.beds.filter((b) => b.facilityId === state.currentFacilityId),
    [state.beds, state.currentFacilityId]
  );

  const facilityInventory = useMemo(
    () => state.pharmacyInventory.filter((i) => i.facilityId === state.currentFacilityId),
    [state.currentFacilityId, state.pharmacyInventory]
  );

  const specialtyPatients = useMemo(() => {
    const matched = state.patients.filter((p) => p.specialtyTags.includes(selectedSpecialty));
    return matched.length > 0 ? matched : state.patients.slice(0, 2);
  }, [selectedSpecialty, state.patients]);

  const nephroPatient = state.patients.find((p) => p.id === 'pat-4') || state.patients[0];
  const nephroLabs = state.labResults
    .filter((l) => l.patientId === nephroPatient.id && l.testName.toLowerCase().includes('egfr'))
    .concat(
      state.labResults.filter((l) => l.patientId === 'pat-1' && l.testName.toLowerCase().includes('egfr'))
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hospital Operations, Specialties & Regional Workspaces"
        subtitle={`M26 Inpatient · M27 eMAR · M28 ED/OR · M29 Pharmacy & Dept Ops · M30 12 Specialties · M35 India ABDM (${currentFacility.shortName})`}
      />

      <SegmentedTabs
        tabs={[
          { id: 'beds', label: 'Bed Board & Census (M26)' },
          { id: 'nursing', label: 'Nursing & eMAR (M27)' },
          { id: 'ed-or', label: 'ED & Surgery / OR (M28)' },
          { id: 'pharmacy', label: 'Pharmacy & Dept Ops (M29)' },
          { id: 'specialties', label: '12 Specialties (M30)' },
          { id: 'abdm', label: indiaActive ? 'India ABDM (Active)' : 'India ABDM (M35)' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {/* M26: Bed Board */}
      {tab === 'beds' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {facilityBeds.map((bed) => {
            const pat = state.patients.find((p) => p.id === bed.patientId);
            return (
              <div key={bed.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BedDouble className="w-4 h-4 text-[#185FA5]" />
                    <span className="font-mono font-semibold text-[#042C53]">{bed.bedNumber}</span>
                    <span className="text-[#5F5D56]">{bed.ward}</span>
                  </div>
                  <StatusBadge label={bed.state} />
                </div>

                {bed.state === 'Occupied' && pat ? (
                  <div className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
                    <PatientLink patientId={pat.id} tab="overview" showMrn />
                    <div className="text-[11px] text-[#5F5D56]">
                      Acuity: {bed.acuity} · Admitted {bed.admittedAt}
                    </div>
                    {bed.handoverNote && (
                      <div className="text-[11px] text-slate-700 pt-1 border-t border-slate-200">
                        {bed.handoverNote}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateBedState(bed.id, {
                            state: 'Cleaning',
                            patientId: undefined,
                            handoverNote: 'Discharged — terminal cleaning queued',
                          })
                        }
                        className="px-2.5 py-1 text-[11px] font-medium bg-[#042C53] text-white rounded"
                      >
                        Discharge & Release Bed
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 flex flex-wrap gap-2">
                    {bed.state === 'Available' && (
                      <button
                        type="button"
                        onClick={() => setAdmitBedId(bed.id)}
                        className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                      >
                        Admit Patient
                      </button>
                    )}
                    {bed.state === 'Cleaning' && (
                      <button
                        type="button"
                        onClick={() => updateBedState(bed.id, { state: 'Available' })}
                        className="px-2.5 py-1 text-[11px] font-medium bg-[#0F6E50] text-white rounded"
                      >
                        Mark Clean / Available
                      </button>
                    )}
                    {bed.state === 'Blocked' && (
                      <button
                        type="button"
                        onClick={() => updateBedState(bed.id, { state: 'Available' })}
                        className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 rounded"
                      >
                        Unblock Bed
                      </button>
                    )}
                    {bed.state === 'Available' && (
                      <button
                        type="button"
                        onClick={() => updateBedState(bed.id, { state: 'Blocked' })}
                        className="px-2.5 py-1 text-[11px] border border-slate-300 rounded"
                      >
                        Block
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* M27: Nursing & eMAR */}
      {tab === 'nursing' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#042C53]">
              Inpatient eMAR Worklist (Simulated Barcode Verification Only)
            </span>
            <span className="text-[#5F5D56]">Ward 4B · Shift Day</span>
          </div>
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
              <tr>
                <th className="py-2.5 px-3">Patient</th>
                <th className="py-2.5 px-3">Medication & Dose</th>
                <th className="py-2.5 px-3">Scheduled</th>
                <th className="py-2.5 px-3">Barcode</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.emarDoses.map((d) => (
                <tr key={d.id}>
                  <td className="py-2.5 px-3">
                    <PatientLink patientId={d.patientId} tab="medications" showMrn />
                  </td>
                  <td className="py-2.5 px-3 font-medium text-[#042C53]">
                    {d.medication} — <span className="font-mono">{d.dose}</span>
                  </td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">{d.scheduledTime}</td>
                  <td className="py-2.5 px-3">
                    {d.barcodeVerified ? (
                      <span className="text-[#0F6E50] font-medium">Verified (Sim)</span>
                    ) : (
                      <span className="text-[#5F5D56]">Pending scan</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <StatusBadge label={d.status} />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {d.status === 'Due' ? (
                      <button
                        type="button"
                        onClick={() => administerEmarDose(d.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                      >
                        <ScanBarcode className="w-3.5 h-3.5" />
                        Scan & Administer (Sim)
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#5F5D56]">
                        {d.administeredBy} @ {d.administeredAt}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* M28: Emergency & Surgery / OR */}
      {tab === 'ed-or' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {state.emergencyOrCases.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Siren className="w-4 h-4 text-[#B4321F]" />
                    <span className="font-semibold text-[#042C53]">
                      {c.kind} · {c.location}
                    </span>
                    {c.triageCategory && <StatusBadge label={c.triageCategory} />}
                  </div>
                  <div className="mt-1">
                    <PatientLink patientId={c.patientId} tab="encounters" showMrn />
                  </div>
                </div>
                <StatusBadge label={c.status} />
              </div>

              <div className="p-2.5 bg-[#F7F7F5] rounded">
                <div className="font-medium text-[#042C53]">{c.chiefOrProcedure}</div>
                <div className="text-[11px] text-[#5F5D56] font-mono mt-0.5">Scheduled / Arrived: {c.scheduledTime}</div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#5F5D56]">Readiness Checklist</div>
                {c.readinessChecklist.map((item, idx) => (
                  <label key={item.item} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleEmergencyChecklist(c.id, idx)}
                    />
                    <span className={item.done ? 'line-through text-[#5F5D56]' : ''}>{item.item}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-[11px] text-[#5F5D56]">Update Status:</span>
                <select
                  aria-label={`Status for ${c.chiefOrProcedure}`}
                  value={c.status}
                  onChange={(e) => updateEmergencyStatus(c.id, e.target.value as typeof c.status)}
                  className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                >
                  <option value="Waiting">Waiting</option>
                  <option value="Triage">Triage</option>
                  <option value="In Treatment">In Treatment</option>
                  <option value="Pre-Op">Pre-Op</option>
                  <option value="In OR">In OR</option>
                  <option value="PACU">PACU</option>
                  <option value="Discharged">Discharged</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* M29: Pharmacy Inventory & Departmental Ops */}
      {tab === 'pharmacy' && (
        <div className="space-y-3">
          <SegmentedTabs
            tabs={[
              { id: 'pharmacy', label: 'Pharmacy Inventory & Dispensing', count: facilityInventory.length },
              { id: 'lab', label: 'Laboratory Queue' },
              { id: 'radiology', label: 'Radiology Operations' },
              { id: 'blood-steril', label: 'Blood Bank & Sterilisation' },
            ]}
            activeId={deptSubTab}
            onChange={(id) => setDeptSubTab(id as typeof deptSubTab)}
          />

          {deptSubTab === 'pharmacy' && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              {facilityInventory.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="No pharmacy batches loaded for this facility" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                      <tr>
                        <th className="py-2.5 px-3">Medicine & NDC</th>
                        <th className="py-2.5 px-3">Batch & Expiry</th>
                        <th className="py-2.5 px-3 text-right">Stock / Threshold</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3 text-right">Dispense / Restock (Sim)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {facilityInventory.map((item) => {
                        const low = item.stockQty <= item.reorderThreshold;
                        return (
                          <tr key={item.id}>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-[#042C53]">{item.name} {item.strength}</div>
                              <div className="text-[11px] font-mono text-[#5F5D56]">NDC {item.ndc}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              <div>{item.batchNumber}</div>
                              <div className="text-[#5F5D56]">Exp {item.expiryDate}</div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              <span className={`font-semibold ${low ? 'text-[#B4321F]' : 'text-[#042C53]'}`}>
                                {item.stockQty}
                              </span>{' '}
                              / {item.reorderThreshold}
                              {low && (
                                <div className="mt-0.5">
                                  <StatusBadge label="Reorder Alert" tone="danger" />
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{item.supplier}</td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                              <button
                                type="button"
                                onClick={() => dispenseOrRestockPharmacy(item.id, -5, 'Simulated Rx dispense (-5)')}
                                className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded hover:bg-[#042C53]"
                              >
                                Dispense -5
                              </button>
                              <button
                                type="button"
                                onClick={() => dispenseOrRestockPharmacy(item.id, 30, 'Procurement restock (+30)')}
                                className="px-2.5 py-1 text-[11px] font-medium border border-slate-300 rounded hover:bg-slate-50"
                              >
                                Restock +30
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
          )}

          {deptSubTab === 'lab' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
              <div className="font-semibold text-[#042C53]">Laboratory Specimen & Bench Worklist</div>
              {state.orders
                .filter((o) => o.category === 'Lab')
                .map((o) => (
                  <div key={o.id} className="p-2.5 border border-slate-200 rounded flex items-center justify-between">
                    <div>
                      <span className="font-mono font-semibold text-[#042C53]">{o.requisitionId}</span> · {o.name}
                      <div className="text-[11px] text-[#5F5D56]">
                        <PatientLink patientId={o.patientId} tab="orders-results" /> · {o.priority}
                      </div>
                    </div>
                    <StatusBadge label={o.status} />
                  </div>
                ))}
            </div>
          )}

          {deptSubTab === 'radiology' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
              <div className="font-semibold text-[#042C53]">Radiology Modality Worklist</div>
              {state.imagingReports.map((img) => (
                <div key={img.id} className="p-2.5 border border-slate-200 rounded flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[#042C53]">{img.studyName} ({img.modality})</div>
                    <div className="text-[11px] text-[#5F5D56]">
                      <PatientLink patientId={img.patientId} tab="orders-results" /> · {img.performedAt}
                    </div>
                  </div>
                  <StatusBadge label={img.status} />
                </div>
              ))}
            </div>
          )}

          {deptSubTab === 'blood-steril' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="font-semibold text-[#042C53]">Blood Bank Inventory (Synthetic)</div>
                <div className="flex justify-between py-1 border-b border-slate-100"><span>O-Negative PRBC</span><span className="font-mono">8 units</span></div>
                <div className="flex justify-between py-1 border-b border-slate-100"><span>A-Positive PRBC</span><span className="font-mono">14 units</span></div>
                <button
                  type="button"
                  onClick={() => notify('info', 'Simulated crossmatch verification logged')}
                  className="mt-2 px-3 py-1.5 bg-[#185FA5] text-white rounded text-xs"
                >
                  Log Crossmatch Check (Sim)
                </button>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="font-semibold text-[#042C53]">Sterilisation & CSSD Autoclave</div>
                <div className="flex justify-between py-1 border-b border-slate-100"><span>Ortho TKA Tray #04</span><StatusBadge label="Verified Sterile" tone="success" /></div>
                <div className="flex justify-between py-1 border-b border-slate-100"><span>Vascular Access Pack #02</span><StatusBadge label="In Cycle" tone="blue" /></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* M30: All 12 Specialty Workspaces */}
      {tab === 'specialties' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-2 space-y-0.5">
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#5F5D56]">
              Specialty Workspaces (12)
            </div>
            {SPECIALTIES.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSelectedSpecialty(sp)}
                className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-medium ${
                  selectedSpecialty === sp
                    ? 'bg-[#E6F1FB] text-[#042C53]'
                    : 'text-[#5F5D56] hover:bg-slate-100'
                }`}
              >
                {sp}
              </button>
            ))}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-[#042C53] flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#185FA5]" />
                    {selectedSpecialty} Workspace
                  </h2>
                  <p className="text-[11px] text-[#5F5D56]">
                    Reuses canonical patient records · Specialty fields provisional pending clinical review
                  </p>
                </div>
                <StatusBadge label="Provisional Clinical Fields" tone="warning" />
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {specialtyPatients.map((p) => (
                  <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <PatientLink patientId={p.id} tab="overview" showMrn />
                      <div className="text-[11px] text-[#5F5D56]">
                        {p.conditions.map((c) => c.name).join(' · ') || 'Active specialty consult'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openPatient(p.id, 'overview')}
                      className="px-2.5 py-1 text-xs font-medium bg-[#E6F1FB] text-[#042C53] rounded"
                    >
                      Open Chart
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {selectedSpecialty === 'Nephrology / Dialysis' && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#042C53]">
                    Nephrology Longitudinal eGFR & Dialysis Tracking ({nephroPatient.fullName})
                  </h3>
                  <button
                    type="button"
                    onClick={() => openPatient(nephroPatient.id, 'orders-results')}
                    className="text-xs font-medium text-[#185FA5] hover:underline"
                  >
                    Open Full Renal Chart →
                  </button>
                </div>

                <SimpleLineChart
                  points={nephroLabs
                    .slice()
                    .reverse()
                    .map((l) => ({
                      label: l.collectionDate.slice(5),
                      value: l.numericValue || 0,
                    }))}
                  unit="mL/min"
                  referenceMin={60}
                  referenceMax={90}
                />

                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] text-[#5F5D56]">
                      <tr>
                        <th className="py-2 px-3">Session Date</th>
                        <th className="py-2 px-3">Access</th>
                        <th className="py-2 px-3 font-mono">Pre → Post Weight</th>
                        <th className="py-2 px-3 font-mono">UF Goal / Achieved</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {state.dialysisSessions.map((ds) => (
                        <tr key={ds.id}>
                          <td className="py-2 px-3 font-mono">{ds.date} ({ds.durationMin}m)</td>
                          <td className="py-2 px-3">{ds.accessType}</td>
                          <td className="py-2 px-3 font-mono">{ds.preWeightKg} → {ds.postWeightKg} kg</td>
                          <td className="py-2 px-3 font-mono">{ds.ufGoalL}L / {ds.ufAchievedL}L</td>
                          <td className="py-2 px-3"><StatusBadge label={ds.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* M35: India & ABDM Workspace */}
      {tab === 'abdm' && (
        <div className="space-y-4">
          {!indiaActive && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-[#9A5B10]">Regional Separation Notice</div>
                <p className="text-slate-700 mt-0.5">
                  ABDM (ABHA, Scan & Share, HIP/HIU Consent) is strictly an India regional workspace. Switch active facility to EigenH Bengaluru Care Hub (IST) to operate in India demo mode.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFacility('fac-bengaluru')}
                className="px-3 py-1.5 font-medium bg-[#042C53] text-white rounded-md shrink-0"
              >
                Switch to Bengaluru Hub (IST)
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <div className="flex items-center gap-2 font-semibold text-[#042C53]">
                <QrCode className="w-4 h-4 text-[#185FA5]" />
                Scan & Share / Request ABDM Consent (Sandbox)
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  requestAbdmConsent(abdmPatientId, abdmPurpose, abdmHip);
                }}
                className="space-y-2.5"
              >
                <div>
                  <label htmlFor="abdm-pat" className="block text-[11px] font-medium text-[#5F5D56] mb-1">
                    India Patient (ABHA Linked)
                  </label>
                  <select
                    id="abdm-pat"
                    value={abdmPatientId}
                    onChange={(e) => setAbdmPatientId(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    {state.patients
                      .filter((p) => p.facilityId === 'fac-bengaluru' || p.abhaId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.abhaId || p.mrn})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="abdm-hip" className="block text-[11px] font-medium text-[#5F5D56] mb-1">
                    HIP Source Facility
                  </label>
                  <input
                    id="abdm-hip"
                    type="text"
                    value={abdmHip}
                    onChange={(e) => setAbdmHip(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label htmlFor="abdm-purp" className="block text-[11px] font-medium text-[#5F5D56] mb-1">
                    Purpose of Request
                  </label>
                  <input
                    id="abdm-purp"
                    type="text"
                    value={abdmPurpose}
                    onChange={(e) => setAbdmPurpose(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 font-medium text-white bg-[#185FA5] rounded-md"
                >
                  Request HIU Consent (Sim)
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-[#042C53]">
                ABDM Consent Requests & HIU/HIP Exchange History (Simulated Only)
              </div>
              <div className="divide-y divide-slate-100">
                {state.abdmConsents.map((c) => (
                  <div key={c.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <PatientLink patientId={c.patientId} tab="overview" />
                      <div className="font-mono text-[11px] text-[#5F5D56]">
                        {c.abhaAddress} · HIP: {c.hipName}
                      </div>
                      <div className="text-[11px] text-slate-700 mt-0.5">
                        {c.purpose} ({c.hiTypes.join(', ')})
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={c.status} />
                      {c.status === 'Requested' && (
                        <button
                          type="button"
                          onClick={() => updateAbdmConsent(c.id, 'Granted')}
                          className="px-2 py-1 text-[11px] font-medium bg-[#0F6E50] text-white rounded"
                        >
                          Simulate Grant
                        </button>
                      )}
                      {c.status === 'Granted' && (
                        <button
                          type="button"
                          onClick={() => updateAbdmConsent(c.id, 'Revoked')}
                          className="px-2 py-1 text-[11px] font-medium text-[#B4321F] border border-red-200 rounded"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={Boolean(admitBedId)} onClose={() => setAdmitBedId(null)} title="Admit Patient to Bed">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (admitBedId) {
              updateBedState(admitBedId, {
                state: 'Occupied',
                patientId: admitPatientId,
                acuity: admitAcuity,
                admittedAt: `2026-11-18 12:00 ${currentFacility.tzAbbr}`,
                handoverNote: 'Newly admitted via Bed Board prototype.',
              });
              setAdmitBedId(null);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label htmlFor="adm-pat" className="block font-medium text-[#042C53] mb-1">
              Patient
            </label>
            <select
              id="adm-pat"
              value={admitPatientId}
              onChange={(e) => setAdmitPatientId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="adm-acu" className="block font-medium text-[#042C53] mb-1">
              Acuity
            </label>
            <select
              id="adm-acu"
              value={admitAcuity}
              onChange={(e) => setAdmitAcuity(e.target.value as typeof admitAcuity)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-md bg-white"
            >
              <option value="General">General</option>
              <option value="Telemetry">Telemetry</option>
              <option value="ICU">ICU</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdmitBedId(null)} className="px-3 py-1.5 border border-slate-300 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded-md">
              Confirm Admission
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
