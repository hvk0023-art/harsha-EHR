import React, { useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { PatientTabKey } from '../../types/hms';

export type BadgeTone = 'neutral' | 'blue' | 'success' | 'warning' | 'danger' | 'navy';

const TONE_MAP: Record<BadgeTone, string> = {
  neutral: 'bg-[#F1EFE8] text-[#444441] border-[#042C53]/10',
  blue: 'bg-[#E6F1FB] text-[#042C53] border-[#85B7EB]/50',
  success: 'bg-[#E9F7F1] text-[#0F6E50] border-[#1D9E75]/30',
  warning: 'bg-[#FEF5E7] text-[#9A5B10] border-[#C97A1B]/30',
  danger: 'bg-[#FDF0EE] text-[#B4321F] border-[#B4321F]/25',
  navy: 'bg-[#042C53] text-white border-[#042C53]',
};

const DOT_MAP: Record<BadgeTone, string> = {
  neutral: 'bg-[#5F5D56]',
  blue: 'bg-[#185FA5]',
  success: 'bg-[#1D9E75]',
  warning: 'bg-[#C97A1B]',
  danger: 'bg-[#B4321F]',
  navy: 'bg-[#85B7EB]',
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-medium rounded-full border whitespace-nowrap shrink-0 leading-4 ${TONE_MAP[resolved]} ${className}`}
    >
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_MAP[resolved]}`} />
      <span>{label}</span>
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
  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 pb-4 border-b border-[#042C53]/[0.08]">
    <div className="min-w-0 flex-1 basis-[280px] space-y-1">
      {backButton && (
        <button
          type="button"
          onClick={backButton.onClick}
          className="text-xs font-medium text-[#185FA5] hover:text-[#042C53] mb-1 inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {backButton.label}
        </button>
      )}
      <h1 className="font-display text-[22px] sm:text-2xl font-semibold text-[#042C53] tracking-[-0.02em] leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="text-xs text-[#5F5D56] leading-relaxed max-w-3xl">{subtitle}</p>
      )}
    </div>
    {(secondaryActions || primaryAction) && (
      <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
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
  <div className="py-10 px-6 text-center border border-dashed border-[#042C53]/15 rounded-xl bg-[#F8F8F5]/70">
    <p className="text-sm font-semibold text-[#042C53]">{title}</p>
    {description && (
      <p className="text-xs text-[#5F5D56] mt-1.5 max-w-md mx-auto leading-relaxed">{description}</p>
    )}
    {action && <div className="mt-4">{action}</div>}
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
  if (!pat) return <span className="text-xs text-[#5F5D56]">Unknown patient</span>;
  return (
    <button
      type="button"
      onClick={() => openPatient(pat.id, tab)}
      className={`text-left font-semibold text-[#042C53] hover:text-[#185FA5] transition-colors focus-visible:outline-2 group ${className}`}
    >
      <span className="group-hover:underline underline-offset-2">{pat.fullName}</span>
      {showMrn && (
        <span className="ml-2 font-mono text-[11px] text-[#5F5D56] font-normal whitespace-nowrap">
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
    className={`inline-flex flex-wrap items-center gap-1 p-1 bg-[#F1EFE8] rounded-xl border border-[#042C53]/[0.07] ${className}`}
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
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
            active
              ? 'bg-white text-[#042C53] shadow-[0_1px_2px_rgba(4,44,83,0.08)] ring-1 ring-[#042C53]/[0.06]'
              : 'text-[#5F5D56] hover:text-[#042C53] hover:bg-white/50'
          }`}
        >
          <span>{t.label}</span>
          {typeof t.count === 'number' && (
            <span
              className={`font-mono text-[10px] tabular-nums px-1.5 py-0.25 rounded-full ${
                active ? 'bg-[#E6F1FB] text-[#185FA5] font-semibold' : 'bg-[#042C53]/[0.06] text-[#5F5D56]'
              }`}
            >
              {t.count}
            </span>
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
      className={`fixed inset-0 ${zIndexClass} flex items-start justify-center bg-[#042C53]/35 backdrop-blur-[2px] px-3 sm:px-4 pt-3 sm:pt-5`}
      style={{
        paddingBottom: 'calc(var(--demo-bar-clearance, 0px) + 0.75rem)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        data-modal-card="true"
        className={`w-full ${maxWidth} bg-white rounded-2xl border border-[#042C53]/12 shadow-[0_20px_50px_-12px_rgba(4,44,83,0.28)] flex flex-col overflow-hidden`}
        style={{
          maxHeight: 'calc(100dvh - var(--demo-bar-clearance, 0px) - 2rem)',
        }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 sm:px-6 sm:py-4 border-b border-[#042C53]/[0.08] bg-[#FAF9F7] shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-semibold text-[#042C53] tracking-tight leading-tight">
              {title}
            </h2>
            {subtitle && (
              <p className="text-[11px] sm:text-xs text-[#5F5D56] mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-[#5F5D56] hover:text-[#042C53] rounded-lg hover:bg-[#042C53]/[0.06] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div data-modal-body="true" className="p-4 sm:p-6 overflow-y-auto eigen-scroll">
          {children}
        </div>
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
      className="fixed inset-0 z-50 flex justify-end bg-[#042C53]/30 backdrop-blur-[1.5px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-xl bg-white h-full border-l border-[#042C53]/10 shadow-[-12px_0_40px_-10px_rgba(4,44,83,0.18)] flex flex-col">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[#042C53]/[0.08] bg-[#FAF9F7]">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold text-[#042C53] tracking-tight truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-[#5F5D56] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="p-1.5 text-[#5F5D56] hover:text-[#042C53] rounded-lg hover:bg-[#042C53]/[0.06] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto eigen-scroll flex-1">{children}</div>
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
  icon?: React.ReactNode;
}> = ({ label, value, detail, onClick, tone = 'default', icon }) => {
  const valColor =
    tone === 'danger'
      ? 'text-[#B4321F]'
      : tone === 'warning'
      ? 'text-[#C97A1B]'
      : tone === 'success'
      ? 'text-[#0F6E50]'
      : 'text-[#042C53]';

  const iconBg =
    tone === 'danger'
      ? 'bg-[#FDF0EE] text-[#B4321F]'
      : tone === 'warning'
      ? 'bg-[#FEF5E7] text-[#C97A1B]'
      : tone === 'success'
      ? 'bg-[#E9F7F1] text-[#0F6E50]'
      : 'bg-[#E6F1FB] text-[#185FA5]';

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-[#5F5D56] tracking-wide">{label}</div>
        <div className={`font-display text-2xl font-semibold tabular-nums tracking-tight mt-1 ${valColor}`}>
          {value}
        </div>
        {detail && <div className="text-[11px] text-[#5F5D56] mt-1 truncate">{detail}</div>}
      </div>
      {icon && (
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left eigen-card p-4 hover:border-[#378ADD]/60 hover:shadow-[0_4px_16px_-4px_rgba(24,95,165,0.14)] transition-all w-full group"
      >
        {content}
      </button>
    );
  }
  return <div className="eigen-card p-4">{content}</div>;
};
