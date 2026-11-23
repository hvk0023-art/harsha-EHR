import React, { useMemo, useState } from 'react';
import { Check, Printer, RefreshCw, Send } from 'lucide-react';
import { useAppState } from '../state/AppStateContext';
import {
  EmptyState,
  Modal,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const InboxPage: React.FC = () => {
  const {
    state,
    currentFacility,
    acknowledgeLabResult,
    sendMessageInThread,
    createMessageThread,
    sendFax,
    retryFax,
    matchInboundFax,
    notify,
  } = useAppState();

  const [subTab, setSubTab] = useState<'results' | 'messages' | 'fax'>('results');
  const [resultFilter, setResultFilter] = useState<'all' | 'mine' | 'critical'>('all');
  const [selectedThreadId, setSelectedThreadId] = useState<string>(state.messages[0]?.id || '');
  const [composerBody, setComposerBody] = useState('');
  const [composerMode, setComposerMode] = useState<'In-App' | 'Text' | 'Internal Note' | 'Page'>('In-App');
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [newMsgPatient, setNewMsgPatient] = useState(state.patients[0]?.id || '');
  const [newMsgSubject, setNewMsgSubject] = useState('');
  const [newMsgBody, setNewMsgBody] = useState('');

  // Fax form
  const [showSendFax, setShowSendFax] = useState(false);
  const [faxPatientId, setFaxPatientId] = useState(state.patients[0]?.id || '');
  const [faxRecipient, setFaxRecipient] = useState('Mass General Nephrology');
  const [faxNumber, setFaxNumber] = useState('(617) 555-0921');
  const [faxSubject, setFaxSubject] = useState('');
  const [faxCover, setFaxCover] = useState('');
  const [faxSimulateFail, setFaxSimulateFail] = useState(false);

  const facilityLabs = useMemo(() => {
    return state.labResults
      .filter((l) => {
        if (l.facilityId !== state.currentFacilityId) return false;
        if (resultFilter === 'mine') return l.reviewOwnerId === state.currentUserId && l.status !== 'Reviewed';
        if (resultFilter === 'critical') return l.flag === 'Critical' || l.flag === 'Abnormal';
        return true;
      })
      .sort((a, b) => (a.flag === 'Critical' ? -1 : b.flag === 'Critical' ? 1 : 0));
  }, [resultFilter, state.currentFacilityId, state.currentUserId, state.labResults]);

  const activeThread = state.messages.find((m) => m.id === selectedThreadId) || state.messages[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clinical Inbox & Communications"
        subtitle={`M13 Results · M17 Messaging · M18 Fax & Document Exchange (${currentFacility.shortName})`}
        primaryAction={
          subTab === 'messages' ? (
            <button
              type="button"
              onClick={() => setShowNewMsg(true)}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
            >
              New Conversation
            </button>
          ) : subTab === 'fax' ? (
            <button
              type="button"
              onClick={() => setShowSendFax(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
            >
              <Printer className="w-3.5 h-3.5" />
              Send Fax (Sim)
            </button>
          ) : undefined
        }
      />

      <SegmentedTabs
        tabs={[
          {
            id: 'results',
            label: 'Results Queue',
            count: state.labResults.filter((l) => l.facilityId === state.currentFacilityId && l.status !== 'Reviewed').length,
          },
          { id: 'messages', label: 'Messages & Team Chat', count: state.messages.length },
          { id: 'fax', label: 'Fax & Exchange', count: state.faxes.length },
        ]}
        activeId={subTab}
        onChange={(id) => setSubTab(id as typeof subTab)}
      />

      {/* M13: Results & Clinical Inbox */}
      {subTab === 'results' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg p-3">
            <SegmentedTabs
              tabs={[
                { id: 'all', label: 'All Incoming Results' },
                { id: 'mine', label: 'Assigned to Me (Unreviewed)' },
                { id: 'critical', label: 'Critical & Abnormal' },
              ]}
              activeId={resultFilter}
              onChange={(id) => setResultFilter(id as typeof resultFilter)}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {facilityLabs.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No pending results" description="New results will appear here." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                    <tr>
                      <th className="py-2.5 px-3">Patient</th>
                      <th className="py-2.5 px-3">Test & Collection Date</th>
                      <th className="py-2.5 px-3">Result & Reference</th>
                      <th className="py-2.5 px-3">Flag</th>
                      <th className="py-2.5 px-3">Review Owner</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {facilityLabs.map((l) => {
                      const owner = state.staff.find((s) => s.id === l.reviewOwnerId);
                      return (
                        <tr
                          key={l.id}
                          className={l.flag === 'Critical' && l.status !== 'Reviewed' ? 'bg-red-50/40' : 'hover:bg-slate-50'}
                        >
                          <td className="py-2.5 px-3">
                            <PatientLink patientId={l.patientId} tab="orders-results" showMrn />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[#042C53]">{l.testName}</div>
                            <div className="text-[11px] font-mono text-[#5F5D56]">{l.collectionDate}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums">
                            <span className="font-semibold text-[#042C53]">
                              {l.value} {l.unit}
                            </span>
                            <div className="text-[11px] text-[#5F5D56]">Ref: {l.referenceInterval}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge label={l.flag} />
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{owner?.name || 'Unassigned'}</td>
                          <td className="py-2.5 px-3">
                            <StatusBadge label={l.status} />
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1.5">
                            {l.status !== 'Reviewed' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => acknowledgeLabResult(l.id, false)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded hover:bg-[#042C53]"
                                >
                                  <Check className="w-3 h-3" />
                                  Sign Off
                                </button>
                                <button
                                  type="button"
                                  onClick={() => acknowledgeLabResult(l.id, true)}
                                  className="px-2 py-1 text-[11px] font-medium border border-slate-300 rounded hover:bg-slate-50"
                                >
                                  Sign Off + Task
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-[#0F6E50]">Reviewed {l.reviewedAt}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* M17: Messaging & Communications */}
      {subTab === 'messages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[520px] overflow-y-auto eigen-scroll">
            {state.messages.map((th) => {
              const active = activeThread?.id === th.id;
              const pat = state.patients.find((p) => p.id === th.patientId);
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setSelectedThreadId(th.id)}
                  className={`w-full text-left p-3 hover:bg-[#E6F1FB]/30 ${
                    active ? 'bg-[#E6F1FB]/50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#042C53] truncate">{th.subject}</span>
                    <StatusBadge label={th.priority} />
                  </div>
                  <div className="text-[11px] text-[#5F5D56] mt-0.5">
                    {pat ? `${pat.fullName} · ` : ''}
                    {th.channel} · {th.status}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg flex flex-col max-h-[520px]">
            {activeThread ? (
              <>
                <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[#042C53]">{activeThread.subject}</div>
                    <div className="text-[11px] text-[#5F5D56]">
                      Participants: {activeThread.participants.join(', ')}
                    </div>
                  </div>
                  {activeThread.patientId && (
                    <PatientLink patientId={activeThread.patientId} tab="communications" className="text-xs" />
                  )}
                </div>

                <div className="flex-1 p-4 space-y-3 overflow-y-auto eigen-scroll">
                  {activeThread.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-lg border text-xs ${
                        m.isInternalNote
                          ? 'bg-amber-50/70 border-amber-200'
                          : m.isPatient
                          ? 'bg-[#F1EFE8] border-slate-200'
                          : 'bg-[#E6F1FB]/40 border-[#85B7EB]/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-[#042C53]">
                          {m.sender}
                          {m.isInternalNote ? ' (Internal Staff Note — Not Visible to Patient)' : ''}
                        </span>
                        <span className="font-mono text-[11px] text-[#5F5D56]">
                          {m.channel} · {m.timestamp} · {m.deliveryStatus}
                        </span>
                      </div>
                      <p className="text-slate-800">{m.body}</p>
                    </div>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!composerBody.trim()) return;
                    sendMessageInThread(activeThread.id, composerBody.trim(), composerMode, false);
                    setComposerBody('');
                  }}
                  className="p-3 border-t border-slate-200 space-y-2 bg-[#F7F7F5]"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['In-App', 'Text', 'Internal Note', 'Page'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setComposerMode(mode)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded border ${
                          composerMode === mode
                            ? mode === 'Internal Note'
                              ? 'bg-amber-100 border-amber-400 text-[#9A5B10]'
                              : 'bg-[#042C53] text-white border-[#042C53]'
                            : 'bg-white text-[#5F5D56] border-slate-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                    <span className="text-[11px] text-[#5F5D56] ml-auto">
                      {composerMode === 'Internal Note'
                        ? 'Staff-only note'
                        : 'Simulated delivery (no external SMS/API)'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={composerBody}
                      onChange={(e) => setComposerBody(e.target.value)}
                      placeholder={
                        composerMode === 'Internal Note'
                          ? 'Write internal staff note...'
                          : `Write ${composerMode} message...`
                      }
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-6">
                <EmptyState title="Select a conversation" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* M18: Fax & Document Exchange */}
      {subTab === 'fax' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Direction & Time</th>
                  <th className="py-2.5 px-3">Recipient / Sender</th>
                  <th className="py-2.5 px-3">Matched Patient</th>
                  <th className="py-2.5 px-3">Subject & Documents</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {state.faxes.map((f) => (
                  <tr key={f.id}>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[#042C53]">{f.direction}</div>
                      <div className="text-[11px] font-mono text-[#5F5D56]">{f.timestamp}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div>{f.recipientOrSender}</div>
                      <div className="text-[11px] font-mono text-[#5F5D56]">{f.faxNumber}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {f.patientId ? (
                        <PatientLink patientId={f.patientId} tab="documents-forms" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => matchInboundFax(f.id, state.patients[0].id)}
                          className="text-xs text-[#185FA5] hover:underline"
                        >
                          Match to patient
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-[#042C53]">{f.subject}</div>
                      <div className="text-[11px] text-[#5F5D56]">{f.documentNames.join(', ')}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge label={f.status} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {f.status === 'Failed' && (
                        <button
                          type="button"
                          onClick={() => retryFax(f.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#185FA5] text-white rounded"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry (Sim)
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Message Modal */}
      <Modal open={showNewMsg} onClose={() => setShowNewMsg(false)} title="New Message Thread">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newMsgSubject.trim() || !newMsgBody.trim()) return;
            createMessageThread(newMsgPatient, newMsgSubject.trim(), newMsgBody.trim(), 'In-App', false);
            setNewMsgSubject('');
            setNewMsgBody('');
            setShowNewMsg(false);
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="nm-pat" className="block text-xs font-medium text-[#042C53] mb-1">
              Patient
            </label>
            <select
              id="nm-pat"
              value={newMsgPatient}
              onChange={(e) => setNewMsgPatient(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nm-subj" className="block text-xs font-medium text-[#042C53] mb-1">
              Subject
            </label>
            <input
              id="nm-subj"
              type="text"
              required
              value={newMsgSubject}
              onChange={(e) => setNewMsgSubject(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="nm-body" className="block text-xs font-medium text-[#042C53] mb-1">
              Message
            </label>
            <textarea
              id="nm-body"
              rows={3}
              required
              value={newMsgBody}
              onChange={(e) => setNewMsgBody(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowNewMsg(false)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md">
              Send (Simulated)
            </button>
          </div>
        </form>
      </Modal>

      {/* Send Fax Modal */}
      <Modal
        open={showSendFax}
        onClose={() => setShowSendFax(false)}
        title="Send Fax (Simulated)"
        subtitle="Never transmits an actual external fax"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!faxSubject.trim()) {
              notify('error', 'Fax subject is required');
              return;
            }
            sendFax({
              direction: 'Outbound',
              patientId: faxPatientId,
              recipientOrSender: faxRecipient,
              faxNumber,
              subject: faxSubject.trim(),
              coverMessage: faxCover.trim() || 'Synthetic clinical packet enclosed.',
              documentNames: ['Clinical_Summary_Demo.pdf'],
              status: faxSimulateFail ? 'Failed' : 'Delivered',
            });
            setFaxSubject('');
            setFaxCover('');
            setShowSendFax(false);
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="fx-pat" className="block text-xs font-medium text-[#042C53] mb-1">
              Patient
            </label>
            <select
              id="fx-pat"
              value={faxPatientId}
              onChange={(e) => setFaxPatientId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
            >
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fx-rec" className="block text-xs font-medium text-[#042C53] mb-1">
                Verified Recipient
              </label>
              <input
                id="fx-rec"
                type="text"
                value={faxRecipient}
                onChange={(e) => setFaxRecipient(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="fx-num" className="block text-xs font-medium text-[#042C53] mb-1">
                Fax Number
              </label>
              <input
                id="fx-num"
                type="text"
                value={faxNumber}
                onChange={(e) => setFaxNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label htmlFor="fx-subj" className="block text-xs font-medium text-[#042C53] mb-1">
              Subject *
            </label>
            <input
              id="fx-subj"
              type="text"
              required
              value={faxSubject}
              onChange={(e) => setFaxSubject(e.target.value)}
              placeholder="e.g. Nephrology Consultation Records"
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <div>
            <label htmlFor="fx-cov" className="block text-xs font-medium text-[#042C53] mb-1">
              Cover-Page Message
            </label>
            <textarea
              id="fx-cov"
              rows={2}
              value={faxCover}
              onChange={(e) => setFaxCover(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={faxSimulateFail}
              onChange={(e) => setFaxSimulateFail(e.target.checked)}
            />
            Simulate transmission failure (test retry flow)
          </label>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setShowSendFax(false)} className="px-3 py-1.5 text-xs border border-slate-300 rounded-md">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md">
              Send Fax (Sim)
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
