import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Lock,
  Mic,
  ShieldAlert,
  Sparkles,
  Square,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
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
import { StatusBadge } from '../ui/Primitives';

const ProvenanceTag: React.FC<{ kind: ProvenanceKind }> = ({ kind }) => {
  const tone =
    kind === 'Recorded Fact'
      ? 'text-[#0F6E50] bg-emerald-50 border-emerald-200'
      : kind === 'Derived Calculation'
      ? 'text-[#185FA5] bg-[#E6F1FB] border-[#85B7EB]/60'
      : kind === 'Simulated AI Suggestion'
      ? 'text-[#042C53] bg-slate-100 border-slate-300'
      : 'text-[#9A5B10] bg-amber-50 border-amber-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${tone}`}>
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
  } = useAppState();

  const readiness = useMemo(() => buildPreVisitReadiness(state, patient.id), [state, patient.id]);
  const whatMatters = useMemo(() => buildWhatMattersToday(state, patient.id), [state, patient.id]);
  const safetyRadar = useMemo(() => buildClinicalSafetyRadar(state, patient.id), [state, patient.id]);
  const latestIntake = (state.preVisitIntakes || []).find((i) => i.patientId === patient.id);
  const vitals = state.vitals.filter((v) => v.patientId === patient.id);
  const patientHandoffs = (state.handoffs || []).filter((h) => h.patientId === patient.id);

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
    <div className="space-y-4 text-xs">
      {/* Top Clinical Orientation Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#185FA5]" />
            <h2 className="text-sm font-semibold text-[#042C53]">
              Pre-Consultation Clinical Summary
            </h2>
          </div>
          <p className="text-[11px] text-[#5F5D56] mt-0.5">
            Source-linked synthesis distinguishing recorded facts, derived calculations, simulated AI suggestions, and unavailable data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPatientTab('pre-visit-intake')}
            className="px-3 py-1.5 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
          >
            Open Pre-Visit Intake
          </button>
          <button
            type="button"
            data-demo-target="start-consult-scribe-btn"
            onClick={() => setPatientTab('post-consultation')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
          >
            Start Consultation & Scribe
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Clinical Safety Radar */}
      <section
        data-demo-target="clinical-safety-radar-panel"
        aria-label="Clinical Safety Radar"
        className={`rounded-lg border p-4 space-y-2.5 ${
          safetyRadar.some((a) => a.severity === 'Critical')
            ? 'bg-red-50/70 border-red-200'
            : safetyRadar.length > 0
            ? 'bg-amber-50/50 border-amber-200'
            : 'bg-emerald-50/40 border-emerald-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-[#042C53]">
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
            <span className="font-mono tabular-nums text-[11px] text-[#5F5D56]">
              · {safetyRadar.length} active signal{safetyRadar.length === 1 ? '' : 's'}
            </span>
          </div>
          <span className="text-[11px] text-[#5F5D56]">
            Checks allergies, critical/unreviewed labs, external records & reconciliation
          </span>
        </div>

        {safetyRadar.length === 0 ? (
          <div className="text-xs text-[#0F6E50] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            No active safety conflicts, unreviewed critical results, or pending reconciliation alerts.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {safetyRadar.map((alert) => (
              <div
                key={alert.id}
                className="bg-white border border-slate-200 rounded-md p-3 flex items-start justify-between gap-3"
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
                  <div className="text-[11px] text-[#5F5D56]">{alert.detail}</div>
                  <div className="text-[10px] font-mono text-[#5F5D56]">Source: {alert.supportingRecord}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientTab(alert.targetTab)}
                  className="text-[11px] font-medium text-[#185FA5] hover:underline shrink-0"
                >
                  Inspect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Columns: What Matters Today + Intelligent Document-to-Chart */}
        <div className="lg:col-span-2 space-y-4">
          <section
            data-demo-target="what-matters-today-panel"
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-semibold text-[#042C53]">What Matters Today</h3>
              <span className="text-[11px] text-[#5F5D56]">Click any source link to drill into full chart</span>
            </div>

            <div className="divide-y divide-slate-100">
              {groupedSections.map((group) => (
                <div key={group.section} className="py-2.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                    {group.section}
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-2 bg-[#F7F7F5] rounded-md px-3 py-2"
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
                        className="text-[11px] font-medium text-[#185FA5] hover:underline shrink-0"
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
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-sm font-semibold text-[#042C53]">
                  Intelligent Document-to-Chart (AI Intake Intelligence)
                </h3>
                <p className="text-[11px] text-[#5F5D56]">
                  Extracted items remain Draft / Unverified until explicitly verified by staff against source snippets.
                </p>
              </div>
              {latestIntake && latestIntake.extractedItems.length === 0 && (
                <button
                  type="button"
                  data-demo-target="extract-intake-btn"
                  onClick={() => runAiIntakeExtraction(latestIntake.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] text-white font-medium rounded-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Extract Structured Fields (Sim AI)
                </button>
              )}
            </div>

            {!latestIntake ? (
              <div className="p-3 bg-[#F7F7F5] rounded-md flex flex-wrap items-center justify-between gap-2">
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
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-[#F7F7F5] px-3 py-2 rounded">
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
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                    {latestIntake.extractedItems.map((item, idx) => (
                      <div key={item.id} className="p-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#042C53]">{item.field}</span>
                            <ProvenanceTag kind={item.verified ? 'Recorded Fact' : 'Simulated AI Suggestion'} />
                            {!item.verified && (
                              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border border-amber-300 bg-amber-50 text-[#9A5B10]">
                                AI-prepared — review required
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-[#5F5D56]">
                              Confidence: {item.confidence}
                            </span>
                          </div>
                          <div className="text-slate-800 font-medium">{item.value}</div>
                          <div className="text-[11px] text-[#5F5D56]">
                            <span className="font-medium text-[#042C53]">Source:</span> {item.sourceDocument} — &ldquo;{item.sourceSnippet}&rdquo;
                          </div>
                          {item.uncertaintyNote && (
                            <div className="text-[11px] text-[#9A5B10]">
                              Uncertainty note: {item.uncertaintyNote}
                            </div>
                          )}
                          {item.verified && item.verifiedBy && (
                            <div className="text-[11px] text-[#0F6E50]">
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
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#185FA5] hover:bg-[#042C53] text-white text-[11px] font-medium rounded"
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
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-semibold text-[#042C53]">
                  External HIE Conditions Pending Verification
                </div>
                {patient.conditions
                  .filter((c) => !c.verified)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 p-2 bg-amber-50/60 border border-amber-200 rounded"
                    >
                      <div>
                        <span className="font-medium text-[#042C53]">{c.name}</span>{' '}
                        <span className="font-mono text-[11px] text-[#5F5D56]">({c.icd10} · {c.source})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => verifyExternalCondition(patient.id, c.id)}
                        className="px-2.5 py-1 bg-white border border-amber-300 text-[#042C53] font-medium rounded hover:bg-amber-100"
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
        <div className="space-y-4">
          <section
            data-demo-target="pre-visit-readiness-panel"
            className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-[#042C53]">
                <ClipboardCheck className="w-4 h-4 text-[#185FA5]" />
                <span>Pre-Visit Readiness</span>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold text-[#042C53]">
                {readiness.completedCount}/{readiness.totalCount} criteria
              </span>
            </div>
            <p className="text-[11px] text-[#5F5D56]">
              Explicit documented criteria status (no unverified composite scores).
            </p>
            <div className="divide-y divide-slate-100">
              {readiness.criteria.map((c) => (
                <div key={c.id} className="py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[#042C53]">{c.label}</div>
                    <div className="text-[11px] text-[#5F5D56]">{c.detail}</div>
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

          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#042C53]">Vitals Comparison</h3>
              <button
                type="button"
                onClick={() => setPatientTab('encounters')}
                className="text-[11px] text-[#185FA5] hover:underline"
              >
                Record / Edit
              </button>
            </div>
            {vitals.length === 0 ? (
              <p className="text-[#5F5D56]">No vitals recorded yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 bg-[#F7F7F5] p-3 rounded font-mono tabular-nums">
                <div>
                  <div className="text-[10px] font-sans text-[#5F5D56]">BP (mmHg)</div>
                  <div className="font-semibold text-[#042C53]">
                    {vitals[0].bpSystolic}/{vitals[0].bpDiastolic}
                  </div>
                  {vitals[1] && (
                    <div className="text-[10px] text-[#5F5D56]">
                      Prior: {vitals[1].bpSystolic}/{vitals[1].bpDiastolic}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-sans text-[#5F5D56]">Heart Rate</div>
                  <div className="font-semibold text-[#042C53]">{vitals[0].heartRate} bpm</div>
                  <div className="text-[10px] text-[#5F5D56]">SpO2 {vitals[0].spo2}%</div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-[#5F5D56]">Weight</div>
                  <div className="font-semibold text-[#042C53]">{vitals[0].weightKg} kg</div>
                </div>
                <div>
                  <div className="text-[10px] font-sans text-[#5F5D56]">Recorded By</div>
                  <div className="font-sans text-[11px] text-[#042C53] truncate">{vitals[0].recordedBy}</div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-[#042C53]">Smart Role Handoffs ({patientHandoffs.length})</h3>
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
              <div className="space-y-2">
                {patientHandoffs.slice(0, 4).map((h) => (
                  <div key={h.id} className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#042C53]">
                        {h.fromRole} → {h.toRole}
                      </span>
                      <StatusBadge
                        label={h.status}
                        tone={h.status === 'Completed' ? 'success' : h.status === 'Accepted' ? 'blue' : 'warning'}
                      />
                    </div>
                    <div className="text-[11px] text-[#5F5D56]">{h.reason}</div>
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
    decideComposerAction,
  } = useAppState();

  const patientEncounters = state.encounters.filter((e) => e.patientId === patient.id);
  const activeEncounter = patientEncounters[0];
  const scribeSession = (state.scribeSessions || []).find(
    (s) => s.patientId === patient.id && (!activeEncounter || s.encounterId === activeEncounter.id)
  );

  const [simRecording, setSimRecording] = useState(false);
  const [transcript, setTranscript] = useState(
    scribeSession?.transcript || activeEncounter?.scribeTranscript || DEMO_AMBIENT_TRANSCRIPT
  );
  const [whyOpenId, setWhyOpenId] = useState<string | null>(null);

  const timeMachine = useMemo(() => buildJourneyTimeMachine(state, patient.id), [state, patient.id]);
  const canSign = canSignClinicalNote(state.currentRole);
  const canApproveActions = canOrderOrPrescribe(state.currentRole);

  const handleStartScribe = () => {
    if (!activeEncounter) {
      createEncounter({
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
    }
    setSimRecording(true);
  };

  const handleStopAndDraft = () => {
    setSimRecording(false);
    const enc = activeEncounter || state.encounters.find((e) => e.patientId === patient.id);
    if (!enc) return;
    runSimulatedAmbientScribe(patient.id, enc.id, transcript);
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Top Disclosure & Scribe Controls */}
      <section
        data-demo-target="ambient-scribe-panel"
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-[#185FA5]" />
              <h2 className="text-sm font-semibold text-[#042C53]">
                Post-Consultation Summary & Simulated Ambient AI Scribe
              </h2>
            </div>
            <p className="text-[11px] text-[#5F5D56] mt-0.5">
              Uses synthetic consultation transcripts — <strong>no live microphone audio is captured or transmitted</strong>. All drafts require individual clinician review and sign-off.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!simRecording ? (
              <button
                type="button"
                data-demo-target="start-sim-scribe-btn"
                onClick={handleStartScribe}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded-md"
              >
                <Mic className="w-3.5 h-3.5" />
                Start Simulated Scribe
              </button>
            ) : (
              <button
                type="button"
                data-demo-target="stop-gen-soap-btn"
                onClick={handleStopAndDraft}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#B4321F] hover:bg-red-800 text-white font-medium rounded-md"
              >
                <Square className="w-3.5 h-3.5" />
                Stop & Generate Draft SOAP
              </button>
            )}
            <button
              type="button"
              data-demo-target="gen-draft-transcript-btn"
              onClick={handleStopAndDraft}
              className="px-3 py-1.5 border border-slate-300 text-[#042C53] font-medium rounded-md hover:bg-slate-50"
            >
              Generate Draft from Transcript
            </button>
          </div>
        </div>

        {simRecording && (
          <div className="p-2.5 bg-[#E6F1FB] border border-[#85B7EB] rounded text-[#042C53] flex items-center justify-between">
            <span className="font-medium">
              Active Simulated Consultation Session (Synthetic Transcript Mode — No Audio Recorded)
            </span>
            <span className="font-mono text-[11px]">Click &ldquo;Stop & Generate Draft SOAP&rdquo; when ready</span>
          </div>
        )}

        <div>
          <label htmlFor="ambient-transcript" className="block text-[11px] font-semibold text-[#042C53] mb-1">
            Synthetic Consultation Transcript (Editable for Testing)
          </label>
          <textarea
            id="ambient-transcript"
            rows={4}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-md bg-[#F7F7F5] focus:bg-white focus:border-[#185FA5] focus:outline-none text-xs leading-relaxed"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: SOAP Note Draft & Sign-Off */}
        <section
          data-demo-target="post-consult-approval-bar"
          className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-[#042C53]">Consultation SOAP Review</h3>
              <p className="text-[11px] text-[#5F5D56]">
                {activeEncounter
                  ? `${activeEncounter.type} · ${activeEncounter.date}`
                  : 'No encounter created yet — start simulated scribe above.'}
              </p>
            </div>
            {activeEncounter && <StatusBadge label={activeEncounter.noteStatus} />}
          </div>

          {activeEncounter ? (
            <div className="space-y-2.5">
              {(['subjective', 'objective', 'assessment', 'plan'] as const).map((sec) => (
                <div key={sec}>
                  <label
                    htmlFor={`post-soap-${sec}`}
                    className="block text-[11px] font-semibold uppercase tracking-wide text-[#5F5D56] mb-1"
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
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs disabled:bg-slate-50"
                  />
                </div>
              ))}

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                {activeEncounter.noteStatus === 'Signed' ? (
                  <div className="inline-flex items-center gap-1.5 text-[#0F6E50] font-medium">
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#042C53] hover:bg-[#185FA5] disabled:bg-slate-300 text-white font-medium rounded-md"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      Sign & Lock Clinical Note
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#F7F7F5] rounded text-[#5F5D56]">
              Generate a simulated SOAP draft or open the Encounters tab to begin documentation.
            </div>
          )}
        </section>

        {/* Right: AI Clinical Action Composer with "Why?" Explainability */}
        <section
          data-demo-target="ai-action-composer-panel"
          className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-semibold text-[#042C53]">
                AI Clinical Action Composer
              </h3>
              <p className="text-[11px] text-[#5F5D56]">
                Every proposed order, medication draft, follow-up, and handoff requires individual human approval.
              </p>
            </div>
            <ProvenanceTag kind="Simulated AI Suggestion" />
          </div>

          {!scribeSession || scribeSession.proposedActions.length === 0 ? (
            <div className="p-4 bg-[#F7F7F5] rounded text-[#5F5D56]">
              No clinical actions staged yet. Run Simulated Ambient Scribe to extract reviewable proposals.
            </div>
          ) : (
            <div className="space-y-2.5">
              {scribeSession.proposedActions.map((act, idx) => {
                const isWhyOpen = whyOpenId === act.id;
                const pending = act.status === 'Awaiting Approval' || act.status === 'Draft';
                return (
                  <div
                    key={act.id}
                    className="border border-slate-200 rounded-md p-3 space-y-2 bg-[#F7F7F5]/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-[#185FA5]">{act.kind}</span>
                          {pending && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-[#9A5B10] rounded">
                              AI-prepared — review required
                            </span>
                          )}
                          {act.confidence && (
                            <span className="text-[10px] font-mono text-[#5F5D56]">
                              · Confidence: {act.confidence}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-[#042C53]">{act.title}</div>
                        <p className="text-[11px] text-[#5F5D56]">{act.summary}</p>
                      </div>
                      <StatusBadge label={act.status} />
                    </div>

                    {act.resultRef && (
                      <div className="text-[11px] font-mono text-[#0F6E50]">Result: {act.resultRef}</div>
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

                      {pending && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            data-demo-target={`composer-approve-btn-${idx}`}
                            disabled={!canApproveActions}
                            onClick={() => decideComposerAction(scribeSession.id, act.id, 'approve')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#185FA5] hover:bg-[#042C53] disabled:bg-slate-300 text-white text-[11px] font-medium rounded"
                          >
                            <Check className="w-3 h-3" />
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => decideComposerAction(scribeSession.id, act.id, 'cancel')}
                            className="inline-flex items-center gap-1 px-2 py-1 border border-red-200 text-[#B4321F] text-[11px] font-medium rounded hover:bg-red-50"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>

                    {isWhyOpen && (
                      <div className="mt-2 p-2.5 bg-white border border-slate-200 rounded text-[11px] space-y-1">
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
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-sm font-semibold text-[#042C53]">Patient Journey Time Machine</h3>
            <p className="text-[11px] text-[#5F5D56]">
              Chronological provenance across human actions, AI drafts, and clinical role handoffs for {patient.fullName}.
            </p>
          </div>
          <span className="font-mono tabular-nums text-[11px] text-[#5F5D56]">{timeMachine.length} journey events</span>
        </div>

        {timeMachine.length === 0 ? (
          <p className="text-[#5F5D56]">No chronological journey events logged yet.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto eigen-scroll">
            {timeMachine.map((entry) => (
              <div key={entry.id} className="py-2.5 flex flex-wrap items-start justify-between gap-3">
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
                  <div className="text-slate-700">{entry.whatChanged}</div>
                  <div className="text-[11px] text-[#5F5D56]">
                    Actor: {entry.actor} ({entry.role}) · {entry.whyAdvanced}
                    {entry.nextOwner ? ` · Next owner: ${entry.nextOwner}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPatientTab(entry.targetTab)}
                  className="text-[11px] font-medium text-[#185FA5] hover:underline shrink-0"
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
