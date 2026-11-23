import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { PatientTabKey } from '../../types/hms';

export type BadgeTone = 'neutral' | 'blue' | 'success' | 'warning' | 'danger' | 'navy';

const TONE_MAP: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  blue: 'bg-[#E6F1FB] text-[#042C53] border-[#85B7EB]/60',
  success: 'bg-emerald-50 text-[#0F6E50] border-emerald-200',
  warning: 'bg-amber-50 text-[#9A5B10] border-amber-200',
  danger: 'bg-red-50 text-[#B4321F] border-red-200',
  navy: 'bg-[#042C53] text-white border-[#042C53]',
};

export function toneForStatus(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (
    s.includes('critical') ||
    s.includes('denied') ||
    s.includes('rejected') ||
    s.includes('failed') ||
    s.includes('blocked') ||
    s.includes('revoked') ||
    s.includes('urgent') ||
    s.includes('severe') ||
    s.includes('esi-1')
  ) {
    return 'danger';
  }
  if (
    s.includes('abnormal') ||
    s.includes('awaiting') ||
    s.includes('pending') ||
    s.includes('triage') ||
    s.includes('delayed') ||
    s.includes('cleaning') ||
    s.includes('warning') ||
    s.includes('at risk') ||
    s.includes('missing') ||
    s.includes('partial') ||
    s.includes('expired') ||
    s.includes('refill')
  ) {
    return 'warning';
  }
  if (
    s.includes('signed') ||
    s.includes('complete') ||
    s.includes('paid') ||
    s.includes('reviewed') ||
    s.includes('active') ||
    s.includes('approved') ||
    s.includes('granted') ||
    s.includes('available') ||
    s.includes('normal') ||
    s.includes('delivered') ||
    s.includes('closed') ||
    s.includes('achieved') ||
    s.includes('verified') ||
    s.includes('connected')
  ) {
    return 'success';
  }
  if (
    s.includes('checked in') ||
    s.includes('in room') ||
    s.includes('in progress') ||
    s.includes('scheduled') ||
    s.includes('confirmed') ||
    s.includes('submitted') ||
    s.includes('accepted') ||
    s.includes('ordered') ||
    s.includes('occupied') ||
    s.includes('sandbox')
  ) {
    return 'blue';
  }
  return 'neutral';
}

export const StatusBadge: React.FC<{
  label: string;
  tone?: BadgeTone;
  className?: string;
}> = ({ label, tone, className = '' }) => {
  const resolved = tone || toneForStatus(label);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border whitespace-nowrap shrink-0 ${TONE_MAP[resolved]} ${className}`}
    >
      {label}
    </span>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  backButton?: { label: string; onClick: () => void };
}> = ({ title, subtitle, primaryAction, secondaryActions, backButton }) => (
  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-200">
    <div className="min-w-0">
      {backButton && (
        <button
          type="button"
          onClick={backButton.onClick}
          className="text-xs font-medium text-[#185FA5] hover:underline mb-1 inline-flex items-center gap-1"
        >
          ← {backButton.label}
        </button>
      )}
      <h1 className="text-xl font-semibold text-[#042C53] tracking-tight truncate">{title}</h1>
      {subtitle && <p className="text-xs text-[#5F5D56] mt-0.5">{subtitle}</p>}
    </div>
    {(secondaryActions || primaryAction) && (
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {secondaryActions}
        {primaryAction}
      </div>
    )}
  </div>
);

export const EmptyState: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-white">
    <p className="text-sm font-medium text-slate-800">{title}</p>
    {description && <p className="text-xs text-[#5F5D56] mt-1">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export const PatientLink: React.FC<{
  patientId: string;
  tab?: PatientTabKey;
  className?: string;
  showMrn?: boolean;
}> = ({ patientId, tab = 'overview', className = '', showMrn = false }) => {
  const { state, openPatient } = useAppState();
  const pat = state.patients.find((p) => p.id === patientId);
  if (!pat) return <span className="text-xs text-slate-500">Unknown patient</span>;
  return (
    <button
      type="button"
      onClick={() => openPatient(pat.id, tab)}
      className={`text-left font-medium text-[#185FA5] hover:text-[#042C53] hover:underline focus-visible:outline-2 ${className}`}
    >
      <span>{pat.fullName}</span>
      {showMrn && (
        <span className="ml-1.5 font-mono text-[11px] text-[#5F5D56] font-normal whitespace-nowrap">
          {pat.mrn}
        </span>
      )}
    </button>
  );
};

export const SegmentedTabs: React.FC<{
  tabs: { id: string; label: string; count?: number }[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ tabs, activeId, onChange, className = '' }) => (
  <div
    role="tablist"
    className={`inline-flex flex-wrap items-center gap-1 p-1 bg-[#F1EFE8] rounded-lg border border-slate-200/80 ${className}`}
  >
    {tabs.map((t) => {
      const active = t.id === activeId;
      return (
        <button
          key={t.id}
          type="button"
          role="tab"
          data-demo-target={`seg-tab-${t.id}`}
          aria-selected={active}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
            active
              ? 'bg-white text-[#042C53] shadow-xs border border-slate-200/80'
              : 'text-[#5F5D56] hover:text-[#042C53]'
          }`}
        >
          <span>{t.label}</span>
          {typeof t.count === 'number' && (
            <span className="font-mono text-[11px] tabular-nums opacity-75">{t.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
  zIndexClass?: string;
}> = ({ open, onClose, title, subtitle, children, maxWidth = 'max-w-lg', zIndexClass = 'z-50' }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-start justify-center bg-[#042C53]/35 px-4 pt-6 pb-32 sm:pt-8`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`w-full ${maxWidth} bg-white rounded-lg border border-slate-200 shadow-lg max-h-[calc(100vh-9.5rem)] flex flex-col`}>
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-[#042C53]">{title}</h2>
            {subtitle && <p className="text-xs text-[#5F5D56] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto eigen-scroll">{children}</div>
      </div>
    </div>
  );
};

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#042C53]/30"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-[#042C53]">{title}</h2>
            {subtitle && <p className="text-xs text-[#5F5D56] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto eigen-scroll flex-1">{children}</div>
      </div>
    </div>
  );
};

export const MetricTile: React.FC<{
  label: string;
  value: string | number;
  detail?: string;
  onClick?: () => void;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}> = ({ label, value, detail, onClick, tone = 'default' }) => {
  const valColor =
    tone === 'danger'
      ? 'text-[#B4321F]'
      : tone === 'warning'
      ? 'text-[#C97A1B]'
      : tone === 'success'
      ? 'text-[#0F6E50]'
      : 'text-[#042C53]';

  const content = (
    <>
      <div className="text-xs font-medium text-[#5F5D56]">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${valColor}`}>{value}</div>
      {detail && <div className="text-[11px] text-[#5F5D56] mt-0.5 truncate">{detail}</div>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left bg-white border border-slate-200 rounded-lg p-3.5 hover:border-[#378ADD] hover:bg-[#E6F1FB]/25 transition-colors w-full"
      >
        {content}
      </button>
    );
  }
  return <div className="bg-white border border-slate-200 rounded-lg p-3.5">{content}</div>;
};
