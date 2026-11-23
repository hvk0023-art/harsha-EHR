import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarPlus,
  CheckSquare,
  Clapperboard,
  FileSignature,
  Play,
  Star,
  UserPlus,
} from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import { computeTaskSummary, formatCurrency } from '../state/domainLogic';
import {
  canViewTeamWork,
  filterAppointmentsForRole,
  filterTasksForRole,
  getRoleScopeDescription,
} from '../state/permissions';
import { useAppState } from '../state/AppStateContext';
import { useDemoDirector } from '../demo/DemoDirectorContext';
import {
  BookAppointmentModal,
  CreateTaskModal,
  RegisterPatientModal,
} from '../components/modals/QuickActionModals';
import {
  EmptyState,
  MetricTile,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const HomeDashboardPage: React.FC = () => {
  const {
    state,
    currentFacility,
    openPatient,
    setNav,
    updateAppointmentStatus,
    updateTaskStatus,
    togglePatientFavourite,
  } = useAppState();
  const { startScenario, isDemoMode } = useDemoDirector();

  const teamWorkAllowed = canViewTeamWork(state.currentRole);
  const [scopeTab, setScopeTab] = useState<'my' | 'team'>('my');
  const effectiveScope: 'my' | 'team' = teamWorkAllowed ? scopeTab : 'my';
  const [showRegister, setShowRegister] = useState(false);
  const [showBook, setShowBook] = useState(false);
  const [showTask, setShowTask] = useState(false);

  const facilityAppts = useMemo(
    () =>
      filterAppointmentsForRole(state.appointments, {
        role: state.currentRole,
        userId: state.currentUserId,
        facilityId: state.currentFacilityId,
        teamScope: effectiveScope === 'team',
      })
        .filter((a) => a.date === TODAY_DATE && a.status !== 'Cancelled')
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [effectiveScope, state.appointments, state.currentFacilityId, state.currentRole, state.currentUserId]
  );

  const taskSummary = useMemo(
    () => computeTaskSummary(state.tasks, state.currentUserId, state.currentFacilityId, TODAY_DATE),
    [state.tasks, state.currentUserId, state.currentFacilityId]
  );

  const visibleTasks = useMemo(() => {
    return filterTasksForRole(state.tasks, {
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
      scope: effectiveScope === 'my' ? 'mine' : 'all',
    }).filter((t) => t.status !== 'Complete');
  }, [effectiveScope, state.currentFacilityId, state.currentRole, state.currentUserId, state.tasks]);

  const pendingSignatures = useMemo(
    () =>
      state.encounters.filter(
        (e) =>
          e.facilityId === state.currentFacilityId &&
          (e.noteStatus === 'Draft' || e.noteStatus === 'Awaiting Signature')
      ),
    [state.encounters, state.currentFacilityId]
  );

  const criticalAlerts = useMemo(() => {
    const labs = state.labResults.filter(
      (l) => l.facilityId === state.currentFacilityId && l.status !== 'Reviewed' && l.flag !== 'Normal'
    );
    const rpm = state.rpmDevices.filter((d) => {
      const p = state.patients.find((pat) => pat.id === d.patientId);
      return p?.facilityId === state.currentFacilityId && d.alertState !== 'Normal';
    });
    return { labs, rpm };
  }, [state.currentFacilityId, state.labResults, state.patients, state.rpmDevices]);

  const favouritePatients = useMemo(
    () => state.patients.filter((p) => p.facilityId === state.currentFacilityId && p.favourite),
    [state.currentFacilityId, state.patients]
  );

  const billingExceptions = useMemo(
    () =>
      state.claims.filter(
        (c) =>
          c.facilityId === state.currentFacilityId &&
          (c.status === 'Rejected' || c.status === 'Denied' || c.status === 'Validated')
      ),
    [state.claims, state.currentFacilityId]
  );

  const handleStartQuickEncounter = () => {
    const nextAppt = facilityAppts[0];
    if (nextAppt) {
      openPatient(nextAppt.patientId, 'encounters');
    } else {
      const pat = state.patients.find((p) => p.facilityId === state.currentFacilityId) || state.patients[0];
      if (pat) openPatient(pat.id, 'encounters');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${effectiveScope === 'my' ? 'My Workspace' : 'Team Dashboard'} — ${state.currentRole}`}
        subtitle={`${currentFacility.name} · ${TODAY_DATE} (${currentFacility.tzAbbr}) · ${getRoleScopeDescription(state.currentRole)}`}
        secondaryActions={
          teamWorkAllowed ? (
            <SegmentedTabs
              tabs={[
                { id: 'my', label: 'My Dashboard' },
                { id: 'team', label: 'Team Dashboard' },
              ]}
              activeId={effectiveScope}
              onChange={(id) => setScopeTab(id as 'my' | 'team')}
            />
          ) : (
            <span className="text-[11px] font-medium text-[#5F5D56] bg-[#F1EFE8] border border-slate-200 rounded px-2.5 py-1">
              Assigned Scope Only (Prototype Role Preview)
            </span>
          )
        }
        primaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-[#042C53] rounded-md hover:bg-slate-50"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              Register Patient
            </button>
            <button
              type="button"
              onClick={() => setShowBook(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-[#042C53] rounded-md hover:bg-slate-50"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              Book Appointment
            </button>
            <button
              type="button"
              onClick={() => setShowTask(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-[#042C53] rounded-md hover:bg-slate-50"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#185FA5]" />
              Create Task
            </button>
            <button
              type="button"
              onClick={handleStartQuickEncounter}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#185FA5] hover:bg-[#042C53] text-white rounded-md"
            >
              <Play className="w-3.5 h-3.5" />
              Start Encounter
            </button>
          </div>
        }
      />

      {!isDemoMode && (
        <section
          data-demo-target="home-academy-banner"
          className="bg-white border border-slate-200 border-l-4 border-l-[#185FA5] rounded-lg px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Clapperboard className="w-4 h-4 text-[#185FA5] shrink-0" />
              <h2 className="text-sm font-semibold text-[#042C53]">
                EigenH Guided Demo Academy
              </h2>
            </div>
            <p className="text-xs text-[#5F5D56] mt-0.5">
              Learn every clinical workflow by watching the EHR demonstrate itself — live cursor guidance, visible data entry, AI-prepared review gates, and hands-on practice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => startScenario('demo-01-scheduled-journey', { autoPlay: true, learningMode: 'watch' })}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#042C53] hover:bg-[#185FA5] text-white rounded-md"
            >
              <Play className="w-3.5 h-3.5" />
              Watch Complete Patient Journey
            </button>
            <button
              type="button"
              onClick={() => setNav('demo-scenarios')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-[#042C53] hover:bg-slate-50 rounded-md"
            >
              Explore Workflows by Role (8)
            </button>
          </div>
        </section>
      )}

      {/* Role-specific decision strip (max 4 concise tiles) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {state.currentRole === 'Billing User' ? (
          <>
            <MetricTile
              label="Claim Exceptions"
              value={billingExceptions.length}
              detail="Rejected, denied or ready to submit"
              tone={billingExceptions.length > 0 ? 'warning' : 'default'}
              onClick={() => setNav('billing')}
            />
            <MetricTile
              label="Open Invoices"
              value={state.invoices.filter((i) => i.facilityId === state.currentFacilityId && i.status !== 'Paid').length}
              detail="Awaiting patient collection"
              onClick={() => setNav('billing')}
            />
            <MetricTile
              label="Revenue Tasks"
              value={visibleTasks.length}
              detail={`${taskSummary.overdue} overdue`}
              tone={taskSummary.overdue > 0 ? 'danger' : 'default'}
              onClick={() => setNav('tasks')}
            />
            <MetricTile
              label="Today's Visits"
              value={facilityAppts.length}
              detail="Eligible for charge capture"
              onClick={() => setNav('schedule')}
            />
          </>
        ) : state.currentRole === 'Front Desk' ? (
          <>
            <MetricTile
              label="Expected Today"
              value={facilityAppts.length}
              detail={`${facilityAppts.filter((a) => a.status === 'Checked In' || a.status === 'In Room').length} arrived`}
              onClick={() => setNav('front-desk')}
            />
            <MetricTile
              label="Intake Incomplete"
              value={
                facilityAppts.filter((a) => {
                  const p = state.patients.find((pat) => pat.id === a.patientId);
                  return p && !p.intakeFormsComplete;
                }).length
              }
              detail="Forms or consent needed"
              tone="warning"
              onClick={() => setNav('front-desk')}
            />
            <MetricTile
              label="Co-pays Pending"
              value={facilityAppts.filter((a) => a.coPayAmount > 0 && !a.coPayCollected).length}
              detail="Check-in collection due"
              onClick={() => setNav('front-desk')}
            />
            <MetricTile
              label="Front Desk Tasks"
              value={visibleTasks.length}
              detail={`${taskSummary.overdue} overdue`}
              onClick={() => setNav('tasks')}
            />
          </>
        ) : (
          <>
            <MetricTile
              label="Today's Patients"
              value={facilityAppts.length}
              detail={`${facilityAppts.filter((a) => a.status === 'Checked In' || a.status === 'In Room').length} checked in / roomed`}
              onClick={() => setNav('schedule')}
            />
            <MetricTile
              label={effectiveScope === 'my' ? 'My Open Tasks' : 'Team Open Tasks'}
              value={effectiveScope === 'my' ? taskSummary.myOpen : taskSummary.myOpen + taskSummary.teamOpen}
              detail={`${taskSummary.overdue} overdue`}
              tone={taskSummary.overdue > 0 ? 'warning' : 'default'}
              onClick={() => setNav('tasks')}
            />
            <MetricTile
              label="Pending Signatures"
              value={pendingSignatures.length}
              detail="Draft or awaiting sign-off"
              tone={pendingSignatures.length > 0 ? 'warning' : 'default'}
              onClick={() => {
                if (pendingSignatures[0]) openPatient(pendingSignatures[0].patientId, 'encounters');
              }}
            />
            <MetricTile
              label="Critical / Abnormal Alerts"
              value={criticalAlerts.labs.length + criticalAlerts.rpm.length}
              detail={`${criticalAlerts.labs.filter((l) => l.flag === 'Critical').length} critical lab`}
              tone={criticalAlerts.labs.some((l) => l.flag === 'Critical') ? 'danger' : 'default'}
              onClick={() => setNav('inbox')}
            />
          </>
        )}
      </div>

      {/* Section 13: Equal-height, aligned top & bottom edges, independent scroll on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* Left Card: Today's Patients */}
        <section
          aria-label="Today's Patients"
          data-demo-target="home-todays-patients"
          className="bg-white border border-slate-200 rounded-lg flex flex-col lg:h-[clamp(360px,48vh,540px)] overflow-hidden"
        >
          <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-[#042C53]">Today’s Patients</h2>
              <p className="text-[11px] text-[#5F5D56]">
                {facilityAppts.length} visits · {currentFacility.shortName} ({currentFacility.tzAbbr})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNav('schedule')}
              className="text-xs font-medium text-[#185FA5] hover:underline whitespace-nowrap"
            >
              Full Schedule
            </button>
          </div>

          <div className="flex-1 overflow-y-auto eigen-scroll">
            {facilityAppts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="No appointments scheduled today"
                  description="Book a visit or switch facility to view another clinic schedule."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowBook(true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
                    >
                      Book Appointment
                    </button>
                  }
                />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                  <tr>
                    <th className="py-2 px-3">Time</th>
                    <th className="py-2 px-3">Patient</th>
                    <th className="py-2 px-3 hidden sm:table-cell">Visit / Subtype</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {facilityAppts.map((a) => (
                    <tr key={a.id} className="hover:bg-[#E6F1FB]/30">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[#042C53] whitespace-nowrap">
                        {a.startTime}
                      </td>
                      <td className="py-2.5 px-3">
                        <PatientLink patientId={a.patientId} tab="overview" showMrn />
                        <div className="text-[11px] text-[#5F5D56]">
                          {a.room ? `${a.room} · ` : ''}
                          {a.reason}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell">
                        <div className="text-slate-800">{a.type}</div>
                        <div className="text-[11px] text-[#5F5D56]">{a.subtype}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={a.status} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {state.currentRole === 'Front Desk' && a.status === 'Pre-Registered' ? (
                          <button
                            type="button"
                            onClick={() => updateAppointmentStatus(a.id, 'Checked In')}
                            className="px-2 py-1 text-[11px] font-medium text-[#042C53] bg-[#E6F1FB] hover:bg-[#85B7EB]/40 rounded"
                          >
                            Check In
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-demo-target={a.patientId === 'pat-demo-elena' ? 'home-open-elena-btn' : undefined}
                            onClick={() => openPatient(a.patientId, 'pre-consultation')}
                            className="px-2 py-1 text-[11px] font-medium text-[#185FA5] hover:underline"
                          >
                            Open Chart
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Right Card: My Work Queue */}
        <section
          aria-label="My Work Queue"
          className="bg-white border border-slate-200 rounded-lg flex flex-col lg:h-[clamp(360px,48vh,540px)] overflow-hidden"
        >
          <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-[#042C53]">
                {effectiveScope === 'my' ? 'My Work Queue' : 'Team Work Queue'}
              </h2>
              <p className="text-[11px] text-[#5F5D56] tabular-nums">
                {visibleTasks.length} open · {taskSummary.overdue} overdue
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNav('tasks')}
              className="text-xs font-medium text-[#185FA5] hover:underline whitespace-nowrap"
            >
              All Tasks
            </button>
          </div>

          <div className="flex-1 overflow-y-auto eigen-scroll divide-y divide-slate-100">
            {visibleTasks.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  title="Queue clear"
                  description="No open tasks assigned in this worklist."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowTask(true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
                    >
                      Create Task
                    </button>
                  }
                />
              </div>
            ) : (
              visibleTasks.map((t) => {
                const owner = state.staff.find((s) => s.id === t.ownerId);
                const isOverdue = t.dueDate < TODAY_DATE;
                return (
                  <div key={t.id} className="px-4 py-3 hover:bg-slate-50 flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={t.priority} />
                        <span className="text-xs font-medium text-[#042C53]">{t.title}</span>
                      </div>
                      <div className="text-[11px] text-[#5F5D56] flex flex-wrap items-center gap-1.5">
                        {t.patientId && (
                          <>
                            <PatientLink patientId={t.patientId} tab="overview" className="text-[11px]" />
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span>{owner?.name || 'Unassigned'}</span>
                        <span aria-hidden="true">·</span>
                        <span className={`font-mono tabular-nums ${isOverdue ? 'text-[#B4321F] font-semibold' : ''}`}>
                          Due {t.dueDate}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        aria-label={`Change status for ${t.title}`}
                        value={t.status}
                        onChange={(e) => updateTaskStatus(t.id, e.target.value as typeof t.status)}
                        className="text-[11px] border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Complete">Complete</option>
                      </select>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Secondary Operational Row: Pending Signatures, Critical Alerts, Favourites */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending Signatures */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53] inline-flex items-center gap-1.5">
              <FileSignature className="w-4 h-4 text-[#185FA5]" />
              Pending Signatures
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#5F5D56]">{pendingSignatures.length}</span>
          </div>
          {pendingSignatures.length === 0 ? (
            <p className="text-xs text-[#5F5D56]">All notes signed.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingSignatures.map((enc) => (
                <div key={enc.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={enc.patientId} tab="encounters" />
                    <div className="text-[11px] text-[#5F5D56] truncate">
                      {enc.type} · {enc.date}
                    </div>
                  </div>
                  <StatusBadge label={enc.noteStatus} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Critical & Abnormal Alerts */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53] inline-flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-[#B4321F]" />
              Critical & Abnormal Alerts
            </h2>
            <button
              type="button"
              onClick={() => setNav('inbox')}
              className="text-xs font-medium text-[#185FA5] hover:underline"
            >
              Open Inbox
            </button>
          </div>
          {criticalAlerts.labs.length === 0 && criticalAlerts.rpm.length === 0 ? (
            <p className="text-xs text-[#5F5D56]">No pending clinical alerts.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {criticalAlerts.labs.map((lab) => (
                <div key={lab.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={lab.patientId} tab="orders-results" />
                    <div className="text-[11px] text-[#5F5D56] font-mono tabular-nums truncate">
                      {lab.testName}: {lab.value} {lab.unit}
                    </div>
                  </div>
                  <StatusBadge label={lab.flag} />
                </div>
              ))}
              {criticalAlerts.rpm.map((dev) => (
                <div key={dev.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={dev.patientId} tab="care-plan" />
                    <div className="text-[11px] text-[#5F5D56] truncate">
                      RPM {dev.deviceType}: {dev.lastValue}
                    </div>
                  </div>
                  <StatusBadge label={dev.alertState} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent & Favourite Patients / Role Quick Panel */}
        <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#042C53] inline-flex items-center gap-1.5">
              <Star className="w-4 h-4 text-[#C97A1B]" />
              {state.currentRole === 'Billing User' ? 'Billing Action Queue' : 'Favourite Patients'}
            </h2>
            <button
              type="button"
              onClick={() => setNav(state.currentRole === 'Billing User' ? 'billing' : 'patients')}
              className="text-xs font-medium text-[#185FA5] hover:underline"
            >
              View All
            </button>
          </div>
          {state.currentRole === 'Billing User' ? (
            <div className="divide-y divide-slate-100">
              {billingExceptions.slice(0, 4).map((clm) => (
                <div key={clm.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono font-medium text-[#042C53]">{clm.claimNumber}</div>
                    <div className="text-[11px] text-[#5F5D56] truncate">
                      {clm.payerName} · {formatCurrency(clm.chargeAmount, currentFacility.currency)}
                    </div>
                  </div>
                  <StatusBadge label={clm.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(favouritePatients.length > 0
                ? favouritePatients
                : state.patients.filter((p) => p.facilityId === state.currentFacilityId).slice(0, 3)
              ).map((p) => (
                <div key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={p.id} tab="overview" showMrn />
                    <div className="text-[11px] text-[#5F5D56] truncate">
                      {p.conditions[0]?.name || 'Active Chart'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePatientFavourite(p.id)}
                    aria-label={p.favourite ? `Remove ${p.fullName} from favourites` : `Add ${p.fullName} to favourites`}
                    className="p-1 text-[#C97A1B] hover:bg-amber-50 rounded"
                  >
                    <Star className={`w-3.5 h-3.5 ${p.favourite ? 'fill-[#C97A1B]' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <RegisterPatientModal open={showRegister} onClose={() => setShowRegister(false)} />
      <BookAppointmentModal open={showBook} onClose={() => setShowBook(false)} />
      <CreateTaskModal open={showTask} onClose={() => setShowTask(false)} />
    </div>
  );
};
