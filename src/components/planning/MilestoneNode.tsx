import { useState } from 'react';
import { ChevronDown, ChevronRight, GripVertical, Calendar, CheckCircle2, AlertCircle, Clock, Circle, Plus, X, Loader2, Pencil, Trash2 } from 'lucide-react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { usePlanningStore } from '@/store/planningStore';
import TaskNode from './TaskNode';
import type { PlanningMilestone, PlanningTask, PlanningSubtask, ProjectMember, MilestoneStatus } from '@/types';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/services/api';
import { subtaskService } from '@/services/subtaskService';
import { milestoneService } from '@/services/milestoneService';

interface Props {
  milestone: PlanningMilestone;
  canManage: boolean;
  projectMembers?: ProjectMember[];
  onOpenTask: (taskId: string) => void;
  onAddTask: (milestoneId: string) => void;
  projectId: string;
  onDeleteTask?: (taskId: string) => Promise<void>;
}

// plan2.md §5.2: 4 distinct display states
const statusConfig = {
  NOT_STARTED:  { label: 'Not started', className: 'bg-muted text-muted-foreground border-border' },
  IN_PROGRESS:  { label: 'In Progress', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  OVERDUE:      { label: 'Overdue',     className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  COMPLETED:    { label: 'Completed',   className: 'bg-primary/10 text-primary border-primary/20' },
  CANCELLED:    { label: 'Cancelled',   className: 'bg-muted text-muted-foreground border-border' },
};

export default function MilestoneNode({
  milestone, canManage, projectMembers, onOpenTask, onAddTask, projectId, onDeleteTask,
}: Props) {
  const { expandedMilestones, toggleMilestone, refresh, patchMilestones } = usePlanningStore();
  const isExpanded = expandedMilestones.has(milestone.id);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [submittingSubtask, setSubmittingSubtask] = useState(false);

  // ── Inline edit state ──────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', description: '', startDate: '', deadline: '', status: 'ACTIVE' as string });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleEditOpen = () => {
    setEditForm({
      title:       milestone.title,
      description: milestone.description ?? '',
      startDate:   milestone.startDate ? milestone.startDate.substring(0, 10) : '',
      deadline:    milestone.deadline  ? milestone.deadline.substring(0, 10)  : '',
      status:      milestone.status ?? 'ACTIVE',
    });
    setDeleteConfirm(false);
    setIsEditing(true);
  };

  const toIso = (val: string) => val ? `${val}T00:00:00.000Z` : null;

  const handleSave = async () => {
    if (!editForm.title.trim()) return;
    setSaving(true);
    try {
      await milestoneService.updateMilestone(projectId, milestone.id, {
        title:       editForm.title.trim(),
        description: editForm.description.trim() || null,
        startDate:   toIso(editForm.startDate),
        deadline:    toIso(editForm.deadline),
        status:      editForm.status as MilestoneStatus,
      });
      setIsEditing(false);
      await refresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update milestone'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await milestoneService.deleteMilestone(projectId, milestone.id);
      await refresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete milestone'));
    }
  };

  const {
    attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging: isSortableDragging,
  } = useSortable({ id: milestone.id, data: { type: 'milestone' } });

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `milestone-drop-${milestone.id}`, data: { type: 'milestone-drop', milestoneId: milestone.id } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  // Derive display state from data (plan2.md §5.2)
  const allTasksDone =
    (milestone.progress.total > 0 && milestone.progress.done === milestone.progress.total) ||
    (milestone.tasks.length > 0 && milestone.tasks.every(t => t.status === 'done'));
  const statusKey =
    milestone.status === 'COMPLETED'  ? 'COMPLETED' :
    milestone.status === 'CANCELLED'  ? 'CANCELLED' :
    allTasksDone                      ? 'COMPLETED' :
    milestone.isOverdue               ? 'OVERDUE' :
    milestone.progress.total > 0      ? 'IN_PROGRESS' :
                                        'NOT_STARTED';
  const statusCfg = statusConfig[statusKey];
  const taskIds = milestone.tasks.map(t => t.id);
  const unassignedCount = milestone.tasks.filter(t => !t.assignedTo).length;

  const handleToggleSubtask = async (task: PlanningTask, subtask: PlanningSubtask) => {
    const newStatus = subtask.status === 'done' ? 'todo' : 'done';

    // Optimistic: update subtask in tree immediately for instant feedback
    const store = usePlanningStore.getState();
    const currentTree = store.tree;
    if (currentTree) {
      const newMilestones = currentTree.milestones.map(m => {
        if (m.id !== milestone.id) return m;
        return {
          ...m,
          tasks: m.tasks.map(t => {
            if (t.id !== task.id) return t;
            const newSubs = t.subtasks.map(s =>
              s.id === subtask.id ? { ...s, status: newStatus as 'todo' | 'doing' | 'done' } : s
            );
            const done = newSubs.filter(s => s.status === 'done').length;
            return { ...t, subtasks: newSubs, subtaskProgress: { done, total: newSubs.length } };
          }),
        };
      });
      patchMilestones(newMilestones);
    }

    try {
      await subtaskService.update(task.id, subtask.id, { status: newStatus });
      void refresh(); // background sync, no await
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update subtask'));
      await refresh(); // revert on error
    }
  };

  const handleAddSubtask = async (task: PlanningTask) => {
    if (!newSubtaskTitle.trim()) return;
    setSubmittingSubtask(true);
    try {
      await subtaskService.create(task.id, { title: newSubtaskTitle.trim() });
      setNewSubtaskTitle('');
      setAddingSubtaskFor(null);
      await refresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to add subtask'));
    } finally {
      setSubmittingSubtask(false);
    }
  };

  return (
    <div ref={setSortableRef} style={style} className="group/milestone">
      {/* Milestone header */}
      <div className={`flex items-center gap-2 p-3 rounded-xl border-l-4 border border-border transition-all ${
        isOver ? 'border-l-primary border-primary/20 bg-primary/5' : 'border-l-primary/30 bg-card hover:border-l-primary/60 hover:border-border/80'
      } shadow-sm`}>
        {/* Drag handle */}
        {canManage && (
          <button
            {...attributes} {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground opacity-40 group-hover/milestone:opacity-100 transition-opacity touch-none"
          >
            <GripVertical size={14} />
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => toggleMilestone(milestone.id)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>

        {/* Milestone status icon */}
        <span className="shrink-0">
          {statusKey === 'COMPLETED'   ? <CheckCircle2 size={15} className="text-primary" /> :
           statusKey === 'OVERDUE'     ? <AlertCircle  size={15} className="text-red-500" /> :
           statusKey === 'IN_PROGRESS' ? <Clock        size={15} className="text-amber-500" /> :
           statusKey === 'CANCELLED'   ? <Circle       size={15} className="text-muted-foreground/40" /> :
                                         <Circle       size={15} className="text-muted-foreground/40" />}
        </span>

        {/* Title */}
        <span className="font-semibold text-sm text-foreground flex-1 min-w-0 truncate">
          {milestone.title}
        </span>

        {/* Progress bar — hidden on phones so the title keeps its width */}
        {milestone.progress.total > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${milestone.progress.percent}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium w-7 text-right">
              {milestone.progress.percent}%
            </span>
          </div>
        )}

        {/* Task count */}
        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
          {milestone.progress.done}/{milestone.progress.total} tasks
        </span>

        {/* Unassigned-task warning — surfaces tasks nobody owns yet */}
        {unassignedCount > 0 && statusKey !== 'COMPLETED' && statusKey !== 'CANCELLED' && (
          <span
            className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-500 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded shrink-0"
            title={`${unassignedCount} task${unassignedCount > 1 ? 's' : ''} in this milestone ${unassignedCount > 1 ? 'have' : 'has'} no assignee`}
          >
            <AlertCircle size={10} />
            {unassignedCount} unassigned
          </span>
        )}

        {/* Deadline — hidden on phones so the title keeps its width */}
        {milestone.deadline && (
          <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            <Calendar size={10} />
            {new Date(milestone.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        )}

        {/* Status badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${statusCfg.className}`}>
          {statusCfg.label}
        </span>

        {/* Add task button */}
        {canManage && (
          <button
            onClick={() => onAddTask(milestone.id)}
            className="shrink-0 opacity-40 group-hover/milestone:opacity-100 transition-opacity p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary"
            title="Add task to milestone"
            aria-label="Add task to milestone"
          >
            <Plus size={12} />
          </button>
        )}

        {/* Edit milestone button */}
        {canManage && (
          <button
            onClick={() => isEditing ? setIsEditing(false) : handleEditOpen()}
            className="shrink-0 opacity-40 group-hover/milestone:opacity-100 transition-opacity p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Edit milestone"
            aria-label="Edit milestone"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <div className="mt-1 p-3 rounded-xl border border-border bg-card space-y-3 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {/* Top row: left = title + dates (50%), right = description (50%) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            {/* Left column */}
            <div className="flex flex-col gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-medium">Title *</label>
                <input
                  autoFocus
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') setIsEditing(false); }}
                  className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/40"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Start date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/40"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Deadline</label>
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={e => setEditForm(f => ({ ...f, deadline: e.target.value }))}
                    className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/40"
                  />
                </div>
              </div>
            </div>
            {/* Right column — description fills full height of left */}
            <div className="flex flex-col space-y-1">
              <label className="text-[10px] text-muted-foreground font-medium">Description</label>
              <textarea
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description..."
                className="flex-1 resize-none text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/40 min-h-0"
              />
            </div>
          </div>
          {/* Status row */}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground font-medium">Status</label>
            <select
              value={editForm.status}
              onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
              className="w-full text-xs bg-muted/50 border border-border rounded-lg px-2 py-1.5 outline-none focus:border-primary/40"
            >
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            {deleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delete this milestone?</span>
                <button onClick={() => setDeleteConfirm(false)} className="text-xs px-2 py-1 rounded-lg border border-border hover:bg-muted">Keep</button>
                <button onClick={() => void handleDelete()} className="text-xs px-2 py-1 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20">Delete</button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-1 text-xs text-destructive/60 hover:text-destructive transition-colors"
              >
                <Trash2 size={11} /> Delete milestone
              </button>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEditing(false)} className="text-xs px-3 py-1 rounded-lg border border-border hover:bg-muted transition-colors">Cancel</button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !editForm.title.trim()}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {saving && <Loader2 size={10} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tasks list (expanded) */}
      {isExpanded && (
        <div
          ref={setDropRef}
          className={`ml-4 mt-1 pl-3 border-l-2 transition-colors ${
            isOver ? 'border-primary/40' : 'border-border/30'
          } space-y-0.5 min-h-[4px]`}
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {milestone.tasks.map(task => (
              <div key={task.id}>
                <TaskNode
                  task={task}
                  milestoneId={milestone.id}
                  canEdit={canManage}
                  projectMembers={projectMembers}
                  onOpenTask={onOpenTask}
                  onToggleSubtask={handleToggleSubtask}
                  onAddSubtask={canManage ? (t) => { setAddingSubtaskFor(t.id); setNewSubtaskTitle(''); } : undefined}
                  onDeleteTask={onDeleteTask}
                />
                {/* Inline add subtask input */}
                {addingSubtaskFor === task.id && (
                  <div className="ml-8 mt-1 flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
                    <input
                      autoFocus
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddSubtask(task);
                        if (e.key === 'Escape') { setAddingSubtaskFor(null); setNewSubtaskTitle(''); }
                      }}
                      placeholder="Subtask title..."
                      className="flex-1 text-xs bg-muted/50 border border-border rounded px-2 py-1 outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={() => handleAddSubtask(task)}
                      disabled={submittingSubtask || !newSubtaskTitle.trim()}
                      className="p-1 rounded hover:bg-primary/10 text-primary disabled:opacity-40"
                    >
                      {submittingSubtask ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    </button>
                    <button
                      onClick={() => { setAddingSubtaskFor(null); setNewSubtaskTitle(''); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </SortableContext>

          {milestone.tasks.length === 0 && (
            <div className={`min-h-[48px] flex items-center justify-center rounded-lg border border-dashed text-xs transition-colors ${
              isOver
                ? 'border-primary/60 bg-primary/5 text-primary'
                : 'border-border/40 text-muted-foreground/40'
            }`}>
              {isOver ? 'Release to add here' : 'Drop a task here or click + to add'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
