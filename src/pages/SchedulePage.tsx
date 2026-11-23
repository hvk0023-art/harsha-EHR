import React, { useMemo, useState } from 'react';
import { CalendarPlus, RefreshCw } from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import { filterAppointmentsForRole } from '../state/permissions';
import { useAppState } from '../state/AppStateContext';
import type { Appointment } from '../types/hms';
import { BookAppointmentModal } from '../components/modals/QuickActionModals';
import {
  EmptyState,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const SchedulePage: React.FC = () => {
  const {
    state,
    currentFacility,
    updateAppointmentStatus,
    rescheduleAppointment,
    notify,
  } = useAppState();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('day');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showBookModal, setShowBookModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState(TODAY_DATE);
  const [newTime, setNewTime] = useState('14:00');
  const [newRoom, setNewRoom] = useState('');
  const [reschedError, setReschedError] = useState('');
  const [showWaitlistOnly, setShowWaitlistOnly] = useState(false);

  const facilityProviders = useMemo(
    () => state.staff.filter((s) => s.facilityId === state.currentFacilityId && s.role === 'Clinician'),
    [state.currentFacilityId, state.staff]
  );

  const isIndividualClinician = state.currentRole === 'Clinician';
  const effectiveProviderFilter = isIndividualClinician ? state.currentUserId : providerFilter;

  const filteredAppointments = useMemo(() => {
    const roleScoped = filterAppointmentsForRole(state.appointments, {
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
    });
    return roleScoped
      .filter((a) => {
        if (effectiveProviderFilter !== 'all' && a.providerId !== effectiveProviderFilter) return false;
        if (showWaitlistOnly) return a.status === 'Waitlist';
        if (viewMode === 'day') return a.date === TODAY_DATE && a.status !== 'Waitlist';
        return a.status !== 'Waitlist';
      })
      .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }, [effectiveProviderFilter, showWaitlistOnly, state.appointments, state.currentFacilityId, state.currentRole, state.currentUserId, viewMode]);

  const waitlistCount = state.appointments.filter(
    (a) => a.facilityId === state.currentFacilityId && a.status === 'Waitlist'
  ).length;

  const weekDates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

  return (
    <div data-demo-target="schedule-calendar" className="space-y-4">
      <PageHeader
        title="Schedule & Provider Availability"
        subtitle={`M03 · ${currentFacility.name} (${currentFacility.tzAbbr}) · Calendar sync & reminders are simulated`}
        secondaryActions={
          <button
            type="button"
            onClick={() => setShowWaitlistOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border ${
              showWaitlistOnly
                ? 'bg-[#042C53] text-white border-[#042C53]'
                : 'bg-white text-[#042C53] border-slate-300 hover:bg-slate-50'
            }`}
          >
            Waitlist ({waitlistCount})
          </button>
        }
        primaryAction={
          <button
            type="button"
            onClick={() => setShowBookModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Book Appointment
          </button>
        }
      />

      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          tabs={[
            { id: 'day', label: 'Day' },
            { id: 'week', label: 'Week' },
            { id: 'month', label: 'Month' },
            { id: 'agenda', label: 'Agenda' },
          ]}
          activeId={viewMode}
          onChange={(id) => {
            setShowWaitlistOnly(false);
            setViewMode(id as typeof viewMode);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="sched-prov" className="text-xs text-[#5F5D56]">
            Provider:
          </label>
          {isIndividualClinician ? (
            <span className="text-xs font-medium text-[#042C53] bg-[#F7F7F5] border border-slate-200 rounded-md px-2.5 py-1.5">
              {state.staff.find((s) => s.id === state.currentUserId)?.name || 'My Schedule'} (Assigned)
            </span>
          ) : (
            <select
              id="sched-prov"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
            >
              <option value="all">All Providers ({facilityProviders.length})</option>
              {facilityProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Week Grid View */}
      {viewMode === 'week' && !showWaitlistOnly ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {weekDates.map((d) => {
            const dayAppts = filteredAppointments.filter((a) => a.date === d);
            return (
              <div key={d} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-mono text-xs font-semibold text-[#042C53]">
                    {d} {d === TODAY_DATE ? '(Today)' : ''}
                  </span>
                  <span className="text-[11px] font-mono text-[#5F5D56]">{dayAppts.length}</span>
                </div>
                {dayAppts.length === 0 ? (
                  <div className="text-[11px] text-[#5F5D56] py-4 text-center">Open slots available</div>
                ) : (
                  <div className="space-y-2">
                    {dayAppts.map((a) => (
                      <div key={a.id} className="p-2 rounded border border-slate-200 bg-[#F7F7F5] text-xs space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[11px] font-semibold text-[#042C53]">
                            {a.startTime}
                          </span>
                          <StatusBadge label={a.status} />
                        </div>
                        <PatientLink patientId={a.patientId} tab="overview" className="text-xs block truncate" />
                        <div className="text-[11px] text-[#5F5D56] truncate">{a.type}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : viewMode === 'month' && !showWaitlistOnly ? (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-[#042C53] mb-3">November 2026 — Clinic Schedule Overview</div>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-medium text-[#5F5D56] mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 30 }, (_, idx) => {
              const dayStr = `2026-11-${String(idx + 1).padStart(2, '0')}`;
              const count = state.appointments.filter(
                (a) => a.facilityId === state.currentFacilityId && a.date === dayStr && a.status !== 'Cancelled'
              ).length;
              const isToday = dayStr === TODAY_DATE;
              return (
                <div
                  key={dayStr}
                  className={`p-2 min-h-[68px] rounded border text-left ${
                    isToday ? 'border-[#185FA5] bg-[#E6F1FB]/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="font-mono text-[11px] font-semibold text-[#042C53]">{idx + 1}</div>
                  {count > 0 && (
                    <div className="mt-1 text-[11px] font-medium text-[#185FA5]">
                      {count} visit{count > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Day / Agenda / Waitlist Table */
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredAppointments.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={showWaitlistOnly ? 'Waitlist is empty' : 'No appointments match this filter'}
                description="Use Book Appointment to schedule a visit or add a patient to the waitlist."
                action={
                  <button
                    type="button"
                    onClick={() => setShowBookModal(true)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
                  >
                    Book Appointment
                  </button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                  <tr>
                    <th className="py-2.5 px-3">Date & Time ({currentFacility.tzAbbr})</th>
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Provider & Room</th>
                    <th className="py-2.5 px-3">Type / Subtype</th>
                    <th className="py-2.5 px-3">Sync & Reminder (Sim)</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredAppointments.map((a) => {
                    const prov = state.staff.find((s) => s.id === a.providerId);
                    return (
                      <tr key={a.id} className="hover:bg-[#E6F1FB]/25">
                        <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-[#042C53]">{a.date}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            {a.startTime} ({a.durationMin}m)
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <PatientLink patientId={a.patientId} tab="overview" showMrn />
                          <div className="text-[11px] text-[#5F5D56]">{a.reason}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{prov?.name}</div>
                          <div className="text-[11px] text-[#5F5D56]">{a.room || 'Room unassigned'}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{a.type}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            {a.subtype}
                            {a.recurringSeriesId ? ' · Recurring Series' : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-[11px] text-[#5F5D56]">
                            Reminder: {a.reminderStatus || (a.reminderSent ? 'Simulated Logged' : 'Pending')}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              updateAppointmentStatus(a.id, a.status, {
                                reminderSent: true,
                                reminderStatus: 'Simulated Logged',
                                calendarSynced: true,
                              });
                              notify('info', 'Reminder marked Simulated Logged (no external SMS/email sent)');
                            }}
                            className="text-[11px] text-[#185FA5] hover:underline inline-flex items-center gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            {a.calendarSynced ? 'Synced (Sim)' : 'Log Reminder (Sim)'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge label={a.status} />
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                          {a.status === 'Scheduled' || a.status === 'Waitlist' ? (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(a.id, 'Confirmed')}
                              className="px-2 py-1 text-[11px] font-medium bg-[#E6F1FB] text-[#042C53] rounded hover:bg-[#85B7EB]/40"
                            >
                              Confirm
                            </button>
                          ) : null}
                          {a.status !== 'Cancelled' && a.status !== 'Completed' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setRescheduleTarget(a);
                                  setNewDate(a.date);
                                  setNewTime(a.startTime);
                                  setNewRoom(a.room || '');
                                  setReschedError('');
                                }}
                                className="px-2 py-1 text-[11px] font-medium border border-slate-200 rounded hover:bg-slate-50"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => updateAppointmentStatus(a.id, 'Cancelled')}
                                className="px-2 py-1 text-[11px] font-medium text-[#B4321F] hover:bg-red-50 rounded"
                              >
                                Cancel
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
      )}

      <BookAppointmentModal open={showBookModal} onClose={() => setShowBookModal(false)} />

      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Reschedule Appointment"
        subtitle="Slot conflict check enforced across provider & room"
      >
        {rescheduleTarget && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const res = rescheduleAppointment(rescheduleTarget.id, newDate, newTime, newRoom || undefined);
              if (!res.ok) {
                setReschedError(res.error || 'Conflict detected');
                return;
              }
              setRescheduleTarget(null);
            }}
            className="space-y-3"
          >
            {reschedError && (
              <div className="p-2.5 text-xs text-[#B4321F] bg-red-50 border border-red-200 rounded">
                {reschedError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="rs-date" className="block text-xs font-medium text-[#042C53] mb-1">
                  New Date
                </label>
                <input
                  id="rs-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="rs-time" className="block text-xs font-medium text-[#042C53] mb-1">
                  New Start Time
                </label>
                <input
                  id="rs-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                />
              </div>
            </div>
            <div>
              <label htmlFor="rs-room" className="block text-xs font-medium text-[#042C53] mb-1">
                Room
              </label>
              <input
                id="rs-room"
                type="text"
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                placeholder="e.g. Exam 1"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
              >
                Save New Slot
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
