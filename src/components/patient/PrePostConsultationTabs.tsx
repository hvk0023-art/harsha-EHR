import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  FileText,
  HelpCircle,
  Loader2,
  Lock,
  Mic,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Square,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  clinicalAiAuditService,
  generateAmbientScribeV2WithClinicalAi,
  prepareClinicalActionsWithClinicalAi,
  preparePreConsultationBriefWithClinicalAi,
} from '../../ai/clinicalAiService';
import type {
  ActionComposerOutput,
  AmbientScribeV2Output,
  ClinicalAIExecutionMode,
  ClinicalAIResponse,
  PreConsultationBriefOutput,
} from '../../ai/clinicalAiTypes';
import { buildPermittedPatientContext, resolveGroundedSources } from '../../ai/patientContextBuilder';
import { TODAY_DATE } from '../../data/seedData';
import { DEMO_AMBIENT_TRANSCRIPT } from '../../demo/demoFixtures';
import { useAppState } from '../../state/AppStateContext';
import {
  buildClinicalSafetyRadar,
  buildJourneyTimeMachine,
  buildPreVisitReadiness,
  buildWhatMattersToday,
  type ProvenanceKind,
} from '../../state/clinicalIntelligence';
import { canOrderOrPrescribe, canSignClinicalNote } from '../../state/permissions';
import type { Patient } from '../../types/hms';
import {
  ClinicalAiErrorBanner,
  ClinicalAiModeToggle,
  ClinicalAiProvenanceBar,
  useClinicalAiFlags,
} from '../ai/ClinicalAiControls';
import { StatusBadge } from '../ui/Primitives';

const SYNTHETIC_TRANSCRIPT_PRESETS: { id: string; label: string; text: string }[] = [
  {
    id: 'ckd-htn',
    label: 'CKD Stage 3a & Elevated BP (Default)',
    text: DEMO_AMBIENT_TRANSCRIPT,
  },
  {
    id: 'afib-inr',
    label: 'Atrial Fibrillation & Elevated INR',
    text: `Clinician: Good morning. Tell me how your heart rhythm and energy have been since last visit.\nPatient: I felt brief palpitations twice this week and noticed minor gum brushing bleeding after my Warfarin dose.\nClinician: Your pulse is irregular at 78 bpm and recent INR was 3.4, slightly above target 2.0-3.0. No melena, hematuria, or syncope.\nClinician: Plan is to hold tonight's Warfarin dose as a draft recommendation for verification, order a repeat STAT PT/INR lab in 3 days, refer to Cardiology Anticoagulation Clinic, and schedule a 1-week follow-up.\nPatient: Understood, I will watch for any unusual bruising or bleeding and call right away.`,
  },
  {
    id: 't2dm-neuropathy',
    label: 'Type 2 Diabetes & Foot Neuropathy',
    text: `Clinician: How have your fasting sugars and foot tingling been over the past month?\nPatient: Morning fasting glucose averages 168 mg/dL and I have burning tingling in both toes at night.\nClinician: Monofilament testing shows reduced protective sensation bilaterally at the plantar first metatarsal head. No foot ulcerations.\nClinician: Plan is to order HbA1c and Lipid Panel, draft Gabapentin 100 mg PO at bedtime for neuropathic pain review, create a Podiatry referral, and schedule a 4-week diabetes follow-up.`,
  },
];

const ProvenanceTag: React.FC<{ kind: ProvenanceKind }> = ({ kind }) => {
  const tone =
    kind === 'Recorded Fact'
      ? 'text-[#0F6E50] bg-[#E9F7F1] border-[#1D9E75]/30'
      : kind === 'Derived Calculation'
      ? 'text-[#185FA5] bg-[#E6F1FB] border-[#85B7EB]/55'
      : kind === 'Simulated AI Suggestion'
      ? 'text-[#042C53] bg-[#F1EFE8] border-[#042C53]/12'
      : 'text-[#9A5B10] bg-[#FEF5E7] border-[#C97A1B]/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${tone}`}>
      {kind}
    </span>
  );
};

// ============================================================================
// 1. PRE-CONSULTATION SUMMARY (AI-NATIVE CLINICIAN VIEW)
// ============================================================================

export const PreConsultationTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    setPatientTab,
    runAiIntakeExtraction,
    verifyIntakeExtractedItem,
    verifyExternalCondition,
    recordClinicalHandoff,
    recordClinicalAiAudit,
    notify,
  } = useAppState();
  const { flags, updateFlags, serverStatus } = useClinicalAiFlags();

  const [briefLoading, setBriefLoading] = useState(false);
  const [briefResponse, setBriefResponse] = useState<ClinicalAIResponse<PreConsultationBriefOutput> | null>(null);
  const [briefDecision, setBriefDecision] = useState<'Draft — Review Required' | 'Verified & Approved' | 'Edited & Approved' | 'Rejected'>('Draft — Review Required');
  const [editingBrief, setEditingBrief] = useState(false);
  const [editedBriefHeadline, setEditedBriefHeadline] = useState('');

  const readiness = useMemo(() => buildPreVisitReadiness(state, patient.id), [state, patient.id]);
  const whatMatters = useMemo(() => buildWhatMattersToday(state, patient.id), [state, patient.id]);
  const safetyRadar = useMemo(() => buildClinicalSafetyRadar(state, patient.id), [state, patient.id]);
  const latestIntake = (state.preVisitIntakes || []).find((i) => i.patientId === patient.id);
  const vitals = state.vitals.filter((v) => v.patientId === patient.id);
  const patientHandoffs = (state.handoffs || []).filter((h) => h.patientId === patient.id);

  const sourceCatalog = useMemo(() => {
    const res = buildPermittedPatientContext(state, {
      patientId: patient.id,
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
    });
    return res.ok ? res.context.sourceCatalog : {};
  }, [state, patient.id]);

  const handlePrepareBrief = async (modeOverride?: ClinicalAIExecutionMode) => {
    setBriefLoading(true);
    const resp = await preparePreConsultationBriefWithClinicalAi(state, patient.id, {
      modeOverride,
      flags,
    });
    setBriefResponse(resp);
    setBriefDecision('Draft — Review Required');
    setEditingBrief(false);
    setEditedBriefHeadline(resp.data?.whatMattersTodayHeadline || '');
    setBriefLoading(false);
    if (resp.ok && resp.data) {
      recordClinicalAiAudit(
        `Prepare Pre-Consultation Brief (${resp.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'})`,
        'Patient',
        patient.id,
        `Model ${resp.modelId} (${resp.requestId}) generated ${resp.data.sections.length} grounded section(s); review required`
      );
    } else if (resp.error) {
      notify('error', resp.error.message);
    }
  };

  const handleBriefReviewAction = (decision: 'Accepted' | 'Edited' | 'Rejected') => {
    if (!briefResponse) return;
    const actor = state.staff.find((s) => s.id === state.currentUserId)?.name || state.currentRole;
    const nextState: 'Verified & Approved' | 'Edited & Approved' | 'Rejected' =
      decision === 'Accepted'
        ? 'Verified & Approved'
        : decision === 'Edited'
        ? 'Edited & Approved'
        : 'Rejected';
    setBriefDecision(nextState);
    setEditingBrief(false);
    clinicalAiAuditService.updateReview(briefResponse.requestId, {
      reviewState: nextState,
      humanReviewDecision: `${decision} by ${actor} (${state.currentRole})${
        decision === 'Edited' && editedBriefHeadline ? ` — ${editedBriefHeadline}` : ''
      }`,
    });
    recordClinicalAiAudit(
      `Pre-Consultation Brief ${decision}`,
      'Patient',
      patient.id,
      `${actor} (${state.currentRole}) marked brief ${briefResponse.requestId} as ${decision}`
    );
    notify(
      decision === 'Rejected' ? 'warning' : 'success',
      `Pre-Consultation Brief marked ${decision} by ${actor}`
    );
  };

  const groupedSections = useMemo(() => {
    const order = [
      'Reason for Visit',
      'Recent Clinical Events',
      'Medications & Allergies',
      'Trends',
      'Missing or Unverified',
      'Outstanding Actions',
    ] as const;
    return order
      .map((section) => ({
        section,
        items: whatMatters.filter((w) => w.section === section),
      }))
      .filter((g) => g.items.length > 0);
  }, [whatMatters]);

  return (
    <div className="space-y-5 text-xs">
      {/* Top Clinical Orientation Bar */}
      <div className="eigen-card p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-[#042C53]">
              Pre-Consultation Clinical Summary
            </h2>
            <p className="text-xs text-[#5F5D56] mt-0.5 leading-relaxed">
              Source-linked synthesis clearly distinguishing recorded facts, derived calculations, AI-prepared drafts, and missing data.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ClinicalAiModeToggle
            mode={flags.executionMode}
            onChangeMode={(m) => updateFlags({ executionMode: m })}
            serverConfigured={serverStatus?.configured}
            compact
          />
          <button
            type="button"
            data-demo-target="prepare-intel-brief-btn"
            disabled={briefLoading || !flags.preConsultationBrief}
            onClick={() => void handlePrepareBrief()}
            className="eigen-btn-navy px-3.5 py-2 text-xs disabled:opacity-50"
          >
            {briefLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {briefLoading ? 'Preparing Brief...' : 'Prepare Patient Intelligence Brief'}
          </button>
          <button
            type="button"
            onClick={() => setPatientTab('pre-visit-intake')}
            className="eigen-btn-secondary px-3.5 py-2 text-xs"
          >
            Open Pre-Visit Intake
          </button>
          <button
            type="button"
            data-demo-target="start-consult-scribe-btn"
            onClick={() => setPatientTab('post-consultation')}
            className="eigen-btn-primary px-4 py-2 text-xs"
          >
            Start Consultation & Scribe
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Phase 2 Real AI Pre-Consultation Intelligence Brief Panel */}
      {briefResponse && (
        <section
          data-demo-target="ai-pre-consult-brief-panel"
          className="eigen-card p-5 space-y-4 border-[#185FA5]/25"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/[0.07] pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#042C53] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#185FA5]" />
                AI-Prepared Patient Intelligence Brief
              </h3>
              <p className="text-[11px] text-[#5F5D56] mt-0.5">
                Grounded exclusively in permitted records for {patient.fullName}. Click any source chip to inspect original EHR evidence.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {briefResponse.ok && briefDecision !== 'Rejected' && (
                <>
                  <button
                    type="button"
                    data-demo-target="brief-accept-btn"
                    onClick={() => handleBriefReviewAction('Accepted')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0F6E50] hover:bg-[#042C53] text-white rounded-lg text-[11px] font-semibold"
                  >
                    <Check className="w-3 h-3" />
                    Accept Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingBrief((v) => !v)}
                    className="eigen-btn-secondary px-2.5 py-1.5 text-[11px]"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBriefReviewAction('Rejected')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#B4321F]/25 text-[#B4321F] rounded-lg text-[11px] font-medium hover:bg-[#FDF0EE]"
                  >
                    <X className="w-3 h-3" />
                    Reject
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={briefLoading}
                onClick={() => void handlePrepareBrief()}
                className="eigen-btn-secondary px-2.5 py-1.5 text-[11px]"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
          </div>

          {briefResponse.ok && (
            <ClinicalAiProvenanceBar response={briefResponse} reviewStatusOverride={briefDecision} />
          )}

          {!briefResponse.ok && (
            <ClinicalAiErrorBanner
              response={briefResponse}
              onRetry={() => void handlePrepareBrief('live-ai')}
              onSwitchDeterministic={() => void handlePrepareBrief('deterministic-demo')}
            />
          )}

          {briefResponse.ok && briefResponse.data && briefDecision !== 'Rejected' && (
            <div className="space-y-4">
              {/* Executive Headline + What Matters Today Bullets */}
              <div className="p-3.5 rounded-xl bg-[#EFF6FC]/65 border border-[#85B7EB]/50 space-y-2.5">
                {editingBrief ? (
                  <div className="space-y-2">
                    <label htmlFor="brief-edit-headline" className="text-[11px] font-semibold text-[#042C53]">
                      Edit Clinician Brief Headline
                    </label>
                    <input
                      id="brief-edit-headline"
                      type="text"
                      value={editedBriefHeadline}
                      onChange={(e) => setEditedBriefHeadline(e.target.value)}
                      className="eigen-input w-full"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingBrief(false)}
                        className="eigen-btn-secondary px-2.5 py-1 text-[11px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBriefReviewAction('Edited')}
                        className="eigen-btn-primary px-3 py-1 text-[11px]"
                      >
                        Save &amp; Approve Edit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="font-semibold text-[#042C53] text-xs">
                    {editedBriefHeadline || briefResponse.data.whatMattersTodayHeadline}
                  </div>
                )}

                <ul className="space-y-2">
                  {briefResponse.data.whatMattersTodayBullets.map((b, idx) => {
                    const resolved = resolveGroundedSources(b.sourceIds, sourceCatalog).resolved;
                    return (
                      <li key={idx} className="flex flex-wrap items-start justify-between gap-2 text-xs text-[#042C53]">
                        <span className="flex-1 min-w-0 leading-relaxed">• {b.text}</span>
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {resolved.map((src) => (
                            <button
                              key={src.sourceId}
                              type="button"
                              onClick={() => setPatientTab(src.targetTab)}
                              className="px-2 py-0.5 text-[10px] font-medium bg-white border border-[#185FA5]/30 text-[#185FA5] hover:bg-[#E6F1FB] rounded-md"
                            >
                              {src.label} →
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Source-Linked Structured Sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {briefResponse.data.sections.map((sec) => {
                  const resolved = resolveGroundedSources(sec.sourceIds, sourceCatalog).resolved;
                  return (
                    <div
                      key={sec.id}
                      className="p-3.5 rounded-xl bg-white border border-[#042C53]/10 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                          {sec.section}
                        </span>
                        <StatusBadge
                          label={sec.evidenceType}
                          tone={
                            sec.evidenceType === 'Missing / Conflict Alert'
                              ? 'warning'
                              : sec.evidenceType === 'Source-Grounded Fact'
                              ? 'success'
                              : 'blue'
                          }
                        />
                      </div>
                      <div className="font-semibold text-[#042C53]">{sec.headline}</div>
                      <p className="text-[11px] text-[#444441] leading-relaxed">{sec.detail}</p>
                      {resolved.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {resolved.map((src) => (
                            <button
                              key={src.sourceId}
                              type="button"
                              onClick={() => setPatientTab(src.targetTab)}
                              className="px-2 py-0.5 text-[10px] font-mono text-[#185FA5] bg-[#F8F8F5] hover:bg-[#E6F1FB] border border-[#042C53]/10 rounded"
                            >
                              {src.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Explicit Missing / Conflicting / Uncertainty Indicators */}
              {(briefResponse.data.missingClinicalData.length > 0 ||
                briefResponse.data.conflictingInformation.length > 0 ||
                briefResponse.data.uncertaintyIndicators.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {briefResponse.data.missingClinicalData.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#FEF5E7] border border-[#C97A1B]/30 text-[#9A5B10] space-y-1">
                      <div className="font-semibold text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Missing Clinical Data
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {briefResponse.data.missingClinicalData.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {briefResponse.data.conflictingInformation.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#FDF0EE] border border-[#B4321F]/25 text-[#B4321F] space-y-1">
                      <div className="font-semibold text-[11px] flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Conflicting / Unreconciled Items
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {briefResponse.data.conflictingInformation.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {briefResponse.data.uncertaintyIndicators.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#F8F8F5] border border-[#042C53]/12 text-[#042C53] space-y-1">
                      <div className="font-semibold text-[11px]">Uncertainty &amp; Verification Notes</div>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-[#5F5D56]">
                        {briefResponse.data.uncertaintyIndicators.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {briefDecision === 'Rejected' && (
            <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#042C53]/10 text-[#5F5D56]">
              AI-prepared brief rejected by clinician and logged in audit history. Deterministic What Matters Today and Safety Radar remain active below.
            </div>
          )}
        </section>
      )}

      {/* Clinical Safety Radar */}
      <section
        data-demo-target="clinical-safety-radar-panel"
        aria-label="Clinical Safety Radar"
        className={`rounded-2xl border p-5 space-y-3 shadow-[0_1px_2px_rgba(4,44,83,0.03)] ${
          safetyRadar.some((a) => a.severity === 'Critical')
            ? 'bg-[#FDF0EE]/70 border-[#B4321F]/25'
            : safetyRadar.length > 0
            ? 'bg-[#FEF5E7]/65 border-[#C97A1B]/25'
            : 'bg-[#E9F7F1]/55 border-[#1D9E75]/25'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display font-semibold text-sm text-[#042C53]">
            <ShieldAlert
              className={`w-4 h-4 ${
                safetyRadar.some((a) => a.severity === 'Critical')
                  ? 'text-[#B4321F]'
                  : safetyRadar.length > 0
                  ? 'text-[#C97A1B]'
                  : 'text-[#0F6E50]'
              }`}
            />
            <span>Clinical Safety Radar</span>
            <span className="font-mono tabular-nums text-[11px] font-medium text-[#5F5D56]">
              · {safetyRadar.length} active signal{safetyRadar.length === 1 ? '' : 's'}
            </span>
          </div>
          <span className="text-[11px] text-[#5F5D56]">
            Checks allergies, critical/unreviewed labs, external records & reconciliation
          </span>
        </div>

        {safetyRadar.length === 0 ? (
          <div className="text-xs text-[#0F6E50] font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            No active safety conflicts, unreviewed critical results, or pending reconciliation alerts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {safetyRadar.map((alert) => (
              <div
                key={alert.id}
                className="bg-white border border-[#042C53]/10 rounded-xl p-3.5 flex items-start justify-between gap-3 shadow-2xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge
                      label={alert.severity}
                      tone={
                        alert.severity === 'Critical'
                          ? 'danger'
                          : alert.severity === 'Warning'
                          ? 'warning'
                          : 'blue'
                      }
                    />
                    <span className="text-[11px] font-medium text-[#5F5D56]">{alert.category}</span>
                  </div>
                  <div className="font-semibold text-[#042C53]">{alert.title}</div>
                  <div className="text-[11px] text-[#444441] leading-snug">{alert.detail}</div>
                  <div className="text-[10px] font-mono text-[#5F5D56]">Source: {alert.supportingRecord}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientTab(alert.targetTab)}
                  className="px-2.5 py-1 text-[11px] font-medium text-[#185FA5] hover:bg-[#E6F1FB] rounded-lg transition-colors shrink-0"
                >
                  Inspect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Columns: What Matters Today + Intelligent Document-to-Chart */}
        <div className="lg:col-span-2 space-y-5">
          <section
            data-demo-target="what-matters-today-panel"
            className="eigen-card p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-[#042C53]/[0.07] pb-3">
              <h3 className="font-display text-sm font-semibold text-[#042C53]">What Matters Today</h3>
              <span className="text-[11px] text-[#5F5D56]">Click any source link to drill into full chart</span>
            </div>

            <div className="divide-y divide-[#042C53]/[0.06]">
              {groupedSections.map((group) => (
                <div key={group.section} className="py-3 first:pt-0 last:pb-0 space-y-2.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5F5D56]">
                    {group.section}
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-2.5 eigen-card-subtle px-3.5 py-2.5"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#042C53]">{item.title}</span>
                          <ProvenanceTag kind={item.provenance} />
                        </div>
                        <p className="text-[#444441] leading-relaxed">{item.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPatientTab(item.targetTab)}
                        className="text-[11px] font-medium text-[#185FA5] hover:text-[#042C53] hover:underline shrink-0"
                      >
                        {item.sourceLabel} →
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          {/* Intelligent Document-to-Chart (AI Intake Intelligence) */}
          <section
            data-demo-target="ai-doc-to-chart-panel"
            className="eigen-card p-5 space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/[0.07] pb-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-[#042C53]">
                  Intelligent Document-to-Chart (AI Intake Intelligence)
                </h3>
                <p className="text-[11px] text-[#5F5D56] mt-0.5">
                  Extracted items remain Draft / Unverified until explicitly verified by staff against source snippets.
                </p>
              </div>
              {latestIntake && latestIntake.extractedItems.length === 0 && (
                <button
                  type="button"
                  data-demo-target="extract-intake-btn"
                  onClick={() => runAiIntakeExtraction(latestIntake.id)}
                  className="eigen-btn-primary px-3.5 py-2 text-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Extract Structured Fields (Sim AI)
                </button>
              )}
            </div>

            {!latestIntake ? (
              <div className="p-3.5 eigen-card-subtle flex flex-wrap items-center justify-between gap-2">
                <span className="text-[#5F5D56]">
                  No pre-visit intake submission recorded for {patient.fullName} yet.
                </span>
                <button
                  type="button"
                  onClick={() => setPatientTab('pre-visit-intake')}
                  className="text-[#185FA5] font-medium hover:underline"
                >
                  Simulate Pre-Visit Intake →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] eigen-card-subtle px-3.5 py-2.5">
                  <span>
                    <strong className="text-[#042C53]">Submitted:</strong>{' '}
                    <span className="font-mono">{latestIntake.submittedAt}</span> ·{' '}
                    {latestIntake.uploadedDocuments.length} uploaded document(s) · Insurance:{' '}
                    <strong className="text-[#042C53]">{latestIntake.insurancePayer}</strong> ({latestIntake.insuranceStatus})
                  </span>
                  <StatusBadge
                    label={latestIntake.status}
                    tone={latestIntake.status === 'Verified' ? 'success' : 'warning'}
                  />
                </div>

                {latestIntake.extractedItems.length > 0 && (
                  <div className="divide-y divide-[#042C53]/[0.06] border border-[#042C53]/10 rounded-xl overflow-hidden">
                    {latestIntake.extractedItems.map((item, idx) => (
                      <div key={item.id} className="p-3.5 bg-white flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#042C53]">{item.field}</span>
                            <ProvenanceTag kind={item.verified ? 'Recorded Fact' : 'Simulated AI Suggestion'} />
                            {!item.verified && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full border border-[#C97A1B]/30 bg-[#FEF5E7] text-[#9A5B10]">
                                AI-prepared — review required
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#5F5D56]">
                              Confidence: {item.confidence}
                            </span>
                          </div>
                          <div className="text-[#042C53] font-medium">{item.value}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            <span className="font-medium text-[#042C53]">Source:</span> {item.sourceDocument} — &ldquo;{item.sourceSnippet}&rdquo;
                          </div>
                          {item.uncertaintyNote && (
                            <div className="text-[11px] text-[#9A5B10]">
                              Uncertainty note: {item.uncertaintyNote}
                            </div>
                          )}
                          {item.verified && item.verifiedBy && (
                            <div className="text-[11px] text-[#0F6E50] font-medium">
                              Verified by {item.verifiedBy} · {item.verifiedAt}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          {item.verified ? (
                            <StatusBadge label="Verified" tone="success" />
                          ) : (
                            <button
                              type="button"
                              data-demo-target={`verify-intake-btn-${idx}`}
                              onClick={() => verifyIntakeExtractedItem(latestIntake.id, item.id)}
                              className="eigen-btn-primary px-3 py-1.5 text-[11px]"
                            >
                              <Check className="w-3 h-3" />
                              Verify into Chart
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Unverified External Conditions Quick Review */}
            {patient.conditions.some((c) => !c.verified) && (
              <div className="pt-3 border-t border-[#042C53]/[0.07] space-y-2">
                <div className="text-[11px] font-semibold text-[#042C53]">
                  External HIE Conditions Pending Verification
                </div>
                {patient.conditions
                  .filter((c) => !c.verified)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 p-2.5 bg-[#FEF5E7]/70 border border-[#C97A1B]/25 rounded-xl"
                    >
                      <div>
                        <span className="font-semibold text-[#042C53]">{c.name}</span>{' '}
                        <span className="font-mono text-[11px] text-[#5F5D56]">({c.icd10} · {c.source})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => verifyExternalCondition(patient.id, c.id)}
                        className="eigen-btn-secondary px-2.5 py-1 text-[11px]"
                      >
                        Verify
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Explicit Pre-Visit Readiness + Latest Vitals + Smart Handoffs */}
        <div className="space-y-5">
          <section
            data-demo-target="pre-visit-readiness-panel"
            className="eigen-card p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-display font-semibold text-sm text-[#042C53]">
                <ClipboardCheck className="w-4 h-4 text-[#185FA5]" />
                <span>Pre-Visit Readiness</span>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#042C53] bg-[#E6F1FB] px-2.5 py-0.5 rounded-full">
                {readiness.completedCount}/{readiness.totalCount}
              </span>
            </div>
            <p className="text-[11px] text-[#5F5D56]">
              Explicit documented criteria status (no unverified composite scores).
            </p>
            <div className="divide-y divide-[#042C53]/[0.06]">
              {readiness.criteria.map((c) => (
                <div key={c.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#042C53]">{c.label}</div>
                    <div className="text-[11px] text-[#5F5D56] mt-0.5">{c.detail}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPatientTab(c.targetTab)}
                    className="shrink-0"
                  >
                    <StatusBadge
                      label={c.status}
                      tone={c.status === 'Complete' ? 'success' : c.status === 'Needs Review' ? 'warning' : 'danger'}
                    />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="eigen-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#042C53]">Vitals Comparison</h3>
              <button
                type="button"
                onClick={() => setPatientTab('encounters')}
                className="text-[11px] font-medium text-[#185FA5] hover:underline"
              >
                Record / Edit
              </button>
            </div>
            {vitals.length === 0 ? (
              <p className="text-[#5F5D56]">No vitals recorded yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 font-mono tabular-nums">
                <div className="p-3 eigen-card-subtle">
                  <div className="text-[10px] font-sans font-medium text-[#5F5D56]">BP (mmHg)</div>
                  <div className="text-sm font-semibold text-[#042C53] mt-0.5">
                    {vitals[0].bpSystolic}/{vitals[0].bpDiastolic}
                  </div>
                  {vitals[1] && (
                    <div className="text-[10px] text-[#5F5D56] mt-0.5">
                      Prior: {vitals[1].bpSystolic}/{vitals[1].bpDiastolic}
                    </div>
                  )}
                </div>
                <div className="p-3 eigen-card-subtle">
                  <div className="text-[10px] font-sans font-medium text-[#5F5D56]">Heart Rate</div>
                  <div className="text-sm font-semibold text-[#042C53] mt-0.5">{vitals[0].heartRate} bpm</div>
                  <div className="text-[10px] text-[#5F5D56] mt-0.5">SpO2 {vitals[0].spo2}%</div>
                </div>
                <div className="p-3 eigen-card-subtle">
                  <div className="text-[10px] font-sans font-medium text-[#5F5D56]">Weight</div>
                  <div className="text-sm font-semibold text-[#042C53] mt-0.5">{vitals[0].weightKg} kg</div>
                </div>
                <div className="p-3 eigen-card-subtle">
                  <div className="text-[10px] font-sans font-medium text-[#5F5D56]">Recorded By</div>
                  <div className="font-sans text-[11px] font-medium text-[#042C53] truncate mt-1">{vitals[0].recordedBy}</div>
                </div>
              </div>
            )}
          </section>

          <section className="eigen-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-[#042C53]">Smart Role Handoffs ({patientHandoffs.length})</h3>
              <button
                type="button"
                data-demo-target="log-handoff-btn"
                onClick={() =>
                  recordClinicalHandoff({
                    patientId: patient.id,
                    fromRole: state.currentRole,
                    fromActor: state.staff.find((s) => s.id === state.currentUserId)?.name || state.currentRole,
                    toRole: state.currentRole === 'Medical Assistant' ? 'Nurse Practitioner' : 'Clinician',
                    toOwnerName:
                      state.currentRole === 'Medical Assistant' ? 'Hannah Brooks, NP' : 'Dr. Elena Rostova, MD',
                    reason: 'Pre-consultation preparation complete; chart ready for review.',
                    linkedRecordRef: `Patient ${patient.mrn}`,
                    status: 'Pending',
                  })
                }
                className="text-[11px] font-medium text-[#185FA5] hover:underline"
              >
                + Log Handoff
              </button>
            </div>
            {patientHandoffs.length === 0 ? (
              <p className="text-[11px] text-[#5F5D56]">No structured role handoffs recorded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {patientHandoffs.slice(0, 4).map((h) => (
                  <div key={h.id} className="p-3 eigen-card-subtle space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#042C53]">
                        {h.fromRole} → {h.toRole}
                      </span>
                      <StatusBadge
                        label={h.status}
                        tone={h.status === 'Completed' ? 'success' : h.status === 'Accepted' ? 'blue' : 'warning'}
                      />
                    </div>
                    <div className="text-[11px] text-[#444441]">{h.reason}</div>
                    <div className="text-[10px] font-mono text-[#5F5D56]">
                      Owner: {h.toOwnerName} · {h.timestamp}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. POST-CONSULTATION SUMMARY (AMBIENT AI SCRIBE + EXPLAINABLE ACTION COMPOSER)
// ============================================================================

export const PostConsultationTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    setPatientTab,
    createEncounter,
    saveEncounterDraft,
    signEncounter,
    runSimulatedAmbientScribe,
    stageAiComposerProposals,
    updateComposerProposal,
    decideComposerAction,
    notify,
  } = useAppState();
  const { flags, updateFlags, serverStatus } = useClinicalAiFlags();

  const patientEncounters = state.encounters.filter((e) => e.patientId === patient.id);
  const activeEncounter = patientEncounters[0];
  const scribeSession = (state.scribeSessions || []).find(
    (s) => s.patientId === patient.id && (!activeEncounter || s.encounterId === activeEncounter.id)
  );

  const [simRecording, setSimRecording] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('ckd-htn');
  const [transcript, setTranscript] = useState(
    scribeSession?.transcript || activeEncounter?.scribeTranscript || DEMO_AMBIENT_TRANSCRIPT
  );
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);
  const [scribeDraftVersion, setScribeDraftVersion] = useState(0);
  const [scribeAiLoading, setScribeAiLoading] = useState(false);
  const [scribeAiResponse, setScribeAiResponse] = useState<ClinicalAIResponse<AmbientScribeV2Output> | null>(null);
  const [composerAiLoading, setComposerAiLoading] = useState(false);
  const [composerAiResponse, setComposerAiResponse] = useState<ClinicalAIResponse<ActionComposerOutput> | null>(null);
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [editActionTitle, setEditActionTitle] = useState('');
  const [editActionSummary, setEditActionSummary] = useState('');

  const timeMachine = useMemo(() => buildJourneyTimeMachine(state, patient.id), [state, patient.id]);
  const canSign = canSignClinicalNote(state.currentRole);
  const canApproveActions = canOrderOrPrescribe(state.currentRole);

  const ensureEncounter = () => {
    if (activeEncounter) return activeEncounter;
    return createEncounter({
      patientId: patient.id,
      providerId: state.currentUserId,
      facilityId: patient.facilityId,
      date: TODAY_DATE,
      type: 'Outpatient Consultation',
      chiefComplaint: patient.chiefConcern || 'Follow-up consultation',
      soap: {
        subjective: '',
        objective: '',
        assessment: '',
        plan: '',
      },
      diagnoses: patient.conditions.slice(0, 2).map((c) => `${c.name} (${c.icd10})`),
      noteStatus: 'Draft',
      amendments: [],
      comments: [],
      avsReleased: false,
    });
  };

  const handleStartScribe = () => {
    ensureEncounter();
    setSimRecording(true);
  };

  const handleStopAndDraft = () => {
    setSimRecording(false);
    const enc = ensureEncounter();
    runSimulatedAmbientScribe(patient.id, enc.id, transcript);
  };

  const handleGenerateAiSoapV2 = async (modeOverride?: ClinicalAIExecutionMode) => {
    setSimRecording(false);
    const enc = ensureEncounter();
    const nextVersion = scribeDraftVersion + 1;
    setScribeAiLoading(true);
    const resp = await generateAmbientScribeV2WithClinicalAi(
      state,
      {
        patientId: patient.id,
        encounterId: enc.id,
        transcript,
        draftVersion: nextVersion,
      },
      { modeOverride, flags }
    );
    setScribeAiResponse(resp);
    setScribeAiLoading(false);
    if (resp.ok && resp.data) {
      setScribeDraftVersion(resp.data.draftVersion);
      stageAiComposerProposals({
        patientId: patient.id,
        encounterId: enc.id,
        transcript,
        soap: resp.data.soap,
        executionMode: resp.executionMode,
        modelId: resp.modelId,
        requestId: resp.requestId,
      });
      notify(
        'info',
        `SOAP Draft v${resp.data.draftVersion} generated (${resp.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'}) — review & sign manually`
      );
    } else if (resp.error) {
      notify('error', resp.error.message);
    }
  };

  const handlePrepareActionsFromSoap = async (modeOverride?: ClinicalAIExecutionMode) => {
    const enc = activeEncounter;
    if (!enc) {
      notify('warning', 'Generate or enter a SOAP note draft before preparing clinical actions.');
      return;
    }
    setComposerAiLoading(true);
    const resp = await prepareClinicalActionsWithClinicalAi(
      state,
      {
        patientId: patient.id,
        encounterId: enc.id,
        soap: enc.soap,
        transcript,
      },
      { modeOverride, flags }
    );
    setComposerAiResponse(resp);
    setComposerAiLoading(false);
    if (resp.ok && resp.data) {
      const staged = resp.data.proposals.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        summary: p.summary,
        status: 'Awaiting Approval' as const,
        payload: p.payload,
        whyExplanation: p.rationale,
        supportingRecord: p.supportingSourceText,
        source: `${resp.executionMode === 'live-ai' ? 'Live AI Action Composer' : 'Deterministic Action Composer'} (${resp.modelId})`,
        sourceVerified: p.sourceIds.length > 0,
        confidence: p.confidence,
        uncertaintyNote: p.uncertaintyNote,
        humanDecisionRequired: 'Authorized Clinician must approve individually before chart write.',
        idempotencyKey: p.idempotencyKey,
        executionMode: resp.executionMode,
        modelId: resp.modelId,
      }));
      stageAiComposerProposals({
        patientId: patient.id,
        encounterId: enc.id,
        proposals: staged,
        executionMode: resp.executionMode,
        modelId: resp.modelId,
        requestId: resp.requestId,
      });
      notify('info', `Staged ${staged.length} reviewable action proposal(s) from reviewed SOAP note`);
    } else if (resp.error) {
      notify('error', resp.error.message);
    }
  };

  return (
    <div className="space-y-5 text-xs">
      {/* Top Disclosure & Scribe Controls */}
      <section
        data-demo-target="ambient-scribe-panel"
        className="eigen-card p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-[#042C53]">
                Post-Consultation Summary &amp; Ambient Clinical Scribe V2
              </h2>
              <p className="text-xs text-[#5F5D56] mt-0.5 leading-relaxed">
                Processes synthetic consultation transcripts only — <strong>no live microphone audio is captured or transmitted</strong>. Drafts are never auto-signed.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClinicalAiModeToggle
              mode={flags.executionMode}
              onChangeMode={(m) => updateFlags({ executionMode: m })}
              serverConfigured={serverStatus?.configured}
              compact
            />
            <button
              type="button"
              data-demo-target="generate-ai-soap-v2-btn"
              disabled={scribeAiLoading || !flags.ambientScribeV2 || !transcript.trim()}
              onClick={() => void handleGenerateAiSoapV2()}
              className="eigen-btn-navy px-4 py-2 text-xs disabled:opacity-50"
            >
              {scribeAiLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {scribeAiLoading
                ? 'Drafting SOAP...'
                : flags.executionMode === 'live-ai'
                ? 'Generate AI SOAP Draft (Live)'
                : 'Generate AI SOAP Draft'}
            </button>
            {!simRecording ? (
              <button
                type="button"
                data-demo-target="start-sim-scribe-btn"
                onClick={handleStartScribe}
                className="eigen-btn-primary px-3.5 py-2 text-xs"
              >
                <Mic className="w-3.5 h-3.5" />
                Start Simulated Scribe
              </button>
            ) : (
              <button
                type="button"
                data-demo-target="stop-gen-soap-btn"
                onClick={handleStopAndDraft}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#B4321F] hover:bg-[#8E2517] text-white font-medium rounded-xl shadow-xs transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop &amp; Generate Draft SOAP
              </button>
            )}
            <button
              type="button"
              data-demo-target="gen-draft-transcript-btn"
              onClick={handleStopAndDraft}
              className="eigen-btn-secondary px-3 py-2 text-xs"
            >
              Fixture Draft
            </button>
          </div>
        </div>

        {simRecording && (
          <div className="p-3 bg-[#E6F1FB] border border-[#85B7EB]/70 rounded-xl text-[#042C53] flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">
              Active Simulated Consultation Session (Synthetic Transcript Mode — No Audio Recorded)
            </span>
            <span className="font-mono text-[11px] text-[#185FA5]">Click &ldquo;Generate AI SOAP Draft&rdquo; or &ldquo;Stop &amp; Generate Draft SOAP&rdquo; when ready</span>
          </div>
        )}

        {/* Synthetic Transcript Preset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
            Synthetic Transcript Presets:
          </span>
          {SYNTHETIC_TRANSCRIPT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-demo-target={`transcript-preset-${preset.id}`}
              onClick={() => {
                setSelectedPresetId(preset.id);
                setTranscript(preset.text);
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                selectedPresetId === preset.id
                  ? 'bg-[#042C53] text-white border-[#042C53]'
                  : 'bg-[#FAF9F6] text-[#042C53] border-[#042C53]/12 hover:bg-[#E6F1FB]'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="ambient-transcript" className="block text-[11px] font-semibold text-[#042C53] mb-1.5">
            Synthetic Consultation Transcript (Kept Separate from Editable SOAP Draft)
          </label>
          <textarea
            id="ambient-transcript"
            rows={4}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full px-3.5 py-2.5 eigen-input bg-[#F8F8F5] text-xs leading-relaxed"
          />
        </div>

        {scribeAiResponse && scribeAiResponse.ok && (
          <ClinicalAiProvenanceBar
            response={scribeAiResponse}
            reviewStatusOverride={
              activeEncounter?.noteStatus === 'Signed'
                ? 'Signed by Clinician'
                : `Draft v${scribeDraftVersion} — Clinician Review & Signature Required`
            }
          />
        )}

        {scribeAiResponse && !scribeAiResponse.ok && (
          <ClinicalAiErrorBanner
            response={scribeAiResponse}
            onRetry={() => void handleGenerateAiSoapV2('live-ai')}
            onSwitchDeterministic={() => void handleGenerateAiSoapV2('deterministic-demo')}
          />
        )}

        {scribeAiResponse?.ok && scribeAiResponse.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {scribeAiResponse.data.unsupportedOrUncertainStatements.length > 0 && (
              <div className="p-3 rounded-xl bg-[#FEF5E7] border border-[#C97A1B]/30 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#9A5B10] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Unsupported / Uncertain Statements Highlighted ({scribeAiResponse.data.unsupportedOrUncertainStatements.length})
                </div>
                <ul className="space-y-1 text-[11px] text-[#444441]">
                  {scribeAiResponse.data.unsupportedOrUncertainStatements.map((item, idx) => (
                    <li key={idx}>
                      <span className="font-mono uppercase text-[10px] font-semibold text-[#9A5B10] mr-1">
                        [{item.section}]
                      </span>
                      <strong className="text-[#042C53]">{item.statement}:</strong> {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scribeAiResponse.data.supportingTranscriptQuotes.length > 0 && (
              <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#042C53]/10 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#042C53]">
                  Supporting Transcript Evidence Quotes ({scribeAiResponse.data.supportingTranscriptQuotes.length})
                </div>
                <ul className="space-y-1 text-[11px] text-[#5F5D56] font-mono">
                  {scribeAiResponse.data.supportingTranscriptQuotes.slice(0, 4).map((q, idx) => (
                    <li key={idx}>
                      <span className="uppercase text-[10px] text-[#185FA5] font-semibold mr-1">[{q.section}]</span>
                      &ldquo;{q.quote}&rdquo;
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: SOAP Note Draft & Sign-Off */}
        <section
          data-demo-target="post-consult-approval-bar"
          className="eigen-card p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/[0.07] pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#042C53]">Consultation SOAP Review</h3>
              <p className="text-[11px] text-[#5F5D56] mt-0.5">
                {activeEncounter
                  ? `${activeEncounter.type} · ${activeEncounter.date}`
                  : 'No encounter created yet — start simulated scribe above.'}
              </p>
            </div>
            {activeEncounter && <StatusBadge label={activeEncounter.noteStatus} />}
          </div>

          {activeEncounter ? (
            <div className="space-y-3">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map((sec) => (
                <div key={sec}>
                  <label
                    htmlFor={`post-soap-${sec}`}
                    className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#5F5D56] mb-1.5"
                  >
                    {sec}
                  </label>
                  <textarea
                    id={`post-soap-${sec}`}
                    rows={sec === 'plan' || sec === 'subjective' ? 3 : 2}
                    disabled={activeEncounter.noteStatus === 'Signed'}
                    value={activeEncounter.soap[sec]}
                    onChange={(e) =>
                      saveEncounterDraft(activeEncounter.id, {
                        soap: { ...activeEncounter.soap, [sec]: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 eigen-input text-xs leading-relaxed disabled:bg-[#F8F8F5] disabled:text-[#444441]"
                  />
                </div>
              ))}

              <div className="pt-3 border-t border-[#042C53]/[0.08] flex flex-wrap items-center justify-between gap-2">
                {activeEncounter.noteStatus === 'Signed' ? (
                  <div className="inline-flex items-center gap-1.5 text-[#0F6E50] font-semibold bg-[#E9F7F1] px-3 py-1.5 rounded-xl">
                    <Lock className="w-3.5 h-3.5" />
                    Signed by {activeEncounter.signedBy} · {activeEncounter.signedAt}
                  </div>
                ) : (
                  <>
                    <span className="text-[11px] text-[#5F5D56]">
                      {canSign
                        ? `Authorized to sign as ${state.currentRole}`
                        : `Role "${state.currentRole}" cannot sign clinical notes`}
                    </span>
                    <button
                      type="button"
                      data-demo-target="sign-lock-note-btn"
                      disabled={!canSign}
                      onClick={() => signEncounter(activeEncounter.id)}
                      className="eigen-btn-navy px-4 py-2 text-xs disabled:opacity-45"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Sign & Lock Clinical Note
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 eigen-card-subtle text-[#5F5D56]">
              Generate a simulated SOAP draft or open the Encounters tab to begin documentation.
            </div>
          )}
        </section>

        {/* Right: AI Clinical Action Composer with "Why?" Explainability & Individual Approval */}
        <section
          data-demo-target="ai-action-composer-panel"
          className="eigen-card p-5 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/[0.07] pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-[#042C53]">
                AI Clinical Action Composer
              </h3>
              <p className="text-[11px] text-[#5F5D56] mt-0.5">
                Propose lab orders, medication drafts, follow-up tasks, referrals, and patient instructions from the reviewed SOAP note. Every action requires individual approval.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-demo-target="prepare-ai-actions-btn"
                disabled={composerAiLoading || !flags.actionComposer || !activeEncounter}
                onClick={() => void handlePrepareActionsFromSoap()}
                className="eigen-btn-navy px-3 py-1.5 text-[11px] disabled:opacity-50"
              >
                {composerAiLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {composerAiLoading ? 'Preparing...' : 'Prepare Actions from SOAP'}
              </button>
              <ProvenanceTag kind="Simulated AI Suggestion" />
            </div>
          </div>

          {composerAiResponse && composerAiResponse.ok && (
            <ClinicalAiProvenanceBar response={composerAiResponse} />
          )}
          {composerAiResponse && !composerAiResponse.ok && (
            <ClinicalAiErrorBanner
              response={composerAiResponse}
              onRetry={() => void handlePrepareActionsFromSoap('live-ai')}
              onSwitchDeterministic={() => void handlePrepareActionsFromSoap('deterministic-demo')}
            />
          )}

          {!scribeSession || scribeSession.proposedActions.length === 0 ? (
            <div className="p-4 eigen-card-subtle text-[#5F5D56]">
              No clinical actions staged yet. Generate or review a SOAP draft, then click &ldquo;Prepare Actions from SOAP&rdquo;.
            </div>
          ) : (
            <div className="space-y-3">
              {scribeSession.proposedActions.map((act, idx) => {
                const isWhyOpen = whyOpenId === act.id;
                const isEditing = editingActionId === act.id;
                const pending = act.status === 'Awaiting Approval' || act.status === 'Draft';
                return (
                  <div
                    key={act.id}
                    className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                      act.status === 'Completed'
                        ? 'bg-[#E9F7F1]/45 border-[#1D9E75]/25'
                        : 'bg-[#FAF9F7] border-[#042C53]/10'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-[#185FA5]">{act.kind}</span>
                          {pending && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-[#FEF5E7] border border-[#C97A1B]/30 text-[#9A5B10] rounded-full">
                              AI-prepared — review required
                            </span>
                          )}
                          {act.confidence && (
                            <span className="text-[10px] font-mono text-[#5F5D56]">
                              · Confidence: {act.confidence}
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <input
                              type="text"
                              aria-label="Edit proposal title"
                              value={editActionTitle}
                              onChange={(e) => setEditActionTitle(e.target.value)}
                              className="eigen-input w-full"
                            />
                            <textarea
                              rows={2}
                              aria-label="Edit proposal summary"
                              value={editActionSummary}
                              onChange={(e) => setEditActionSummary(e.target.value)}
                              className="eigen-input w-full"
                            />
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  updateComposerProposal(scribeSession.id, act.id, {
                                    title: editActionTitle.trim() || act.title,
                                    summary: editActionSummary.trim() || act.summary,
                                  });
                                  setEditingActionId(null);
                                }}
                                className="eigen-btn-primary px-2.5 py-1 text-[11px]"
                              >
                                Save Draft Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingActionId(null)}
                                className="eigen-btn-secondary px-2.5 py-1 text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-semibold text-[#042C53]">{act.title}</div>
                            <p className="text-[11px] text-[#444441] leading-snug">{act.summary}</p>
                          </>
                        )}
                      </div>
                      <StatusBadge label={act.status} />
                    </div>

                    {act.resultRef && (
                      <div className="text-[11px] font-mono text-[#0F6E50] bg-[#E9F7F1] px-2.5 py-1 rounded-lg">
                        Result: {act.resultRef}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        data-demo-target={`composer-why-btn-${idx}`}
                        onClick={() => setWhyOpenId(isWhyOpen ? null : act.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#185FA5] hover:underline"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        {isWhyOpen ? 'Hide Why?' : 'Why? (Evidence & Provenance)'}
                      </button>

                      {pending && !isEditing && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingActionId(act.id);
                              setEditActionTitle(act.title);
                              setEditActionSummary(act.summary);
                            }}
                            className="eigen-btn-secondary px-2.5 py-1.5 text-[11px]"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            data-demo-target={`composer-approve-btn-${idx}`}
                            disabled={!canApproveActions}
                            onClick={() => decideComposerAction(scribeSession.id, act.id, 'approve')}
                            className="eigen-btn-primary px-3 py-1.5 text-[11px] disabled:opacity-40"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => decideComposerAction(scribeSession.id, act.id, 'cancel')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#B4321F]/25 text-[#B4321F] text-[11px] font-medium rounded-lg hover:bg-[#FDF0EE] transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {isWhyOpen && (
                      <div className="mt-2 p-3 bg-white border border-[#042C53]/10 rounded-xl text-[11px] space-y-1.5">
                        <div>
                          <strong className="text-[#042C53]">Rationale:</strong> {act.whyExplanation || 'Derived from consultation draft.'}
                        </div>
                        <div>
                          <strong className="text-[#042C53]">Supporting Record:</strong> {act.supportingRecord || 'Active Encounter'}
                        </div>
                        <div>
                          <strong className="text-[#042C53]">Source:</strong> {act.source || 'AI Composer'} ·{' '}
                          {act.sourceVerified ? 'Source Verified' : 'Unverified Draft Source'}
                        </div>
                        {act.uncertaintyNote && (
                          <div className="text-[#9A5B10]">
                            <strong>Uncertainty:</strong> {act.uncertaintyNote}
                          </div>
                        )}
                        <div className="text-[#042C53]">
                          <strong>Human Decision Required:</strong> {act.humanDecisionRequired || 'Authorized clinician sign-off.'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Patient Journey Time Machine */}
      <section
        data-demo-target="journey-time-machine-panel"
        className="eigen-card p-5 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/[0.07] pb-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-[#042C53]">Patient Journey Time Machine</h3>
            <p className="text-[11px] text-[#5F5D56] mt-0.5">
              Chronological provenance across human actions, AI drafts, and clinical role handoffs for {patient.fullName}.
            </p>
          </div>
          <span className="font-mono tabular-nums text-[11px] text-[#5F5D56] bg-[#F1EFE8] px-2.5 py-0.5 rounded-full">
            {timeMachine.length} journey events
          </span>
        </div>

        {timeMachine.length === 0 ? (
          <p className="text-[#5F5D56]">No chronological journey events logged yet.</p>
        ) : (
          <div className="divide-y divide-[#042C53]/[0.06] max-h-72 overflow-y-auto eigen-scroll">
            {timeMachine.map((entry) => (
              <div key={entry.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-[#5F5D56]">{entry.timestamp}</span>
                    <span className="font-semibold text-[#042C53]">{entry.stage}</span>
                    <StatusBadge
                      label={entry.actorKind}
                      tone={
                        entry.actorKind === 'Role Handoff'
                          ? 'blue'
                          : entry.actorKind === 'AI Draft'
                          ? 'warning'
                          : 'success'
                      }
                    />
                  </div>
                  <div className="text-[#042C53]/90">{entry.whatChanged}</div>
                  <div className="text-[11px] text-[#5F5D56]">
                    Actor: {entry.actor} ({entry.role}) · {entry.whyAdvanced}
                    {entry.nextOwner ? ` · Next owner: ${entry.nextOwner}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientTab(entry.targetTab)}
                  className="px-2.5 py-1 text-[11px] font-medium text-[#185FA5] hover:bg-[#E6F1FB] rounded-lg transition-colors shrink-0"
                >
                  Open Source
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// ============================================================================
// 3. SIMULATED PRE-VISIT PATIENT INTAKE VIEW (POPULATES SAME PATIENT CHART)
// ============================================================================

export const PreVisitIntakeTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { state, submitPreVisitIntake, runAiIntakeExtraction, setPatientTab } = useAppState();
  const existing = (state.preVisitIntakes || []).find((i) => i.patientId === patient.id);
  const nextAppt = state.appointments.find(
    (a) => a.patientId === patient.id && a.status !== 'Cancelled' && a.status !== 'Completed'
  );

  const [reason, setReason] = useState(
    existing?.reasonForVisit || patient.chiefConcern || 'Elevated home blood pressure and CKD stage 3a follow-up'
  );
  const [symptoms, setSymptoms] = useState(
    existing?.symptomsSummary || 'Mild evening ankle puffiness twice last week; no chest pain or shortness of breath.'
  );
  const [medsText, setMedsText] = useState(
    existing?.reportedMedications.join(', ') || 'Lisinopril 10 mg once daily'
  );
  const [allergiesText, setAllergiesText] = useState(
    existing?.reportedAllergies.join(', ') ||
      patient.allergies.map((a) => `${a.substance} (${a.reaction})`).join(', ') ||
      'NKDA'
  );
  const [payer, setPayer] = useState(existing?.insurancePayer || 'Blue Cross Blue Shield MA');
  const [memberId, setMemberId] = useState(existing?.insuranceMemberId || 'BCBS-9921048');
  const [attachLabPdf, setAttachLabPdf] = useState(true);
  const [attachBpLog, setAttachBpLog] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const docs: { id: string; title: string; type: 'Lab PDF' | 'External Summary'; snippet: string; date: string }[] = [];
    if (attachLabPdf) {
      docs.push({
        id: 'lab-pdf',
        title: 'Harborview Outside Renal Panel (2026-11-12).pdf',
        type: 'Lab PDF',
        snippet: 'Creatinine 1.38 mg/dL, eGFR 48 mL/min/1.73m2, Serum Potassium 4.5 mmol/L, Urine ACR 92 mg/g.',
        date: '2026-11-12',
      });
    }
    if (attachBpLog) {
      docs.push({
        id: 'bp-log',
        title: 'Home BP 14-Day Log Summary.pdf',
        type: 'External Summary',
        snippet: '14-day average morning BP 144/86 mmHg; evening BP 146/88 mmHg; pulse 70-74 bpm.',
        date: '2026-11-17',
      });
    }
    submitPreVisitIntake({
      patientId: patient.id,
      appointmentId: nextAppt?.id,
      reasonForVisit: reason.trim(),
      symptomsSummary: symptoms.trim(),
      reportedMedications: medsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      reportedAllergies: allergiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      insurancePayer: payer.trim(),
      insuranceMemberId: memberId.trim(),
      uploadedDocuments: docs,
    });
  };

  return (
    <div data-demo-target="pre-visit-intake-panel" className="space-y-4 text-xs">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#185FA5]" />
            <h2 className="text-sm font-semibold text-[#042C53]">
              Simulated Pre-Visit Patient Intake Link
            </h2>
          </div>
          <p className="text-[11px] text-[#5F5D56] mt-0.5">
            Simulated patient pre-visit submission that writes directly into {patient.fullName}&rsquo;s chart for AI Intake Intelligence and staff verification (no real external patient portal link sent).
          </p>
        </div>
        {existing && (
          <div className="flex items-center gap-2">
            <StatusBadge
              label={`Status: ${existing.status}`}
              tone={existing.status === 'Verified' ? 'success' : 'warning'}
            />
            {existing.extractedItems.length === 0 && (
              <button
                type="button"
                data-demo-target="intake-run-ai-btn"
                onClick={() => {
                  runAiIntakeExtraction(existing.id);
                  setPatientTab('pre-consultation');
                }}
                className="px-3 py-1.5 bg-[#185FA5] text-white font-medium rounded-md"
              >
                Run AI Extraction & Review
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="font-semibold text-[#042C53]">Patient Questionnaire & Synthetic Document Upload</div>

          <div>
            <label htmlFor="intake-reason" className="block font-medium text-[#042C53] mb-1">
              Reason for Visit *
            </label>
            <input
              id="intake-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded"
            />
          </div>

          <div>
            <label htmlFor="intake-symptoms" className="block font-medium text-[#042C53] mb-1">
              Recent Symptoms & Home Readings
            </label>
            <textarea
              id="intake-symptoms"
              rows={2}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="intake-meds" className="block font-medium text-[#042C53] mb-1">
                Current Medications (comma-separated)
              </label>
              <input
                id="intake-meds"
                type="text"
                value={medsText}
                onChange={(e) => setMedsText(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="intake-allergies" className="block font-medium text-[#042C53] mb-1">
                Documented Allergies
              </label>
              <input
                id="intake-allergies"
                type="text"
                value={allergiesText}
                onChange={(e) => setAllergiesText(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="intake-payer" className="block font-medium text-[#042C53] mb-1">
                Insurance Payer (Simulated)
              </label>
              <input
                id="intake-payer"
                type="text"
                value={payer}
                onChange={(e) => setPayer(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label htmlFor="intake-member" className="block font-medium text-[#042C53] mb-1">
                Member ID (Synthetic)
              </label>
              <input
                id="intake-member"
                type="text"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-[#F7F7F5] border border-slate-200 rounded space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#042C53]">
              <Upload className="w-3.5 h-3.5 text-[#185FA5]" />
              Illustrative Pre-Visit Synthetic Attachments
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                data-demo-target="intake-doc-lab-checkbox"
                checked={attachLabPdf}
                onChange={(e) => setAttachLabPdf(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-[#042C53]">Harborview Outside Renal Panel (2026-11-12).pdf</strong> — Cr 1.38, eGFR 48, K+ 4.5, Urine ACR 92
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                data-demo-target="intake-doc-bp-checkbox"
                checked={attachBpLog}
                onChange={(e) => setAttachBpLog(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong className="text-[#042C53]">Home BP 14-Day Log Summary.pdf</strong> — AM avg 144/86, PM avg 146/88 mmHg
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="submit"
              data-demo-target="intake-submit-btn"
              className="px-4 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
            >
              Submit Simulated Pre-Visit Intake
            </button>
          </div>
        </form>

        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="font-semibold text-[#042C53]">Latest Submission Summary</div>
          {!existing ? (
            <div className="p-3 bg-[#F7F7F5] rounded text-[#5F5D56]">
              No submission recorded yet. Submit the form on the left to populate the patient&rsquo;s Pre-Consultation Summary.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-[#5F5D56]">Submitted: {existing.submittedAt}</div>
              <div className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
                <div className="font-medium text-[#042C53]">{existing.reasonForVisit}</div>
                <div className="text-[11px] text-[#5F5D56]">{existing.symptomsSummary}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[#042C53]">
                  Uploaded Synthetic Documents ({existing.uploadedDocuments.length})
                </div>
                {existing.uploadedDocuments.map((d) => (
                  <div key={d.id} className="p-2 border border-slate-200 rounded text-[11px]">
                    <div className="font-medium text-[#042C53]">{d.title}</div>
                    <div className="text-[#5F5D56]">{d.snippet}</div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPatientTab('pre-consultation')}
                className="w-full py-1.5 bg-[#E6F1FB] text-[#042C53] font-medium rounded hover:bg-[#85B7EB]/40"
              >
                Review in Pre-Consultation Summary →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
