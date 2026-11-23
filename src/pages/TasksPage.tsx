import React, { useMemo, useState } from 'react';
import { CheckSquare, Clock, Plus } from 'lucide-react';
import { TODAY_DATE } from '../data/seedData';
import { computeTaskSummary } from '../state/domainLogic';
import { canViewTeamWork, filterTasksForRole } from '../state/permissions';
import { useAppState } from '../state/AppStateContext';
import type { TaskItem, TaskStatus } from '../types/hms';
import { CreateTaskModal } from '../components/modals/QuickActionModals';
import {
  Drawer,
  EmptyState,
  PageHeader,
  PatientLink,
  SegmentedTabs,
  StatusBadge,
} from '../components/ui/Primitives';

export const TasksPage: React.FC = () => {
  const {
    state,
    currentFacility,
    updateTaskStatus,
    updateTask,
    addTaskComment,
    openPatient,
  } = useAppState();

  const teamWorkAllowed = canViewTeamWork(state.currentRole);
  const [scope, setScope] = useState<'my' | 'team' | 'patient' | 'completed'>('my');
  const effectiveScope: 'my' | 'team' | 'patient' | 'completed' =
    !teamWorkAllowed && scope === 'team' ? 'my' : scope;
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const summary = useMemo(
    () => computeTaskSummary(state.tasks, state.currentUserId, state.currentFacilityId, TODAY_DATE),
    [state.currentFacilityId, state.currentUserId, state.tasks]
  );

  const filteredTasks = useMemo(() => {
    const base = filterTasksForRole(state.tasks, {
      role: state.currentRole,
      userId: state.currentUserId,
      facilityId: state.currentFacilityId,
      scope: effectiveScope === 'team' ? 'team' : effectiveScope === 'my' ? 'mine' : teamWorkAllowed ? 'all' : 'mine',
    });
    return base.filter((t) => {
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (effectiveScope === 'my') return t.status !== 'Complete';
      if (effectiveScope === 'team') return t.status !== 'Complete';
      if (effectiveScope === 'patient') return Boolean(t.patientId) && t.status !== 'Complete';
      return t.status === 'Complete';
    });
  }, [effectiveScope, priorityFilter, state.currentFacilityId, state.currentRole, state.currentUserId, state.tasks, teamWorkAllowed]);

  const selectedTask = state.tasks.find((t) => t.id === selectedTaskId) || null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={teamWorkAllowed ? 'Tasks & Team Worklists' : 'My Tasks & Worklist'}
        subtitle={
          teamWorkAllowed
            ? `M16 · ${currentFacility.shortName} · My Open: ${summary.myOpen} · Team Open: ${summary.teamOpen} · Overdue: ${summary.overdue}`
            : `M16 · ${currentFacility.shortName} · Assigned Scope (${state.currentRole}) · My Open: ${summary.myOpen}`
        }
        primaryAction={
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#185FA5] hover:bg-[#042C53] rounded-md"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Task
          </button>
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          tabs={[
            { id: 'my', label: 'My Tasks', count: summary.myOpen },
            ...(teamWorkAllowed ? [{ id: 'team', label: 'Team Tasks', count: summary.teamOpen }] : []),
            { id: 'patient', label: 'Patient Tasks' },
            { id: 'completed', label: 'Completed' },
          ]}
          activeId={effectiveScope}
          onChange={(id) => setScope(id as typeof scope)}
        />
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white"
        >
          <option value="all">All Priorities</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>
      </div>

      <div data-demo-target="tasks-work-queue" className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No tasks in this worklist"
              description="Create a task or switch between My Tasks and Team Tasks."
              action={
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#185FA5] rounded-md"
                >
                  Create Task
                </button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#F7F7F5] border-b border-slate-200 text-[11px] font-medium text-[#5F5D56]">
                <tr>
                  <th className="py-2.5 px-3">Task</th>
                  <th className="py-2.5 px-3">Patient / Linked Record</th>
                  <th className="py-2.5 px-3">Owner & Team</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredTasks.map((t) => {
                  const owner = state.staff.find((s) => s.id === t.ownerId);
                  const overdue = t.status !== 'Complete' && t.dueDate < TODAY_DATE;
                  return (
                    <tr key={t.id} className="hover:bg-[#E6F1FB]/25">
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(t.id)}
                          className="font-medium text-[#042C53] hover:text-[#185FA5] hover:underline text-left"
                        >
                          {t.title}
                        </button>
                        <div className="text-[11px] text-[#5F5D56]">
                          {t.subtasks.length > 0 && `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} subtasks · `}
                          {t.recurring ? `Recurring: ${t.recurring} · ` : ''}
                          {t.patientVisible ? 'Patient-visible' : 'Staff-only'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {t.patientId ? (
                          <PatientLink patientId={t.patientId} tab="overview" />
                        ) : (
                          <span className="text-[#5F5D56]">Operational</span>
                        )}
                        {t.linkedRecord && (
                          <div className="text-[11px] text-[#5F5D56]">
                            {t.linkedRecord.type}: {t.linkedRecord.label}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div>{owner?.name || 'Unassigned'}</div>
                        <div className="text-[11px] text-[#5F5D56]">{t.team}</div>
                      </td>
                      <td className={`py-2.5 px-3 font-mono tabular-nums ${overdue ? 'text-[#B4321F] font-semibold' : ''}`}>
                        {t.dueDate} {overdue ? '(Overdue)' : ''}
                      </td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={t.priority} />
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          aria-label={`Status for ${t.title}`}
                          data-demo-target={t.id === 'tsk-demo-01' ? 'task-status-select-demo' : undefined}
                          value={t.status}
                          onChange={(e) => updateTaskStatus(t.id, e.target.value as TaskStatus)}
                          className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                        >
                          <option value="To Do">To Do</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Complete">Complete</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedTaskId(t.id)}
                          className="px-2.5 py-1 text-xs font-medium text-[#185FA5] hover:bg-[#E6F1FB] rounded"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateTaskModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Full Task Inspection Drawer */}
      <Drawer
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        title={selectedTask?.title || 'Task Detail'}
        subtitle={selectedTask ? `${selectedTask.team} · Due ${selectedTask.dueDate}` : ''}
      >
        {selectedTask && (
          <div className="space-y-5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <StatusBadge label={selectedTask.priority} />
                <StatusBadge label={selectedTask.status} />
                <span className="font-mono text-[#5F5D56]">
                  Time logged: {selectedTask.timeLoggedMin} min
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateTask(selectedTask.id, { timeLoggedMin: selectedTask.timeLoggedMin + 15 })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
              >
                <Clock className="w-3.5 h-3.5 text-[#185FA5]" />
                Log +15m
              </button>
            </div>

            {selectedTask.patientId && (
              <div className="p-3 bg-[#F7F7F5] rounded-md flex items-center justify-between">
                <div>
                  <span className="text-[#5F5D56]">Linked Patient: </span>
                  <PatientLink patientId={selectedTask.patientId} tab="overview" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const pid = selectedTask.patientId!;
                    setSelectedTaskId(null);
                    openPatient(pid, 'overview');
                  }}
                  className="text-[#185FA5] font-medium hover:underline"
                >
                  Open Chart →
                </button>
              </div>
            )}

            {/* Subtasks */}
            <div className="space-y-2">
              <div className="font-semibold text-[#042C53]">Subtasks</div>
              {selectedTask.subtasks.map((st) => (
                <label key={st.id} className="flex items-center gap-2 p-2 border border-slate-200 rounded">
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={() =>
                      updateTask(selectedTask.id, {
                        subtasks: selectedTask.subtasks.map((x) =>
                          x.id === st.id ? { ...x, done: !x.done } : x
                        ),
                      })
                    }
                  />
                  <span className={st.done ? 'line-through text-[#5F5D56]' : ''}>{st.title}</span>
                </label>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newSubtaskTitle.trim()) return;
                  updateTask(selectedTask.id, {
                    subtasks: [
                      ...selectedTask.subtasks,
                      { id: `st-${Date.now()}`, title: newSubtaskTitle.trim(), done: false },
                    ],
                  });
                  setNewSubtaskTitle('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Add subtask..."
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                />
                <button type="submit" className="px-3 py-1.5 bg-[#185FA5] text-white rounded font-medium">
                  Add
                </button>
              </form>
            </div>

            {/* Comments & Mentions */}
            <div className="space-y-2">
              <div className="font-semibold text-[#042C53]">Comments & Mentions</div>
              {selectedTask.comments.length === 0 ? (
                <p className="text-[#5F5D56]">No comments yet.</p>
              ) : (
                <div className="space-y-2">
                  {selectedTask.comments.map((c) => (
                    <div key={c.id} className="p-2.5 bg-[#F7F7F5] rounded border border-slate-200">
                      <div className="font-medium text-[#042C53]">
                        {c.author} <span className="font-mono text-[11px] text-[#5F5D56]">{c.timestamp}</span>
                      </div>
                      <p className="mt-0.5 text-slate-800">{c.text}</p>
                    </div>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!commentText.trim()) return;
                  addTaskComment(selectedTask.id, commentText.trim());
                  setCommentText('');
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  placeholder="Add comment or @mention..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
                />
                <button type="submit" className="px-3 py-1.5 bg-[#042C53] text-white rounded font-medium">
                  Post
                </button>
              </form>
            </div>

            {/* Activity History */}
            <div className="space-y-1.5 pt-2 border-t border-slate-200">
              <div className="font-semibold text-[#042C53]">Activity History</div>
              {selectedTask.history.map((h) => (
                <div key={h.id} className="text-[11px] text-[#5F5D56] flex justify-between gap-2">
                  <span>{h.event}</span>
                  <span className="font-mono">{h.timestamp}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
