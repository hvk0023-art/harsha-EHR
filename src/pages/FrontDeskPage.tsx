import React, { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, DoorOpen, ShieldCheck, TabletSmartphone, UserPlus } from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import { formatCurrency } from '../state/domainLogic';
import { useAppState } from '../state/AppStateContext';
import type { Appointment } from '../types/hms';
import { BookAppointmentModal, RegisterPatientModal } from '../components/modals/QuickActionModals';
import { IntelligentRegistrationModal } from '../components/registration/IntelligentRegistrationModal';
import {
  EmptyState,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const FrontDeskPage: React.FC = () => {
  const {
    state,
    currentFacility,
    updateAppointmentStatus,
    updatePatientDemographics,
    recordVitals,
    addPatientAllergy,
    addInsurancePolicy,
    runEligibilityCheck,
    openPatient,
    notify,
  } = useAppState();

  const [tab, setTab] = useState<'queue' | 'checkout' | 'kiosk'>('queue');
  const [showWalkInRegister, setShowWalkInRegister] = useState(false);
  const [showScheduledReg, setShowScheduledReg] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [bookDefaultPatientId, setBookDefaultPatientId] = useState<string | undefined>(undefined);
  const [roomAssignTarget, setRoomAssignTarget] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState('Exam 2');
  const [kioskMrn, setKioskMrn] = useState('');
  const [kioskResult, setKioskResult] = useState<string | null>(null);

  // Step 3: Check-In & Intake Modal state
  const [intakeTarget, setIntakeTarget] = useState<Appointment | null>(null);
  const [demoVerified, setDemoVerified] = useState(true);
  const [intakeRoom, setIntakeRoom] = useState('Exam 2');
  const [intakeSys, setIntakeSys] = useState('144');
  const [intakeDia, setIntakeDia] = useState('88');
  const [intakeHr, setIntakeHr] = useState('82');
  const [intakeTemp, setIntakeTemp] = useState('98.6');
  const [intakeSpo2, setIntakeSpo2] = useState('98');
  const [intakeWt, setIntakeWt] = useState('68.5');
  const [newAlgSub, setNewAlgSub] = useState('');
  const [newAlgReact, setNewAlgReact] = useState('');
  const [newAlgSev, setNewAlgSev] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [intakeError, setIntakeError] = useState('');

  const todaysQueue = useMemo(
    () =>
      state.appointments
        .filter((a) => a.facilityId === state.currentFacilityId && a.date === TODAY_DATE && a.status !== 'Cancelled')
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [state.appointments, state.currentFacilityId]
  );

  // Newly registered walk-in patients at this facility who do not yet have an appointment today
  const unscheduledWalkIns = useMemo(() => {
    const scheduledIds = new Set(todaysQueue.map((a) => a.patientId));
    return state.patients.filter(
      (p) =>
        p.facilityId === state.currentFacilityId &&
        p.entryPath === 'Walk-in' &&
        !scheduledIds.has(p.id)
    );
  }, [state.currentFacilityId, state.patients, todaysQueue]);

  const checkoutList = todaysQueue.filter((a) => a.status === 'In Room' || a.status === 'Completed');

  const handleKioskCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    const q = kioskMrn.trim().toLowerCase();
    const appt = todaysQueue.find((a) => {
      const p = state.patients.find((pat) => pat.id === a.patientId);
      return p && (p.mrn.toLowerCase() === q || p.fullName.toLowerCase().includes(q));
    });
    if (!appt) {
      setKioskResult('No matching appointment found at this facility today.');
      return;
    }
    const pat = state.patients.find((p) => p.id === appt.patientId);
    updateAppointmentStatus(appt.id, 'Checked In');
    setKioskResult(`Checked in ${pat?.fullName} for ${appt.startTime} (${appt.type}). Please have a seat in reception.`);
    setKioskMrn('');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Front Desk & Patient Access"
        subtitle={`M04 · ${currentFacility.shortName} · Pre-registration, check-in queue, rooming & check-out`}
        secondaryActions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-demo-target="scheduled-registration-btn"
              onClick={() => setShowScheduledReg(true)}
              className="eigen-btn-navy text-xs"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Scheduled Registration
            </button>
            <button
              type="button"
              onClick={() => setShowWalkInRegister(true)}
              className="eigen-btn-secondary text-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              New Walk-in Patient
            </button>
          </div>
        }
        primaryAction={
          <button
            type="button"
            onClick={() => setShowBook(true)}
            className="eigen-btn-primary text-xs"
          >
            Schedule Follow-up
          </button>
        }
      />

      <SegmentedTabs
        tabs={[
          { id: 'queue', label: 'Arrival & Waiting Queue', count: todaysQueue.length },
          { id: 'checkout', label: 'Check-Out & Collections', count: checkoutList.length },
          { id: 'kiosk', label: 'Kiosk Self Check-in (Demo)' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {tab === 'queue' && (
        <div data-demo-target="front-desk-arrivals" className="space-y-4">
          {unscheduledWalkIns.length > 0 && (
            <section className="eigen-card bg-[#E6F1FB]/45 border-[#85B7EB]/70 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-[#042C53]">
                    Walk-In Patients Registered — Ready to Schedule ({unscheduledWalkIns.length})
                  </h2>
                  <p className="text-[11px] text-[#5F5D56]">
                    Assign an open clinic slot to move walk-in patients into today’s arrival & check-in queue.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[#85B7EB]/35">
                {unscheduledWalkIns.map((p) => (
                  <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <PatientLink patientId={p.id} tab="overview" showMrn />
                      <div className="text-[11px] text-[#5F5D56] mt-0.5">
                        {p.chiefConcern || 'Walk-in visit'} · Registered at {currentFacility.shortName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBookDefaultPatientId(p.id);
                        setShowBook(true);
                      }}
                      className="eigen-btn-primary text-xs py-1.5 px-3"
                    >
                      Schedule Walk-in Slot
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="eigen-card overflow-hidden">
            {todaysQueue.length === 0 ? (
              <div className="p-8">
                <EmptyState title="No arrivals scheduled today" description="Register a walk-in or schedule a visit." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="eigen-table-head">
                    <tr>
                      <th className="py-3 px-4">Slot</th>
                      <th className="py-3 px-4">Patient & Entry</th>
                      <th className="py-3 px-4">Intake Readiness</th>
                      <th className="py-3 px-4">Est. Copay</th>
                      <th className="py-3 px-4">Room / Provider</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Front Desk Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#042C53]/6 text-xs">
                    {todaysQueue.map((a) => {
                      const pat = state.patients.find((p) => p.id === a.patientId);
                      const prov = state.staff.find((s) => s.id === a.providerId);
                      return (
                        <tr
                          key={a.id}
                          data-demo-target={a.patientId === 'pat-demo-elena' ? 'front-desk-row-elena' : undefined}
                          className="hover:bg-[#FAF9F6] transition-colors"
                        >
                          <td className="py-3 px-4 font-mono tabular-nums font-semibold text-[#042C53]">
                            {a.startTime}
                          </td>
                          <td className="py-3 px-4">
                            <PatientLink patientId={a.patientId} tab="overview" showMrn />
                            <div className="text-[11px] text-[#5F5D56] mt-0.5">
                              {a.subtype} · {a.type}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                label={pat?.intakeFormsComplete ? 'Intake Complete' : 'Forms Missing'}
                                tone={pat?.intakeFormsComplete ? 'success' : 'warning'}
                              />
                              {!pat?.intakeFormsComplete && pat && (
                                <button
                                  type="button"
                                  onClick={() => updatePatientDemographics(pat.id, { intakeFormsComplete: true })}
                                  className="text-[11px] font-medium text-[#185FA5] hover:underline"
                                >
                                  Mark Verified
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums">
                            {a.coPayAmount > 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#042C53]">
                                  {formatCurrency(a.coPayAmount, currentFacility.currency)}
                                </span>
                                {a.coPayCollected ? (
                                  <StatusBadge label="Collected" tone="success" />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateAppointmentStatus(a.id, a.status, { coPayCollected: true });
                                      notify('success', 'Simulated copay collection recorded');
                                    }}
                                    className="text-[11px] font-medium text-[#185FA5] hover:underline"
                                  >
                                    Collect (Sim)
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[#5F5D56]">$0</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-[#042C53]">{prov?.name}</div>
                            <div className="text-[11px] text-[#5F5D56]">{a.room || 'Waiting room'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge label={a.status} />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                            {(a.status === 'Scheduled' || a.status === 'Confirmed' || a.status === 'Pre-Registered' || a.status === 'Checked In') && (
                              <button
                                type="button"
                                data-demo-target={a.patientId === 'pat-demo-elena' ? 'fd-checkin-btn-elena' : undefined}
                                onClick={() => {
                                  setIntakeTarget(a);
                                  setDemoVerified(false);
                                  setIntakeRoom(a.room || 'Exam 3');
                                  setIntakeError('');
                                  setNewAlgSub('');
                                  setNewAlgReact('');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-[#185FA5] text-white rounded-lg hover:bg-[#042C53] transition-colors"
                              >
                                <ClipboardList className="w-3 h-3" />
                                Check-In & Intake
                              </button>
                            )}
                            {a.status === 'Checked In' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRoomAssignTarget(a.id);
                                  setSelectedRoom(a.room || 'Exam 2');
                                }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium bg-[#042C53] text-white rounded-lg"
                              >
                                <DoorOpen className="w-3 h-3" />
                                Assign Room
                              </button>
                            )}
                            {a.status === 'In Room' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPatient(a.patientId, 'encounters')}
                                  className="px-2.5 py-1.5 text-[11px] font-medium border border-[#042C53]/15 bg-white text-[#042C53] rounded-lg hover:bg-[#FAF9F6]"
                                >
                                  Open Encounter
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateAppointmentStatus(a.id, 'Completed')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold bg-[#0F6E50] text-white rounded-lg hover:bg-[#042C53] transition-colors"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Check Out
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'checkout' && (
        <div className="eigen-card p-5 space-y-3">
          {checkoutList.length === 0 ? (
            <EmptyState title="No patients ready for check-out" description="Patients move here once roomed or completed." />
          ) : (
            <div className="divide-y divide-[#042C53]/8">
              {checkoutList.map((a) => (
                <div key={a.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <PatientLink patientId={a.patientId} tab="account" showMrn />
                    <div className="text-[11px] text-[#5F5D56] mt-0.5">
                      {a.type} · {a.room || 'Clinic'} · Status: {a.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openPatient(a.patientId, 'account')}
                      className="eigen-btn-secondary text-xs py-1.5 px-3"
                    >
                      Open Account & Bills
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBook(true)}
                      className="eigen-btn-primary text-xs py-1.5 px-3"
                    >
                      Book Follow-up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'kiosk' && (
        <div className="eigen-card p-6 max-w-lg mx-auto space-y-4">
          <div className="flex items-center gap-2.5 text-[#042C53]">
            <div className="w-9 h-9 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center">
              <TabletSmartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Self Check-in Kiosk Simulator</h2>
              <p className="text-xs text-[#5F5D56]">{currentFacility.shortName}</p>
            </div>
          </div>
          <p className="text-xs text-[#5F5D56] leading-relaxed">
            Enter a synthetic patient name or MRN scheduled today at {currentFacility.shortName} (e.g. Maya Lin or MRN-105112).
          </p>
          <form onSubmit={handleKioskCheckIn} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Enter Patient Name or MRN..."
              value={kioskMrn}
              onChange={(e) => setKioskMrn(e.target.value)}
              className="eigen-input w-full py-2.5 text-sm"
            />
            <button type="submit" className="eigen-btn-primary w-full justify-center py-2.5 text-xs">
              Verify Identity & Check In
            </button>
          </form>
          {kioskResult && (
            <div className="p-3.5 text-xs bg-[#E6F1FB]/70 border border-[#85B7EB] rounded-xl text-[#042C53]">
              {kioskResult}
            </div>
          )}
        </div>
      )}

      <RegisterPatientModal
        open={showWalkInRegister}
        onClose={() => setShowWalkInRegister(false)}
        defaultEntryPath="Walk-in"
        onRegistered={(pid) => {
          setBookDefaultPatientId(pid);
          notify('info', 'Walk-in patient added to Front Desk queue — ready to schedule a clinic slot');
        }}
      />
      <BookAppointmentModal
        open={showBook}
        onClose={() => {
          setShowBook(false);
          setBookDefaultPatientId(undefined);
        }}
        defaultPatientId={bookDefaultPatientId}
      />

      {/* Step 3: Structured Check-In & Intake Modal */}
      {(() => {
        const intakePatient = intakeTarget
          ? state.patients.find((p) => p.id === intakeTarget.patientId)
          : null;
        const intakePolicy = intakePatient
          ? state.policies.find((p) => p.patientId === intakePatient.id && p.isPrimary)
          : null;

        return (
          <Modal
            open={Boolean(intakeTarget && intakePatient)}
            onClose={() => setIntakeTarget(null)}
            title={`Check-In & Clinical Intake — ${intakePatient?.fullName || ''}`}
            subtitle={
              intakeTarget && intakePatient
                ? `${intakePatient.mrn} · Slot ${intakeTarget.startTime} · ${intakeTarget.type}`
                : ''
            }
            maxWidth="max-w-2xl"
          >
            {intakeTarget && intakePatient && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setIntakeError('');
                  const sys = Number(intakeSys);
                  const dia = Number(intakeDia);
                  const hrVal = Number(intakeHr);
                  const tempVal = Number(intakeTemp);
                  const spo2Val = Number(intakeSpo2);
                  const wtVal = Number(intakeWt);
                  if (sys < 50 || sys > 260 || dia < 30 || dia > 160 || hrVal < 30 || hrVal > 220 || spo2Val < 50 || spo2Val > 100) {
                    setIntakeError('Entered vitals are outside valid physiological ranges.');
                    return;
                  }
                  recordVitals({
                    patientId: intakePatient.id,
                    recordedAt: `${TODAY_DATE} ${new Date().toTimeString().slice(0, 5)}`,
                    bpSystolic: sys,
                    bpDiastolic: dia,
                    heartRate: hrVal,
                    tempF: tempVal,
                    spo2: spo2Val,
                    weightKg: wtVal,
                    heightCm: 168,
                    painScore: 1,
                    source: 'Clinic Intake',
                    recordedBy: state.staff.find((s) => s.id === state.currentUserId)?.name || 'Intake Staff',
                  });
                  updatePatientDemographics(intakePatient.id, { intakeFormsComplete: demoVerified });
                  updateAppointmentStatus(intakeTarget.id, 'In Room', {
                    room: intakeRoom,
                    coPayCollected: true,
                  });
                  setIntakeTarget(null);
                  notify('success', `${intakePatient.fullName} checked in, intake vitals recorded, and roomed in ${intakeRoom}`);
                }}
                className="space-y-4 text-xs"
              >
                {intakeError && (
                  <div className="p-3 text-[#B4321F] bg-red-50 border border-red-200 rounded-xl">
                    {intakeError}
                  </div>
                )}

                {/* 1. Demographics & Emergency Contact */}
                <div
                  data-demo-target="fd-modal-demographics"
                  className="eigen-card-subtle p-3.5 space-y-2"
                >
                  <div className="font-semibold text-[#042C53]">1. Demographics & Contact Verification</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[#5F5D56]">
                    <div>DOB: <span className="font-mono text-[#042C53]">{intakePatient.dob}</span></div>
                    <div>Phone: <span className="font-mono text-[#042C53]">{intakePatient.phone}</span></div>
                    <div>Address: <span className="text-[#042C53]">{intakePatient.address}</span></div>
                    <div>
                      Emergency Contact:{' '}
                      <span className="text-[#042C53]">
                        {intakePatient.caregivers[0]
                          ? `${intakePatient.caregivers[0].name} (${intakePatient.caregivers[0].relationship})`
                          : 'None documented'}
                      </span>
                    </div>
                  </div>
                  <label
                    data-demo-target="fd-modal-demo-checkbox-wrap"
                    className="flex items-center gap-2 pt-1 text-[#042C53] font-medium cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      data-demo-target="fd-modal-demo-checkbox"
                      checked={demoVerified}
                      onChange={(e) => setDemoVerified(e.target.checked)}
                    />
                    Demographics, identity, and intake consent verified
                  </label>
                </div>

                {/* 2. Simulated Insurance Verification */}
                <div
                  data-demo-target="fd-modal-coverage-panel"
                  className="p-3.5 bg-[#E6F1FB]/45 border border-[#85B7EB]/65 rounded-xl flex flex-wrap items-center justify-between gap-2.5"
                >
                  <div>
                    <div className="font-semibold text-[#042C53] inline-flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#185FA5]" />
                      2. Coverage Verification (Simulated — no live clearinghouse)
                    </div>
                    <div className="text-[11px] text-[#5F5D56] mt-0.5">
                      {intakePolicy
                        ? `${intakePolicy.payerName} · Member ${intakePolicy.memberId} · Status: ${intakePolicy.status} (Checked: ${intakePolicy.eligibilityCheckedAt})`
                        : 'No primary insurance policy on file — can log Self-Pay / Simulated Verification.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    data-demo-target="fd-modal-verify-coverage-btn"
                    onClick={() => {
                      if (intakePolicy) {
                        runEligibilityCheck(intakePolicy.id);
                      } else {
                        const pol = addInsurancePolicy({
                          patientId: intakePatient.id,
                          payerName: 'Blue Cross Blue Shield MA (Simulated)',
                          payerCategory: 'Commercial',
                          planName: 'PPO Gold',
                          memberId: `BCBS-${intakePatient.mrn.replace(/\D/g, '')}`,
                          groupNumber: 'GRP-4402',
                          isPrimary: true,
                          status: 'Active',
                          eligibilityCheckedAt: `${TODAY_DATE} (Simulated)`,
                          eligibilitySummary: {
                            preventiveServices: 'Covered 100% in-network (simulated)',
                            nonCoveredNote: 'Prototype simulation only — no live clearinghouse',
                            deductibleTotal: 1000,
                            deductibleMet: 750,
                            coinsurancePct: 10,
                            copay: 25,
                          },
                        });
                        runEligibilityCheck(pol.id);
                      }
                    }}
                    className="eigen-btn-secondary text-[11px] py-1.5 px-3"
                  >
                    Verify Coverage (Simulated)
                  </button>
                </div>

                {/* 3. Intake Vitals Capture */}
                <div
                  data-demo-target="fd-modal-vitals-section"
                  className="p-3.5 border border-[#042C53]/10 rounded-xl bg-white space-y-2.5"
                >
                  <div className="font-semibold text-[#042C53]">3. Intake Vitals Capture</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label htmlFor="in-sys" className="block text-[11px] text-[#5F5D56] mb-1">BP Systolic (mmHg)</label>
                      <input id="in-sys" data-demo-target="fd-vital-sys" type="number" value={intakeSys} onChange={(e) => setIntakeSys(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                    <div>
                      <label htmlFor="in-dia" className="block text-[11px] text-[#5F5D56] mb-1">BP Diastolic (mmHg)</label>
                      <input id="in-dia" data-demo-target="fd-vital-dia" type="number" value={intakeDia} onChange={(e) => setIntakeDia(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                    <div>
                      <label htmlFor="in-hr" className="block text-[11px] text-[#5F5D56] mb-1">Heart Rate (bpm)</label>
                      <input id="in-hr" data-demo-target="fd-vital-hr" type="number" value={intakeHr} onChange={(e) => setIntakeHr(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                    <div>
                      <label htmlFor="in-temp" className="block text-[11px] text-[#5F5D56] mb-1">Temp (°F)</label>
                      <input id="in-temp" data-demo-target="fd-vital-temp" type="number" step="0.1" value={intakeTemp} onChange={(e) => setIntakeTemp(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                    <div>
                      <label htmlFor="in-spo2" className="block text-[11px] text-[#5F5D56] mb-1">SpO₂ (%)</label>
                      <input id="in-spo2" data-demo-target="fd-vital-spo2" type="number" value={intakeSpo2} onChange={(e) => setIntakeSpo2(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                    <div>
                      <label htmlFor="in-wt" className="block text-[11px] text-[#5F5D56] mb-1">Weight (kg)</label>
                      <input id="in-wt" data-demo-target="fd-vital-wt" type="number" step="0.1" value={intakeWt} onChange={(e) => setIntakeWt(e.target.value)} className="eigen-input w-full font-mono" />
                    </div>
                  </div>
                </div>

                {/* 4. Allergy Check & Rooming */}
                <div
                  data-demo-target="fd-modal-allergy-section"
                  className="p-3.5 border border-[#042C53]/10 rounded-xl bg-white space-y-2.5"
                >
                  <div className="font-semibold text-[#042C53]">4. Allergy Screening & Exam Room Assignment</div>
                  <div className="text-[11px] text-[#5F5D56]">
                    Current Allergies:{' '}
                    {intakePatient.allergies.length === 0 ? (
                      <span className="font-medium text-[#0F6E50]">NKDA documented</span>
                    ) : (
                      <span className="font-semibold text-[#B4321F]">
                        {intakePatient.allergies.map((a) => `${a.substance} (${a.reaction})`).join('; ')}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label="Add allergy substance"
                      type="text"
                      placeholder="Add allergy (e.g. Penicillin)..."
                      value={newAlgSub}
                      onChange={(e) => setNewAlgSub(e.target.value)}
                      className="eigen-input flex-1 min-w-[140px]"
                    />
                    <input
                      aria-label="Add allergy reaction"
                      type="text"
                      placeholder="Reaction (e.g. Rash)"
                      value={newAlgReact}
                      onChange={(e) => setNewAlgReact(e.target.value)}
                      className="eigen-input flex-1 min-w-[120px]"
                    />
                    <select
                      aria-label="Add allergy severity"
                      value={newAlgSev}
                      onChange={(e) => setNewAlgSev(e.target.value as 'Mild' | 'Moderate' | 'Severe')}
                      className="eigen-input"
                    >
                      <option value="Mild">Mild</option>
                      <option value="Moderate">Moderate</option>
                      <option value="Severe">Severe</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newAlgSub.trim()) return;
                        addPatientAllergy(intakePatient.id, {
                          substance: newAlgSub.trim(),
                          reaction: newAlgReact.trim() || 'Documented at intake',
                          severity: newAlgSev,
                          verified: true,
                          source: 'Clinic Intake Screening',
                          recordedDate: TODAY_DATE,
                        });
                        setNewAlgSub('');
                        setNewAlgReact('');
                      }}
                      className="eigen-btn-secondary text-xs py-1.5 px-3"
                    >
                      + Add Allergy
                    </button>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <label htmlFor="in-room" className="font-medium text-[#042C53]">Assign Exam Room:</label>
                    <select
                      id="in-room"
                      data-demo-target="fd-modal-room-select"
                      value={intakeRoom}
                      onChange={(e) => setIntakeRoom(e.target.value)}
                      className="eigen-input"
                    >
                      <option value="Exam 1">Exam 1</option>
                      <option value="Exam 2">Exam 2</option>
                      <option value="Exam 3">Exam 3</option>
                      <option value="Consult A">Consult A</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#042C53]/8">
                  <button
                    type="button"
                    onClick={() => setIntakeTarget(null)}
                    className="eigen-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-demo-target="fd-modal-submit-btn"
                    className="eigen-btn-primary text-xs"
                  >
                    Complete Check-In & Room Patient
                  </button>
                </div>
              </form>
            )}
          </Modal>
        );
      })()}

      <Modal
        open={Boolean(roomAssignTarget)}
        onClose={() => setRoomAssignTarget(null)}
        title="Assign Exam Room"
        subtitle="Move checked-in patient to active clinical room"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (roomAssignTarget) {
              updateAppointmentStatus(roomAssignTarget, 'In Room', { room: selectedRoom });
              setRoomAssignTarget(null);
            }
          }}
          className="space-y-3.5"
        >
          <label htmlFor="fd-room" className="block text-xs font-medium text-[#042C53]">
            Select Room
          </label>
          <select
            id="fd-room"
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="eigen-input w-full"
          >
            <option value="Exam 1">Exam 1</option>
            <option value="Exam 2">Exam 2</option>
            <option value="Exam 3">Exam 3</option>
            <option value="Consult A">Consult A</option>
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRoomAssignTarget(null)}
              className="eigen-btn-secondary text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="eigen-btn-primary text-xs">
              Room Patient
            </button>
          </div>
        </form>
      </Modal>
      <IntelligentRegistrationModal
        open={showScheduledReg}
        onClose={() => setShowScheduledReg(false)}
      />
    </div>
  );
};
