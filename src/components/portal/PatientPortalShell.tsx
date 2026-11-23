import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  FileText,
  Heart,
  Home,
  MessageSquare,
  Pill,
  Share2,
  Shield,
} from 'lucide-react';
import { TODAY_DATE } from '../../data/seedData';
import { computeInvoiceTotals, formatCurrency } from '../../state/domainLogic';
import { useAppState } from '../../state/AppStateContext';
import type { PatientPortalSection } from '../../types/hms';
import { EmptyState, StatusBadge } from '../ui/Primitives';

const PORTAL_NAV: { id: PatientPortalSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'summary', label: 'My Health Summary', icon: Home },
  { id: 'appointments', label: 'Appointments', icon: Calendar },
  { id: 'records', label: 'Records & Results', icon: FileText },
  { id: 'medications', label: 'Medications', icon: Pill },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'forms', label: 'Forms', icon: Shield },
  { id: 'bills', label: 'Bills', icon: CreditCard },
  { id: 'care-plans', label: 'Care Plans & Education', icon: Heart },
  { id: 'sharing', label: 'Sharing & Caregivers', icon: Share2 },
];

export const PatientPortalShell: React.FC = () => {
  const {
    state,
    setPortal,
    setPatientPortalSection,
    setActiveCaregiverProxy,
    bookAppointment,
    updateAppointmentStatus,
    requestMedicationRefill,
    sendMessageInThread,
    submitFormAssignment,
    collectInvoicePayment,
    notify,
  } = useAppState();

  const patient = state.patients.find((p) => p.id === (state.selectedPatientId || 'pat-1')) || state.patients[0];
  const facility = state.facilities.find((f) => f.id === patient.facilityId) || state.facilities[0];
  const section = state.patientPortalSection;

  // Demo booking form
  const [bookDate, setBookDate] = useState('2026-11-26');
  const [bookTime, setBookTime] = useState('10:00');
  const [bookReason, setBookReason] = useState('');

  // Messaging
  const [replyBody, setReplyBody] = useState('');

  // Form completion
  const [educationChecked, setEducationChecked] = useState<Record<string, boolean>>({
    ed1: true,
    ed2: false,
  });
  const [shareRecipient, setShareRecipient] = useState('');

  const myAppts = state.appointments.filter((a) => a.patientId === patient.id && a.status !== 'Cancelled');
  // Strict isolation: only released results and signed AVS
  const releasedLabs = state.labResults.filter((l) => l.patientId === patient.id && l.patientReleased);
  const releasedAvs = state.encounters.filter((e) => e.patientId === patient.id && e.avsReleased);
  const myMeds = state.medications.filter((m) => m.patientId === patient.id && m.status !== 'Discontinued');
  const myThreads = state.messages.filter((m) => m.patientId === patient.id);
  const myForms = state.formAssignments.filter((f) => f.patientId === patient.id);
  const myInvoices = state.invoices.filter((i) => i.patientId === patient.id);
  const myCarePlans = state.carePlans.filter((cp) => cp.patientId === patient.id);

  return (
    <div className="min-h-screen bg-[#F1EFE8]/60 text-slate-900 flex flex-col">
      {/* Patient Portal Header */}
      <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-2.5 min-h-14 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0 max-w-full">
          <span className="font-display text-lg font-bold text-[#042C53] shrink-0">EigenH</span>
          <span className="text-xs font-medium text-[#185FA5] border-l border-slate-200 pl-2.5 truncate">
            Patient & Caregiver Portal · Prototype — not for clinical use
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <label htmlFor="proxy-select" className="sr-only">
            Viewing profile
          </label>
          <select
            id="proxy-select"
            value={state.activeCaregiverProxy || 'self'}
            onChange={(e) => setActiveCaregiverProxy(e.target.value === 'self' ? null : e.target.value)}
            className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-[#F7F7F5] text-[#042C53] min-w-0 max-w-full flex-1 sm:flex-none"
          >
            <option value="self">Viewing as: {patient.fullName} (Self)</option>
            {patient.caregivers
              .filter((c) => c.portalAccess !== 'None')
              .map((cg) => (
                <option key={cg.id} value={`${cg.name} (${cg.portalAccess})`}>
                  Proxy: {cg.name} ({cg.relationship} · {cg.portalAccess})
                </option>
              ))}
          </select>

          <button
            type="button"
            onClick={() => setPortal('staff')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#042C53] text-white rounded-md hover:bg-[#185FA5] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to Staff Portal
          </button>
        </div>
      </header>

      <div className="max-w-6xl w-full mx-auto flex-1 px-4 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Clean Portal Nav */}
        <aside className="md:col-span-1 space-y-1">
          <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3">
            <div className="text-sm font-semibold text-[#042C53]">{patient.fullName}</div>
            <div className="text-xs text-[#5F5D56] font-mono mt-0.5">{patient.mrn}</div>
            {state.activeCaregiverProxy && (
              <div className="mt-2">
                <StatusBadge label={`Caregiver Proxy: ${state.activeCaregiverProxy}`} tone="blue" />
              </div>
            )}
          </div>

          <nav aria-label="Patient portal navigation" className="bg-white border border-slate-200 rounded-lg p-1.5 space-y-0.5">
            {PORTAL_NAV.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPatientPortalSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                    active ? 'bg-[#E6F1FB] text-[#042C53]' : 'text-[#5F5D56] hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-[#185FA5]' : ''}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main Patient Content */}
        <main className="md:col-span-3 space-y-4">
          {section === 'summary' && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-lg p-5">
                <h1 className="text-lg font-semibold text-[#042C53]">
                  Welcome, {state.activeCaregiverProxy ? state.activeCaregiverProxy.split(' (')[0] : patient.fullName}
                </h1>
                <p className="text-xs text-[#5F5D56] mt-1">
                  Showing verified health information shared for {patient.fullName} at {facility.name}. Internal staff notes are hidden.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setPatientPortalSection('appointments')}
                  className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-[#185FA5]"
                >
                  <div className="text-[#5F5D56]">Upcoming Visits</div>
                  <div className="text-xl font-semibold text-[#042C53] tabular-nums mt-1">{myAppts.length}</div>
                  <div className="text-[11px] text-[#185FA5] mt-1">Manage appointments →</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPatientPortalSection('records')}
                  className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-[#185FA5]"
                >
                  <div className="text-[#5F5D56]">Released Results</div>
                  <div className="text-xl font-semibold text-[#042C53] tabular-nums mt-1">{releasedLabs.length}</div>
                  <div className="text-[11px] text-[#185FA5] mt-1">View results & summaries →</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPatientPortalSection('forms')}
                  className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-[#185FA5]"
                >
                  <div className="text-[#5F5D56]">Pending Forms</div>
                  <div className="text-xl font-semibold text-[#042C53] tabular-nums mt-1">
                    {myForms.filter((f) => f.status === 'Assigned').length}
                  </div>
                  <div className="text-[11px] text-[#185FA5] mt-1">Complete intake →</div>
                </button>
              </div>
            </div>
          )}

          {section === 'appointments' && (
            <div className="space-y-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <h2 className="text-sm font-semibold text-[#042C53]">My Appointments</h2>
                {myAppts.length === 0 ? (
                  <EmptyState title="No upcoming visits" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {myAppts.map((a) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-[#042C53]">{a.type}</div>
                          <div className="font-mono text-[11px] text-[#5F5D56]">
                            {a.date} at {a.startTime} ({facility.tzAbbr}) · {a.reason}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge label={a.status} />
                          {a.status === 'Scheduled' && (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(a.id, 'Cancelled')}
                              className="text-[#B4321F] hover:underline text-[11px]"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold text-[#042C53]">Request Appointment (Demo Booking)</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!bookReason.trim()) return;
                    const res = bookAppointment({
                      patientId: patient.id,
                      providerId: patient.primaryProviderId,
                      facilityId: patient.facilityId,
                      date: bookDate,
                      startTime: bookTime,
                      durationMin: 30,
                      type: 'Patient Portal Visit',
                      subtype: 'Scheduled Visit',
                      status: 'Scheduled',
                      reason: bookReason.trim(),
                      reminderSent: true,
                      calendarSynced: false,
                      coPayAmount: 25,
                      coPayCollected: false,
                    });
                    if (res.ok) setBookReason('');
                    else notify('error', res.error || 'Slot unavailable');
                  }}
                  className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                >
                  <input type="date" value={bookDate} onChange={(e) => setBookDate(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  <input type="time" value={bookTime} onChange={(e) => setBookTime(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  <input type="text" required placeholder="Reason for visit..." value={bookReason} onChange={(e) => setBookReason(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  <button type="submit" className="sm:col-span-3 py-2 bg-[#185FA5] text-white rounded font-medium">
                    Book Demo Appointment
                  </button>
                </form>
              </div>
            </div>
          )}

          {section === 'records' && (
            <div className="space-y-4 text-xs">
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <h2 className="text-sm font-semibold text-[#042C53]">Released Lab Results</h2>
                {releasedLabs.length === 0 ? (
                  <EmptyState title="No released results available" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {releasedLabs.map((l) => (
                      <div key={l.id} className="py-2 flex items-center justify-between">
                        <div>
                          <div className="font-medium text-[#042C53]">{l.testName}</div>
                          <div className="text-[11px] font-mono text-[#5F5D56]">{l.collectionDate} · Ref {l.referenceInterval}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">{l.value} {l.unit}</span>
                          <StatusBadge label={l.flag} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <h2 className="text-sm font-semibold text-[#042C53]">After-Visit Summaries</h2>
                {releasedAvs.length === 0 ? (
                  <p className="text-[#5F5D56]">No released visit summaries yet.</p>
                ) : (
                  releasedAvs.map((e) => (
                    <div key={e.id} className="p-3 bg-[#F7F7F5] rounded space-y-1">
                      <div className="font-semibold text-[#042C53]">{e.date} — {e.type}</div>
                      <p className="text-slate-700">{e.soap.plan}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {section === 'medications' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">My Medications & Refill Requests</h2>
              <div className="divide-y divide-slate-100">
                {myMeds.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-[#042C53]">{m.name} {m.dose}</div>
                      <div className="text-[11px] text-[#5F5D56]">{m.frequency} · Pharmacy: {m.pharmacy}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge label={m.status} />
                      {m.status === 'Active' && (
                        <button
                          type="button"
                          onClick={() => requestMedicationRefill(m.id)}
                          className="px-2.5 py-1 bg-[#185FA5] text-white rounded font-medium"
                        >
                          Request Refill
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {section === 'messages' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">Care Team Messages (Staff-Only Notes Excluded)</h2>
              {myThreads.length === 0 ? (
                <EmptyState title="No messages" />
              ) : (
                myThreads.map((th) => (
                  <div key={th.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="font-semibold text-[#042C53]">{th.subject}</div>
                    {/* Filter out internal staff notes! */}
                    {th.messages
                      .filter((m) => !m.isInternalNote)
                      .map((m) => (
                        <div key={m.id} className={`p-2.5 rounded ${m.isPatient ? 'bg-[#E6F1FB]/40' : 'bg-[#F7F7F5]'}`}>
                          <div className="text-[11px] font-medium text-[#042C53]">
                            {m.sender} · <span className="font-mono text-[#5F5D56]">{m.timestamp}</span>
                          </div>
                          <p className="mt-0.5 text-slate-800">{m.body}</p>
                        </div>
                      ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!replyBody.trim()) return;
                        sendMessageInThread(th.id, replyBody.trim(), 'In-App', true);
                        setReplyBody('');
                      }}
                      className="flex gap-2 pt-1"
                    >
                      <input
                        type="text"
                        placeholder="Write a reply to your care team..."
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <button type="submit" className="px-3 py-1.5 bg-[#185FA5] text-white rounded font-medium">
                        Send
                      </button>
                    </form>
                  </div>
                ))
              )}
            </div>
          )}

          {section === 'forms' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">Forms & Consents</h2>
              {myForms.map((f) => (
                <div key={f.id} className="p-3 border border-slate-200 rounded flex items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#042C53]">{f.title}</div>
                    <div className="text-[11px] text-[#5F5D56]">Assigned {f.assignedDate} · {f.language}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={f.status} />
                    {(f.status === 'Assigned' || f.status === 'Draft') && (
                      <button
                        type="button"
                        onClick={() =>
                          submitFormAssignment(
                            f.id,
                            { completedVia: 'Patient Portal Demo' },
                            state.activeCaregiverProxy || patient.fullName
                          )
                        }
                        className="px-2.5 py-1 bg-[#185FA5] text-white rounded font-medium"
                      >
                        Complete & Sign (Demo)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 'bills' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">Bills & Simulated Payments</h2>
              {myInvoices.map((inv) => {
                const totals = computeInvoiceTotals(inv);
                return (
                  <div key={inv.id} className="p-3 border border-slate-200 rounded flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-mono font-semibold text-[#042C53]">{inv.invoiceNumber}</div>
                      <div className="text-[11px] text-[#5F5D56]">Due {inv.dueDate}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#042C53]">
                        {formatCurrency(totals.amountDue, facility.currency)}
                      </span>
                      <StatusBadge label={inv.status} />
                      {totals.amountDue > 0 && (
                        <button
                          type="button"
                          onClick={() => collectInvoicePayment(inv.id, totals.amountDue, 'Portal Demo Card')}
                          className="px-3 py-1.5 bg-[#185FA5] text-white rounded font-medium"
                        >
                          Pay Balance (Sim)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {section === 'care-plans' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">Care Plans & Education</h2>
              {myCarePlans.map((cp) => (
                <div key={cp.id} className="p-3 bg-[#F7F7F5] rounded space-y-2">
                  <div className="font-semibold text-[#042C53]">{cp.programme}</div>
                  {cp.goals.map((g) => (
                    <div key={g.id} className="text-[11px] flex justify-between">
                      <span>{g.title}</span>
                      <span className="font-mono">{g.progressPct}%</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="font-semibold text-[#042C53]">Educational Checklist</div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={educationChecked.ed1}
                    onChange={(e) => setEducationChecked((p) => ({ ...p, ed1: e.target.checked }))}
                  />
                  Understanding Kidney-Friendly Sodium & Potassium Targets
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={educationChecked.ed2}
                    onChange={(e) => setEducationChecked((p) => ({ ...p, ed2: e.target.checked }))}
                  />
                  How to Log Home Blood Pressure Readings
                </label>
              </div>
            </div>
          )}

          {section === 'sharing' && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4 text-xs">
              <h2 className="text-sm font-semibold text-[#042C53]">Authorised Caregivers & Record Sharing</h2>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                {patient.caregivers.map((cg) => (
                  <div key={cg.id} className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#042C53]">{cg.name} ({cg.relationship})</div>
                      <div className="text-[11px] text-[#5F5D56]">{cg.phone}</div>
                    </div>
                    <StatusBadge label={`Access: ${cg.portalAccess}`} tone="blue" />
                  </div>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!shareRecipient.trim()) return;
                  notify('success', `Simulated record share request logged for ${shareRecipient} (no external transfer)`);
                  setShareRecipient('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Share summary with external clinic (demo)..."
                  value={shareRecipient}
                  onChange={(e) => setShareRecipient(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded"
                />
                <button type="submit" className="px-3 py-1.5 bg-[#185FA5] text-white rounded font-medium">
                  Request Share (Sim)
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
