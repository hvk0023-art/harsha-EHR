import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CalendarPlus,
  CheckSquare,
  Clapperboard,
  ClipboardCheck,
  CreditCard,
  FileSignature,
  Play,
  Search,
  Sparkles,
  Star,
  UserPlus,
  Users,
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
import { AskEigenHPanel } from '../components/ai/AskEigenHPanel';
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
  const [showAskEigenH, setShowAskEigenH] = useState(false);
  const canUseAskEigenH =
    state.currentRole === 'Clinician' ||
    state.currentRole === 'Nurse Practitioner' ||
    state.currentRole === 'Nurse / Care Coordinator' ||
    state.currentRole === 'Supervisor' ||
    state.currentRole === 'Administrator';

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
    <div className="space-y-6">
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
            <span className="text-[11px] font-medium text-[#5F5D56] bg-[#F1EFE8] border border-[#042C53]/[0.08] rounded-full px-3 py-1">
              Assigned Scope · Prototype Preview
            </span>
          )
        }
        primaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowRegister(true)}
              className="eigen-btn-secondary px-3 py-2 text-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              Register Patient
            </button>
            <button
              type="button"
              onClick={() => setShowBook(true)}
              className="eigen-btn-secondary px-3 py-2 text-xs"
            >
              <CalendarPlus className="w-3.5 h-3.5 text-[#185FA5]" />
              Book Appointment
            </button>
            <button
              type="button"
              onClick={() => setShowTask(true)}
              className="eigen-btn-secondary px-3 py-2 text-xs"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#185FA5]" />
              Create Task
            </button>
            <button
              type="button"
              onClick={handleStartQuickEncounter}
              className="eigen-btn-primary px-4 py-2 text-xs"
            >
              <Play className="w-3.5 h-3.5" />
              Start Encounter
            </button>
            {canUseAskEigenH && (
              <button
                type="button"
                data-demo-target="home-ask-eigenh-btn"
                onClick={() => setShowAskEigenH((v) => !v)}
                aria-expanded={showAskEigenH}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors ${
                  showAskEigenH
                    ? 'bg-[#042C53] text-white'
                    : 'bg-[#EFF6FC] hover:bg-[#E6F1FB] border border-[#185FA5]/30 text-[#185FA5]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <Search className="w-3 h-3" />
                Ask EigenH
              </button>
            )}
          </div>
        }
      />

      {canUseAskEigenH && showAskEigenH && (
        <AskEigenHPanel compact onClose={() => setShowAskEigenH(false)} />
      )}

      {!isDemoMode && (
        <section
          data-demo-target="home-academy-banner"
          className="rounded-2xl bg-[#EFF6FC] border border-[#85B7EB]/45 px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shadow-[0_1px_2px_rgba(4,44,83,0.03)]"
        >
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#85B7EB]/50 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <Clapperboard className="w-4 h-4 text-[#185FA5]" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-semibold text-[#042C53]">
                EigenH Guided Demo Academy
              </h2>
              <p className="text-xs text-[#444441] mt-0.5 leading-relaxed max-w-2xl">
                Learn every clinical workflow by watching the EHR demonstrate itself — live cursor guidance, visible data entry, AI-prepared review gates, and hands-on practice.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => startScenario('demo-01-scheduled-journey', { autoPlay: true, learningMode: 'watch' })}
              className="eigen-btn-navy px-4 py-2 text-xs"
            >
              <Play className="w-3.5 h-3.5" />
              Watch Complete Patient Journey
            </button>
            <button
              type="button"
              onClick={() => setNav('demo-scenarios')}
              className="eigen-btn-secondary px-3.5 py-2 text-xs"
            >
              Explore Workflows by Role (8)
            </button>
          </div>
        </section>
      )}

      {/* Role-specific decision strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {state.currentRole === 'Billing User' ? (
          <>
            <MetricTile
              label="Claim Exceptions"
              value={billingExceptions.length}
              detail="Rejected, denied or ready to submit"
              tone={billingExceptions.length > 0 ? 'warning' : 'default'}
              icon={<AlertCircle className="w-4 h-4" />}
              onClick={() => setNav('billing')}
            />
            <MetricTile
              label="Open Invoices"
              value={state.invoices.filter((i) => i.facilityId === state.currentFacilityId && i.status !== 'Paid').length}
              detail="Awaiting patient collection"
              icon={<CreditCard className="w-4 h-4" />}
              onClick={() => setNav('billing')}
            />
            <MetricTile
              label="Revenue Tasks"
              value={visibleTasks.length}
              detail={`${taskSummary.overdue} overdue`}
              tone={taskSummary.overdue > 0 ? 'danger' : 'default'}
              icon={<CheckSquare className="w-4 h-4" />}
              onClick={() => setNav('tasks')}
            />
            <MetricTile
              label="Today's Visits"
              value={facilityAppts.length}
              detail="Eligible for charge capture"
              icon={<Calendar className="w-4 h-4" />}
              onClick={() => setNav('schedule')}
            />
          </>
        ) : state.currentRole === 'Front Desk' ? (
          <>
            <MetricTile
              label="Expected Today"
              value={facilityAppts.length}
              detail={`${facilityAppts.filter((a) => a.status === 'Checked In' || a.status === 'In Room').length} arrived`}
              icon={<Users className="w-4 h-4" />}
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
              icon={<ClipboardCheck className="w-4 h-4" />}
              onClick={() => setNav('front-desk')}
            />
            <MetricTile
              label="Co-pays Pending"
              value={facilityAppts.filter((a) => a.coPayAmount > 0 && !a.coPayCollected).length}
              detail="Check-in collection due"
              icon={<CreditCard className="w-4 h-4" />}
              onClick={() => setNav('front-desk')}
            />
            <MetricTile
              label="Front Desk Tasks"
              value={visibleTasks.length}
              detail={`${taskSummary.overdue} overdue`}
              icon={<CheckSquare className="w-4 h-4" />}
              onClick={() => setNav('tasks')}
            />
          </>
        ) : (
          <>
            <MetricTile
              label="Today's Patients"
              value={facilityAppts.length}
              detail={`${facilityAppts.filter((a) => a.status === 'Checked In' || a.status === 'In Room').length} checked in / roomed`}
              icon={<Users className="w-4 h-4" />}
              onClick={() => setNav('schedule')}
            />
            <MetricTile
              label={effectiveScope === 'my' ? 'My Open Tasks' : 'Team Open Tasks'}
              value={effectiveScope === 'my' ? taskSummary.myOpen : taskSummary.myOpen + taskSummary.teamOpen}
              detail={`${taskSummary.overdue} overdue`}
              tone={taskSummary.overdue > 0 ? 'warning' : 'default'}
              icon={<CheckSquare className="w-4 h-4" />}
              onClick={() => setNav('tasks')}
            />
            <MetricTile
              label="Pending Signatures"
              value={pendingSignatures.length}
              detail="Draft or awaiting sign-off"
              tone={pendingSignatures.length > 0 ? 'warning' : 'default'}
              icon={<FileSignature className="w-4 h-4" />}
              onClick={() => {
                if (pendingSignatures[0]) openPatient(pendingSignatures[0].patientId, 'encounters');
              }}
            />
            <MetricTile
              label="Critical / Abnormal Alerts"
              value={criticalAlerts.labs.length + criticalAlerts.rpm.length}
              detail={`${criticalAlerts.labs.filter((l) => l.flag === 'Critical').length} critical lab`}
              tone={criticalAlerts.labs.some((l) => l.flag === 'Critical') ? 'danger' : 'default'}
              icon={<AlertCircle className="w-4 h-4" />}
              onClick={() => setNav('inbox')}
            />
          </>
        )}
      </div>

      {/* Equal-height primary clinical work split */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        {/* Left Card: Today's Patients */}
        <section
          aria-label="Today's Patients"
          data-demo-target="home-todays-patients"
          className="eigen-card min-w-0 flex flex-col xl:h-[clamp(370px,48vh,540px)] overflow-hidden"
        >
          <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-[#042C53]/[0.07] flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#042C53]">Today’s Patients</h2>
              <p className="text-[11px] text-[#5F5D56] mt-0.5">
                {facilityAppts.length} visits · {currentFacility.shortName} ({currentFacility.tzAbbr})
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNav('schedule')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#185FA5] hover:text-[#042C53] transition-colors whitespace-nowrap"
            >
              Full Schedule
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto eigen-scroll">
            {facilityAppts.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="No appointments scheduled today"
                  description="Book a visit or switch facility to view another clinic schedule."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowBook(true)}
                      className="eigen-btn-primary px-3.5 py-2 text-xs"
                    >
                      Book Appointment
                    </button>
                  }
                />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 eigen-table-head">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2">Time</th>
                    <th className="py-2.5 px-2">Patient</th>
                    <th className="py-2.5 px-2 hidden sm:table-cell">Visit</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#042C53]/[0.055] text-xs">
                  {facilityAppts.map((a) => (
                    <tr key={a.id} className="hover:bg-[#E6F1FB]/28 transition-colors">
                      <td className="py-3 pl-4 pr-2 font-mono tabular-nums font-medium text-[#042C53] whitespace-nowrap align-top">
                        {a.startTime}
                      </td>
                      <td className="py-3 px-2 align-top">
                        <PatientLink patientId={a.patientId} tab="overview" showMrn />
                        <div className="text-[11px] text-[#5F5D56] mt-0.5 leading-snug">
                          {a.room ? `${a.room} · ` : ''}
                          {a.reason}
                        </div>
                      </td>
                      <td className="py-3 px-2 hidden sm:table-cell align-top">
                        <div className="text-slate-800 font-medium">{a.type}</div>
                        <div className="text-[11px] text-[#5F5D56] mt-0.5">{a.subtype}</div>
                      </td>
                      <td className="py-3 px-2 align-top">
                        <StatusBadge label={a.status} />
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right whitespace-nowrap align-top">
                        {state.currentRole === 'Front Desk' && a.status === 'Pre-Registered' ? (
                          <button
                            type="button"
                            onClick={() => updateAppointmentStatus(a.id, 'Checked In')}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#042C53] bg-[#E6F1FB] hover:bg-[#85B7EB]/40 rounded-lg transition-colors"
                          >
                            Check In
                          </button>
                        ) : (
                          <button
                            type="button"
                            data-demo-target={a.patientId === 'pat-demo-elena' ? 'home-open-elena-btn' : undefined}
                            onClick={() => openPatient(a.patientId, 'pre-consultation')}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#185FA5] hover:bg-[#E6F1FB] rounded-lg transition-colors"
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
          className="eigen-card min-w-0 flex flex-col xl:h-[clamp(370px,48vh,540px)] overflow-hidden"
        >
          <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-[#042C53]/[0.07] flex items-center justify-between gap-2 shrink-0">
            <div>
              <h2 className="font-display text-sm font-semibold text-[#042C53]">
                {effectiveScope === 'my' ? 'Assigned Work Queue' : 'Team Work Queue'}
              </h2>
              <p className="text-[11px] text-[#5F5D56] tabular-nums mt-0.5">
                {visibleTasks.length} open · {taskSummary.overdue} overdue
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNav('tasks')}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#185FA5] hover:text-[#042C53] transition-colors whitespace-nowrap"
            >
              All Tasks
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto eigen-scroll divide-y divide-[#042C53]/[0.055]">
            {visibleTasks.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Queue clear"
                  description="No open tasks assigned in this worklist."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowTask(true)}
                      className="eigen-btn-primary px-3.5 py-2 text-xs"
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
                  <div key={t.id} className="px-5 py-3.5 hover:bg-[#F8F8F5] transition-colors flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge label={t.priority} />
                        <span className="text-xs font-semibold text-[#042C53] leading-snug">{t.title}</span>
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
                        className="text-[11px] eigen-input px-2.5 py-1.5 cursor-pointer"
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Pending Signatures */}
        <section className="eigen-card p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#042C53] inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center">
                <FileSignature className="w-3.5 h-3.5" />
              </span>
              Pending Signatures
            </h2>
            <span className="font-mono text-xs tabular-nums font-semibold text-[#5F5D56] bg-[#F1EFE8] px-2 py-0.5 rounded-full">
              {pendingSignatures.length}
            </span>
          </div>
          {pendingSignatures.length === 0 ? (
            <p className="text-xs text-[#5F5D56] py-2">All clinical notes are signed.</p>
          ) : (
            <div className="divide-y divide-[#042C53]/[0.06]">
              {pendingSignatures.map((enc) => (
                <div key={enc.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={enc.patientId} tab="encounters" />
                    <div className="text-[11px] text-[#5F5D56] truncate mt-0.5">
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
        <section className="eigen-card p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#042C53] inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#FDF0EE] text-[#B4321F] flex items-center justify-center">
                <AlertCircle className="w-3.5 h-3.5" />
              </span>
              Needs Review & Alerts
            </h2>
            <button
              type="button"
              onClick={() => setNav('inbox')}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-[#185FA5] hover:text-[#042C53]"
            >
              Open Inbox
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {criticalAlerts.labs.length === 0 && criticalAlerts.rpm.length === 0 ? (
            <p className="text-xs text-[#5F5D56] py-2">No pending clinical alerts.</p>
          ) : (
            <div className="divide-y divide-[#042C53]/[0.06]">
              {criticalAlerts.labs.map((lab) => (
                <div key={lab.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={lab.patientId} tab="orders-results" />
                    <div className="text-[11px] text-[#5F5D56] font-mono tabular-nums truncate mt-0.5">
                      {lab.testName}: {lab.value} {lab.unit}
                    </div>
                  </div>
                  <StatusBadge label={lab.flag} />
                </div>
              ))}
              {criticalAlerts.rpm.map((dev) => (
                <div key={dev.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={dev.patientId} tab="care-plan" />
                    <div className="text-[11px] text-[#5F5D56] truncate mt-0.5">
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
        <section className="eigen-card p-5 space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[#042C53] inline-flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#FEF5E7] text-[#C97A1B] flex items-center justify-center">
                <Star className="w-3.5 h-3.5" />
              </span>
              {state.currentRole === 'Billing User' ? 'Billing Action Queue' : 'Favourite Patients'}
            </h2>
            <button
              type="button"
              onClick={() => setNav(state.currentRole === 'Billing User' ? 'billing' : 'patients')}
              className="inline-flex items-center gap-0.5 text-xs font-medium text-[#185FA5] hover:text-[#042C53]"
            >
              View All
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {state.currentRole === 'Billing User' ? (
            <div className="divide-y divide-[#042C53]/[0.06]">
              {billingExceptions.slice(0, 4).map((clm) => (
                <div key={clm.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-mono font-semibold text-[#042C53]">{clm.claimNumber}</div>
                    <div className="text-[11px] text-[#5F5D56] truncate mt-0.5">
                      {clm.payerName} · {formatCurrency(clm.chargeAmount, currentFacility.currency)}
                    </div>
                  </div>
                  <StatusBadge label={clm.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[#042C53]/[0.06]">
              {(favouritePatients.length > 0
                ? favouritePatients
                : state.patients.filter((p) => p.facilityId === state.currentFacilityId).slice(0, 3)
              ).map((p) => (
                <div key={p.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <PatientLink patientId={p.id} tab="overview" showMrn />
                    <div className="text-[11px] text-[#5F5D56] truncate mt-0.5">
                      {p.conditions[0]?.name || 'Active Chart'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePatientFavourite(p.id)}
                    aria-label={p.favourite ? `Remove ${p.fullName} from favourites` : `Add ${p.fullName} to favourites`}
                    className="p-1.5 text-[#C97A1B] hover:bg-[#FEF5E7] rounded-lg transition-colors"
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
