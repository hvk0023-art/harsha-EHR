import React, { useMemo, useState } from 'react';
import {
  Bot,
  Check,
  CreditCard,
  FileText,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { computeInvoiceTotals, deriveAiRequestStatus, formatCurrency } from '../../state/domainLogic';
import { useAppState } from '../../state/AppStateContext';
import type { Patient } from '../../types/hms';
import {
  EmptyState,
  Modal,
  SegmentedTabs,
  StatusBadge,
} from '../ui/Primitives';

export const PatientCommsTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { state, sendMessageInThread, createMessageThread, sendFax } = useAppState();
  const threads = state.messages.filter((m) => m.patientId === patient.id);
  const faxes = state.faxes.filter((f) => f.patientId === patient.id);

  const [selectedId, setSelectedId] = useState(threads[0]?.id || '');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'In-App' | 'Text' | 'Internal Note' | 'Page'>('In-App');
  const [newSubj, setNewSubj] = useState('');
  const [newText, setNewText] = useState('');

  const active = threads.find((t) => t.id === selectedId) || threads[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
      <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-3">
        <div className="font-semibold text-[#042C53]">Patient Threads ({threads.length})</div>
        <div className="divide-y divide-slate-100">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className={`w-full text-left py-2 px-2 rounded ${active?.id === t.id ? 'bg-[#E6F1FB]/60' : 'hover:bg-slate-50'}`}
            >
              <div className="font-medium text-[#042C53]">{t.subject}</div>
              <div className="text-[11px] text-[#5F5D56]">{t.channel} · {t.status}</div>
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newSubj.trim() || !newText.trim()) return;
            createMessageThread(patient.id, newSubj.trim(), newText.trim(), 'In-App', false);
            setNewSubj('');
            setNewText('');
          }}
          className="pt-3 border-t border-slate-200 space-y-2"
        >
          <div className="font-semibold text-[#042C53]">Start New Thread</div>
          <input type="text" placeholder="Subject..." value={newSubj} onChange={(e) => setNewSubj(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
          <textarea rows={2} placeholder="Message..." value={newText} onChange={(e) => setNewText(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
          <button type="submit" className="w-full py-1.5 bg-[#185FA5] text-white rounded font-medium">Create Thread</button>
        </form>

        <div className="pt-3 border-t border-slate-200 space-y-1.5">
          <div className="font-semibold text-[#042C53] flex items-center justify-between">
            <span>Patient Faxes ({faxes.length})</span>
            <button
              type="button"
              onClick={() =>
                sendFax({
                  direction: 'Outbound',
                  patientId: patient.id,
                  recipientOrSender: 'External Specialist Demo',
                  faxNumber: '(617) 555-0999',
                  subject: `Chart Summary — ${patient.fullName}`,
                  coverMessage: 'Simulated patient packet.',
                  documentNames: ['Chart_Summary.pdf'],
                  status: 'Delivered',
                })
              }
              className="inline-flex items-center gap-1 text-[11px] text-[#185FA5] hover:underline"
            >
              <Printer className="w-3 h-3" /> Send Sim Fax
            </button>
          </div>
          {faxes.map((f) => (
            <div key={f.id} className="text-[11px] flex justify-between py-1">
              <span className="truncate">{f.subject}</span>
              <StatusBadge label={f.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg flex flex-col max-h-[500px]">
        {!active ? (
          <div className="p-6">
            <EmptyState title="No messages yet" />
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-[#042C53]">
              {active.subject}
            </div>
            <div className="flex-1 p-4 space-y-2.5 overflow-y-auto eigen-scroll">
              {active.messages.map((m) => (
                <div
                  key={m.id}
                  className={`p-3 rounded border ${
                    m.isInternalNote
                      ? 'bg-amber-50 border-amber-200'
                      : m.isPatient
                      ? 'bg-[#F1EFE8] border-slate-200'
                      : 'bg-[#E6F1FB]/40 border-[#85B7EB]/50'
                  }`}
                >
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="font-semibold text-[#042C53]">
                      {m.sender} {m.isInternalNote ? '(Internal Note)' : ''}
                    </span>
                    <span className="font-mono text-[#5F5D56]">{m.timestamp} · {m.deliveryStatus}</span>
                  </div>
                  <p className="text-slate-800">{m.body}</p>
                </div>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!body.trim()) return;
                sendMessageInThread(active.id, body.trim(), mode, false);
                setBody('');
              }}
              className="p-3 border-t border-slate-200 bg-[#F7F7F5] space-y-2"
            >
              <div className="flex flex-wrap gap-1.5">
                {(['In-App', 'Text', 'Internal Note', 'Page'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-2 py-0.5 text-[11px] rounded border ${
                      mode === m ? 'bg-[#042C53] text-white border-[#042C53]' : 'bg-white border-slate-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={`Write ${mode}...`}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded"
                />
                <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#185FA5] text-white rounded font-medium">
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export const PatientDocsFormsTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    addPatientDocument,
    verifyExternalCondition,
    reconcileExternalDocument,
    assignFormToPatient,
    submitFormAssignment,
    createFormTemplate,
    notify,
  } = useAppState();

  const [subTab, setSubTab] = useState<'docs' | 'forms' | 'builder'>('docs');
  const [docTitle, setDocTitle] = useState('');
  const [docCat, setDocCat] = useState<'Clinical Note' | 'External Record' | 'Consent' | 'Lab PDF' | 'Imaging' | 'ROI'>('Clinical Note');
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [formAns, setFormAns] = useState<Record<string, string>>({});
  const [signName, setSignName] = useState(patient.fullName);
  const [tplTitle, setTplTitle] = useState('');

  const docs = state.documents.filter((d) => d.patientId === patient.id);
  const forms = state.formAssignments.filter((f) => f.patientId === patient.id);
  const externalConds = patient.conditions.filter((c) => c.source === 'External HIE');
  const uncertainDocs = (state.externalDocQueue || []).filter(
    (d) => d.candidatePatientIds.includes(patient.id) || d.filedPatientId === patient.id
  );
  const activeAssignment = forms.find((f) => f.id === activeFormId);
  const activeTemplate = activeAssignment
    ? state.formTemplates.find((t) => t.id === activeAssignment.templateId)
    : null;

  return (
    <div className="space-y-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedTabs
          tabs={[
            { id: 'docs', label: 'Documents & External Records (M19)', count: docs.length },
            { id: 'forms', label: 'Forms & Consents (M20)', count: forms.length },
            { id: 'builder', label: 'Form Builder (M20)' },
          ]}
          activeId={subTab}
          onChange={(id) => setSubTab(id as typeof subTab)}
        />
      </div>

      {subTab === 'docs' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            {/* Uncertain External Document Reconciliation Queue (Never Auto-Merged) */}
            {uncertainDocs.length > 0 && (
              <section
                data-demo-target="external-reconciliation-panel"
                className="bg-amber-50/70 border border-amber-200 rounded-lg p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-[#9A5B10]">
                    Uncertain External Document Reconciliation (Human Verification Required — Never Auto-Merged)
                  </div>
                  <span className="font-mono text-[11px] text-[#9A5B10]">
                    {uncertainDocs.length} record{uncertainDocs.length === 1 ? '' : 's'}
                  </span>
                </div>
                {uncertainDocs.map((ext) => (
                  <div key={ext.id} className="bg-white border border-amber-200 rounded-md p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#042C53]">{ext.title}</div>
                        <div className="text-[11px] text-[#5F5D56]">
                          Source: {ext.sourceOrganization} · Received <span className="font-mono">{ext.receivedAt}</span>
                        </div>
                      </div>
                      <StatusBadge
                        label={ext.status}
                        tone={ext.status === 'Verified & Filed' ? 'success' : ext.status === 'Rejected' ? 'danger' : 'warning'}
                      />
                    </div>
                    <div className="p-2 bg-[#F7F7F5] rounded text-[11px] space-y-1">
                      <div>
                        <strong className="text-[#042C53]">Extracted Identity:</strong> {ext.extractedPatientName} · DOB {ext.extractedDob}
                      </div>
                      <div>
                        <strong className="text-[#042C53]">Clinical Extract:</strong> {ext.extractedSummary}
                      </div>
                      <div className="text-[#9A5B10]">
                        <strong>Uncertainty Notice:</strong> {ext.uncertaintyReason}
                      </div>
                    </div>
                    {ext.status === 'Pending Human Verification' ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-[#5F5D56]">
                          Candidate chart match: <strong className="text-[#042C53]">{patient.fullName} ({patient.mrn}, DOB {patient.dob})</strong>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => reconcileExternalDocument(ext.id, patient.id, 'file')}
                            className="px-2.5 py-1 bg-[#185FA5] hover:bg-[#042C53] text-white text-[11px] font-medium rounded"
                          >
                            Verify Identity & File into Chart
                          </button>
                          <button
                            type="button"
                            onClick={() => reconcileExternalDocument(ext.id, patient.id, 'reject')}
                            className="px-2.5 py-1 border border-red-200 text-[#B4321F] text-[11px] font-medium rounded hover:bg-red-50"
                          >
                            Reject Match
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-[#0F6E50]">
                        Decision recorded by {ext.verifiedBy} · {ext.verifiedAt}
                      </div>
                    )}
                  </div>
                ))}
              </section>
            )}

            {externalConds.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="font-semibold text-[#9A5B10]">
                  External Conditions (Distinct from Local Verified Diagnoses)
                </div>
                {externalConds.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 bg-white p-2 rounded border border-amber-200">
                    <div>
                      <span className="font-medium text-[#042C53]">{c.name}</span>{' '}
                      <span className="font-mono text-[11px] text-[#5F5D56]">{c.icd10}</span>
                    </div>
                    {c.verified ? (
                      <StatusBadge label="Verified" tone="success" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => verifyExternalCondition(patient.id, c.id)}
                        className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                      >
                        Promote to Verified
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {docs.length === 0 ? (
                <div className="p-6"><EmptyState title="No documents indexed" /></div>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className="p-3.5 flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#042C53]">{d.title}</div>
                      <div className="text-[11px] text-[#5F5D56]">
                        {d.category} · {d.source} · Author: {d.author} · {d.date} · v{d.version}
                      </div>
                      <div className="text-slate-700 mt-1">{d.summary}</div>
                    </div>
                    <StatusBadge label={d.external && !d.verified ? 'External Unverified' : 'Verified'} />
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit">
            <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-[#185FA5]" />
              Upload / Scan Local Demo Document
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!docTitle.trim()) return;
                addPatientDocument({
                  patientId: patient.id,
                  title: docTitle.trim(),
                  category: docCat,
                  summary: 'Uploaded synthetic document for prototype demonstration.',
                });
                setDocTitle('');
              }}
              className="space-y-2.5"
            >
              <input
                type="text"
                required
                placeholder="Document title..."
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <select
                value={docCat}
                onChange={(e) => setDocCat(e.target.value as typeof docCat)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="Clinical Note">Clinical Note</option>
                <option value="External Record">External Record</option>
                <option value="Consent">Consent</option>
                <option value="Lab PDF">Lab PDF</option>
                <option value="ROI">Release of Information</option>
              </select>
              <button type="submit" className="w-full py-2 bg-[#185FA5] text-white rounded font-medium">
                Index Document
              </button>
            </form>
            <button
              type="button"
              onClick={() => notify('info', 'Print / Export PDF preview generated locally (no external transfer)')}
              className="w-full py-1.5 border border-slate-300 rounded font-medium text-[#042C53]"
            >
              Export / Print Packet (Sim)
            </button>
          </div>
        </div>
      )}

      {subTab === 'forms' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[#042C53]">Assigned Forms & Consents</span>
            <div className="flex flex-wrap gap-1.5">
              {state.formTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => assignFormToPatient(patient.id, tpl.id)}
                  className="px-2.5 py-1 text-[11px] bg-[#F7F7F5] hover:bg-[#E6F1FB] border border-slate-200 rounded"
                >
                  + Assign {tpl.title}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {forms.length === 0 ? (
              <div className="p-6"><EmptyState title="No forms assigned" /></div>
            ) : (
              forms.map((f) => (
                <div key={f.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[#042C53]">{f.title}</div>
                    <div className="text-[11px] text-[#5F5D56]">
                      {f.category} · v{f.version} · {f.language} · Assigned {f.assignedDate}
                      {f.signedBy ? ` · E-Signed by ${f.signedBy} (${f.signedAt})` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge label={f.status} />
                    <button
                      type="button"
                      onClick={() => {
                        setActiveFormId(f.id);
                        setFormAns(f.responses);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                    >
                      {f.status === 'Assigned' || f.status === 'Draft' ? 'Complete & Sign' : 'View Responses'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'builder' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 max-w-lg space-y-3">
          <div className="font-semibold text-[#042C53]">Create Mock Form Template (M20)</div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!tplTitle.trim()) return;
              createFormTemplate({
                title: tplTitle.trim(),
                category: 'Questionnaire',
                version: '1.0',
                languages: ['English', 'Spanish'],
                fields: [
                  { id: 'q1', label: 'Primary symptom severity (1-10)', type: 'text' },
                  { id: 'q2', label: 'Consent to share with care team', type: 'checkbox' },
                ],
              });
              setTplTitle('');
              setSubTab('forms');
            }}
            className="space-y-3"
          >
            <input
              type="text"
              required
              placeholder="New template title (e.g. CKD Diet Readiness Survey)..."
              value={tplTitle}
              onChange={(e) => setTplTitle(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded"
            />
            <button type="submit" className="px-4 py-1.5 bg-[#185FA5] text-white rounded font-medium">
              Save Form Template
            </button>
          </form>
        </div>
      )}

      <Modal
        open={Boolean(activeAssignment)}
        onClose={() => setActiveFormId(null)}
        title={activeAssignment?.title || 'Form'}
        subtitle={`Version ${activeAssignment?.version} · ${activeAssignment?.language}`}
      >
        {activeAssignment && activeTemplate && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitFormAssignment(
                activeAssignment.id,
                formAns,
                activeAssignment.category === 'Consent' ? signName : undefined
              );
              setActiveFormId(null);
            }}
            className="space-y-3 text-xs"
          >
            {activeTemplate.fields.map((fld) => (
              <div key={fld.id}>
                <label className="block font-medium text-[#042C53] mb-1">{fld.label}</label>
                {fld.type === 'select' ? (
                  <select
                    value={formAns[fld.id] || ''}
                    onChange={(e) => setFormAns((p) => ({ ...p, [fld.id]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  >
                    <option value="">Select...</option>
                    {fld.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : fld.type === 'checkbox' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formAns[fld.id] === 'true'}
                      onChange={(e) => setFormAns((p) => ({ ...p, [fld.id]: String(e.target.checked) }))}
                    />
                    Confirm
                  </label>
                ) : (
                  <input
                    type="text"
                    value={formAns[fld.id] || ''}
                    onChange={(e) => setFormAns((p) => ({ ...p, [fld.id]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                )}
              </div>
            ))}
            {activeAssignment.category === 'Consent' && (
              <div>
                <label className="block font-medium text-[#042C53] mb-1">Electronic Signature (Type Full Name)</label>
                <input
                  type="text"
                  required
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button type="button" onClick={() => setActiveFormId(null)} className="px-3 py-1.5 border border-slate-300 rounded">Close</button>
              <button type="submit" className="px-4 py-1.5 bg-[#185FA5] text-white rounded font-medium">Submit Form</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// D01 — PATIENT AI AGENT
export const PatientAiAgentTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { state, submitAiPrompt, handleAiActionDecision, setPatientTab } = useAppState();
  const convs = state.aiConversations.filter((c) => c.patientId === patient.id);
  const [activeConvId, setActiveConvId] = useState<string | null>(convs[0]?.id || null);
  const [promptInput, setPromptInput] = useState('');
  const [previewFocus, setPreviewFocus] = useState<{ label: string; tab: Parameters<typeof setPatientTab>[0]; excerpt: string } | null>(null);

  const activeConv = convs.find((c) => c.id === activeConvId) || convs[0] || null;
  const allActions = activeConv ? activeConv.messages.flatMap((m) => m.actions || []) : [];
  const overallStatus = deriveAiRequestStatus(allActions);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
      {/* Left: Conversation History */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-3 space-y-3 h-fit">
        <button
          type="button"
          onClick={() => setActiveConvId(null)}
          className="w-full py-2 px-3 bg-[#185FA5] hover:bg-[#042C53] text-white rounded-md font-medium"
        >
          + New Conversation
        </button>
        <div className="text-[11px] font-semibold text-[#5F5D56]">Conversation History</div>
        <div className="space-y-1.5">
          {convs.length === 0 ? (
            <p className="text-[#5F5D56]">No prior AI sessions for {patient.fullName}.</p>
          ) : (
            convs.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveConvId(c.id)}
                className={`w-full text-left p-2.5 rounded border ${
                  activeConv?.id === c.id ? 'bg-[#E6F1FB]/60 border-[#85B7EB]' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-[#042C53] truncate">{c.title}</div>
                <div className="text-[11px] font-mono text-[#5F5D56] mt-0.5">{c.createdAt}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Centre: Conversation & Multi-Action Progress */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg flex flex-col min-h-[480px]">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#185FA5]" />
            <span className="font-semibold text-[#042C53]">D01 · Patient AI Agent (Simulated)</span>
          </div>
          {allActions.length > 0 && <StatusBadge label={overallStatus} />}
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto eigen-scroll max-h-[540px]">
          {!activeConv ? (
            <div className="space-y-3 py-6 text-center">
              <p className="font-medium text-[#042C53]">Ask the patient chart or prepare multi-step actions</p>
              <button
                type="button"
                onClick={() => {
                  const id = submitAiPrompt(
                    patient.id,
                    null,
                    'Prepare a CMP lab order, schedule a 3-week follow-up appointment, and create a care coordination task.'
                  );
                  setActiveConvId(id);
                }}
                className="px-3 py-1.5 bg-[#E6F1FB] text-[#042C53] rounded border border-[#85B7EB] font-medium"
              >
                Try: Prepare lab order, follow-up & task
              </button>
            </div>
          ) : (
            activeConv.messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div
                  className={`p-3 rounded-lg border ${
                    m.role === 'user'
                      ? 'bg-[#F1EFE8] border-slate-200 ml-6'
                      : 'bg-[#E6F1FB]/35 border-[#85B7EB]/60 mr-2'
                  }`}
                >
                  <div className="flex justify-between text-[11px] text-[#5F5D56] mb-1">
                    <span className="font-semibold text-[#042C53]">
                      {m.role === 'user' ? 'Clinician Request' : 'EigenH AI Action Layer (Simulated)'}
                    </span>
                    <span className="font-mono">{m.timestamp}</span>
                  </div>
                  <p className="text-slate-800">{m.text}</p>

                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/80 flex flex-wrap gap-1.5">
                      {m.sources.map((src) => (
                        <button
                          key={src.label}
                          type="button"
                          onClick={() => setPreviewFocus(src)}
                          className="px-2 py-0.5 text-[11px] bg-white border border-slate-300 rounded text-[#185FA5] hover:underline"
                        >
                          Source: {src.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {m.uncertaintyNote && (
                    <div className="mt-2 text-[11px] text-[#9A5B10] bg-amber-50 p-2 rounded border border-amber-200">
                      {m.uncertaintyNote}
                    </div>
                  )}

                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="text-[11px] font-semibold text-[#042C53]">
                        Proposed Actions — Individual Approval Required:
                      </div>
                      {m.actions.map((act) => (
                        <div
                          key={act.id}
                          className="p-2.5 bg-white border border-slate-200 rounded-md flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-[#042C53]">{act.title}</div>
                            <div className="text-[11px] text-[#5F5D56]">{act.summary}</div>
                            {act.resultRef && (
                              <div className="text-[11px] text-[#0F6E50] font-mono mt-0.5">
                                Created: {act.resultRef}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <StatusBadge label={act.status} />
                            {(act.status === 'Awaiting Approval' || act.status === 'Draft') && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAiActionDecision(activeConv.id, m.id, act.id, 'approve')
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded hover:bg-[#042C53]"
                                >
                                  <Check className="w-3 h-3" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAiActionDecision(activeConv.id, m.id, act.id, 'cancel')
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#B4321F] border border-red-200 rounded hover:bg-red-50"
                                >
                                  <X className="w-3 h-3" />
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!promptInput.trim()) return;
            const id = submitAiPrompt(patient.id, activeConv?.id || null, promptInput.trim());
            setActiveConvId(id);
            setPromptInput('');
          }}
          className="p-3 border-t border-slate-200 bg-[#F7F7F5] flex gap-2"
        >
          <input
            type="text"
            aria-label="Ask Patient AI Agent"
            placeholder="Ask chart or request draft lab order, appointment, task, message..."
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-medium text-white bg-[#185FA5] rounded-md"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Submit
          </button>
        </form>
      </div>

      {/* Right: Linked Record Preview & Sources */}
      <div className="lg:col-span-3 bg-white border border-slate-200 rounded-lg p-3 space-y-3 h-fit">
        <div className="font-semibold text-[#042C53]">Linked-Record Preview</div>
        {previewFocus ? (
          <div className="p-3 bg-[#F7F7F5] rounded border border-slate-200 space-y-2">
            <div className="font-medium text-[#042C53]">{previewFocus.label}</div>
            <p className="text-slate-700">{previewFocus.excerpt}</p>
            <button
              type="button"
              onClick={() => setPatientTab(previewFocus.tab)}
              className="text-[#185FA5] font-medium hover:underline"
            >
              Open Full Record Tab →
            </button>
          </div>
        ) : (
          <div className="space-y-2 text-[#5F5D56]">
            <p>Click any source chip in the AI response to preview evidence from {patient.fullName}'s chart.</p>
            <div className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
              <div className="font-medium text-[#042C53]">Active Chart Context</div>
              <div>Conditions: {patient.conditions.length}</div>
              <div>Allergies: {patient.allergies.length}</div>
              <div>Open Orders: {state.orders.filter((o) => o.patientId === patient.id && o.status !== 'Resulted').length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// D05 & D06 — PATIENT ACCOUNT (BILLS & MEDICARE ELIGIBILITY)
export const PatientAccountTab: React.FC<{ patient: Patient }> = ({ patient }) => {
  const {
    state,
    currentFacility,
    collectInvoicePayment,
    toggleAutopayAuthorisation,
    runEligibilityCheck,
    closePatientWorkspace,
  } = useAppState();

  const [subView, setSubView] = useState<'bills' | 'eligibility'>('bills');
  const [collectionMethod, setCollectionMethod] = useState<'saved' | 'new-demo'>('saved');
  const [selectedPmId, setSelectedPmId] = useState<string>(
    state.savedPaymentMethods.find((pm) => pm.patientId === patient.id)?.id || ''
  );

  const invoices = state.invoices.filter((i) => i.patientId === patient.id);
  const policies = state.policies.filter((p) => p.patientId === patient.id);
  const auths = state.priorAuths.filter((pa) => pa.patientId === patient.id);
  const savedPms = state.savedPaymentMethods.filter((pm) => pm.patientId === patient.id);

  const activeInvoice = invoices[0];
  const totals = activeInvoice ? computeInvoiceTotals(activeInvoice) : null;
  const medicarePolicy = policies.find((p) => p.payerCategory === 'Medicare') || policies[0];
  const selectedPm = savedPms.find((pm) => pm.id === selectedPmId) || savedPms[0];

  return (
    <div className="space-y-4 text-xs">
      <SegmentedTabs
        tabs={[
          { id: 'bills', label: 'D05 · Bills & Payment Collection', count: invoices.length },
          { id: 'eligibility', label: 'D06 · Coverage & Medicare Eligibility', count: policies.length },
        ]}
        activeId={subView}
        onChange={(id) => setSubView(id as typeof subView)}
      />

      {/* D05 — PATIENT BILLS AND PAYMENT COLLECTION */}
      {subView === 'bills' && (
        !activeInvoice || !totals ? (
          <EmptyState title="No invoices on file for this patient" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <div className="text-sm font-semibold text-[#042C53]">
                    Invoice {activeInvoice.invoiceNumber}
                  </div>
                  <div className="text-[11px] font-mono text-[#5F5D56]">
                    Issued {activeInvoice.issuedDate} · Due {activeInvoice.dueDate}
                  </div>
                </div>
                <StatusBadge label={activeInvoice.status} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] text-[#5F5D56]">
                    <tr>
                      <th className="py-2 px-3">Date & Code</th>
                      <th className="py-2 px-3">Service Description</th>
                      <th className="py-2 px-3 text-right">Charge</th>
                      <th className="py-2 px-3 text-right">Ins. Covered</th>
                      <th className="py-2 px-3 text-right">Patient Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeInvoice.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {li.date} · {li.code}
                        </td>
                        <td className="py-2 px-3">{li.description}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(li.amount, currentFacility.currency)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-[#0F6E50]">
                          -{formatCurrency(li.insuranceCovered, currentFacility.currency)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(li.patientResponsibility, currentFacility.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1 text-right font-mono tabular-nums">
                <div className="text-[#5F5D56]">
                  Subtotal Charges: {formatCurrency(totals.subtotal, currentFacility.currency)}
                </div>
                <div className="text-[#0F6E50]">
                  Insurance Covered: -{formatCurrency(totals.insuranceCovered, currentFacility.currency)}
                </div>
                <div className="text-[#5F5D56]">
                  Payments Applied: -{formatCurrency(totals.paid, currentFacility.currency)}
                </div>
                <div className="text-base font-bold text-[#042C53]">
                  Amount Due: {formatCurrency(totals.amountDue, currentFacility.currency)}
                </div>
              </div>
            </div>

            {/* Right: Payment Collection & Saved Methods */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 h-fit">
              <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#185FA5]" />
                Simulated Payment Collection (D05)
              </div>
              <p className="text-[11px] text-[#5F5D56]">
                Masked fictional references only. Real card numbers are never collected or charged.
              </p>

              <div className="p-2.5 bg-[#F7F7F5] rounded space-y-1">
                <div className="text-[11px] font-semibold text-[#042C53]">Billing Information Status</div>
                <div>Guarantor: {patient.caregivers.find((c) => c.isGuarantor)?.name || patient.fullName}</div>
                <div>Statement Delivery: Electronic & Paper</div>
              </div>

              <div className="space-y-2">
                <label className="block font-medium text-[#042C53]">Collection Method</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCollectionMethod('saved')}
                    className={`flex-1 py-1.5 rounded border font-medium ${
                      collectionMethod === 'saved' ? 'bg-[#E6F1FB] border-[#185FA5] text-[#042C53]' : 'border-slate-300'
                    }`}
                  >
                    Saved Method
                  </button>
                  <button
                    type="button"
                    onClick={() => setCollectionMethod('new-demo')}
                    className={`flex-1 py-1.5 rounded border font-medium ${
                      collectionMethod === 'new-demo' ? 'bg-[#E6F1FB] border-[#185FA5] text-[#042C53]' : 'border-slate-300'
                    }`}
                  >
                    Manual Demo Entry
                  </button>
                </div>

                {collectionMethod === 'saved' && savedPms.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {savedPms.map((pm) => (
                      <div
                        key={pm.id}
                        className={`p-2 rounded border flex items-center justify-between ${
                          selectedPm?.id === pm.id ? 'border-[#185FA5] bg-[#E6F1FB]/30' : 'border-slate-200'
                        }`}
                      >
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="pm-select"
                            checked={selectedPm?.id === pm.id}
                            onChange={() => setSelectedPmId(pm.id)}
                          />
                          <span className="font-mono">
                            {pm.brand} •••• {pm.last4}
                          </span>
                          {pm.isDefault && <StatusBadge label="Default" tone="blue" />}
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleAutopayAuthorisation(pm.id)}
                          className="text-[11px] text-[#185FA5] hover:underline"
                        >
                          {pm.autopayAuthorised ? 'Autopay Auth On' : 'Enable Autopay'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {totals.amountDue > 0 ? (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() =>
                      collectInvoicePayment(
                        activeInvoice.id,
                        totals.amountDue,
                        selectedPm ? `${selectedPm.brand} •••• ${selectedPm.last4}` : 'Simulated Card •••• 0000'
                      )
                    }
                    className="w-full py-2 font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
                  >
                    Collect {formatCurrency(totals.amountDue, currentFacility.currency)} (Simulated)
                  </button>
                  {selectedPm?.autopayAuthorised && (
                    <button
                      type="button"
                      onClick={() =>
                        collectInvoicePayment(
                          activeInvoice.id,
                          totals.amountDue,
                          `Autopay (${selectedPm.brand} •••• ${selectedPm.last4})`
                        )
                      }
                      className="w-full py-1.5 font-medium text-[#042C53] bg-[#E6F1FB] border border-[#85B7EB] rounded-md"
                    >
                      Run Authorised Automatic Collection (Sim)
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded text-[#0F6E50] font-medium">
                  Invoice Paid in Full (Simulated)
                </div>
              )}

              <button
                type="button"
                onClick={closePatientWorkspace}
                className="w-full py-1.5 border border-slate-300 rounded-md font-medium text-[#042C53] hover:bg-slate-50"
              >
                Finish and Go Back
              </button>
            </div>
          </div>
        )
      )}

      {/* D06 — MEDICARE ELIGIBILITY SUMMARY */}
      {subView === 'eligibility' && (
        !medicarePolicy ? (
          <EmptyState title="No coverage policies on file" />
        ) : (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200">
                <div>
                  <h2 className="text-sm font-semibold text-[#042C53]">
                    D06 · Eligibility Result — {medicarePolicy.payerName}
                  </h2>
                  <div className="text-[11px] font-mono text-[#5F5D56] mt-0.5">
                    Member ID: {medicarePolicy.memberId} · Eligibility As-of: {medicarePolicy.eligibilityCheckedAt}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={`Insurance: ${medicarePolicy.status}`} tone="success" />
                  <button
                    type="button"
                    onClick={() => runEligibilityCheck(medicarePolicy.id)}
                    className="px-3 py-1.5 font-medium bg-[#185FA5] text-white rounded-md"
                  >
                    Refresh Eligibility (Sim)
                  </button>
                </div>
              </div>

              <div className="p-3 bg-[#E6F1FB]/50 border border-[#85B7EB]/60 rounded text-[#042C53]">
                <strong>Quick Summary:</strong> {medicarePolicy.planName} is active. Eligibility verification confirms active enrolment on the as-of date only and does not guarantee claim payment.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 bg-[#F7F7F5] rounded border border-slate-200">
                  <div className="text-[11px] font-semibold text-[#5F5D56]">Medicare Part A</div>
                  <div className="font-medium text-[#042C53] mt-1">
                    {medicarePolicy.eligibilitySummary.partAStatus || 'Commercial Plan — N/A'}
                  </div>
                </div>
                <div className="p-3 bg-[#F7F7F5] rounded border border-slate-200">
                  <div className="text-[11px] font-semibold text-[#5F5D56]">Medicare Part B</div>
                  <div className="font-medium text-[#042C53] mt-1">
                    {medicarePolicy.eligibilitySummary.partBStatus || 'Outpatient Active'}
                  </div>
                </div>
                <div className="p-3 bg-[#F7F7F5] rounded border border-slate-200">
                  <div className="text-[11px] font-semibold text-[#5F5D56]">Deductible Information</div>
                  <div className="font-mono font-semibold text-[#042C53] mt-1">
                    ${medicarePolicy.eligibilitySummary.deductibleMet} / ${medicarePolicy.eligibilitySummary.deductibleTotal} met
                  </div>
                </div>
                <div className="p-3 bg-[#F7F7F5] rounded border border-slate-200">
                  <div className="text-[11px] font-semibold text-[#5F5D56]">Coinsurance / Copay</div>
                  <div className="font-mono font-semibold text-[#042C53] mt-1">
                    {medicarePolicy.eligibilitySummary.coinsurancePct}% coinsurance · ${medicarePolicy.eligibilitySummary.copay} copay
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 border border-slate-200 rounded">
                  <div className="font-semibold text-[#042C53]">Preventive Services</div>
                  <p className="text-slate-700 mt-1">{medicarePolicy.eligibilitySummary.preventiveServices}</p>
                </div>
                <div className="p-3 border border-slate-200 rounded">
                  <div className="font-semibold text-[#042C53]">Non-Covered Services</div>
                  <p className="text-slate-700 mt-1">{medicarePolicy.eligibilitySummary.nonCoveredNote}</p>
                </div>
              </div>
            </div>

            {auths.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                <div className="font-semibold text-[#042C53]">Prior Authorisations</div>
                {auths.map((pa) => (
                  <div key={pa.id} className="p-2.5 bg-[#F7F7F5] rounded flex items-center justify-between">
                    <div>
                      <div className="font-medium text-[#042C53]">{pa.serviceName}</div>
                      <div className="text-[11px] font-mono text-[#5F5D56]">
                        Auth #{pa.authNumber} · {pa.validFrom} to {pa.validTo} · Visits used: {pa.visitsUsed}/{pa.visitsApproved}
                      </div>
                    </div>
                    <StatusBadge label={pa.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
