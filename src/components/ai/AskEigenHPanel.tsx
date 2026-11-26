import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Loader2,
  Search,
  Sparkles,
  Table as TableIcon,
  TrendingUp,
  X,
} from 'lucide-react';
import { askEigenHChartSearch } from '../../ai/clinicalAiService';
import type { ChartSearchOutput, ClinicalAIResponse } from '../../ai/clinicalAiTypes';
import { useAppState } from '../../state/AppStateContext';
import { canSwitchFacility, filterPatientsForRole } from '../../state/permissions';
import type { Patient, PatientTabKey } from '../../types/hms';
import { SimpleLineChart } from '../ui/Charts';
import { StatusBadge } from '../ui/Primitives';
import {
  ClinicalAiErrorBanner,
  ClinicalAiModeToggle,
  ClinicalAiProvenanceBar,
  useClinicalAiFlags,
} from './ClinicalAiControls';

const SUGGESTED_QUESTIONS: readonly string[] = [
  "Show this patient's latest laboratory results.",
  'What was the last recorded eGFR?',
  'Show the blood pressure trend.',
  'Which medications are currently documented?',
  'Which clinical documents are awaiting verification?',
  'What follow-up tasks remain open?',
  'Summarize the available encounter history.',
];

interface AskEigenHPanelProps {
  /** When provided (inside Patient 360°), locks search strictly to this patient. */
  patient?: Patient;
  /** Optional close handler when rendered as a collapsible panel in PatientWorkspace. */
  onClose?: () => void;
  /** Compact mode for clinician Home dashboard. */
  compact?: boolean;
}

export const AskEigenHPanel: React.FC<AskEigenHPanelProps> = ({ patient, onClose, compact }) => {
  const { state, openPatient, setPatientTab } = useAppState();
  const { flags, updateFlags, serverStatus } = useClinicalAiFlags();

  const permittedPatients = useMemo(
    () =>
      filterPatientsForRole(state.patients, {
        role: state.currentRole,
        userId: state.currentUserId,
        facilityId: state.currentFacilityId,
        includeAllFacilities: canSwitchFacility(state.currentRole),
      }),
    [state.currentFacilityId, state.currentRole, state.currentUserId, state.patients]
  );

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    patient?.id || permittedPatients[0]?.id || ''
  );
  const activePatient =
    patient ||
    permittedPatients.find((p) => p.id === selectedPatientId) ||
    permittedPatients[0] ||
    null;

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClinicalAIResponse<ChartSearchOutput> | null>(null);

  const runSearch = async (queryText: string, modeOverride?: 'live-ai' | 'deterministic-demo') => {
    const trimmed = queryText.trim();
    if (!trimmed || !activePatient) return;
    setQuestion(trimmed);
    setLoading(true);
    try {
      const resp = await askEigenHChartSearch(state, activePatient.id, trimmed, {
        modeOverride,
        flags,
      });
      setResult(resp);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateSource = (tab: PatientTabKey) => {
    if (!activePatient) return;
    if (patient) {
      setPatientTab(tab);
    } else {
      openPatient(activePatient.id, tab);
    }
  };

  return (
    <section
      data-demo-target="ask-eigenh-panel"
      aria-label="Ask EigenH Clinical Chart Search"
      className="eigen-card p-4 sm:p-5 space-y-3.5 text-xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center shrink-0">
            <Search className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-sm font-semibold text-[#042C53]">
                Ask EigenH — Clinical Chart Search
              </h3>
              {activePatient && (
                <StatusBadge
                  label={`Scoped to ${activePatient.fullName} (${activePatient.mrn})`}
                  tone="blue"
                />
              )}
            </div>
            <p className="text-[11px] text-[#5F5D56] mt-0.5">
              Natural-language retrieval over permitted records only. Structured numbers are calculated deterministically from EHR data; narrative summaries cite source records.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ClinicalAiModeToggle
            mode={flags.executionMode}
            onChangeMode={(executionMode) => updateFlags({ executionMode })}
            serverConfigured={serverStatus?.configured}
            compact
          />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Ask EigenH panel"
              className="p-1.5 rounded-lg text-[#5F5D56] hover:bg-[#F6F6F2] hover:text-[#042C53]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Patient selector (only on clinician Home workspace when no chart is open) */}
      {!patient && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="ask-eigenh-patient-select" className="text-[11px] font-medium text-[#5F5D56]">
            Permitted Patient Context:
          </label>
          <select
            id="ask-eigenh-patient-select"
            value={activePatient?.id || ''}
            onChange={(e) => {
              setSelectedPatientId(e.target.value);
              setResult(null);
            }}
            className="eigen-input py-1 px-2.5 text-xs bg-white max-w-xs"
          >
            {permittedPatients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName} ({p.mrn})
              </option>
            ))}
          </select>
          <span className="text-[10.5px] text-[#5F5D56]">
            Role: {state.currentRole} · Cross-patient queries blocked
          </span>
        </div>
      )}

      {/* Search Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(question);
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          data-demo-target="ask-eigenh-input"
          aria-label="Ask a clinical question about this patient chart"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            activePatient
              ? `Ask about ${activePatient.fullName}'s labs, eGFR, BP trend, medications, pending docs, or encounters...`
              : 'Select a permitted patient first...'
          }
          disabled={!activePatient || loading}
          className="eigen-input flex-1 min-w-[220px] py-2 px-3 text-xs"
        />
        <button
          type="submit"
          data-demo-target="ask-eigenh-submit-btn"
          disabled={!activePatient || !question.trim() || loading}
          className="eigen-btn-navy px-4 py-2 text-xs disabled:opacity-45 shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching Chart...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Search Chart
            </>
          )}
        </button>
      </form>

      {/* Suggested Chart Questions */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] font-medium text-[#5F5D56] mr-0.5">Quick questions:</span>
        {(compact ? SUGGESTED_QUESTIONS.slice(0, 5) : SUGGESTED_QUESTIONS).map((q, idx) => (
          <button
            key={q}
            type="button"
            data-demo-target={`ask-eigenh-chip-${idx}`}
            disabled={!activePatient || loading}
            onClick={() => void runSearch(q)}
            className="px-2.5 py-1 text-[11px] text-[#042C53] bg-[#F8F8F5] hover:bg-[#E6F1FB] border border-[#042C53]/10 rounded-lg transition-colors text-left"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Error State */}
      {result && !result.ok && (
        <ClinicalAiErrorBanner
          response={result}
          onRetry={() => void runSearch(question, 'live-ai')}
          onSwitchDeterministic={() => {
            updateFlags({ executionMode: 'deterministic-demo' });
            void runSearch(question, 'deterministic-demo');
          }}
        />
      )}

      {/* Structured & Source-Backed Result */}
      {result && result.ok && result.data && (
        <div
          data-demo-target="ask-eigenh-result"
          className="space-y-3 pt-2 border-t border-[#042C53]/8"
        >
          <ClinicalAiProvenanceBar response={result} />

          {/* Query Plan + Concise Answer */}
          <div className="p-3.5 rounded-xl bg-white border border-[#042C53]/10 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge
                  label={
                    result.data.queryPlan.strategy === 'deterministic-structured'
                      ? 'Validated Structured Query Plan'
                      : result.data.queryPlan.strategy === 'grounded-narrative'
                      ? result.data.narrativeGroundedByModel
                        ? 'Live AI Grounded Narrative'
                        : 'Deterministic Grounded Summary'
                      : 'Outside Permitted Scope'
                  }
                  tone={
                    result.data.queryPlan.strategy === 'unsupported'
                      ? 'warning'
                      : result.data.queryPlan.strategy === 'deterministic-structured'
                      ? 'success'
                      : 'blue'
                  }
                />
                <span className="text-[10.5px] font-mono text-[#5F5D56]">
                  Intent: {result.data.queryPlan.intent}
                </span>
              </div>
              <span className="text-[10.5px] text-[#5F5D56]">
                {result.data.sources.length} source record{result.data.sources.length === 1 ? '' : 's'}
              </span>
            </div>

            <p className="text-[12.5px] text-[#042C53] leading-relaxed font-medium">
              {result.data.answer}
            </p>

            {result.data.incompleteOrMissingNote && (
              <div className="flex items-start gap-1.5 text-[11px] text-[#9A5B10] bg-[#FEF5E7] border border-[#C97A1B]/25 rounded-lg px-2.5 py-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{result.data.incompleteOrMissingNote}</span>
              </div>
            )}
          </div>

          {/* Trend Visualization (using real chart values) */}
          {result.data.trendSeries && result.data.trendSeries.points.length >= 2 && (
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#042C53]/8 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#185FA5]" />
                  {result.data.trendSeries.title}
                </div>
                <span className="text-[10.5px] font-mono text-[#5F5D56]">
                  {result.data.trendSeries.points.length} chart points · {result.data.trendSeries.unit}
                </span>
              </div>
              <SimpleLineChart
                points={result.data.trendSeries.points.map((pt) => ({
                  label: pt.label,
                  value: pt.value,
                }))}
                unit={result.data.trendSeries.unit}
                color={result.data.trendSeries.color}
                height={150}
              />
            </div>
          )}

          {/* Clinical Table */}
          {result.data.table && result.data.table.rows.length > 0 && (
            <div className="rounded-xl border border-[#042C53]/10 overflow-hidden bg-white">
              <div className="px-3.5 py-2 bg-[#FAF9F6] border-b border-[#042C53]/8 font-semibold text-[#042C53] flex items-center gap-1.5">
                <TableIcon className="w-3.5 h-3.5 text-[#185FA5]" />
                {result.data.table.title}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-[#042C53]/8 text-[#5F5D56] bg-[#FAF9F6]/60">
                      {result.data.table.columns.map((col) => (
                        <th key={col} className="px-3 py-2 font-semibold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#042C53]/6">
                    {result.data.table.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#F8F8F5]">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 text-[#042C53] whitespace-nowrap">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Clickable Source Record References */}
          {result.data.sources.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                Source Records ({result.data.sources.length}) — Click to Inspect Original Chart Section
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.data.sources.map((src) => (
                  <button
                    key={src.sourceId}
                    type="button"
                    onClick={() => handleNavigateSource(src.targetTab)}
                    title={src.excerpt}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#E6F1FB]/70 hover:bg-[#E6F1FB] border border-[#85B7EB]/60 text-[#042C53] rounded-lg text-[11px] font-medium transition-colors"
                  >
                    <span className="font-mono text-[10px] text-[#185FA5]">[{src.sourceType}]</span>
                    <span className="truncate max-w-[220px]">{src.label}</span>
                    <ArrowUpRight className="w-3 h-3 text-[#185FA5] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
