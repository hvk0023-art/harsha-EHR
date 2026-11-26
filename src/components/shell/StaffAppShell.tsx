import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FileBarChart2,
  HeartPulse,
  HelpCircle,
  Home,
  Inbox,
  Menu,
  PlayCircle,
  RotateCcw,
  Search,
  Settings,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { DEMO_SCENARIOS, TODAY_DATE } from '../../data/seedData';
import { useDemoDirector } from '../../demo/DemoDirectorContext';
import { DEMO_DIRECTOR_SCENARIOS } from '../../demo/demoScenarios';
import { computeTaskSummary } from '../../state/domainLogic';
import {
  ALL_STAFF_ROLES,
  canAccessNav,
  canSwitchFacility,
  filterPatientsForRole,
  getRoleScopeDescription,
} from '../../state/permissions';
import { useAppState } from '../../state/AppStateContext';
import type { StaffNavKey, StaffRole } from '../../types/hms';
import { StatusBadge } from '../ui/Primitives';

const ROLES: StaffRole[] = ALL_STAFF_ROLES;

type NavGroup = 'workspace' | 'clinical' | 'operations';

const NAV_ITEMS: {
  key: StaffNavKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: NavGroup;
}[] = [
  { key: 'home', label: 'Home', icon: Home, group: 'workspace' },
  { key: 'demo-scenarios', label: 'Demo Academy', icon: PlayCircle, group: 'workspace' },
  { key: 'patients', label: 'Patients', icon: Users, group: 'clinical' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, group: 'clinical' },
  { key: 'front-desk', label: 'Front Desk', icon: ClipboardCheck, group: 'clinical' },
  { key: 'inbox', label: 'Inbox', icon: Inbox, group: 'clinical' },
  { key: 'tasks', label: 'Tasks', icon: CheckSquare, group: 'clinical' },
  { key: 'care-management', label: 'Care Management', icon: HeartPulse, group: 'clinical' },
  { key: 'billing', label: 'Billing', icon: CreditCard, group: 'operations' },
  { key: 'reports', label: 'Reports', icon: FileBarChart2, group: 'operations' },
  { key: 'hospital', label: 'Hospital & Specialties', icon: Activity, group: 'operations' },
  { key: 'administration', label: 'Administration', icon: Settings, group: 'operations' },
];

const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  workspace: 'Workspace',
  clinical: 'Clinical Care',
  operations: 'Operations',
};

function getInitials(name: string): string {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
}

export const StaffAppShell: React.FC<{
  children: React.ReactNode;
  onOpenHelp: () => void;
}> = ({ children, onOpenHelp }) => {
  const {
    state,
    currentFacility,
    setNav,
    openPatient,
    setRole,
    setFacility,
    clearScenario,
    resetDemoData,
  } = useAppState();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  const { isDemoMode, startScenario } = useDemoDirector();

  const currentUser = state.staff.find((s) => s.id === state.currentUserId) || state.staff[0];

  const taskSummary = useMemo(
    () => computeTaskSummary(state.tasks, state.currentUserId, state.currentFacilityId, TODAY_DATE),
    [state.tasks, state.currentUserId, state.currentFacilityId]
  );

  const unreadLabCount = useMemo(
    () =>
      state.labResults.filter(
        (l) => l.facilityId === state.currentFacilityId && l.status !== 'Reviewed'
      ).length,
    [state.labResults, state.currentFacilityId]
  );

  const allowFacilitySwitch = canSwitchFacility(state.currentRole);

  const authorizedPatients = useMemo(
    () =>
      filterPatientsForRole(state.patients, {
        role: state.currentRole,
        userId: state.currentUserId,
        facilityId: state.currentFacilityId,
        includeAllFacilities: allowFacilitySwitch,
      }),
    [allowFacilitySwitch, state.currentFacilityId, state.currentRole, state.currentUserId, state.patients]
  );

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return authorizedPatients
      .filter(
        (p) =>
          p.fullName.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          p.dob.includes(q) ||
          (p.abhaId && p.abhaId.includes(q))
      )
      .slice(0, 6);
  }, [authorizedPatients, searchQuery]);

  const notifications = useMemo(() => {
    const list: { id: string; title: string; detail: string; tone: 'danger' | 'warning' | 'blue'; action: () => void }[] = [];
    state.labResults
      .filter((l) => l.facilityId === state.currentFacilityId && l.status !== 'Reviewed')
      .forEach((l) => {
        const pat = state.patients.find((p) => p.id === l.patientId);
        list.push({
          id: `n-lab-${l.id}`,
          title: `${l.flag} Lab: ${l.testName} (${l.value} ${l.unit})`,
          detail: `${pat?.fullName || 'Patient'} · ${l.collectionDate}`,
          tone: l.flag === 'Critical' ? 'danger' : 'warning',
          action: () => {
            openPatient(l.patientId, 'orders-results');
            setShowNotifs(false);
          },
        });
      });

    state.encounters
      .filter((e) => e.facilityId === state.currentFacilityId && (e.noteStatus === 'Draft' || e.noteStatus === 'Awaiting Signature'))
      .forEach((e) => {
        const pat = state.patients.find((p) => p.id === e.patientId);
        list.push({
          id: `n-enc-${e.id}`,
          title: `Note ${e.noteStatus}: ${e.type}`,
          detail: `${pat?.fullName || 'Patient'} · ${e.date}`,
          tone: 'blue',
          action: () => {
            openPatient(e.patientId, 'encounters');
            setShowNotifs(false);
          },
        });
      });

    return list;
  }, [openPatient, state.encounters, state.currentFacilityId, state.labResults, state.patients]);

  const activeScenario = DEMO_SCENARIOS.find((s) => s.id === state.activeScenarioId);

  const visibleNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => canAccessNav(state.currentRole, item.key));
  }, [state.currentRole]);

  const groupedNav = useMemo(() => {
    const groups: { id: NavGroup; label: string; items: typeof visibleNavItems }[] = [
      { id: 'workspace', label: NAV_GROUP_LABELS.workspace, items: [] },
      { id: 'clinical', label: NAV_GROUP_LABELS.clinical, items: [] },
      { id: 'operations', label: NAV_GROUP_LABELS.operations, items: [] },
    ];
    for (const item of visibleNavItems) {
      const target = groups.find((g) => g.id === item.group);
      target?.items.push(item);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [visibleNavItems]);

  const handleNavClick = (key: StaffNavKey) => {
    setNav(key);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F6F2] text-slate-900">
      {/* Top Clinical Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#042C53]/[0.08] px-3 lg:px-5 h-15 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            className="lg:hidden p-2 rounded-xl text-[#042C53] hover:bg-[#F6F6F2] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setNav('home')}
            className="flex items-center gap-2.5 text-left shrink-0 focus-visible:outline-2 group"
          >
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-xl bg-[#042C53] text-white flex items-center justify-center shadow-xs group-hover:bg-[#185FA5] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2.5" width="5.5" height="5.5" rx="1.5" fill="#85B7EB" />
                <rect x="10.5" y="2.5" width="5.5" height="5.5" rx="1.5" fill="#FFFFFF" />
                <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.5" fill="#FFFFFF" />
                <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.5" fill="#1D9E75" />
              </svg>
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[17px] font-bold tracking-[-0.025em] text-[#042C53]">
                EigenH
              </span>
              <span className="hidden xl:inline text-[11px] font-medium text-[#5F5D56] border-l border-[#042C53]/12 pl-2 whitespace-nowrap">
                AI Native EHR · Prototype
              </span>
            </div>
          </button>

          {/* Global Patient Search */}
          <div className="relative hidden md:block w-44 lg:w-52 xl:w-72 ml-1 xl:ml-2">
            <Search className="w-3.5 h-3.5 text-[#5F5D56] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              aria-label="Search patients by name, MRN, DOB, or ABHA"
              placeholder="Find patient by name, MRN, DOB..."
              value={searchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F6F6F2] border border-[#042C53]/10 rounded-xl text-[#042C53] placeholder:text-[#5F5D56]/80 focus:bg-white focus:border-[#185FA5] focus:ring-2 focus:ring-[#185FA5]/15 focus:outline-none transition-all"
            />
            {searchFocused && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#042C53]/12 rounded-xl shadow-[0_12px_32px_-8px_rgba(4,44,83,0.2)] z-40 py-1.5 max-h-72 overflow-y-auto">
                {searchMatches.length === 0 ? (
                  <div className="px-3.5 py-2.5 text-xs text-[#5F5D56]">No matching patients</div>
                ) : (
                  searchMatches.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => {
                        openPatient(p.id, 'overview');
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3.5 py-2 hover:bg-[#E6F1FB]/55 flex items-center justify-between gap-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#042C53] truncate">{p.fullName}</div>
                        <div className="text-[11px] text-[#5F5D56] font-mono tabular-nums">
                          {p.mrn} · DOB {p.dob}
                        </div>
                      </div>
                      <span className="text-[11px] text-[#5F5D56] shrink-0">
                        {state.facilities.find((f) => f.id === p.facilityId)?.shortName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Controls: Location, Role Preview, Demo Academy, Notifications, Reset */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Facility Context */}
          <div
            data-demo-target="facility-switcher"
            className="hidden xl:flex items-center gap-1.5 bg-[#F6F6F2] border border-[#042C53]/10 rounded-xl px-2.5 py-1.5"
          >
            <Building2 className="w-3.5 h-3.5 text-[#185FA5] shrink-0" />
            {allowFacilitySwitch ? (
              <>
                <label htmlFor="facility-select" className="sr-only">
                  Active facility
                </label>
                <select
                  id="facility-select"
                  value={state.currentFacilityId}
                  onChange={(e) => setFacility(e.target.value)}
                  className="text-xs font-medium text-[#042C53] bg-transparent focus:outline-none pr-1 cursor-pointer"
                >
                  {state.facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.shortName} ({f.tzAbbr})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span
                title="Facility context is derived from your assigned staff profile"
                className="text-xs font-medium text-[#042C53] whitespace-nowrap"
              >
                {currentFacility.shortName} ({currentFacility.tzAbbr}) · Assigned
              </span>
            )}
          </div>

          {/* Role Preview Switcher */}
          <div
            data-demo-target="role-preview-switcher"
            title={`Prototype role preview (not real auth): ${getRoleScopeDescription(state.currentRole)}`}
            className="hidden sm:flex items-center gap-1.5 bg-[#E6F1FB]/80 border border-[#85B7EB]/60 rounded-xl px-2.5 py-1.5"
          >
            <UserCheck className="w-3.5 h-3.5 text-[#185FA5] shrink-0" />
            <label htmlFor="role-select" className="sr-only">
              Prototype role preview (simulated authorization)
            </label>
            <select
              id="role-select"
              value={state.currentRole}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="text-xs font-medium text-[#042C53] bg-transparent focus:outline-none cursor-pointer"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  Role Preview: {r}
                </option>
              ))}
            </select>
          </div>

          {/* EigenH AI Demo Director Quick Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowScenarios((v) => !v);
                setShowNotifs(false);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 border transition-all ${
                isDemoMode
                  ? 'bg-[#042C53] text-white border-[#042C53] shadow-xs'
                  : 'text-[#042C53] bg-white border-[#042C53]/12 hover:bg-[#E6F1FB]/60 hover:border-[#85B7EB]'
              }`}
            >
              <PlayCircle className={`w-3.5 h-3.5 ${isDemoMode ? 'text-[#85B7EB]' : 'text-[#185FA5]'}`} />
              <span className="hidden md:inline">{isDemoMode ? 'Academy Live' : 'Demo Academy'}</span>
            </button>
            {showScenarios && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-[#042C53]/12 rounded-2xl shadow-[0_16px_40px_-10px_rgba(4,44,83,0.22)] z-50 p-2.5">
                <div className="px-2 py-1.5 border-b border-[#042C53]/[0.07] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#042C53]">EigenH Guided Demo Academy</span>
                  <button
                    type="button"
                    onClick={() => setShowScenarios(false)}
                    aria-label="Close demo menu"
                    className="p-1 text-[#5F5D56] hover:text-[#042C53] rounded-lg hover:bg-[#F6F6F2]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="py-2 border-b border-[#042C53]/[0.07] flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      startScenario('demo-01-scheduled-journey', { autoPlay: true, learningMode: 'watch' });
                      setShowScenarios(false);
                    }}
                    className="flex-1 eigen-btn-primary px-2.5 py-1.5 text-[11px]"
                  >
                    Watch Full Journey
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNav('demo-scenarios');
                      setShowScenarios(false);
                    }}
                    className="eigen-btn-secondary px-2.5 py-1.5 text-[11px]"
                  >
                    Explore by Role
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto eigen-scroll divide-y divide-[#042C53]/[0.05] mt-1">
                  {DEMO_DIRECTOR_SCENARIOS.map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => {
                        startScenario(sc.id, { autoPlay: true });
                        setShowScenarios(false);
                      }}
                      className="w-full text-left px-2.5 py-2 hover:bg-[#E6F1FB]/50 rounded-lg transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-[#042C53]">
                          {sc.number}. {sc.title}
                        </span>
                        <span className="text-[10px] font-mono text-[#0F6E50] shrink-0">
                          {sc.scenes.length}s
                        </span>
                      </div>
                      <div className="text-[11px] text-[#5F5D56] mt-0.5 line-clamp-1">{sc.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notification Centre */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifs((v) => !v);
                setShowScenarios(false);
              }}
              aria-label={`Notifications (${notifications.length} items)`}
              className="relative p-2 text-[#5F5D56] hover:text-[#042C53] hover:bg-[#F6F6F2] rounded-xl border border-[#042C53]/10 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#B4321F] text-white text-[10px] font-mono tabular-nums font-semibold rounded-full px-1 min-w-[17px] text-center leading-[17px] ring-2 ring-white">
                  {notifications.length}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-[#042C53]/12 rounded-2xl shadow-[0_16px_40px_-10px_rgba(4,44,83,0.22)] z-50 p-2.5">
                <div className="px-2 py-1.5 border-b border-[#042C53]/[0.07] flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#042C53]">
                    Alerts & Review Queue ({notifications.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowNotifs(false)}
                    aria-label="Close notifications"
                    className="p-1 text-[#5F5D56] hover:text-[#042C53] rounded-lg hover:bg-[#F6F6F2]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto eigen-scroll divide-y divide-[#042C53]/[0.05] mt-1">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-xs text-center text-[#5F5D56]">No pending alerts</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={n.action}
                        className="w-full text-left px-2.5 py-2.5 hover:bg-[#E6F1FB]/50 rounded-lg flex flex-col gap-1 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#042C53] truncate">{n.title}</span>
                          <StatusBadge label={n.tone === 'danger' ? 'Critical' : n.tone === 'warning' ? 'Review' : 'Draft'} tone={n.tone} />
                        </div>
                        <span className="text-[11px] text-[#5F5D56]">{n.detail}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Reset Demo Data */}
          <button
            type="button"
            onClick={resetDemoData}
            title="Reset demo data"
            aria-label="Reset demo data"
            className="p-2 text-[#5F5D56] hover:text-[#B4321F] hover:bg-[#FDF0EE] rounded-xl border border-[#042C53]/10 transition-colors shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Active Scenario Slim Context Bar */}
      {activeScenario && (
        <div className="bg-[#042C53] text-white px-4 py-1.5 flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[#85B7EB] shrink-0">Scenario:</span>
            <span className="font-semibold truncate">{activeScenario.title}</span>
            <span className="hidden md:inline text-slate-300 truncate">— {activeScenario.summary}</span>
          </div>
          <button
            type="button"
            onClick={clearScenario}
            className="text-slate-300 hover:text-white text-[11px] underline shrink-0"
          >
            Exit scenario
          </button>
        </div>
      )}

      {/* Body Layout: Sidebar + Workspace */}
      <div className="flex-1 flex min-w-0">
        {/* Desktop Collapsible Sidebar */}
        <aside
          className={`hidden lg:flex flex-col bg-white border-r border-[#042C53]/[0.08] shrink-0 transition-all duration-150 ${
            collapsed ? 'w-[68px]' : 'w-60'
          }`}
        >
          <nav aria-label="Primary staff navigation" className="flex-1 py-4 px-2.5 space-y-4 overflow-y-auto eigen-scroll">
            {groupedNav.map((group) => (
              <div key={group.id} className="space-y-1">
                {!collapsed && (
                  <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5F5D56]/75">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = state.currentNav === item.key && !state.selectedPatientId;
                  const badgeCount =
                    item.key === 'tasks'
                      ? taskSummary.myOpen
                      : item.key === 'inbox'
                      ? unreadLabCount
                      : undefined;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      data-demo-target={`nav-${item.key}`}
                      onClick={() => handleNavClick(item.key)}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={`relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium transition-all ${
                        active
                          ? 'bg-[#E6F1FB] text-[#042C53] shadow-[inset_0_0_0_1px_rgba(24,95,165,0.14)]'
                          : 'text-[#5F5D56] hover:bg-[#F6F6F2] hover:text-[#042C53]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#185FA5]' : 'text-[#5F5D56]'}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </span>
                      {!collapsed && typeof badgeCount === 'number' && badgeCount > 0 && (
                        <span
                          className={`font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-semibold ${
                            active
                              ? 'bg-[#185FA5] text-white'
                              : 'bg-[#E6F1FB] text-[#185FA5]'
                          }`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Sidebar Footer: Help, User Profile, Collapse */}
          <div className="border-t border-[#042C53]/[0.08] p-2.5 space-y-1.5">
            <button
              type="button"
              onClick={onOpenHelp}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-[#5F5D56] hover:bg-[#F6F6F2] hover:text-[#042C53] transition-colors"
            >
              <HelpCircle className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Help & Preferences</span>}
            </button>

            {!collapsed && (
              <div className="px-2.5 py-2.5 rounded-xl bg-[#F8F8F5] border border-[#042C53]/[0.07] flex items-center gap-2.5">
                <div
                  aria-hidden="true"
                  className="w-8 h-8 rounded-full bg-[#042C53] text-white text-[11px] font-semibold flex items-center justify-center shrink-0"
                >
                  {getInitials(currentUser.name)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#042C53] truncate">{currentUser.name}</div>
                  <div className="text-[11px] text-[#5F5D56] truncate">
                    {state.currentRole} · {currentFacility.shortName}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-full flex items-center justify-center py-1.5 text-[#5F5D56] hover:text-[#042C53] hover:bg-[#F6F6F2] rounded-xl transition-colors"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </aside>

        {/* Mobile Drawer Sidebar */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-[#042C53]/40 backdrop-blur-[1.5px]"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative w-72 max-w-[85vw] bg-white h-full border-r border-[#042C53]/10 shadow-2xl flex flex-col z-10">
              <div className="p-4 border-b border-[#042C53]/[0.08] flex items-center justify-between">
                <span className="font-display font-bold text-[#042C53] tracking-tight">EigenH EHR</span>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation menu"
                  className="p-1.5 rounded-lg hover:bg-[#F6F6F2] text-[#5F5D56]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 border-b border-[#042C53]/[0.08] space-y-2 bg-[#FAF9F7]">
                {allowFacilitySwitch ? (
                  <select
                    aria-label="Active facility mobile"
                    value={state.currentFacilityId}
                    onChange={(e) => setFacility(e.target.value)}
                    className="w-full text-xs eigen-input px-2.5 py-2"
                  >
                    {state.facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.shortName} ({f.tzAbbr})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full text-xs border border-[#042C53]/10 rounded-xl px-2.5 py-2 bg-white text-[#042C53]">
                    {currentFacility.shortName} ({currentFacility.tzAbbr}) · Assigned
                  </div>
                )}
                <select
                  aria-label="Prototype role preview mobile"
                  value={state.currentRole}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="w-full text-xs border border-[#85B7EB]/60 rounded-xl px-2.5 py-2 bg-[#E6F1FB]/70 text-[#042C53] font-medium"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      Role Preview: {r}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-[#5F5D56] px-1">
                  Role preview is prototype simulation, not real auth.
                </div>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = state.currentNav === item.key && !state.selectedPatientId;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleNavClick(item.key)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium ${
                        active ? 'bg-[#E6F1FB] text-[#042C53]' : 'text-[#5F5D56] hover:bg-[#F6F6F2]'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${active ? 'text-[#185FA5]' : ''}`} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-[#5F5D56] hover:bg-[#F6F6F2]"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Help & Preferences</span>
                </button>
              </nav>
            </aside>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className={`flex-1 min-w-0 px-4 py-5 lg:px-7 lg:py-6 ${isDemoMode ? 'pb-40' : ''}`}>
          <div className="max-w-[1440px] mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
};
