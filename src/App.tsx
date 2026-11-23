/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { DemoDirectorOverlay } from './components/demo/DemoDirectorOverlay';
import { HelpPreferencesModal } from './components/modals/QuickActionModals';
import { PatientWorkspace } from './components/patient/PatientWorkspace';
import { PatientPortalShell } from './components/portal/PatientPortalShell';
import { StaffAppShell } from './components/shell/StaffAppShell';
import { Modal } from './components/ui/Primitives';
import { DemoDirectorProvider } from './demo/DemoDirectorContext';
import { AdministrationPage } from './pages/AdministrationPage';
import { BillingPage } from './pages/BillingPage';
import { CareManagementPage } from './pages/CareManagementPage';
import { DemoScenariosPage } from './pages/DemoScenariosPage';
import { FrontDeskPage } from './pages/FrontDeskPage';
import { HomeDashboardPage } from './pages/HomeDashboardPage';
import { HospitalSpecialtiesPage } from './pages/HospitalSpecialtiesPage';
import { InboxPage } from './pages/InboxPage';
import { PatientsDirectoryPage } from './pages/PatientsDirectoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SchedulePage } from './pages/SchedulePage';
import { TasksPage } from './pages/TasksPage';
import { AppStateProvider, useAppState } from './state/AppStateContext';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F1EFE8] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-6 space-y-3">
            <div className="flex items-center gap-2 text-[#B4321F] font-semibold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>EigenH Prototype Recovery</span>
            </div>
            <p className="text-xs text-[#5F5D56]">
              An unexpected UI error occurred: {this.state.message}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('eigenh_hms_prototype_v1');
                  } catch {
                    // ignore storage errors
                  }
                  window.location.reload();
                }}
                className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
              >
                Reset Synthetic Demo Data & Reload
              </button>
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ToastStack: React.FC = () => {
  const { toasts, dismissToast } = useAppState();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-16 right-4 z-[60] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => {
        const icon =
          t.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#0F6E50] shrink-0" />
          ) : t.tone === 'error' ? (
            <XCircle className="w-4 h-4 text-[#B4321F] shrink-0" />
          ) : t.tone === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-[#C97A1B] shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-[#185FA5] shrink-0" />
          );

        const borderClass =
          t.tone === 'success'
            ? 'border-emerald-200'
            : t.tone === 'error'
              ? 'border-red-200'
              : t.tone === 'warning'
                ? 'border-amber-200'
                : 'border-[#85B7EB]';

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-2.5 bg-white border ${borderClass} rounded-lg px-3.5 py-2.5 shadow-md text-xs text-slate-800`}
          >
            {icon}
            <span className="flex-1 leading-relaxed">{t.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

const MainRouter: React.FC = () => {
  const { state, unsavedPrompt, confirmUnsaved, cancelUnsaved } = useAppState();
  const [helpOpen, setHelpOpen] = useState(false);

  const renderStaffSection = () => {
    if (state.selectedPatientId) {
      return <PatientWorkspace />;
    }
    switch (state.currentNav) {
      case 'home':
        return <HomeDashboardPage />;
      case 'demo-scenarios':
        return <DemoScenariosPage />;
      case 'patients':
        return <PatientsDirectoryPage />;
      case 'schedule':
        return <SchedulePage />;
      case 'front-desk':
        return <FrontDeskPage />;
      case 'inbox':
        return <InboxPage />;
      case 'tasks':
        return <TasksPage />;
      case 'care-management':
        return <CareManagementPage />;
      case 'billing':
        return <BillingPage />;
      case 'reports':
        return <ReportsPage />;
      case 'hospital':
        return <HospitalSpecialtiesPage />;
      case 'administration':
        return <AdministrationPage />;
      default:
        return <HomeDashboardPage />;
    }
  };

  return (
    <>
      {state.currentPortal === 'patient' ? (
        <PatientPortalShell />
      ) : (
        <StaffAppShell onOpenHelp={() => setHelpOpen(true)}>{renderStaffSection()}</StaffAppShell>
      )}

      <HelpPreferencesModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Modal
        open={Boolean(unsavedPrompt)}
        onClose={cancelUnsaved}
        title="Unsaved Clinical Changes"
        subtitle="You have unsaved edits in the active workspace."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-700 leading-relaxed">
            Continuing to <span className="font-semibold text-[#042C53]">{unsavedPrompt?.label}</span> will
            discard unsaved draft edits on the current screen. Save your draft first or discard and proceed.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={cancelUnsaved}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
            >
              Stay on Page
            </button>
            <button
              type="button"
              onClick={confirmUnsaved}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#B4321F] hover:bg-red-800 rounded-md"
            >
              Discard & Continue
            </button>
          </div>
        </div>
      </Modal>

      <DemoDirectorOverlay />
      <ToastStack />
    </>
  );
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AppStateProvider>
        <DemoDirectorProvider>
          <MainRouter />
        </DemoDirectorProvider>
      </AppStateProvider>
    </AppErrorBoundary>
  );
}
