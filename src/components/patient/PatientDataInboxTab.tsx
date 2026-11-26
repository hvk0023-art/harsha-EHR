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
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { analyzeDocumentWithClinicalAi } from '../../ai/clinicalAiService';
import type { ClinicalAIExecutionMode, ClinicalAIResponse, DocumentIntelligenceOutput } from '../../ai/clinicalAiTypes';
import { useAppState } from '../../state/AppStateContext';
import {
  classifySyntheticDocument,
  createSyntheticInboxItemFromTemplate,
  DATA_SOURCE_ADAPTERS,
  evaluateDuplicateSafety,
  SYNTHETIC_DOCUMENT_TEMPLATES,
} from '../../state/registrationIntelligence';
import type { Patient, PatientDataInboxItem } from '../../types/hms';
import {
  ClinicalAiErrorBanner,
  ClinicalAiModeToggle,
  ClinicalAiProvenanceBar,
  useClinicalAiFlags,
} from '../ai/ClinicalAiControls';
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
    applyAiDocumentAnalysis,
    decideInboxExtractedField,
    commitVerifiedInboxItem,
    openPatient,
    setPatientTab,
    notify,
  } = useAppState();
  const { flags, updateFlags, serverStatus } = useClinicalAiFlags();

  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [showAdapters, setShowAdapters] = useState<boolean>(true);
  const [showCustomUpload, setShowCustomUpload] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customOrg, setCustomOrg] = useState('Bengaluru External Clinic (Synthetic)');
  const [customRawText, setCustomRawText] = useState('');
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editDraftValue, setEditDraftValue] = useState<string>('');
  const [analyzingAi, setAnalyzingAi] = useState<boolean>(false);
  const [lastAiResponse, setLastAiResponse] = useState<ClinicalAIResponse<DocumentIntelligenceOutput> | null>(null);

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

  const handleLocalTextFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|csv|json)$/i.test(file.name)) {
      notify(
        'warning',
        'Local upload supports plain synthetic text files (.txt, .md, .csv, .json). Binary PDF/image OCR is not claimed in this prototype.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      if (!content.trim()) {
        notify('error', 'Selected text file is empty.');
        return;
      }
      setCustomTitle(file.name.replace(/\.[^.]+$/, ''));
      setCustomRawText(content.slice(0, 12000));
      notify('info', `Loaded local synthetic text file "${file.name}" for AI extraction.`);
    };
    reader.readAsText(file);
  };

  const handleAnalyzeWithAi = async (modeOverride?: ClinicalAIExecutionMode) => {
    if (!activeItem) return;
    setAnalyzingAi(true);
    setLastAiResponse(null);
    const resp = await analyzeDocumentWithClinicalAi(
      state,
      {
        documentId: activeItem.id,
        title: activeItem.title,
        sourceOrganization: activeItem.sourceOrganization,
        documentDate: activeItem.documentDate,
        rawText: activeItem.rawPreviewText,
        expectedPatientContext: patient
          ? {
              patientId: patient.id,
              fullName: patient.fullName,
              dob: patient.dob,
              mrn: patient.mrn,
            }
          : undefined,
      },
      { modeOverride, flags }
    );
    setLastAiResponse(resp);
    setAnalyzingAi(false);

    if (resp.ok && resp.data) {
      const d = resp.data;
      applyAiDocumentAnalysis(activeItem.id, {
        documentType:
          d.documentType === 'Prescription Document' ? 'Medication Record' : d.documentType,
        documentDate: d.documentDate,
        laboratoryOrFacilityIdentity: d.laboratoryOrFacilityIdentity,
        extractedPatientIdentity: d.extractedPatientIdentity,
        summary: d.summary,
        labMeasurements: d.labMeasurements.map((m) => ({
          ...m,
          flag: m.flag === 'Unspecified' ? 'Not Stated' : m.flag,
        })),
        extractedFields: d.extractedFields.map((f, idx) => ({
          id: `${activeItem.id}-ai-${idx}-${f.id}`,
          label: f.label,
          value: f.value,
          targetSection: f.targetSection,
          sourceSnippet: f.sourceSnippet,
          confidence: f.confidence,
          uncertain: f.uncertain,
          uncertaintyReason: f.uncertaintyReason,
          decision: 'Pending',
          metadata: {
            ...(f.originalUnit ? { unit: f.originalUnit } : {}),
            ...(f.referenceRange ? { referenceInterval: f.referenceRange } : {}),
            testName: f.label,
            value: f.value,
          },
        })),
        missingOrAmbiguousFlags: d.missingOrAmbiguousFlags,
        identitySafetyNote: d.identitySafetyNote,
        executionMode: resp.executionMode,
        modelId: resp.modelId,
        requestId: resp.requestId,
      });
    } else if (resp.error) {
      notify('error', resp.error.message);
    }
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
      {/* Compact Header, Quick Intake Controls & Slim Adapter Status Strip */}
      <section className="eigen-card p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E6F1FB] text-[#185FA5] flex items-center justify-center shrink-0">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[#042C53]">
                  Universal Patient Data Inbox
                  {patient ? ` · ${patient.fullName}` : ' · All Incoming Documents'}
                </h2>
                <StatusBadge label="Synthetic Local Intake Active" tone="blue" />
                <StatusBadge
                  label={flags.executionMode === 'live-ai' ? 'Live AI — Synthetic Data Only' : 'Deterministic Demo'}
                  tone={flags.executionMode === 'live-ai' ? 'success' : 'neutral'}
                />
              </div>
              <p className="text-xs text-[#5F5D56] mt-0.5 max-w-3xl">
                Collect synthetic lab reports, discharge summaries, imaging summaries, pharmacy records, and consultation notes. Analyze with Live AI (Gemini) or Deterministic Demo, then verify identity and approve every field before saving.
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
              onClick={() => setShowAdapters((v) => !v)}
              className="eigen-btn-secondary text-xs py-1.5 px-3"
            >
              <Layers className="w-3.5 h-3.5 text-[#185FA5]" />
              {showAdapters ? 'Hide' : 'Show'} Adapters ({DATA_SOURCE_ADAPTERS.length})
            </button>
            <button
              type="button"
              onClick={() => setShowCustomUpload((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#185FA5]/35 bg-[#E6F1FB]/50 text-[#185FA5] rounded-xl hover:bg-[#E6F1FB] font-medium transition-colors"
            >
              <FileUp className="w-3.5 h-3.5" />
              Upload Custom Synthetic Text
            </button>
          </div>
        </div>

        {/* Quick Synthetic Document Intake Action Bar */}
        <div className="eigen-card-subtle p-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56] mr-1">
            Ingest Sample:
          </span>
          <button
            type="button"
            data-demo-target="inbox-upload-lab-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-metropolis-lab')}
            className="eigen-btn-navy text-xs py-1.5 px-3"
          >
            <FileUp className="w-3.5 h-3.5" />
            + Lab PDF (Metropolis HbA1c & Renal)
          </button>
          <button
            type="button"
            data-demo-target="inbox-upload-history-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-prior-history-summary')}
            className="eigen-btn-secondary text-xs py-1.5 px-3"
          >
            <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
            + Prior Clinic & Pharmacy Summary
          </button>
          <button
            type="button"
            data-demo-target="inbox-upload-imaging-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-imaging-usg')}
            className="eigen-btn-secondary text-xs py-1.5 px-3"
          >
            <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
            + Abdominal Ultrasound Report
          </button>
          <button
            type="button"
            data-demo-target="inbox-upload-pharmacy-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-pharmacy-rx')}
            className="eigen-btn-secondary text-xs py-1.5 px-3"
          >
            <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
            + MedPlus Pharmacy Dispense Record
          </button>
          <button
            type="button"
            data-demo-target="inbox-upload-discharge-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-discharge-summary')}
            className="eigen-btn-secondary text-xs py-1.5 px-3"
          >
            <FileText className="w-3.5 h-3.5 text-[#0F6E50]" />
            + Cardiology/Renal Discharge Summary
          </button>
          <button
            type="button"
            data-demo-target="inbox-upload-consult-btn"
            onClick={() => handleLoadSyntheticTemplate('tpl-in-consult-note')}
            className="eigen-btn-secondary text-xs py-1.5 px-3"
          >
            <FileText className="w-3.5 h-3.5 text-[#0F6E50]" />
            + Nephrology Consult Note
          </button>
        </div>

        {/* Custom Upload Drawer */}
        {showCustomUpload && (
          <form
            onSubmit={handleCustomSyntheticUpload}
            className="p-3.5 bg-[#E6F1FB]/40 border border-[#85B7EB]/70 rounded-xl space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-[#042C53]">
                Upload Custom Synthetic Medical Document (Auto-Classified)
              </div>
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-[#185FA5]/30 text-[#185FA5] rounded-lg cursor-pointer hover:bg-[#E6F1FB] text-[11px] font-medium">
                <FileUp className="w-3 h-3" />
                Load Local .txt / .md File
                <input
                  type="file"
                  accept=".txt,.md,.csv,.json"
                  onChange={handleLocalTextFileSelect}
                  className="sr-only"
                />
              </label>
            </div>
            <p className="text-[11px] text-[#5F5D56]">
              Synthetic text only (never real PHI). Local file upload reads plain text documents; binary scanned PDF/image OCR is not claimed in this prototype.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <input
                type="text"
                aria-label="Synthetic document title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Document title (e.g. Thyroid Function Lab Report)"
                className="eigen-input"
              />
              <input
                type="text"
                aria-label="Source organization"
                value={customOrg}
                onChange={(e) => setCustomOrg(e.target.value)}
                placeholder="Source lab / clinic / hospital"
                className="eigen-input"
              />
            </div>
            <textarea
              rows={3}
              aria-label="Synthetic document text"
              value={customRawText}
              onChange={(e) => setCustomRawText(e.target.value)}
              placeholder="Paste synthetic medical report excerpt (never real PHI)..."
              className="eigen-input w-full font-mono text-[11px]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCustomUpload(false)}
                className="eigen-btn-secondary text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button type="submit" className="eigen-btn-primary text-xs py-1.5 px-3.5">
                Classify & Add to Inbox
              </button>
            </div>
          </form>
        )}

        {/* Compact Adapter Status Strip (keeps main verification workbench above the fold) */}
        {showAdapters && (
          <div
            data-demo-target="inbox-adapter-registry"
            className="pt-2.5 border-t border-[#042C53]/8 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                Adapter-Based Data Source Architecture · Honest Connection Status
              </span>
              <span className="text-[11px] text-[#5F5D56]">
                No live external HIE/LIS/ABDM networks connected in prototype
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {DATA_SOURCE_ADAPTERS.map((adapter) => {
                const isActive = adapter.status.startsWith('Active');
                return (
                  <div
                    key={adapter.id}
                    title={adapter.description}
                    className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 ${
                      isActive
                        ? 'bg-emerald-50/55 border-emerald-200/80'
                        : 'bg-[#FAF9F6] border-[#042C53]/8'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#042C53] truncate">
                        {adapter.name}
                      </div>
                      <div className="text-[10px] text-[#5F5D56] truncate">
                        {adapter.description}
                      </div>
                    </div>
                    <StatusBadge
                      label={isActive ? 'Active (Local)' : 'Planned'}
                      tone={isActive ? 'success' : 'neutral'}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Main 3-Panel Desktop Verification Workspace (Queue | Source Preview & Match | Extracted Field Verification) */}
      {scopedItems.length === 0 ? (
        <div className="eigen-card p-10">
          <EmptyState
            title="No incoming documents in Patient Data Inbox"
            description="Select one of the synthetic sample reports above (Metropolis Lab PDF, Prior Clinic Summary, Ultrasound, or Pharmacy Record) or upload custom synthetic text to run classification, simulated extraction, and human verification."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Panel 1: Incoming Document Queue */}
          <aside className="lg:col-span-3 eigen-card p-3.5 space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5F5D56]">
                Incoming Queue
              </span>
              <span className="font-mono text-[11px] font-semibold text-[#042C53] bg-[#F6F6F2] px-2 py-0.5 rounded-full">
                {scopedItems.length}
              </span>
            </div>
            <div className="space-y-2">
              {scopedItems.map((item) => {
                const isSelected = activeItem?.id === item.id;
                const uncertainCount = item.extractedFields.filter((f) => f.uncertain).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-demo-target={`inbox-queue-item-${item.id}`}
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-[#E6F1FB]/55 border-[#185FA5] shadow-xs ring-1 ring-[#185FA5]/20'
                        : 'bg-[#FAF9F6] border-[#042C53]/8 hover:bg-white hover:border-[#042C53]/20'
                    }`}
                  >
                    <div className="font-semibold text-[#042C53] leading-snug text-xs">
                      {item.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
                      <span className="px-2 py-0.5 bg-white border border-[#042C53]/10 text-[#444441] rounded-full text-[10px] font-medium">
                        {item.category}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#5F5D56] mt-1.5 flex items-center justify-between gap-1">
                      <span className="truncate">{item.sourceOrganization}</span>
                      <span className="font-mono shrink-0">{item.documentDate}</span>
                    </div>
                    {uncertainCount > 0 && item.status !== 'Verified & Consolidated' && (
                      <div className="mt-1.5 text-[10px] text-[#9A5B10] font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {uncertainCount} uncertain field{uncertainCount > 1 ? 's' : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Panels 2 & 3: Active Document Review Workbench */}
          {activeItem && (
            <div className="lg:col-span-9 space-y-4">
              {/* Active Document Header Strip */}
              <div className="eigen-card p-4 flex flex-wrap items-start justify-between gap-3">
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
                  <div className="text-[11px] text-[#5F5D56] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>
                      Category: <strong className="text-[#042C53]">{activeItem.category}</strong>
                    </span>
                    <span>·</span>
                    <span>Source: {activeItem.sourceOrganization}</span>
                    <span>·</span>
                    <span>Adapter: {activeItem.sourceAdapter}</span>
                    <span>·</span>
                    <span className="font-mono">Date: {activeItem.documentDate}</span>
                  </div>
                </div>
                {activeItem.verifiedBy && (
                  <div className="text-[11px] text-[#0F6E50] bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 font-medium">
                    <UserCheck className="w-3.5 h-3.5" />
                    Verified by {activeItem.verifiedBy}
                  </div>
                )}
              </div>

              {/* Split Review Grid: Center Source & Identity (col-5) | Right Extracted Proposals (col-7) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
                {/* Panel 2: Identity Confirmation + Original Source Document Preview */}
                <div className="xl:col-span-5 space-y-4">
                  {/* Step 1: Patient Identity Match Confirmation */}
                  <section className="eigen-card p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-[#042C53] flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="w-4 h-4 text-[#185FA5]" />
                        Step 1 · Confirm Patient Identity
                      </div>
                      {activeItem.confirmedPatientId ? (
                        <StatusBadge label="Confirmed" tone="success" />
                      ) : (
                        <StatusBadge label="Review Required" tone="warning" />
                      )}
                    </div>

                    <div className="text-[11px] text-[#444441] font-mono bg-[#FAF9F6] border border-[#042C53]/8 rounded-xl px-3 py-2 leading-relaxed">
                      <span className="text-[10px] uppercase tracking-wider text-[#5F5D56] block font-sans font-semibold mb-0.5">
                        Document Header Identity
                      </span>
                      {activeItem.extractedIdentity.fullName}
                      {activeItem.extractedIdentity.dob
                        ? ` · DOB ${activeItem.extractedIdentity.dob}`
                        : ' · DOB not printed'}
                      {activeItem.extractedIdentity.phone
                        ? ` · ${activeItem.extractedIdentity.phone}`
                        : ''}
                    </div>

                    <div className="space-y-2">
                      {identityCandidates.map((cand) => {
                        const isConfirmed = activeItem.confirmedPatientId === cand.patient.id;
                        const isNameOnly = !cand.mergeAllowed;
                        return (
                          <div
                            key={cand.patient.id}
                            className={`p-3 rounded-xl border space-y-2 ${
                              isConfirmed
                                ? 'bg-emerald-50/55 border-emerald-200'
                                : isNameOnly
                                ? 'bg-amber-50/65 border-amber-200'
                                : 'bg-white border-[#042C53]/10'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1.5">
                              <div>
                                <div className="font-semibold text-[#042C53]">
                                  {cand.patient.fullName}{' '}
                                  <span className="font-mono text-[11px] font-normal text-[#5F5D56]">
                                    ({cand.patient.mrn})
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-[#5F5D56] mt-0.5">
                                  DOB {cand.patient.dob} · {cand.patient.phone}
                                </div>
                              </div>
                              <StatusBadge
                                label={cand.tier}
                                tone={isNameOnly ? 'warning' : 'blue'}
                              />
                            </div>

                            <div className="pt-1">
                              {isConfirmed ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0F6E50]">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Confirmed Target Chart
                                </span>
                              ) : isNameOnly ? (
                                <span className="text-[11px] text-[#9A5B10] font-medium inline-flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                  Different DOB/Phone — Do Not File Here
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  data-demo-target="inbox-confirm-patient-btn"
                                  onClick={() =>
                                    confirmInboxItemPatient(activeItem.id, cand.patient.id)
                                  }
                                  className="eigen-btn-primary text-xs py-1.5 px-3 w-full justify-center"
                                >
                                  Confirm Match ({cand.patient.mrn})
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* Original Source Document Preview */}
                  <details open className="eigen-card overflow-hidden">
                    <summary className="px-4 py-3 bg-[#FAF9F6] border-b border-[#042C53]/8 text-xs font-semibold text-[#042C53] cursor-pointer select-none flex items-center justify-between">
                      <span>Original Source Document Preview</span>
                      <span className="text-[10px] font-normal text-[#5F5D56]">
                        {activeItem.sourceOrganization}
                      </span>
                    </summary>
                    <pre className="p-4 bg-white text-[11px] font-mono text-[#042C53] whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[380px]">
                      {activeItem.rawPreviewText}
                    </pre>
                  </details>
                </div>

                {/* Panel 3: Step 2 AI Extraction & Per-Field Human Verification */}
                <section className="xl:col-span-7 eigen-card p-4 sm:p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#042C53]/8">
                    <div>
                      <div className="font-semibold text-[#042C53] flex items-center gap-1.5 text-xs">
                        <Sparkles className="w-4 h-4 text-[#0F6E50]" />
                        Step 2 · AI Document Intelligence & Human Verification
                      </div>
                      <div className="text-[11px] text-[#5F5D56] mt-0.5">
                        Extract structured fields and lab measurements (original values &amp; units preserved; missing reference ranges never invented). Accept, Correct, or Reject every value before saving.
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeItem.status !== 'Verified & Consolidated' && (
                        <button
                          type="button"
                          data-demo-target="inbox-analyze-ai-btn"
                          disabled={analyzingAi || !flags.documentIntelligence}
                          onClick={() => void handleAnalyzeWithAi()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#042C53] hover:bg-[#185FA5] text-white font-semibold rounded-xl shadow-xs transition-colors disabled:opacity-50"
                        >
                          {analyzingAi ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          {analyzingAi
                            ? 'Analyzing...'
                            : flags.executionMode === 'live-ai'
                            ? 'Analyze with AI (Live)'
                            : 'Analyze with AI (Deterministic)'}
                        </button>
                      )}
                      {activeItem.status === 'Classified' || activeItem.status === 'Uploaded' ? (
                        <button
                          type="button"
                          data-demo-target="inbox-run-extraction-btn"
                          onClick={() => runDataInboxExtraction(activeItem.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0F6E50] hover:bg-[#042C53] text-white font-semibold rounded-xl shadow-xs transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          Run Fixture Extraction (Draft)
                        </button>
                      ) : (
                        <StatusBadge
                          label={`${approvedCount} Approved · ${pendingCount} Pending`}
                          tone={pendingCount === 0 ? 'success' : 'blue'}
                        />
                      )}
                    </div>
                  </div>

                  {lastAiResponse && lastAiResponse.ok && (
                    <ClinicalAiProvenanceBar
                      response={lastAiResponse}
                      reviewStatusOverride={
                        activeItem.status === 'Verified & Consolidated'
                          ? 'Human Approved — Verified into Chart'
                          : 'Draft — Human Review Required'
                      }
                    />
                  )}

                  {lastAiResponse && !lastAiResponse.ok && (
                    <ClinicalAiErrorBanner
                      response={lastAiResponse}
                      onRetry={() => void handleAnalyzeWithAi('live-ai')}
                      onSwitchDeterministic={() => void handleAnalyzeWithAi('deterministic-demo')}
                    />
                  )}

                  {activeItem.aiSummary && (
                    <div className="p-3 rounded-xl bg-[#EFF6FC]/70 border border-[#85B7EB]/50 text-[#042C53] space-y-1">
                      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#185FA5]">
                        AI-Prepared Document Summary ({activeItem.aiExecutionMode === 'live-ai' ? 'Live AI' : 'Deterministic Demo'} · {activeItem.aiModelId})
                      </div>
                      <p className="text-xs leading-relaxed">{activeItem.aiSummary}</p>
                    </div>
                  )}

                  {activeItem.aiMissingFlags && activeItem.aiMissingFlags.length > 0 && (
                    <div className="p-3 rounded-xl bg-[#FEF5E7] border border-[#C97A1B]/30 text-[#9A5B10] space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Missing / Ambiguous Information Detected
                      </div>
                      <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                        {activeItem.aiMissingFlags.map((flag, i) => (
                          <li key={i}>{flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeItem.aiLabMeasurements && activeItem.aiLabMeasurements.length > 0 && (
                    <div className="border border-[#042C53]/10 rounded-xl overflow-hidden">
                      <div className="px-3.5 py-2 bg-[#FAF9F6] border-b border-[#042C53]/8 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-[#042C53]">
                          Structured Lab Measurements (Original Values &amp; Units Preserved)
                        </span>
                        <span className="text-[10px] text-[#5F5D56]">
                          Missing reference ranges never invented
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[11px]">
                          <thead className="bg-[#F8F8F5] text-[#5F5D56] border-b border-[#042C53]/8">
                            <tr>
                              <th className="py-2 px-3 font-semibold">Test</th>
                              <th className="py-2 px-3 font-semibold">Original Value &amp; Unit</th>
                              <th className="py-2 px-3 font-semibold">Reference Range</th>
                              <th className="py-2 px-3 font-semibold">Date / Lab</th>
                              <th className="py-2 px-3 font-semibold">Flag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#042C53]/6 bg-white">
                            {activeItem.aiLabMeasurements.map((m, i) => (
                              <tr key={`${m.testName}-${i}`} className={m.uncertain ? 'bg-amber-50/45' : ''}>
                                <td className="py-2 px-3 font-semibold text-[#042C53]">{m.testName}</td>
                                <td className="py-2 px-3 font-mono text-[#042C53]">
                                  {m.originalValue} {m.originalUnit}
                                </td>
                                <td className="py-2 px-3 font-mono text-[#5F5D56]">{m.referenceRange}</td>
                                <td className="py-2 px-3 text-[#5F5D56]">
                                  {m.sampleOrResultDate || activeItem.documentDate}
                                  {m.laboratoryIdentity ? ` · ${m.laboratoryIdentity}` : ''}
                                </td>
                                <td className="py-2 px-3">
                                  <StatusBadge
                                    label={m.uncertain ? 'Review Required' : m.flag || 'Not Stated'}
                                    tone={
                                      m.flag === 'Critical'
                                        ? 'danger'
                                        : m.uncertain || m.flag === 'Abnormal'
                                        ? 'warning'
                                        : 'neutral'
                                    }
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {(activeItem.status === 'AI Extracted' ||
                    activeItem.status === 'Verified & Consolidated') && (
                    <div
                      data-demo-target="inbox-extracted-fields"
                      className="space-y-3"
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
                            className={`p-3.5 rounded-xl border space-y-2.5 transition-colors ${
                              field.decision === 'Accepted' || field.decision === 'Corrected'
                                ? 'bg-emerald-50/45 border-emerald-200/90'
                                : field.decision === 'Rejected'
                                ? 'bg-[#FAF9F6] border-[#042C53]/8 opacity-75'
                                : isUncertain
                                ? 'bg-amber-50/60 border-amber-300/90'
                                : 'bg-white border-[#042C53]/10'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2.5">
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-[#E6F1FB] text-[#042C53] text-[10px] font-semibold rounded-full">
                                    {field.targetSection}
                                  </span>
                                  <span className="font-semibold text-[#042C53] text-xs">
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
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    <input
                                      type="text"
                                      aria-label={`Edit value for ${field.label}`}
                                      value={editDraftValue}
                                      onChange={(e) => setEditDraftValue(e.target.value)}
                                      className="eigen-input flex-1 min-w-[200px]"
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
                                      className="px-3 py-1.5 bg-[#0F6E50] text-white rounded-lg text-[11px] font-semibold"
                                    >
                                      Save Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingFieldId(null)}
                                      className="eigen-btn-secondary text-[11px] py-1.5 px-2.5"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="text-[13px] font-semibold text-[#042C53] pt-0.5">
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#0F6E50] hover:bg-[#042C53] text-white rounded-lg text-[11px] font-medium transition-colors"
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-[#042C53]/15 bg-white text-[#042C53] rounded-lg text-[11px] font-medium hover:bg-[#FAF9F6] transition-colors"
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-red-200 bg-red-50/70 text-[#B4321F] rounded-lg text-[11px] font-medium hover:bg-red-100 transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                    Reject
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="text-[11px] font-mono text-[#5F5D56] bg-[#FAF9F6] border border-[#042C53]/6 rounded-lg px-2.5 py-1.5">
                              Source excerpt: “{field.sourceSnippet}”
                            </div>

                            {field.uncertaintyReason && (
                              <div className="text-[11px] text-[#9A5B10] flex items-start gap-1.5 bg-amber-100/45 rounded-lg px-2.5 py-1.5">
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
                    <div className="pt-3.5 border-t border-[#042C53]/8 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[11px] text-[#5F5D56] max-w-md">
                        Only <strong className="text-[#042C53]">Accepted</strong> or{' '}
                        <strong className="text-[#042C53]">Corrected</strong> fields are written to the Patient 360° Profile, Timeline, and Knowledge Graph.
                      </span>
                      <button
                        type="button"
                        data-demo-target="inbox-save-verified-btn"
                        onClick={() => commitVerifiedInboxItem(activeItem.id)}
                        className="eigen-btn-navy px-4 py-2 text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Save Verified Record ({approvedCount} Approved)
                      </button>
                    </div>
                  )}

                  {activeItem.status === 'Verified & Consolidated' &&
                    activeItem.confirmedPatientId && (
                      <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-2.5">
                        <div className="text-[#0F6E50] font-medium flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
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
                            className="eigen-btn-secondary text-xs py-1.5 px-3"
                          >
                            View Patient 360°
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              patient
                                ? setPatientTab('knowledge-graph')
                                : openPatient(activeItem.confirmedPatientId!, 'knowledge-graph')
                            }
                            className="eigen-btn-navy text-xs py-1.5 px-3"
                          >
                            Open Knowledge Graph
                          </button>
                        </div>
                      </div>
                    )}
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
