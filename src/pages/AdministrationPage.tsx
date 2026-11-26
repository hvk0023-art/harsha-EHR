import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { clinicalAiAuditService } from '../ai/clinicalAiService';
import { ClinicalAiModeToggle, useClinicalAiFlags } from '../components/ai/ClinicalAiControls';
import { useAppState } from '../state/AppStateContext';
import type { AuthorizedFhirExportOutcome, FhirExportMode } from '../state/fhirExport';
import { canExportPatientFhir, canManageAdministration } from '../state/permissions';
import {
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const AdministrationPage: React.FC = () => {
  const {
    state,
    updateAdminConfig,
    retryIntegration,
    handleAiActionDecision,
    exportPatientFhir,
    openPatient,
    notify,
  } = useAppState();

  const [tab, setTab] = useState<'fhir-export' | 'config' | 'ai-gov' | 'integrations' | 'audit'>('fhir-export');
  const [customPageName, setCustomPageName] = useState(state.adminConfig.customPageTitle);
  const [customFieldName, setCustomFieldName] = useState(state.adminConfig.customPatientFieldLabel);
  const [selectedPatientId, setSelectedPatientId] = useState(state.patients[0]?.id || 'pat-1');
  const [exportMode, setExportMode] = useState<FhirExportMode>('masked');
  const [confirmedIdentifiable, setConfirmedIdentifiable] = useState(false);
  const [lastExport, setLastExport] = useState<AuthorizedFhirExportOutcome | null>(null);
  const { flags, updateFlags, serverStatus } = useClinicalAiFlags();
  const aiProvenanceRecords = clinicalAiAuditService.list();

  if (!canManageAdministration(state.currentRole)) {
    return (
      <div
        data-demo-target="admin-restricted-banner"
        className="eigen-card border-red-200 p-6 space-y-2 text-xs"
      >
        <div className="flex items-center gap-2 text-[#B4321F] font-semibold text-sm">
          <ShieldAlert className="w-5 h-5" />
          Administration Restricted (Administrator Role Required)
        </div>
        <p className="text-[#5F5D56]">
          Current prototype preview role <strong>{state.currentRole}</strong> is not authorized to view Administration, system configuration, or HL7 FHIR R4 patient exports.
        </p>
      </div>
    );
  }

  const pendingAiActions = state.aiConversations.flatMap((conv) =>
    conv.messages.flatMap((msg) =>
      (msg.actions || []).map((act) => ({
        convId: conv.id,
        patientId: conv.patientId,
        msgId: msg.id,
        action: act,
      }))
    )
  );

  const handleRunExport = () => {
    const outcome = exportPatientFhir(selectedPatientId, exportMode, confirmedIdentifiable);
    setLastExport(outcome);
  };

  const handleDownloadJson = () => {
    if (!lastExport?.ok || !lastExport.bundle) return;
    const blob = new Blob([JSON.stringify(lastExport.bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eigenh-${selectedPatientId}-${exportMode}.fhir.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', `Downloaded ${a.download}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Administration, Interoperability & Audit"
        subtitle="Admin-Only HL7 FHIR R4 Export · M33 AI Governance · M34 Integrations · M36 Configuration · M37 Privacy & Audit"
      />

      <SegmentedTabs
        tabs={[
          { id: 'fhir-export', label: 'HL7 FHIR R4 Export (Admin Only)' },
          { id: 'config', label: 'Configuration (M36)' },
          {
            id: 'ai-gov',
            label: 'AI Review & Automation (M33)',
            count: pendingAiActions.filter((a) => a.action.status === 'Awaiting Approval' || a.action.status === 'Draft').length,
          },
          { id: 'integrations', label: 'Integrations (M34)', count: state.integrations.length },
          { id: 'audit', label: 'Privacy & Audit Trail (M37)', count: state.auditEvents.length },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as typeof tab)}
      />

      {/* Administrator-Only HL7 FHIR R4 Export Panel */}
      {tab === 'fhir-export' && (
        <section
          data-demo-target="admin-fhir-export-panel"
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs"
        >
          <div className="eigen-card p-5 space-y-3.5">
            <div className="flex items-center gap-2 font-semibold text-[#042C53] text-sm">
              <FileCode2 className="w-4 h-4 text-[#185FA5]" />
              HL7 FHIR R4 Patient Bundle Generator
            </div>
            <div className="p-3 bg-[#E6F1FB]/55 border border-[#85B7EB]/65 rounded-xl text-[11px] text-[#042C53] flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#185FA5]" />
              <span>
                Strictly restricted to <strong>Administrator</strong> ({canExportPatientFhir(state.currentRole) ? 'Authorized' : 'Denied'}). Default mode masks/pseudonymizes PII across all FHIR fields and attachments.
              </span>
            </div>

            <div>
              <label htmlFor="fhir-pat-select" className="block font-medium text-[#042C53] mb-1">
                Select Synthetic Patient
              </label>
              <select
                id="fhir-pat-select"
                value={selectedPatientId}
                onChange={(e) => {
                  setSelectedPatientId(e.target.value);
                  setLastExport(null);
                }}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                {state.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="font-medium text-[#042C53]">Privacy Mode</div>
              <label
                data-demo-target="fhir-mode-masked"
                className="flex items-start gap-2 p-2 border border-slate-200 rounded"
              >
                <input
                  type="radio"
                  name="fhir-mode"
                  checked={exportMode === 'masked'}
                  onChange={() => {
                    setExportMode('masked');
                    setConfirmedIdentifiable(false);
                  }}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-[#042C53]">Masked / Pseudonymized (Default)</strong>
                  <span className="block text-[11px] text-[#5F5D56]">Redacts direct identifiers, phone, email, address, and narrative PII.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 p-2 border border-slate-200 rounded">
                <input
                  type="radio"
                  name="fhir-mode"
                  checked={exportMode === 'identifiable'}
                  onChange={() => setExportMode('identifiable')}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-[#042C53]">Identifiable Synthetic Export</strong>
                  <span className="block text-[11px] text-[#5F5D56]">Requires explicit confirmation below; synthetic data only.</span>
                </span>
              </label>
            </div>

            {exportMode === 'identifiable' && (
              <label className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-[#9A5B10]">
                <input
                  type="checkbox"
                  checked={confirmedIdentifiable}
                  onChange={(e) => setConfirmedIdentifiable(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I confirm this is an authorized synthetic identifiable export for prototype review.</span>
              </label>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                data-demo-target="fhir-generate-btn"
                onClick={handleRunExport}
                className="eigen-btn-primary flex-1 justify-center text-xs"
              >
                Generate & Validate FHIR R4
              </button>
              {lastExport?.ok && (
                <button
                  type="button"
                  data-demo-target="fhir-download-btn"
                  onClick={handleDownloadJson}
                  className="eigen-btn-secondary text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  .fhir.json
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 eigen-card p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#042C53]/8 pb-2.5">
              <div className="font-semibold text-[#042C53]">Structural Validation & Bundle Preview</div>
              {lastExport?.validation && (
                <StatusBadge
                  label={
                    lastExport.validation.valid
                      ? `Valid R4 (${lastExport.bundle?.entry.length} resources · 0 errors)`
                      : `Validation Failed (${lastExport.validation.errors.length} errors)`
                  }
                  tone={lastExport.validation.valid ? 'success' : 'danger'}
                />
              )}
            </div>

            {!lastExport ? (
              <div className="p-6 text-center text-[#5F5D56] bg-[#F7F7F5] rounded">
                Select a patient and click <strong>Generate & Validate FHIR R4</strong> to build a structurally validated HL7 FHIR R4 Bundle with reference integrity checks.
              </div>
            ) : !lastExport.ok ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-[#B4321F]">
                {lastExport.error}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(lastExport.validation?.resourceCounts || {}).map(([type, count]) => (
                    <div key={type} className="p-2 bg-[#F7F7F5] border border-slate-200 rounded">
                      <div className="text-[10px] text-[#5F5D56]">{type}</div>
                      <div className="font-mono font-semibold tabular-nums text-[#042C53]">{count}</div>
                    </div>
                  ))}
                </div>

                {lastExport.summary && (
                  <div className="p-2.5 bg-emerald-50/60 border border-emerald-200 rounded text-[11px] text-[#0F6E50] flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>{lastExport.summary.patientDisplay}</strong> · Privacy: {lastExport.summary.mode} · Structural check passed ({lastExport.bundle?.entry.length ?? 0} resources). Prototype structural validation only — not an official HL7 Validator certification.
                    </span>
                  </div>
                )}

                <pre className="p-3 bg-[#042C53] text-slate-100 rounded-md text-[11px] font-mono overflow-x-auto max-h-72 eigen-scroll">
                  {JSON.stringify(lastExport.bundle, null, 2).slice(0, 4500)}
                  {JSON.stringify(lastExport.bundle, null, 2).length > 4500 ? '\n... (download full .fhir.json for complete bundle)' : ''}
                </pre>
              </div>
            )}
          </div>
        </section>
      )}

      {/* M36 Configuration */}
      {tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-[#042C53]">
              <Sliders className="w-4 h-4 text-[#185FA5]" />
              Feature Access & Workflow Rules
            </div>

            <div className="space-y-2 pt-1">
              {(
                [
                  ['aiAgent', 'Enable Patient AI Agent (D01)'],
                  ['telehealth', 'Enable Telehealth Waiting Room (M21)'],
                  ['abdmWorkspace', 'Enable India ABDM Demo Workspace (M35)'],
                  ['remoteMonitoring', 'Enable Remote Monitoring Alerts (M23)'],
                  ['researchCohorts', 'Enable Research Cohort Access Controls (M31)'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between p-2 border border-slate-200 rounded">
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={state.adminConfig.features[key]}
                    onChange={(e) =>
                      updateAdminConfig({
                        features: { ...state.adminConfig.features, [key]: e.target.checked },
                      })
                    }
                  />
                </label>
              ))}

              <label className="flex items-center justify-between p-2 bg-[#E6F1FB]/40 border border-[#85B7EB]/60 rounded">
                <span className="font-medium text-[#042C53]">
                  Workflow Rule: Auto-create Urgent Task on Critical Lab
                </span>
                <input
                  type="checkbox"
                  checked={state.adminConfig.workflowAutoTaskOnCriticalLab}
                  onChange={(e) =>
                    updateAdminConfig({ workflowAutoTaskOnCriticalLab: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
            <div className="font-semibold text-[#042C53]">Custom Fields & {state.adminConfig.customPageTitle}</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateAdminConfig({
                  customPageTitle: customPageName.trim() || 'Custom Page',
                  customPatientFieldLabel: customFieldName.trim() || 'Preferred Pharmacy',
                });
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="adm-cpage" className="block font-medium text-[#042C53] mb-1">
                  Canonical Custom Page Label
                </label>
                <input
                  id="adm-cpage"
                  type="text"
                  value={customPageName}
                  onChange={(e) => setCustomPageName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="adm-cfield" className="block font-medium text-[#042C53] mb-1">
                  Custom Patient Chart Field Label
                </label>
                <input
                  id="adm-cfield"
                  type="text"
                  value={customFieldName}
                  onChange={(e) => setCustomFieldName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 font-medium text-white bg-[#185FA5] rounded-md"
              >
                Save Configuration
              </button>
            </form>

            <div className="pt-3 border-t border-slate-200 space-y-1.5">
              <div className="font-semibold text-[#042C53]">Configured Facilities ({state.facilities.length})</div>
              {state.facilities.map((f) => (
                <div key={f.id} className="flex justify-between text-[11px] py-1 border-b border-slate-100">
                  <span className="font-medium text-[#042C53]">{f.name}</span>
                  <span className="font-mono text-[#5F5D56]">
                    {f.region} · {f.tzAbbr} · {f.currency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* M33 AI Assistance & Automation */}
      {tab === 'ai-gov' && (
        <div className="space-y-4">
          <div className="p-3 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded-lg text-xs text-[#042C53]">
            <strong>Human-in-the-Loop Policy:</strong> AI assistance drafts orders, notes, messages, and coding suggestions with source citations. No autonomous signing, prescribing, or clinical decisions occur.
          </div>

          {/* Phase 2 Clinical AI Runtime Feature Flags & Provenance Governance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="eigen-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#185FA5]" />
                  Phase 2 Clinical AI Runtime Feature Flags
                </div>
                <StatusBadge
                  label={serverStatus?.configured ? `Server Gemini Ready (${serverStatus.model})` : 'Deterministic Only'}
                  tone={serverStatus?.configured ? 'success' : 'warning'}
                />
              </div>
              <ClinicalAiModeToggle
                mode={flags.executionMode}
                onChangeMode={(m) => updateFlags({ executionMode: m })}
                serverConfigured={serverStatus?.configured}
              />
              <div className="space-y-1.5 pt-1">
                {(
                  [
                    ['documentIntelligence', 'Feature 1 · Real AI Document Intelligence (Data Inbox)'],
                    ['preConsultationBrief', 'Feature 2 · AI Pre-Consultation Intelligence Brief'],
                    ['chartSearch', 'Feature 3 · Ask EigenH Clinical Chart Search'],
                    ['ambientScribeV2', 'Feature 4 · Ambient Clinical Scribe V2'],
                    ['actionComposer', 'Feature 5 · AI Clinical Action Composer'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between p-2 border border-slate-200 rounded-lg bg-[#FAF9F6]">
                    <span className="text-[#042C53] font-medium">{label}</span>
                    <input
                      type="checkbox"
                      checked={flags[key]}
                      onChange={(e) => updateFlags({ [key]: e.target.checked })}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="eigen-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#0F6E50]" />
                  Clinical AI Provenance &amp; Audit Log ({aiProvenanceRecords.length})
                </div>
                <span className="text-[10.5px] font-mono text-[#5F5D56]">Synthetic Data Only</span>
              </div>
              {aiProvenanceRecords.length === 0 ? (
                <p className="text-[#5F5D56] py-3">
                  No Phase 2 Clinical AI invocations logged in this session yet. Run Document Intelligence, Pre-Consultation Brief, Ask EigenH, Ambient Scribe V2, or Action Composer to populate provenance records.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto eigen-scroll">
                  {aiProvenanceRecords.slice(0, 12).map((rec) => (
                    <div key={rec.id} className="py-2 first:pt-0 space-y-0.5 text-[11px]">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-semibold text-[#042C53]">{rec.operation}</span>
                        <StatusBadge
                          label={rec.executionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'}
                          tone={rec.executionMode === 'live-ai' ? 'blue' : 'neutral'}
                        />
                      </div>
                      <div className="font-mono text-[10px] text-[#5F5D56]">
                        {rec.modelId} · {rec.latencyMs}ms · {rec.reviewState} · Actor: {rec.actorName} ({rec.actorRole})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 text-xs font-semibold text-[#042C53] flex items-center gap-2">
              <Workflow className="w-4 h-4 text-[#185FA5]" />
              Human Review Queue Across Patients
            </div>
            <div className="divide-y divide-slate-100">
              {pendingAiActions.map((item) => (
                <div key={item.action.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <PatientLink patientId={item.patientId} tab="ai-agent" />
                      <span className="text-[#5F5D56]">· {item.action.kind}</span>
                    </div>
                    <div className="font-medium text-[#042C53] mt-0.5">{item.action.title}</div>
                    <div className="text-[11px] text-[#5F5D56]">{item.action.summary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={item.action.status} />
                    {(item.action.status === 'Awaiting Approval' || item.action.status === 'Draft') && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleAiActionDecision(item.convId, item.msgId, item.action.id, 'approve')
                          }
                          className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleAiActionDecision(item.convId, item.msgId, item.action.id, 'cancel')
                          }
                          className="px-2.5 py-1 text-[11px] text-[#B4321F] border border-red-200 rounded"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openPatient(item.patientId, 'ai-agent')}
                      className="text-[11px] text-[#185FA5] hover:underline"
                    >
                      Open D01
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* M34 Integrations */}
      {tab === 'integrations' && (
        <div className="eigen-card overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="eigen-table-head">
              <tr>
                <th className="py-2.5 px-3">System / Interface</th>
                <th className="py-2.5 px-3">Category</th>
                <th className="py-2.5 px-3">Last Sync</th>
                <th className="py-2.5 px-3">Queue</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.integrations.map((intg) => (
                <tr key={intg.id}>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-[#042C53]">{intg.name}</div>
                    <div className="text-[11px] text-[#5F5D56]">{intg.note}</div>
                  </td>
                  <td className="py-2.5 px-3">{intg.category}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">{intg.lastSync}</td>
                  <td className="py-2.5 px-3 font-mono tabular-nums">{intg.pendingMessages}</td>
                  <td className="py-2.5 px-3">
                    <StatusBadge label={intg.status} />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    {(intg.status === 'Failed' || intg.status === 'Delayed') && (
                      <button
                        type="button"
                        onClick={() => retryIntegration(intg.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry Sync (Sim)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* M37 Privacy, Security & Audit */}
      {tab === 'audit' && (
        <div data-demo-target="admin-audit-panel" className="space-y-4">
          <div className="p-3 bg-[#F1EFE8] border border-slate-200 rounded-lg text-xs text-[#5F5D56] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="text-[#042C53]">Simulated Security & Audit Notice:</strong> Role previews, session lists, and backup indicators below are prototype demonstrations, not production authentication or HIPAA compliance enforcement.
            </span>
            <button
              type="button"
              onClick={() => notify('info', 'Simulated encrypted backup snapshot verified (local demo)')}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 rounded text-[#042C53] font-medium"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#0F6E50]" />
              Verify Backup (Sim)
            </button>
          </div>

          <div className="eigen-card overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="eigen-table-head">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor & Preview Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.auditEvents.map((ev) => (
                  <tr key={ev.id}>
                    <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">{ev.timestamp}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-[#042C53]">{ev.actor}</div>
                      <div className="text-[11px] text-[#5F5D56]">{ev.role}</div>
                    </td>
                    <td className="py-2 px-3">
                      <StatusBadge label={ev.action} tone="blue" />
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]">
                      {ev.targetType}:{ev.targetId}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{ev.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
