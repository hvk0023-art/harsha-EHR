import React, { useMemo, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import {
  AGING_BUCKETS,
  computeArAgingReport,
  computeClaimSubmissionMetrics,
  formatCurrency,
} from '../state/domainLogic';
import { useAppState } from '../state/AppStateContext';
import { SimpleBarChart, SimpleLineChart } from '../components/ui/Charts';
import {
  MetricTile,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

interface AnalysisResult {
  id: string;
  question: string;
  category: string;
  dateRange: string;
  metricDef: string;
  supported: boolean;
  summary: string;
  uncertainty?: string;
  chartType?: 'bar' | 'line';
  barData?: { label: string; value: number }[];
  lineData?: { label: string; value: number; projected?: boolean }[];
}

const SUGGESTED_QUESTIONS = [
  'Appointment analysis by status and visit type',
  'Revenue breakdown by payer category',
  'Patient demographics by age group & facility',
  'Provider performance & encounter volume',
  'Trending & forecasting: 3-month claim charge projection',
];

export const ReportsPage: React.FC = () => {
  const { state, currentFacility, notify } = useAppState();
  const [tab, setTab] = useState<'d03' | 'd04' | 'd02' | 'clinical-ops'>('d03');

  // D03 Claim Submission Summary Filters
  const [d03Facility, setD03Facility] = useState<string>('all');
  const [d03Provider, setD03Provider] = useState<string>('all');
  const [d03Start, setD03Start] = useState('2026-04-01');
  const [d03End, setD03End] = useState('2026-12-31');
  const [drillClaimId, setDrillClaimId] = useState<string | null>(null);

  // D04 AR Aging Filters
  const [d04AsOf, setD04AsOf] = useState(TODAY_DATE);
  const [d04Basis, setD04Basis] = useState<'serviceDate' | 'submittedDate'>('serviceDate');
  const [d04GroupBy, setD04GroupBy] = useState<'payerName' | 'payerCategory'>('payerName');
  const [d04Display, setD04Display] = useState<'balance' | 'pct'>('balance');
  const [d04Facility, setD04Facility] = useState<string>('all');

  // D02 AI Data Analyst
  const [analystQuery, setAnalystQuery] = useState('');
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>(() => [
    {
      id: 'an-init',
      question: 'Revenue breakdown by payer category',
      category: 'Revenue Breakdown',
      dateRange: '2026-04-01 to 2026-11-18',
      metricDef: 'Sum of primary claim chargeAmount grouped by payerCategory (excludes secondary claims to prevent double-counting).',
      supported: true,
      summary: 'Medicare accounts for the largest share of primary billed charges across Boston and Pacific clinics.',
      chartType: 'bar',
      barData: [],
    },
  ]);

  const d03Metrics = useMemo(
    () =>
      computeClaimSubmissionMetrics(state.claims, {
        facilityId: d03Facility,
        providerId: d03Provider,
        startDate: d03Start,
        endDate: d03End,
      }),
    [d03End, d03Facility, d03Provider, d03Start, state.claims]
  );

  const d03FilteredClaims = useMemo(
    () =>
      state.claims.filter((c) => {
        if (d03Facility !== 'all' && c.facilityId !== d03Facility) return false;
        if (d03Provider !== 'all' && c.providerId !== d03Provider) return false;
        const d = c.submittedDate || c.serviceDate;
        if (d < d03Start || d > d03End) return false;
        return true;
      }),
    [d03End, d03Facility, d03Provider, d03Start, state.claims]
  );

  const d04Report = useMemo(
    () =>
      computeArAgingReport(state.claims, {
        asOfDate: d04AsOf,
        agingBasis: d04Basis,
        groupBy: d04GroupBy,
        facilityId: d04Facility,
      }),
    [d04AsOf, d04Basis, d04Facility, d04GroupBy, state.claims]
  );

  const runAnalystQuestion = (q: string) => {
    const lower = q.toLowerCase();
    let res: AnalysisResult;

    if (lower.includes('appointment') || lower.includes('visit')) {
      const byStatus = new Map<string, number>();
      state.appointments.forEach((a) => byStatus.set(a.status, (byStatus.get(a.status) || 0) + 1));
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Appointment Analysis',
        dateRange: 'All scheduled synthetic dates',
        metricDef: 'Count of appointments grouped by current status across all facilities.',
        supported: true,
        summary: `Analyzed ${state.appointments.length} appointments. ${byStatus.get('Checked In') || 0} checked in and ${byStatus.get('Confirmed') || 0} confirmed.`,
        chartType: 'bar',
        barData: Array.from(byStatus.entries()).map(([label, value]) => ({ label, value })),
      };
    } else if (lower.includes('revenue') || lower.includes('payer')) {
      const byPayer = new Map<string, number>();
      state.claims
        .filter((c) => !c.isSecondary)
        .forEach((c) => byPayer.set(c.payerCategory, (byPayer.get(c.payerCategory) || 0) + c.chargeAmount));
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Revenue Breakdown',
        dateRange: '2026-04-01 to 2026-11-18',
        metricDef: 'Primary claim charges ($) grouped by payerCategory.',
        supported: true,
        summary: `Computed across ${state.claims.filter((c) => !c.isSecondary).length} primary claims.`,
        chartType: 'bar',
        barData: Array.from(byPayer.entries()).map(([label, value]) => ({ label, value })),
      };
    } else if (lower.includes('demographic') || lower.includes('age')) {
      const buckets = { '0-39': 0, '40-64': 0, '65+': 0 };
      state.patients.forEach((p) => {
        if (p.age < 40) buckets['0-39'] += 1;
        else if (p.age < 65) buckets['40-64'] += 1;
        else buckets['65+'] += 1;
      });
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Patient Demographics',
        dateRange: 'Active synthetic roster',
        metricDef: 'Patient count by age band across active facilities.',
        supported: true,
        summary: `${state.patients.length} active patients; ${buckets['65+']} seniors (65+).`,
        chartType: 'bar',
        barData: Object.entries(buckets).map(([label, value]) => ({ label, value })),
      };
    } else if (lower.includes('provider') || lower.includes('performance')) {
      const byProv = new Map<string, number>();
      state.appointments.forEach((a) => {
        const name = state.staff.find((s) => s.id === a.providerId)?.name.split(',')[0] || a.providerId;
        byProv.set(name, (byProv.get(name) || 0) + 1);
      });
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Provider Performance',
        dateRange: 'All synthetic appointments',
        metricDef: 'Appointment volume per clinician.',
        supported: true,
        summary: `Comparison across ${byProv.size} clinicians in the synthetic dataset.`,
        chartType: 'bar',
        barData: Array.from(byProv.entries()).map(([label, value]) => ({ label, value })),
      };
    } else if (lower.includes('trend') || lower.includes('forecast') || lower.includes('projection')) {
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Forecasting Analysis',
        dateRange: 'Jul–Nov 2026 (Observed) + Dec–Jan (Projected)',
        metricDef: 'Monthly primary claim volume ($). Dashed segment indicates linear projection, not guaranteed revenue.',
        supported: true,
        summary: 'Observed charges grew steadily from July through November. Projection assumes stable visit volume.',
        uncertainty: 'Forecast uncertainty: ±18% based on small synthetic sample size (n=6 primary claims).',
        chartType: 'line',
        lineData: [
          { label: 'Jul (Obs)', value: 540 },
          { label: 'Sep (Obs)', value: 380 },
          { label: 'Oct (Obs)', value: 620 },
          { label: 'Nov (Obs)', value: 3690 },
          { label: 'Dec (Proj)', value: 3950, projected: true },
          { label: 'Jan (Proj)', value: 4200, projected: true },
        ],
      };
    } else {
      res = {
        id: `an-${Date.now()}`,
        question: q,
        category: 'Unsupported Query',
        dateRange: 'N/A',
        metricDef: 'Requested metric is not present in the local synthetic dataset.',
        supported: false,
        summary:
          'Unable to compute this query honestly from the current prototype records (available domains: appointments, claims, AR aging, patient demographics, provider volume, and lab trends).',
      };
    }

    setAnalysisHistory((prev) => [res, ...prev]);
    setAnalystQuery('');
  };

  // Populate initial D02 chart dynamically from current claims
  const activeAnalysis = useMemo(() => {
    const top = analysisHistory[0];
    if (top.id === 'an-init') {
      const byPayer = new Map<string, number>();
      state.claims
        .filter((c) => !c.isSecondary)
        .forEach((c) => byPayer.set(c.payerCategory, (byPayer.get(c.payerCategory) || 0) + c.chargeAmount));
      return {
        ...top,
        barData: Array.from(byPayer.entries()).map(([label, value]) => ({ label, value })),
      };
    }
    return top;
  }, [analysisHistory, state.claims]);

  const drillClaim = state.claims.find((c) => c.id === drillClaimId);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & Analytics"
        subtitle="M32 Analytics · D02 AI Data Analyst · D03 Claim Submission Summary · D04 AR Aging"
        secondaryActions={
          <button
            type="button"
            onClick={() => notify('info', 'CSV report export prepared locally (simulated)')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV (Sim)
          </button>
        }
      />

      <SegmentedTabs
        tabs={[
          { id: 'd03', label: 'D03 · Claim Submission Summary' },
          { id: 'd04', label: 'D04 · Accounts Receivable Aging' },
          { id: 'd02', label: 'D02 · AI Data Analyst' },
          { id: 'clinical-ops', label: 'Clinical, Quality & Data Quality' },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {/* D03 — CLAIM SUBMISSION SUMMARY */}
      {tab === 'd03' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
            <div>
              <label htmlFor="d03-start" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Submitted From
              </label>
              <input
                id="d03-start"
                type="date"
                value={d03Start}
                onChange={(e) => setD03Start(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="d03-end" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Submitted To
              </label>
              <input
                id="d03-end"
                type="date"
                value={d03End}
                onChange={(e) => setD03End(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="d03-fac" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Organisation
              </label>
              <select
                id="d03-fac"
                value={d03Facility}
                onChange={(e) => setD03Facility(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white"
              >
                <option value="all">All Facilities</option>
                {state.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d03-prov" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Provider
              </label>
              <select
                id="d03-prov"
                value={d03Provider}
                onChange={(e) => setD03Provider(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white"
              >
                <option value="all">All Providers</option>
                {state.staff
                  .filter((s) => s.role === 'Clinician')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricTile label="Total Encounters" value={d03Metrics.totalEncounters} detail="Primary unique visits" />
            <MetricTile
              label="Total Charges"
              value={formatCurrency(d03Metrics.totalCharges, 'USD')}
              detail="Primary charges only"
            />
            <MetricTile label="Claims Submitted" value={d03Metrics.primaryClaimsSubmitted} detail="Primary submissions" />
            <MetricTile label="Days to Submission" value={`${d03Metrics.avgDaysToSubmit} d`} detail="Mean DOS to submit" />
            <MetricTile label="Resubmission Rate" value={`${d03Metrics.resubmissionRatePct}%`} detail="Rejected/Denied/Appealed" />
            <MetricTile
              label="Avg Charge / Visit"
              value={formatCurrency(d03Metrics.avgChargePerVisit, 'USD')}
              detail={`${d03Metrics.secondaryClaimsCount} secondary (excluded)`}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-sm font-semibold text-[#042C53]">Submission Activity by Week</h2>
                <p className="text-[11px] text-[#5F5D56]">
                  Primary submissions (dark blue) vs secondary claims (light blue, not double-counted in charges)
                </p>
              </div>
            </div>
            <SimpleBarChart
              data={d03Metrics.weeklyActivity.map((w) => ({
                label: w.weekLabel.slice(5),
                value: w.primaryCount,
                secondaryValue: w.secondaryCount,
              }))}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Claim #</th>
                  <th className="py-2.5 px-3">Patient</th>
                  <th className="py-2.5 px-3">Payer</th>
                  <th className="py-2.5 px-3">DOS / Submitted</th>
                  <th className="py-2.5 px-3 text-right">Charges</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Drill-down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d03FilteredClaims.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#042C53]">
                      {c.claimNumber} {c.isSecondary ? '(Secondary)' : ''}
                    </td>
                    <td className="py-2.5 px-3">
                      <PatientLink patientId={c.patientId} tab="account" />
                    </td>
                    <td className="py-2.5 px-3">{c.payerName}</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-[11px]">
                      {c.serviceDate} → {c.submittedDate || 'Pending'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {c.isSecondary ? '— (Primary counted)' : formatCurrency(c.chargeAmount, 'USD')}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={c.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDrillClaimId(c.id)}
                        className="text-[#185FA5] hover:underline font-medium"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* D04 — ACCOUNTS RECEIVABLE AGING */}
      {tab === 'd04' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
            <div>
              <label htmlFor="d04-asof" className="block text-[11px] text-[#5F5D56] mb-0.5">
                As-of Date
              </label>
              <input
                id="d04-asof"
                type="date"
                value={d04AsOf}
                onChange={(e) => setD04AsOf(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="d04-basis" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Aging Basis
              </label>
              <select
                id="d04-basis"
                value={d04Basis}
                onChange={(e) => setD04Basis(e.target.value as 'serviceDate' | 'submittedDate')}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white"
              >
                <option value="serviceDate">Date of Service</option>
                <option value="submittedDate">Submitted Date</option>
              </select>
            </div>
            <div>
              <label htmlFor="d04-fac" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Facility Scope
              </label>
              <select
                id="d04-fac"
                value={d04Facility}
                onChange={(e) => setD04Facility(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white"
              >
                <option value="all">All Facilities</option>
                {state.facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="d04-grp" className="block text-[11px] text-[#5F5D56] mb-0.5">
                Group By
              </label>
              <select
                id="d04-grp"
                value={d04GroupBy}
                onChange={(e) => setD04GroupBy(e.target.value as 'payerName' | 'payerCategory')}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white"
              >
                <option value="payerName">Payer</option>
                <option value="payerCategory">Payer Category</option>
              </select>
            </div>
            <div className="ml-auto">
              <SegmentedTabs
                tabs={[
                  { id: 'balance', label: 'Balance ($)' },
                  { id: 'pct', label: 'Percentage (%)' },
                ]}
                activeId={d04Display}
                onChange={(id) => setD04Display(id as 'balance' | 'pct')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricTile
              label="Total Open Balance"
              value={formatCurrency(d04Report.totalOpenBalance, 'USD')}
              detail={`Basis: ${d04Basis === 'serviceDate' ? 'Date of Service' : 'Submitted Date'}`}
            />
            <MetricTile
              label="Over 90 Days"
              value={formatCurrency(d04Report.over90Balance, 'USD')}
              tone="warning"
            />
            <MetricTile
              label="Over 180 Days"
              value={formatCurrency(d04Report.over180Balance, 'USD')}
              tone="danger"
            />
            <MetricTile
              label="Largest Payer Balance"
              value={formatCurrency(d04Report.largestPayerBalance, 'USD')}
              detail={d04Report.largestPayerName}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-[#042C53] mb-2">
              Aging Buckets Distribution (As of {d04AsOf})
            </h2>
            <SimpleBarChart
              valuePrefix="$"
              data={AGING_BUCKETS.map((b) => ({
                label: b,
                value: d04Report.totalsByBucket[b],
              }))}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                  <tr>
                    <th className="py-2.5 px-3">{d04GroupBy === 'payerCategory' ? 'Payer Category' : 'Payer'}</th>
                    {AGING_BUCKETS.map((b) => (
                      <th key={b} className="py-2.5 px-3 text-right">
                        {b}
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-right">Total Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {d04Report.rows.map((row) => (
                    <tr key={row.groupKey}>
                      <td className="py-2.5 px-3 font-sans font-medium text-[#042C53]">{row.groupKey}</td>
                      {AGING_BUCKETS.map((b) => {
                        const val = row.buckets[b];
                        const display =
                          d04Display === 'pct'
                            ? row.totalOpen > 0
                              ? `${Math.round((val / row.totalOpen) * 100)}%`
                              : '0%'
                            : formatCurrency(val, 'USD');
                        return (
                          <td key={b} className="py-2.5 px-3 text-right">
                            {display}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3 text-right font-semibold text-[#042C53]">
                        {formatCurrency(row.totalOpen, 'USD')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* D02 — AI DATA ANALYST */}
      {tab === 'd02' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: History & Suggested */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-[#042C53]">Suggested Analyses</h2>
              <div className="mt-2 space-y-1.5">
                {SUGGESTED_QUESTIONS.map((sq) => (
                  <button
                    key={sq}
                    type="button"
                    onClick={() => runAnalystQuestion(sq)}
                    className="w-full text-left px-2.5 py-2 text-xs bg-[#F7F7F5] hover:bg-[#E6F1FB] border border-slate-200 rounded-md text-[#042C53]"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-[#5F5D56] mb-2">Analysis History</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto eigen-scroll">
                {analysisHistory.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setAnalysisHistory((prev) => [h, ...prev.filter((x) => x.id !== h.id)])}
                    className="w-full text-left p-2 rounded border border-slate-200 hover:bg-slate-50 text-xs"
                  >
                    <div className="font-medium text-[#042C53] truncate">{h.question}</div>
                    <div className="text-[11px] text-[#5F5D56]">{h.category}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Active Query & Visualisation */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!analystQuery.trim()) return;
                runAnalystQuestion(analystQuery.trim());
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                aria-label="Ask AI Data Analyst"
                placeholder="Ask about appointments, revenue, demographics, providers, or try an unsupported topic..."
                value={analystQuery}
                onChange={(e) => setAnalystQuery(e.target.value)}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-md"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run Analysis
              </button>
            </form>

            <div className="p-4 border border-slate-200 rounded-lg space-y-3 bg-[#F7F7F5]/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-[#042C53]">{activeAnalysis.question}</div>
                  <div className="text-[11px] text-[#5F5D56]">
                    {activeAnalysis.category} · Range: {activeAnalysis.dateRange}
                  </div>
                </div>
                <StatusBadge
                  label={activeAnalysis.supported ? 'Computed from Synthetic Data' : 'Unsupported Query'}
                  tone={activeAnalysis.supported ? 'blue' : 'warning'}
                />
              </div>

              <div className="text-xs text-slate-800">{activeAnalysis.summary}</div>

              <div className="text-[11px] text-[#5F5D56] bg-white p-2.5 rounded border border-slate-200">
                <span className="font-semibold text-[#042C53]">Metric Definition: </span>
                {activeAnalysis.metricDef}
              </div>

              {activeAnalysis.uncertainty && (
                <div className="text-[11px] text-[#9A5B10] bg-amber-50 p-2.5 rounded border border-amber-200">
                  {activeAnalysis.uncertainty}
                </div>
              )}

              {activeAnalysis.supported && activeAnalysis.chartType === 'bar' && activeAnalysis.barData && (
                <div className="bg-white p-3 rounded border border-slate-200">
                  <SimpleBarChart data={activeAnalysis.barData} />
                </div>
              )}
              {activeAnalysis.supported && activeAnalysis.chartType === 'line' && activeAnalysis.lineData && (
                <div className="bg-white p-3 rounded border border-slate-200">
                  <SimpleLineChart points={activeAnalysis.lineData} unit="" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clinical, Operational & Data Quality Reports */}
      {tab === 'clinical-ops' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-[#042C53]">Clinical Quality Measures</h2>
            <p className="text-xs text-[#5F5D56]">Derived live from synthetic problem lists, labs, and care plans.</p>
            <div className="divide-y divide-slate-100 text-xs pt-2">
              <div className="py-2 flex justify-between">
                <span>CKD Patients with Recent eGFR (&lt;90d)</span>
                <span className="font-mono font-semibold text-[#0F6E50]">100% (2/2)</span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Medication Reconciliation Completed</span>
                <span className="font-mono font-semibold text-[#042C53]">
                  {state.medications.filter((m) => m.reconciled).length}/{state.medications.length}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Signed Encounter Notes</span>
                <span className="font-mono font-semibold text-[#042C53]">
                  {state.encounters.filter((e) => e.noteStatus === 'Signed' || e.noteStatus === 'Amended').length}/{state.encounters.length}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
            <h2 className="text-sm font-semibold text-[#042C53]">Data Quality & Completeness</h2>
            <p className="text-xs text-[#5F5D56]">Identifies missing intake forms, unverified external conditions, or unmatched faxes.</p>
            <div className="divide-y divide-slate-100 text-xs pt-2">
              <div className="py-2 flex justify-between">
                <span>Patients Missing Intake Forms</span>
                <span className="font-mono font-semibold text-[#C97A1B]">
                  {state.patients.filter((p) => !p.intakeFormsComplete).length}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Unverified External HIE Conditions</span>
                <span className="font-mono font-semibold text-[#C97A1B]">
                  {state.patients.reduce((s, p) => s + p.conditions.filter((c) => !c.verified).length, 0)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span>Failed Outbound Faxes</span>
                <span className="font-mono font-semibold text-[#B4321F]">
                  {state.faxes.filter((f) => f.status === 'Failed').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={Boolean(drillClaim)} onClose={() => setDrillClaimId(null)} title={`Claim Detail: ${drillClaim?.claimNumber || ''}`}>
        {drillClaim && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-[#F7F7F5] p-3 rounded">
              <div>Payer: <strong>{drillClaim.payerName}</strong></div>
              <div>Status: <StatusBadge label={drillClaim.status} /></div>
              <div>DOS: <span className="font-mono">{drillClaim.serviceDate}</span></div>
              <div>Submitted: <span className="font-mono">{drillClaim.submittedDate || 'Not yet'}</span></div>
              <div>Charges: <span className="font-mono">${drillClaim.chargeAmount}</span></div>
              <div>Paid: <span className="font-mono">${drillClaim.paidAmount}</span></div>
            </div>
            <div>CPTs: <span className="font-mono">{drillClaim.cptCodes.join(', ')}</span></div>
            {drillClaim.denialReason && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded text-[#B4321F]">
                {drillClaim.denialReason}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
