import React, { useEffect, useState } from 'react';
import { AlertTriangle, Cpu, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import {
  fetchClinicalAiStatus,
  loadClinicalAiFeatureFlags,
  saveClinicalAiFeatureFlags,
} from '../../ai/clinicalAiService';
import type {
  ClinicalAIExecutionMode,
  ClinicalAIFeatureFlags,
  ClinicalAIResponse,
  ClinicalAIStatus,
} from '../../ai/clinicalAiTypes';
import { StatusBadge } from '../ui/Primitives';

const FLAGS_EVENT = 'eigenh-clinical-ai-flags-updated';

export function useClinicalAiFlags() {
  const [flags, setFlags] = useState<ClinicalAIFeatureFlags>(() => loadClinicalAiFeatureFlags());
  const [serverStatus, setServerStatus] = useState<ClinicalAIStatus | null>(null);

  useEffect(() => {
    let active = true;
    void fetchClinicalAiStatus().then((st) => {
      if (active) setServerStatus(st);
    });
    const onChange = () => setFlags(loadClinicalAiFeatureFlags());
    window.addEventListener(FLAGS_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(FLAGS_EVENT, onChange);
    };
  }, []);

  const updateFlags = (patch: Partial<ClinicalAIFeatureFlags>) => {
    const next = { ...loadClinicalAiFeatureFlags(), ...patch };
    saveClinicalAiFeatureFlags(next);
    setFlags(next);
    window.dispatchEvent(new Event(FLAGS_EVENT));
  };

  return { flags, updateFlags, serverStatus };
}

export const ClinicalAiModeToggle: React.FC<{
  mode: ClinicalAIExecutionMode;
  onChangeMode: (mode: ClinicalAIExecutionMode) => void;
  serverConfigured?: boolean;
  compact?: boolean;
}> = ({ mode, onChangeMode, serverConfigured, compact }) => {
  return (
    <div
      role="group"
      aria-label="Clinical AI execution mode"
      className={`inline-flex items-center rounded-xl border border-[#042C53]/12 bg-[#F8F8F5] p-0.5 ${
        compact ? 'text-[10.5px]' : 'text-[11px]'
      }`}
    >
      <button
        type="button"
        data-demo-target="clinical-ai-mode-live"
        onClick={() => onChangeMode('live-ai')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors ${
          mode === 'live-ai'
            ? 'bg-[#042C53] text-white shadow-2xs'
            : 'text-[#5F5D56] hover:text-[#042C53]'
        }`}
      >
        <Sparkles className="w-3 h-3" />
        <span>Live AI — Synthetic Data Only</span>
        {serverConfigured === false && (
          <span className="text-[9.5px] opacity-80">(Unconfigured)</span>
        )}
      </button>
      <button
        type="button"
        data-demo-target="clinical-ai-mode-deterministic"
        onClick={() => onChangeMode('deterministic-demo')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-colors ${
          mode === 'deterministic-demo'
            ? 'bg-[#185FA5] text-white shadow-2xs'
            : 'text-[#5F5D56] hover:text-[#042C53]'
        }`}
      >
        <Cpu className="w-3 h-3" />
        <span>Deterministic Demo</span>
      </button>
    </div>
  );
};

export const ClinicalAiProvenanceBar: React.FC<{
  response: ClinicalAIResponse<unknown>;
  reviewStatusOverride?: string;
}> = ({ response, reviewStatusOverride }) => {
  const isLive = response.executionMode === 'live-ai';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F8F8F5] border border-[#042C53]/8 text-[10.5px] text-[#5F5D56]">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={isLive ? 'Live AI — Synthetic Data Only' : 'Deterministic Demo'}
          tone={isLive ? 'blue' : 'neutral'}
        />
        <StatusBadge
          label={reviewStatusOverride || response.humanReviewState}
          tone={
            (reviewStatusOverride || response.humanReviewState).includes('Approved') ||
            (reviewStatusOverride || response.humanReviewState).includes('Verified')
              ? 'success'
              : 'warning'
          }
        />
        <span className="font-mono text-[#042C53]">Model: {response.modelId}</span>
        <span className="font-mono">· {response.latencyMs}ms</span>
        <span className="font-mono">· {response.promptVersion}</span>
      </div>
      <span className="inline-flex items-center gap-1 text-[#0F6E50] font-medium">
        <ShieldCheck className="w-3.5 h-3.5" />
        AI proposes · Clinician decides
      </span>
    </div>
  );
};

export const ClinicalAiErrorBanner: React.FC<{
  response: ClinicalAIResponse<unknown>;
  onRetry?: () => void;
  onSwitchDeterministic?: () => void;
}> = ({ response, onRetry, onSwitchDeterministic }) => {
  if (!response.error) return null;
  return (
    <div
      role="alert"
      className="p-3.5 rounded-xl bg-[#FDF0EE] border border-[#B4321F]/25 text-xs space-y-2"
    >
      <div className="flex items-start gap-2 text-[#B4321F]">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <div className="font-semibold">
            {response.error.code === 'LIVE_AI_UNCONFIGURED'
              ? 'Live AI Unavailable (Server Secret Not Configured)'
              : response.error.code === 'ACCESS_DENIED'
              ? 'Clinical Scope Isolation Blocked Request'
              : `Live AI Request Failed (${response.error.code})`}
          </div>
          <p className="text-[11px] text-[#444441] leading-relaxed">{response.error.message}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-6">
        {response.error.retryable && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="eigen-btn-secondary px-2.5 py-1 text-[11px]"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Live AI
          </button>
        )}
        {response.executionMode === 'live-ai' && onSwitchDeterministic && response.error.code !== 'ACCESS_DENIED' && (
          <button
            type="button"
            onClick={onSwitchDeterministic}
            className="eigen-btn-primary px-3 py-1 text-[11px]"
          >
            Run Explicitly in Deterministic Demo Mode
          </button>
        )}
      </div>
    </div>
  );
};
