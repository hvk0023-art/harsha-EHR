import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Edit3,
  FileText,
  FileUp,
  Inbox,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import {
  classifySyntheticDocument,
  createSyntheticInboxItemFromTemplate,
  DATA_SOURCE_ADAPTERS,
  evaluateDuplicateSafety,
  SYNTHETIC_DOCUMENT_TEMPLATES,
} from '../../state/registrationIntelligence';
import type { Patient, PatientDataInboxItem } from '../../types/hms';
import { EmptyState, StatusBadge } from '../ui/Primitives';

interface PatientDataInboxTabProps {
  /** When passed (inside Patient Workspace), filters and defaults to this patient. When omitted (inside Clinical Inbox), shows all items. */
  patient?: Patient;
}

export const PatientDataInboxTab: React.FC<PatientDataInboxTabProps> = ({ patient }) => {
  const {
    state,
    addDataInboxItem,
    confirmInboxItemPatient,
    runDataInboxExtraction,
    decideInboxExtractedField,
    commitVerifiedInboxItem,
    openPatient,
    setPatientTab,
    notify,
  } = useAppState();

  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [showAdapters, setShowAdapters] = useState<boolean>(true);
  const [showCustomUpload, setShowCustomUpload] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customOrg, setCustomOrg] = useState('Bengaluru External Clinic (Synthetic)');
  const [customRawText, setCustomRawText] = useState('');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editDraftValue, setEditDraftValue] = useState<string>('');

  const scopedItems = useMemo(() => {
    const list = state.dataInboxItems || [];
    if (!patient) return list;
    return list.filter(
      (item) =>
        item.confirmedPatientId === patient.id ||
        item.candidatePatientIds.includes(patient.id) ||
        item.extractedIdentity.fullName.toLowerCase() === patient.fullName.toLowerCase()
    );
  }, [patient, state.dataInboxItems]);

  const activeItem: PatientDataInboxItem | undefined =
    scopedItems.find((i) => i.id === selectedItemId) || scopedItems[0];

  const handleLoadSyntheticTemplate = (templateId: string) => {
    const tpl = SYNTHETIC_DOCUMENT_TEMPLATES.find((t) => t.templateId === templateId);
    if (!tpl) return;
    const item = createSyntheticInboxItemFromTemplate(tpl, state.patients, {
      targetPatient: patient,
    });
    addDataInboxItem(item);
    setSelectedItemId(item.id);
  };

  const handleCustomSyntheticUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customRawText.trim()) {
      notify('error', 'Enter a synthetic document title and excerpt text.');
      return;
    }
    const category = classifySyntheticDocument(customTitle, customRawText);
    const identity = patient
      ? { fullName: patient.fullName, dob: patient.dob, phone: patient.phone }
      : { fullName: 'Unmatched Synthetic Patient' };

    const newItem: PatientDataInboxItem = {
      id: `inbox-custom-${Date.now()}`,
      title: `${customTitle.trim()} (Synthetic Upload)`,
      category,
      sourceAdapter: 'Synthetic Local Upload',
      sourceOrganization: customOrg.trim() || 'Local Synthetic Upload',
      receivedAt: '2026-11-18 09:40 IST',
      documentDate: '2026-11-15',
      rawPreviewText: customRawText.trim(),
      extractedIdentity: identity,
      candidatePatientIds: patient ? [patient.id] : [],
      confirmedPatientId: undefined,
      status: 'Classified',
      extractedFields: [
        {
          id: `extf-custom-${Date.now()}-1`,
          label: `${category} Summary Note`,
          value: customRawText.trim().slice(0, 140),
          targetSection: 'History',
          sourceSnippet: customRawText.trim().slice(0, 160),
          confidence: 'Medium',
          uncertain: true,
          uncertaintyReason:
            'Free-text synthetic upload requires human verification before filing into the patient record.',
          decision: 'Pending',
          metadata: {
            historyCategory: 'Medical',
            title: customTitle.trim(),
          },
        },
      ],
    };
    addDataInboxItem(newItem);
    setSelectedItemId(newItem.id);
    setCustomTitle('');
    setCustomRawText('');
    setShowCustomUpload(false);
  };

  const identityCandidates = useMemo(() => {
    if (!activeItem) return [];
    const evals = evaluateDuplicateSafety(state.patients, {
      fullName: activeItem.extractedIdentity.fullName,
      dob: activeItem.extractedIdentity.dob || '',
      phone: activeItem.extractedIdentity.phone,
      abhaId: activeItem.extractedIdentity.abhaOptional,
    });
    if (evals.length > 0) return evals;
    return activeItem.candidatePatientIds
      .map((id) => state.patients.find((p) => p.id === id))
      .filter((p): p is Patient => Boolean(p))
      .map((p) => ({
        patient: p,
        score: 70,
        reasons: ['Selected chart context'],
        tier: 'Possible Duplicate — Review Required' as const,
        mergeAllowed: true,
        safetyExplanation: 'Confirm DOB and phone number against the original document before filing.',
      }));
  }, [activeItem, state.patients]);

  const approvedCount = activeItem
    ? activeItem.extractedFields.filter(
        (f) => f.decision === 'Accepted' || f.decision === 'Corrected'
      ).length
    : 0;
  const pendingCount = activeItem
    ? activeItem.extractedFields.filter((f) => f.decision === 'Pending').length
    : 0;

  return (
    <div data-demo-target="patient-data-inbox" className="space-y-4 text-xs">
      {/* Header & Synthetic Intake Controls */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Inbox className="w-4 h-4 text-[#185FA5]" />
              <h2 className="text-sm font-semibold text-[#042C53]">
                Universal Patient Data Inbox
                {patient ? ` · ${patient.fullName}` : ' · All Incoming Documents'}
              </h2>
              <StatusBadge label="Synthetic Local Intake Active" tone="blue" />
              <StatusBadge label="Simulated AI Extraction (Deterministic Fixture)" tone="neutral" />
            </div>
            <p className="text-[11px] text-[#5F5D56] mt-1 max-w-3xl">
              Collect external lab reports, imaging summaries, pharmacy records, and prior histories through an adapter-based inbox. Prototype classification and structured candidate extraction use deterministic local fixtures (not live OCR/LLM inference or live external HIE feeds); staff verify identity and approve every field before updating the Patient 360° Profile.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowAdapters((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-slate-300 text-[#042C53] rounded-md hover:bg-slate-50 font-medium"
            >
              <Layers className="w-3.5 h-3.5 text-[#185FA5]" />
              {showAdapters ? 'Hide' : 'Show'} Source Adapters ({DATA_SOURCE_ADAPTERS.length})
            </button>
            <button
              type="button"
              onClick={() => setShowCustomUpload((v) => !v)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#185FA5] text-[#185FA5] rounded-md hover:bg-[#E6F1FB] font-medium"
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload Custom Synthetic Text
            </button>
          </div>
        </div>

        {/* Quick Synthetic Document Intake Bar */}
        <div className="bg-[#F7F7F5] border border-slate-200 rounded-md p-3 space-y-2">
          <div className="text-[11px] font-semibold text-[#042C53]">
            Ingest Synthetic Patient Documents (Demo Intake Samples)
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-demo-target="inbox-upload-lab-btn"
              onClick={() => handleLoadSyntheticTemplate('tpl-in-metropolis-lab')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#042C53] hover:bg-[#185FA5] text-white font-medium rounded-md"
            >
              <FileUp className="w-3.5 h-3.5" />
              + Lab PDF (Metropolis HbA1c & Renal)
            </button>
            <button
              type="button"
              data-demo-target="inbox-upload-history-btn"
              onClick={() => handleLoadSyntheticTemplate('tpl-in-prior-history-summary')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-[#185FA5] text-[#042C53] font-medium rounded-md"
            >
              <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
              + Prior Clinic & Pharmacy Summary
            </button>
            <button
              type="button"
              data-demo-target="inbox-upload-imaging-btn"
              onClick={() => handleLoadSyntheticTemplate('tpl-in-imaging-usg')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-[#185FA5] text-[#042C53] font-medium rounded-md"
            >
              <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
              + Abdominal Ultrasound Report
            </button>
            <button
              type="button"
              data-demo-target="inbox-upload-pharmacy-btn"
              onClick={() => handleLoadSyntheticTemplate('tpl-in-pharmacy-rx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:border-[#185FA5] text-[#042C53] font-medium rounded-md"
            >
              <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
              + MedPlus Pharmacy Dispense Record
            </button>
          </div>
        </div>

        {/* Custom Upload Drawer */}
        {showCustomUpload && (
          <form
            onSubmit={handleCustomSyntheticUpload}
            className="p-3 bg-[#E6F1FB]/40 border border-[#85B7EB] rounded-md space-y-2.5"
          >
            <div className="font-semibold text-[#042C53]">
              Upload Custom Synthetic Medical Document (Auto-Classified)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="text"
                aria-label="Synthetic document title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Document title (e.g. Thyroid Function Lab Report)"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              />
              <input
                type="text"
                aria-label="Source organization"
                value={customOrg}
                onChange={(e) => setCustomOrg(e.target.value)}
                placeholder="Source lab / clinic / hospital"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded"
              />
            </div>
            <textarea
              rows={3}
              aria-label="Synthetic document text"
              value={customRawText}
              onChange={(e) => setCustomRawText(e.target.value)}
              placeholder="Paste synthetic medical report excerpt (never real PHI)..."
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded font-mono text-[11px]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomUpload(false)}
                className="px-2.5 py-1 border border-slate-300 rounded bg-white text-[#042C53]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-[#185FA5] text-white font-medium rounded"
              >
                Classify & Add to Inbox
              </button>
            </div>
          </form>
        )}

        {/* Honest Adapter Architecture Registry */}
        {showAdapters && (
          <div
            data-demo-target="inbox-adapter-registry"
            className="pt-2 border-t border-slate-100 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#5F5D56]">
                Adapter-Based Data Source Architecture (Honest Connection Status)
              </span>
              <span className="text-[11px] text-[#5F5D56]">
                No live external networks connected in prototype
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {DATA_SOURCE_ADAPTERS.map((adapter) => {
                const isActive = adapter.status.startsWith('Active');
                return (
                  <div
                    key={adapter.id}
                    className={`p-2.5 rounded-md border ${
                      isActive
                        ? 'bg-teal-50/60 border-teal-200'
                        : 'bg-[#F7F7F5] border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <span className="font-semibold text-[#042C53] leading-snug">
                        {adapter.name}
                      </span>
                    </div>
                    <div className="mt-1">
                      <StatusBadge
                        label={adapter.status}
                        tone={isActive ? 'success' : 'neutral'}
                      />
                    </div>
                    <p className="text-[11px] text-[#5F5D56] mt-1 leading-snug">
                      {adapter.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Main Split Workspace: Document Queue (Left) + Extraction & Verification Workbench (Right) */}
      {scopedItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8">
          <EmptyState
            title="No incoming documents in Patient Data Inbox"
            description="Select one of the synthetic sample reports above (Metropolis Lab PDF, Prior Clinic Summary, Ultrasound, or Pharmacy Record) or upload custom synthetic text to run classification, AI extraction, and human verification."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Queue */}
          <aside className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 h-fit">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#5F5D56] px-1">
              Incoming Queue ({scopedItems.length})
            </div>
            <div className="space-y-1.5">
              {scopedItems.map((item) => {
                const isSelected = activeItem?.id === item.id;
                const uncertainCount = item.extractedFields.filter((f) => f.uncertain).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-demo-target={`inbox-queue-item-${item.id}`}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-[#E6F1FB]/70 border-[#185FA5]'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-[#042C53] leading-snug">
                        {item.title}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <StatusBadge
                        label={item.status}
                        tone={
                          item.status === 'Verified & Consolidated'
                            ? 'success'
                            : item.status === 'AI Extracted'
                            ? 'blue'
                            : 'warning'
                        }
                      />
                      <span className="px-1.5 py-0.5 bg-slate-100 text-[#444441] rounded text-[10px] font-medium">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#5F5D56] mt-1">
                      {item.sourceOrganization} · {item.documentDate}
                      {uncertainCount > 0 && item.status !== 'Verified & Consolidated' && (
                        <span className="text-[#9A5B10] font-semibold">
                          {' '}
                          · {uncertainCount} uncertain
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Right Verification Workbench */}
          {activeItem && (
            <section className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
              {/* Document Metadata Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#042C53]">{activeItem.title}</h3>
                    <StatusBadge
                      label={activeItem.status}
                      tone={
                        activeItem.status === 'Verified & Consolidated'
                          ? 'success'
                          : activeItem.status === 'AI Extracted'
                          ? 'blue'
                          : 'warning'
                      }
                    />
                  </div>
                  <div className="text-[11px] text-[#5F5D56] mt-1">
                    Category: <strong className="text-[#042C53]">{activeItem.category}</strong> ·
                    Source: {activeItem.sourceOrganization} · Adapter: {activeItem.sourceAdapter} ·
                    Document Date: <span className="font-mono">{activeItem.documentDate}</span>
                  </div>
                </div>
                {activeItem.verifiedBy && (
                  <div className="text-[11px] text-[#0F6E50] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded inline-flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    Verified by {activeItem.verifiedBy}
                  </div>
                )}
              </div>

              {/* Step A: Patient Identity Match Confirmation */}
              <div className="p-3 bg-[#F7F7F5] border border-slate-200 rounded-lg space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#185FA5]" />
                    Step 1 · Confirm Patient Identity Before Filing
                  </div>
                  {activeItem.confirmedPatientId ? (
                    <StatusBadge label="Patient Match Confirmed" tone="success" />
                  ) : (
                    <StatusBadge label="Human Confirmation Required" tone="warning" />
                  )}
                </div>

                <div className="text-[11px] text-[#444441] font-mono bg-white border border-slate-200 rounded px-2.5 py-1.5">
                  Document Header Identity: {activeItem.extractedIdentity.fullName}
                  {activeItem.extractedIdentity.dob
                    ? ` · DOB ${activeItem.extractedIdentity.dob}`
                    : ' · DOB not printed'}
                  {activeItem.extractedIdentity.phone
                    ? ` · Phone ${activeItem.extractedIdentity.phone}`
                    : ''}
                </div>

                <div className="space-y-1.5">
                  {identityCandidates.map((cand) => {
                    const isConfirmed = activeItem.confirmedPatientId === cand.patient.id;
                    const isNameOnly = !cand.mergeAllowed;
                    return (
                      <div
                        key={cand.patient.id}
                        className={`p-2.5 rounded border flex flex-wrap items-center justify-between gap-2 ${
                          isConfirmed
                            ? 'bg-teal-50/70 border-teal-300'
                            : isNameOnly
                            ? 'bg-amber-50/70 border-amber-300'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-[#042C53] flex flex-wrap items-center gap-1.5">
                            <span>
                              {cand.patient.fullName} ({cand.patient.mrn})
                            </span>
                            <StatusBadge
                              label={cand.tier}
                              tone={isNameOnly ? 'warning' : 'blue'}
                            />
                          </div>
                          <div className="text-[11px] font-mono text-[#5F5D56]">
                            DOB {cand.patient.dob} · Phone {cand.patient.phone}
                          </div>
                        </div>
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F6E50]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Confirmed Target Chart
                          </span>
                        ) : isNameOnly ? (
                          <span className="text-[11px] text-[#9A5B10] font-medium inline-flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Different DOB/Phone — Do Not File Here
                          </span>
                        ) : (
                          <button
                            type="button"
                            data-demo-target="inbox-confirm-patient-btn"
                            onClick={() =>
                              confirmInboxItemPatient(activeItem.id, cand.patient.id)
                            }
                            className="px-2.5 py-1 bg-[#185FA5] hover:bg-[#042C53] text-white font-medium rounded"
                          >
                            Confirm Match ({cand.patient.mrn})
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Original Raw Document Preview */}
              <details open className="border border-slate-200 rounded-lg overflow-hidden">
                <summary className="px-3 py-2 bg-[#F7F7F5] text-[11px] font-semibold text-[#042C53] cursor-pointer select-none">
                  Original Source Document Preview ({activeItem.sourceOrganization})
                </summary>
                <pre className="p-3 bg-white text-[11px] font-mono text-[#042C53] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                  {activeItem.rawPreviewText}
                </pre>
              </details>

              {/* Step B: AI Extraction & Per-Field Human Verification */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#042C53] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#0F6E50]" />
                      Step 2 · Simulated AI Extraction (Fixture) & Human Verification
                    </div>
                    <div className="text-[11px] text-[#5F5D56]">
                      Deterministic prototype extraction prepares draft candidates from the synthetic document. Review every value against the source preview and Accept, Correct, or Reject before saving.
                    </div>
                  </div>
                  {activeItem.status === 'Classified' || activeItem.status === 'Uploaded' ? (
                    <button
                      type="button"
                      data-demo-target="inbox-run-extraction-btn"
                      onClick={() => runDataInboxExtraction(activeItem.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0F6E50] hover:bg-[#042C53] text-white font-semibold rounded-md"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Run Simulated AI Extraction (Draft)
                    </button>
                  ) : (
                    <StatusBadge
                      label={`${approvedCount} Approved · ${pendingCount} Pending`}
                      tone={pendingCount === 0 ? 'success' : 'blue'}
                    />
                  )}
                </div>

                {(activeItem.status === 'AI Extracted' ||
                  activeItem.status === 'Verified & Consolidated') && (
                  <div
                    data-demo-target="inbox-extracted-fields"
                    className="space-y-2.5"
                  >
                    {activeItem.extractedFields.map((field, idx) => {
                      const isEditing = editingFieldId === field.id;
                      const isUncertain = field.uncertain;
                      return (
                        <div
                          key={field.id}
                          data-demo-target={
                            isUncertain
                              ? 'inbox-field-uncertain'
                              : `inbox-field-row-${idx}`
                          }
                          className={`p-3 rounded-lg border space-y-2 ${
                            field.decision === 'Accepted' || field.decision === 'Corrected'
                              ? 'bg-teal-50/40 border-teal-200'
                              : field.decision === 'Rejected'
                              ? 'bg-slate-50 border-slate-200 opacity-75'
                              : isUncertain
                              ? 'bg-amber-50/70 border-amber-300'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-[#E6F1FB] text-[#042C53] text-[10px] font-semibold rounded">
                                  {field.targetSection}
                                </span>
                                <span className="font-semibold text-[#042C53]">
                                  {field.label}
                                </span>
                                {isUncertain && (
                                  <StatusBadge
                                    label="Uncertain — Review Required"
                                    tone="warning"
                                  />
                                )}
                                <StatusBadge
                                  label={
                                    field.decision === 'Pending'
                                      ? `Simulated AI Draft (${field.confidence})`
                                      : field.decision
                                  }
                                  tone={
                                    field.decision === 'Accepted' ||
                                    field.decision === 'Corrected'
                                      ? 'success'
                                      : field.decision === 'Rejected'
                                      ? 'neutral'
                                      : 'blue'
                                  }
                                />
                              </div>

                              {isEditing ? (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <input
                                    type="text"
                                    aria-label={`Edit value for ${field.label}`}
                                    value={editDraftValue}
                                    onChange={(e) => setEditDraftValue(e.target.value)}
                                    className="px-2 py-1 border border-[#185FA5] rounded bg-white text-xs w-80"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      decideInboxExtractedField(
                                        activeItem.id,
                                        field.id,
                                        'Corrected',
                                        editDraftValue
                                      );
                                      setEditingFieldId(null);
                                    }}
                                    className="px-2 py-1 bg-[#0F6E50] text-white rounded text-[11px] font-medium"
                                  >
                                    Save Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingFieldId(null)}
                                    className="px-2 py-1 border border-slate-300 rounded text-[11px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="text-xs font-medium text-[#042C53]">
                                  {field.correctedValue || field.value}
                                </div>
                              )}
                            </div>

                            {activeItem.status !== 'Verified & Consolidated' && !isEditing && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  data-demo-target={`inbox-field-accept-${idx}`}
                                  onClick={() =>
                                    decideInboxExtractedField(
                                      activeItem.id,
                                      field.id,
                                      'Accepted'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#0F6E50] hover:bg-[#042C53] text-white rounded text-[11px] font-medium"
                                >
                                  <Check className="w-3 h-3" />
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingFieldId(field.id);
                                    setEditDraftValue(field.correctedValue || field.value);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 border border-slate-300 bg-white text-[#042C53] rounded text-[11px] hover:bg-slate-50"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  Correct
                                </button>
                                <button
                                  type="button"
                                  data-demo-target={
                                    isUncertain
                                      ? 'inbox-field-reject-uncertain'
                                      : `inbox-field-reject-${idx}`
                                  }
                                  onClick={() =>
                                    decideInboxExtractedField(
                                      activeItem.id,
                                      field.id,
                                      'Rejected'
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1 border border-red-200 bg-red-50 text-[#B4321F] rounded text-[11px] hover:bg-red-100"
                                >
                                  <X className="w-3 h-3" />
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="text-[11px] font-mono text-[#5F5D56] bg-white/80 border border-slate-100 rounded px-2 py-1">
                            Source excerpt: “{field.sourceSnippet}”
                          </div>

                          {field.uncertaintyReason && (
                            <div className="text-[11px] text-[#9A5B10] flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>
                                <strong>Why flagged uncertain:</strong> {field.uncertaintyReason}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Commit Verified Record Footer */}
                {activeItem.status === 'AI Extracted' && (
                  <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[#5F5D56]">
                      Only <strong>Accepted</strong> or <strong>Corrected</strong> fields are written to the Patient 360° Profile, Timeline, and Knowledge Graph.
                    </span>
                    <button
                      type="button"
                      data-demo-target="inbox-save-verified-btn"
                      onClick={() => commitVerifiedInboxItem(activeItem.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#042C53] hover:bg-[#185FA5] text-white font-semibold rounded-md"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Save Verified Record ({approvedCount} Approved)
                    </button>
                  </div>
                )}

                {activeItem.status === 'Verified & Consolidated' && activeItem.confirmedPatientId && (
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[#0F6E50] font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Consolidated into Patient 360° Profile, Timeline & Patient Knowledge Graph with full provenance.
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          patient
                            ? setPatientTab('overview')
                            : openPatient(activeItem.confirmedPatientId!, 'overview')
                        }
                        className="px-2.5 py-1 bg-white border border-teal-300 text-[#042C53] font-medium rounded hover:bg-teal-100"
                      >
                        View Patient 360° Profile
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          patient
                            ? setPatientTab('knowledge-graph')
                            : openPatient(activeItem.confirmedPatientId!, 'knowledge-graph')
                        }
                        className="px-2.5 py-1 bg-[#042C53] text-white font-medium rounded hover:bg-[#185FA5]"
                      >
                        Open Knowledge Graph
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
