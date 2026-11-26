import React, { useMemo, useState } from 'react';
import { CalendarPlus, Clock, DoorOpen, RefreshCw, User } from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import { filterAppointmentsForRole } from '../state/permissions';
import { useAppState } from '../state/AppStateContext';
import type { Appointment } from '../types/hms';
import { BookAppointmentModal } from '../components/modals/QuickActionModals';
import {
  Drawer,
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
    openPatient,
    notify,
  } = useAppState();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'agenda'>('day');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [showBookModal, setShowBookModal] = useState(false);
  const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
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

  const weekDates = [
    { date: '2026-11-16', label: 'Mon 16' },
    { date: '2026-11-17', label: 'Tue 17' },
    { date: '2026-11-18', label: 'Wed 18' },
    { date: '2026-11-19', label: 'Thu 19' },
    { date: '2026-11-20', label: 'Fri 20' },
  ];

  const selectedAppt = state.appointments.find((a) => a.id === selectedApptId) || null;
  const selectedApptPatient = selectedAppt
    ? state.patients.find((p) => p.id === selectedAppt.patientId) || null
    : null;
  const selectedApptProvider = selectedAppt
    ? state.staff.find((s) => s.id === selectedAppt.providerId) || null
    : null;

  return (
    <div data-demo-target="schedule-calendar" className="space-y-5">
      <PageHeader
        title="Schedule & Provider Availability"
        subtitle={`M03 · ${currentFacility.name} (${currentFacility.tzAbbr}) · Calendar sync & reminders are simulated`}
        secondaryActions={
          <button
            type="button"
            onClick={() => setShowWaitlistOnly((v) => !v)}
            className={`px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors ${
              showWaitlistOnly
                ? 'bg-[#042C53] text-white border-[#042C53]'
                : 'bg-white text-[#042C53] border-[#042C53]/15 hover:bg-[#FAF9F6]'
            }`}
          >
            Waitlist ({waitlistCount})
          </button>
        }
        primaryAction={
          <button
            type="button"
            onClick={() => setShowBookModal(true)}
            className="eigen-btn-primary text-xs"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            Book Appointment
          </button>
        }
      />

      {/* Toolbar */}
      <div className="eigen-card p-3.5 flex flex-wrap items-center justify-between gap-3">
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
          <label htmlFor="sched-prov" className="text-xs font-medium text-[#5F5D56]">
            Provider:
          </label>
          {isIndividualClinician ? (
            <span className="text-xs font-medium text-[#042C53] bg-[#F6F6F2] border border-[#042C53]/10 rounded-xl px-3 py-1.5">
              {state.staff.find((s) => s.id === state.currentUserId)?.name || 'My Schedule'} (Assigned)
            </span>
          ) : (
            <select
              id="sched-prov"
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="eigen-input text-xs py-1.5"
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

      {/* Day Time-Block Ribbon */}
      {viewMode === 'day' && !showWaitlistOnly && filteredAppointments.length > 0 && (
        <div className="eigen-card p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
              Today’s Time Blocks · {TODAY_DATE} ({currentFacility.tzAbbr})
            </span>
            <span className="text-[11px] text-[#5F5D56]">
              Select any slot to open appointment details
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {filteredAppointments.map((a) => {
              const pat = state.patients.find((p) => p.id === a.patientId);
              const prov = state.staff.find((s) => s.id === a.providerId);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedApptId(a.id)}
                  className="text-left p-3 rounded-xl border border-[#042C53]/10 bg-[#FAF9F6] hover:bg-white hover:border-[#185FA5] transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-xs font-semibold text-[#042C53] tabular-nums">
                      {a.startTime} · {a.durationMin}m
                    </span>
                    <StatusBadge label={a.status} />
                  </div>
                  <div className="text-xs font-semibold text-[#042C53] truncate">
                    {pat?.fullName || a.patientId}
                  </div>
                  <div className="text-[11px] text-[#5F5D56] truncate">
                    {prov?.name} · {a.room || 'Unassigned'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Week Grid View */}
      {viewMode === 'week' && !showWaitlistOnly ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {weekDates.map(({ date: d, label }) => {
            const dayAppts = filteredAppointments.filter((a) => a.date === d);
            const isToday = d === TODAY_DATE;
            return (
              <div
                key={d}
                className={`eigen-card p-3.5 space-y-2.5 ${
                  isToday ? 'ring-1 ring-[#185FA5]/35 bg-[#E6F1FB]/20' : ''
                }`}
              >
                <div className="flex items-center justify-between border-b border-[#042C53]/8 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[#042C53]">{label}</span>
                    {isToday && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#185FA5] text-white">
                        Today
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-[#5F5D56] bg-[#F6F6F2] px-1.5 py-0.5 rounded-full">
                    {dayAppts.length}
                  </span>
                </div>
                {dayAppts.length === 0 ? (
                  <div className="text-[11px] text-[#5F5D56] py-6 text-center">Open slots available</div>
                ) : (
                  <div className="space-y-2">
                    {dayAppts.map((a) => (
                      <div
                        key={a.id}
                        onClick={() => setSelectedApptId(a.id)}
                        className="p-2.5 rounded-xl border border-[#042C53]/8 bg-white hover:border-[#185FA5] transition-colors text-xs space-y-1 cursor-pointer"
                      >
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
        <div className="eigen-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-[#042C53]">
              November 2026 — Clinic Schedule Overview
            </div>
            <span className="text-xs text-[#5F5D56]">{currentFacility.shortName}</span>
          </div>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56] mb-2">
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
                  className={`p-2.5 min-h-[76px] rounded-xl border text-left transition-colors ${
                    isToday
                      ? 'border-[#185FA5] bg-[#E6F1FB]/45 ring-1 ring-[#185FA5]/20'
                      : 'border-[#042C53]/8 bg-[#FAF9F6]/60 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#042C53]">{idx + 1}</span>
                    {isToday && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#185FA5]" />
                    )}
                  </div>
                  {count > 0 && (
                    <div className="mt-2 inline-block px-2 py-0.5 rounded-full bg-[#E6F1FB] text-[10px] font-semibold text-[#185FA5]">
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
        <div className="eigen-card overflow-hidden">
          {filteredAppointments.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={showWaitlistOnly ? 'Waitlist is empty' : 'No appointments match this filter'}
                description="Use Book Appointment to schedule a visit or add a patient to the waitlist."
                action={
                  <button
                    type="button"
                    onClick={() => setShowBookModal(true)}
                    className="eigen-btn-primary text-xs"
                  >
                    Book Appointment
                  </button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="eigen-table-head">
                  <tr>
                    <th className="py-3 px-4">Date & Time ({currentFacility.tzAbbr})</th>
                    <th className="py-3 px-4">Patient</th>
                    <th className="py-3 px-4">Provider & Room</th>
                    <th className="py-3 px-4">Type / Subtype</th>
                    <th className="py-3 px-4">Sync & Reminder (Sim)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#042C53]/6 text-xs">
                  {filteredAppointments.map((a) => {
                    const prov = state.staff.find((s) => s.id === a.providerId);
                    return (
                      <tr key={a.id} className="hover:bg-[#FAF9F6] transition-colors">
                        <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-[#042C53]">{a.date}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            {a.startTime} ({a.durationMin}m)
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <PatientLink patientId={a.patientId} tab="overview" showMrn />
                          <div className="text-[11px] text-[#5F5D56] mt-0.5">{a.reason}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#042C53]">{prov?.name}</div>
                          <div className="text-[11px] text-[#5F5D56]">{a.room || 'Room unassigned'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#042C53]">{a.type}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            {a.subtype}
                            {a.recurringSeriesId ? ' · Recurring Series' : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4">
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
                            className="text-[11px] font-medium text-[#185FA5] hover:underline inline-flex items-center gap-1 mt-0.5 whitespace-nowrap"
                          >
                            <RefreshCw className="w-3 h-3 shrink-0" />
                            <span>{a.calendarSynced ? 'Synced (Sim)' : 'Log Reminder (Sim)'}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge label={a.status} />
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedApptId(a.id)}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#185FA5] hover:bg-[#E6F1FB] rounded-lg transition-colors"
                          >
                            Details
                          </button>
                          {a.status === 'Scheduled' || a.status === 'Waitlist' ? (
                            <button
                              type="button"
                              onClick={() => updateAppointmentStatus(a.id, 'Confirmed')}
                              className="px-2.5 py-1 text-[11px] font-medium bg-[#E6F1FB] text-[#042C53] rounded-lg hover:bg-[#85B7EB]/40 transition-colors"
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
                                className="px-2.5 py-1 text-[11px] font-medium border border-[#042C53]/15 bg-white text-[#042C53] rounded-lg hover:bg-[#FAF9F6] transition-colors"
                              >
                                Reschedule
                              </button>
                              <button
                                type="button"
                                onClick={() => updateAppointmentStatus(a.id, 'Cancelled')}
                                className="px-2.5 py-1 text-[11px] font-medium text-[#B4321F] hover:bg-red-50 rounded-lg transition-colors"
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

      {/* Contextual Appointment Details Drawer */}
      <Drawer
        open={Boolean(selectedAppt)}
        onClose={() => setSelectedApptId(null)}
        title={selectedApptPatient ? `${selectedApptPatient.fullName}` : 'Appointment Details'}
        subtitle={
          selectedAppt
            ? `${selectedAppt.date} · ${selectedAppt.startTime} (${selectedAppt.durationMin} min) · ${currentFacility.tzAbbr}`
            : ''
        }
      >
        {selectedAppt && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#042C53]/8">
              <StatusBadge label={selectedAppt.status} />
              <span className="font-mono text-[11px] text-[#5F5D56]">
                {selectedAppt.type} · {selectedAppt.subtype}
              </span>
            </div>

            <dl className="space-y-2.5 bg-[#FAF9F6] border border-[#042C53]/8 rounded-xl p-3.5">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#5F5D56] inline-flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#185FA5]" />
                  Provider
                </dt>
                <dd className="font-medium text-[#042C53]">
                  {selectedApptProvider?.name || 'Unassigned'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#5F5D56] inline-flex items-center gap-1.5">
                  <DoorOpen className="w-3.5 h-3.5 text-[#185FA5]" />
                  Exam Room
                </dt>
                <dd className="font-medium text-[#042C53]">
                  {selectedAppt.room || 'Room unassigned'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#5F5D56] inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#185FA5]" />
                  Reminder (Sim)
                </dt>
                <dd className="font-medium text-[#042C53]">
                  {selectedAppt.reminderStatus || (selectedAppt.reminderSent ? 'Simulated Logged' : 'Pending')}
                </dd>
              </div>
            </dl>

            <div className="bg-white border border-[#042C53]/10 rounded-xl p-3.5 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                Visit Reason
              </div>
              <div className="text-[#042C53] leading-relaxed">{selectedAppt.reason}</div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#042C53]/8">
              <button
                type="button"
                onClick={() => {
                  const pid = selectedAppt.patientId;
                  setSelectedApptId(null);
                  openPatient(pid, 'overview');
                }}
                className="eigen-btn-navy flex-1 justify-center text-xs"
              >
                Open Patient 360°
              </button>
              {selectedAppt.status !== 'Cancelled' && selectedAppt.status !== 'Completed' && (
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedAppt;
                    setSelectedApptId(null);
                    setRescheduleTarget(target);
                    setNewDate(target.date);
                    setNewTime(target.startTime);
                    setNewRoom(target.room || '');
                    setReschedError('');
                  }}
                  className="eigen-btn-secondary text-xs"
                >
                  Reschedule
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

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
            className="space-y-3.5"
          >
            {reschedError && (
              <div className="p-3 text-xs text-[#B4321F] bg-red-50 border border-red-200 rounded-xl">
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
                  className="eigen-input w-full font-mono"
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
                  className="eigen-input w-full font-mono"
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
                className="eigen-input w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#042C53]/8">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="eigen-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="eigen-btn-primary text-xs">
                Save New Slot
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
