/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, lazy, Suspense, type FormEvent } from 'react';
import { boardColumnService } from '@/services/boardColumnService';
import { milestoneService } from '@/services/milestoneService';
import type { BoardColumn, Milestone } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Task, ProjectMember } from '@/types';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { UserCheck, List, Trash2, Check, Plus, Loader2, Sparkles, X } from 'lucide-react';
import { subtaskService } from '@/services/subtaskService';
import { taskService } from '@/services/taskService';
import DescriptionEditor from '@/components/DescriptionEditor';
import { cn } from '@/lib/utils';
import { statusForColumn } from '@/lib/columnStatus';
import { taskNoteService } from '@/services/taskNoteService';
import { useTaskPresence } from '@/hooks/useTaskPresence';
import PresenceAvatars from '@/components/PresenceAvatars';

// TipTap + DnD-kit + DOMPurify only load when the user opens the Notes tab.
// This keeps ~120kB gz of editor code out of the first TaskDialog paint.
const TaskDialogNotesTab = lazy(() => import('@/components/TaskDialogNotesTab'));

// ─── Helpers ──────────────────────────────────────────────────

function toRecurrenceUnit(task?: { recurrenceType?: string | null } | null): 'DAILY' | 'WEEKLY' | 'MONTHLY' | '' {
  switch (task?.recurrenceType) {
    case 'DAILY':   return 'DAILY';
    case 'WEEKLY':  return 'WEEKLY';
    case 'BIWEEKLY': return 'WEEKLY';
    case 'MONTHLY': return 'MONTHLY';
    case 'QUARTERLY': return 'MONTHLY';
    case 'YEARLY':  return 'MONTHLY';
    default: return '';
  }
}

function toRecurrenceIntervalValue(task?: { recurrenceType?: string | null; recurrenceInterval?: number | null } | null): number {
  if (task?.recurrenceInterval && task.recurrenceInterval > 1) return task.recurrenceInterval;
  switch (task?.recurrenceType) {
    case 'BIWEEKLY':  return 2;
    case 'QUARTERLY': return 3;
    case 'YEARLY':    return 12;
    default: return 1;
  }
}

function toDatetimeLocal(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCreatedAt(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}


// ─── TaskDialogProps ──────────────────────────────────────────

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    status: 'todo' | 'doing' | 'done';
    deadline?: string;
    scheduledAt?: string | null;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    projectId?: string;
    columnId?: string | null;
    isRecurring?: boolean;
    recurrenceType?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
    recurrenceInterval?: number | null;
    recurrenceEndDate?: string | null;
    assignedTo?: string | null;
    milestoneId?: string | null;
    milestoneOrder?: number | null;
  }) => void;
  task?: Task | null;
  loading?: boolean;
  defaultDeadline?: string;
  defaultScheduledAt?: string;
  dialogTitle?: string;
  lockedProjectId?: string;
  lockedProjectName?: string;
  showDirectStatus?: boolean;
  initialTab?: 'details' | 'notes';
  onCancelFromDate?: () => void;
  projectMembers?: ProjectMember[];
  canAssign?: boolean;
  isReadOnly?: boolean;
  externalError?: string;
  onSubtasksChanged?: (taskId: string, progress: { completed: number; total: number } | undefined) => void;
  initialMilestoneId?: string | null;
  preloadedMilestones?: Milestone[];
}

// ─── TaskDialog ───────────────────────────────────────────────

export default function TaskDialog({
  open, onClose, onSubmit, task, loading,
  defaultDeadline, defaultScheduledAt,
  dialogTitle, lockedProjectId, lockedProjectName, showDirectStatus = false,
  initialTab, onCancelFromDate,
  projectMembers, canAssign = false, isReadOnly = false,
  externalError, onSubtasksChanged,
  initialMilestoneId, preloadedMilestones,
}: TaskDialogProps) {
  const projects = useProjectStore((s) => s.projects);
  const user = useAuthStore((s) => s.user);
  const myProfileId = user?.id ?? (user as { _id?: string })?._id;
  const myRole = projectMembers?.find(m => m.profileId === myProfileId)?.role;
  const canSelfAssignOnly = !canAssign && myRole === 'MEMBER';

  // ── Presence ───────────────────────────────────────────────
  const { activeUsers } = useTaskPresence(task?._id, open);

  // MEMBER creating a new task in project mode: default assignee to self
  useEffect(() => {
    if (canSelfAssignOnly && !task?._id && myProfileId && assignedTo === null) {
      setAssignedTo(myProfileId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSelfAssignOnly, myProfileId, task?._id]);

  // ── Details tab state ──────────────────────────────────────
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState<'todo' | 'doing' | 'done'>(task?.status || 'todo');
  const [deadline, setDeadline] = useState(task?.deadline ? toDatetimeLocal(task.deadline) : '');
  const [scheduledAt, setScheduledAt] = useState(task?.scheduledAt ? toDatetimeLocal(task.scheduledAt) : '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(task?.priority || 'medium');
  const [tagsInput, setTagsInput] = useState(task?.tags?.join(', ') || '');
  const [projectId, setProjectId] = useState(lockedProjectId || task?.projectId || '__none__');
  const [estimatedHours, setEstimatedHours] = useState<string>(
    task?.estimatedHours != null ? String(task.estimatedHours) : ''
  );
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring ?? false);
  const [recurrenceUnit, setRecurrenceUnit] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | ''>(() => toRecurrenceUnit(task));
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(() => toRecurrenceIntervalValue(task));
  const [confirmCancelFrom, setConfirmCancelFrom] = useState(false);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(task?.recurrenceEndDate ? task.recurrenceEndDate.substring(0, 10) : '');
  const [columnId, setColumnId] = useState<string | null>(task?.columnId ?? null);
  const [projectColumns, setProjectColumns] = useState<BoardColumn[]>([]);
  const [assignedTo, setAssignedTo] = useState<string | null>(task?.assignedTo ?? null);
  const [milestoneId, setMilestoneId] = useState<string | null>(task?.milestoneId ?? null);
  const [projectMilestones, setProjectMilestones] = useState<Milestone[]>([]);
  const [error, setError] = useState('');
  const [infiniteRecurringWarn, setInfiniteRecurringWarn] = useState(false);

  // ── Subtask state ──────────────────────────────────────────
  const [subtasks, setSubtasks] = useState<Task[]>([]);
  const [subtasksLoading, setSubtasksLoading] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [submittingSubtask, setSubmittingSubtask] = useState(false);
  const [confirmDeleteSubtaskId, setConfirmDeleteSubtaskId] = useState<string | null>(null);
  const [deletingSubtaskIds, setDeletingSubtaskIds] = useState<Set<string>>(new Set());

  // ── Tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'details' | 'subtasks' | 'notes'>('details');
  const prevTabRef = useRef<'details' | 'subtasks' | 'notes'>('details');
  // Notes tab is a lazy child — track when it has been opened at least once so
  // the tab badge and mounted state persist without re-fetching every switch.
  const [notesEverOpened, setNotesEverOpened] = useState(false);
  const [notesCount, setNotesCount] = useState(0);

  // ── AI Breakdown state ─────────────────────────────────────
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownItems, setBreakdownItems] = useState<string[]>([]);
  const [breakdownError, setBreakdownError] = useState('');
  const [addingBreakdown, setAddingBreakdown] = useState<'notes' | 'subtasks' | null>(null);

  // ── Sync form on open / task change ───────────────────────
  useEffect(() => {
    if (open) {
      setTitle(task?.title || '');
      setDescription(task?.description || '');
      setStatus(task?.status || 'todo');
      setDeadline(task?.deadline ? toDatetimeLocal(task.deadline) : defaultDeadline ? `${defaultDeadline}T09:00` : '');
      setScheduledAt(
        task?.scheduledAt
          ? toDatetimeLocal(task.scheduledAt)
          : defaultScheduledAt
            ? defaultScheduledAt.includes('T') ? defaultScheduledAt : `${defaultScheduledAt}T09:00`
            : ''
      );
      setPriority(task?.priority || 'medium');
      setTagsInput(task?.tags?.join(', ') || '');
      setProjectId(lockedProjectId || task?.projectId || '__none__');
      setIsRecurring(task?.isRecurring ?? false);
      setRecurrenceUnit(toRecurrenceUnit(task));
      setRecurrenceInterval(toRecurrenceIntervalValue(task));
      setRecurrenceEndDate(task?.recurrenceEndDate ? task.recurrenceEndDate.substring(0, 10) : '');
      setColumnId(task?.columnId ?? null);
      setAssignedTo(task?.assignedTo ?? null);
      setMilestoneId(task?.milestoneId ?? initialMilestoneId ?? null);
      setEstimatedHours(task?.estimatedHours != null ? String(task.estimatedHours) : '');
      setError('');
    }
  }, [task, open, defaultDeadline, defaultScheduledAt]);

  // Fetch milestones for project context (canAssign = OWNER/MANAGER, both create and edit)
  useEffect(() => {
    if (!open || !lockedProjectId || !canAssign) { setProjectMilestones([]); return; }
    if (preloadedMilestones) {
      setProjectMilestones(preloadedMilestones.filter(m => m.status === 'ACTIVE'));
      return;
    }
    milestoneService.getMilestones(lockedProjectId)
      .then(res => setProjectMilestones(res.data.filter(m => m.status === 'ACTIVE')))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedProjectId, canAssign]);

  // Fetch subtasks when editing an existing task
  useEffect(() => {
    if (!open || !task?._id) { setSubtasks([]); return; }
    setSubtasksLoading(true);
    subtaskService.list(task._id)
      .then(res => setSubtasks(res.data))
      .catch(() => {})
      .finally(() => setSubtasksLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?._id]);

  // Fetch columns for project context
  useEffect(() => {
    if (!open || !lockedProjectId) { setProjectColumns([]); return; }
    boardColumnService.getColumns(lockedProjectId)
      .then(res => {
        const cols = [...res.data].sort((a, b) => a.order - b.order);
        setProjectColumns(cols);
        // Auto-select default column if none is selected
        setColumnId(prev => {
          if (prev && cols.some(c => c.id === prev)) return prev;
          return cols.find(c => c.isDefault)?.id ?? (cols[0]?.id ?? null);
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lockedProjectId]);

  // Reset tab + notes-mount tracker on open/close. All internal notes state
  // lives in the lazy child, so unmounting it here (via notesEverOpened=false)
  // drops it automatically.
  useEffect(() => {
    if (open) {
      const tab = initialTab ?? 'details';
      setActiveTab(tab);
      prevTabRef.current = tab;
      if (tab === 'notes') setNotesEverOpened(true);
    }
    if (!open) {
      setActiveTab('details');
      prevTabRef.current = 'details';
      setNotesEverOpened(false);
      setNotesCount(0);
    }
  }, [open, initialTab]);

  // ── Tab switch ────────────────────────────────────────────
  const handleTabChange = (tab: 'details' | 'subtasks' | 'notes') => {
    prevTabRef.current = activeTab;
    setActiveTab(tab);
    if (tab === 'notes') setNotesEverOpened(true);
  };

  // ── Form reset ────────────────────────────────────────────
  const resetForm = () => {
    setTitle(''); setDescription(''); setStatus('todo');
    setDeadline(''); setScheduledAt(''); setPriority('medium');
    setTagsInput(''); setProjectId('__none__');
    setIsRecurring(false); setRecurrenceUnit(''); setRecurrenceInterval(1); setRecurrenceEndDate('');
    setColumnId(null); setProjectColumns([]);
    setAssignedTo(null);
    setMilestoneId(null); setProjectMilestones([]);
    setSubtasks([]); setNewSubtaskTitle('');
    setConfirmDeleteSubtaskId(null); setDeletingSubtaskIds(new Set());
    setBreakdownItems([]); setBreakdownError(''); setAddingBreakdown(null);
    setError('');
    setInfiniteRecurringWarn(false);
  };

  // ── Details form submit ───────────────────────────────────
  const buildSubmitPayload = () => ({
    title: title.trim(), description,
    status: (status ?? 'todo') as 'todo' | 'doing' | 'done',
    deadline: deadline ? new Date(deadline).toISOString() : undefined,
    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    priority,
    tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
    projectId: projectId === '__none__' ? undefined : projectId || undefined,
    ...(lockedProjectId && { columnId: columnId ?? null }),
    isRecurring,
    recurrenceType: isRecurring ? (recurrenceUnit as 'DAILY' | 'WEEKLY' | 'MONTHLY') : null,
    recurrenceInterval: isRecurring && recurrenceInterval > 1 ? recurrenceInterval : null,
    recurrenceEndDate: isRecurring && recurrenceEndDate ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString() : null,
    ...(lockedProjectId && { assignedTo }),
    ...(lockedProjectId && canAssign && { milestoneId }),
    estimatedHours: estimatedHours !== '' ? parseFloat(estimatedHours) : null,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!title.trim()) { setError('Title is required'); return; }
    if (isRecurring) {
      if (!recurrenceUnit) { setError('Please select how often this task repeats'); return; }
      if (!recurrenceEndDate) { setInfiniteRecurringWarn(true); return; }
    }
    if (deadline && !task?._id) {
      const s = new Date(deadline);
      if (isNaN(s.getTime())) { setError('Invalid deadline'); return; }
      if (s < new Date()) { setError('Deadline cannot be in the past'); return; }
    }
    onSubmit(buildSubmitPayload());
  };


  // ── Subtask helpers ───────────────────────────────────────
  const notifyProgress = (list: Task[]) => {
    if (!task?._id) return;
    onSubtasksChanged?.(task._id, list.length === 0 ? undefined : {
      total: list.length,
      completed: list.filter(s => s.status === 'done').length,
    });
  };

  // ── Subtask handlers ──────────────────────────────────────
  const handleToggleSubtask = async (s: Task) => {
    if (!task?._id) return;
    const newStatus: 'todo' | 'doing' | 'done' = s.status === 'done' ? 'todo' : 'done';
    const optimistic = subtasks.map(x => x._id === s._id ? { ...x, status: newStatus } : x);
    setSubtasks(optimistic);
    notifyProgress(optimistic);
    try {
      const res = await subtaskService.update(task._id, s._id, { status: newStatus });
      const final = optimistic.map(x => x._id === s._id ? res.data : x);
      setSubtasks(final);
      notifyProgress(final);
    } catch {
      setSubtasks(subtasks);
      notifyProgress(subtasks);
    }
  };

  const handleAddSubtask = async () => {
    if (!task?._id || !newSubtaskTitle.trim() || submittingSubtask) return;
    setSubmittingSubtask(true);
    try {
      const res = await subtaskService.create(task._id, { title: newSubtaskTitle.trim() });
      const newList = [...subtasks, res.data];
      setSubtasks(newList);
      notifyProgress(newList);
      setNewSubtaskTitle('');
    } catch { /* silent */ } finally { setSubmittingSubtask(false); }
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    if (!task?._id) return;
    setConfirmDeleteSubtaskId(null);
    setDeletingSubtaskIds(prev => new Set([...prev, subtaskId]));
    const snapshot = subtasks;
    setTimeout(async () => {
      try {
        await subtaskService.delete(task._id!, subtaskId);
        const newList = snapshot.filter(s => s._id !== subtaskId);
        setSubtasks(prev => prev.filter(s => s._id !== subtaskId));
        notifyProgress(newList);
      } catch {
        setDeletingSubtaskIds(prev => { const s = new Set(prev); s.delete(subtaskId); return s; });
      } finally {
        setDeletingSubtaskIds(prev => { const s = new Set(prev); s.delete(subtaskId); return s; });
      }
    }, 220);
  };

  // ── Tab slide direction (details=0, subtasks=1, notes=2) ─
  const TAB_ORDER: Record<'details' | 'subtasks' | 'notes', number> = { details: 0, subtasks: 1, notes: 2 };
  const slideIn = TAB_ORDER[activeTab] > TAB_ORDER[prevTabRef.current]
    ? 'slide-in-from-right-2'
    : 'slide-in-from-left-2';

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) { onClose(); resetForm(); }
      }}
    >
      <DialogContent className="sm:max-w-[640px] rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-hide !p-6">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-3 flex-wrap">
            <DialogTitle className="text-xl font-bold flex-1">
              {dialogTitle ?? (task?._id ? 'Edit Task' : 'Create New Task')}
            </DialogTitle>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 shrink-0">
                <UserCheck size={11} /> Assigned
              </span>
            )}
            <PresenceAvatars users={activeUsers} />
          </div>
        </DialogHeader>

        {/* ── Tab bar — only when editing an existing task ─── */}
        {task?._id && (
          <div className="flex items-center border-b border-border -mt-1">
            <button
              type="button"
              onClick={() => handleTabChange('details')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === 'details'
                  ? 'border-[#FE812C] text-[#FE812C]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('subtasks')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                activeTab === 'subtasks'
                  ? 'border-[#FE812C] text-[#FE812C]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Subtasks
              {subtasks.length > 0 && (
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                  activeTab === 'subtasks'
                    ? 'bg-[#FE812C]/15 text-[#FE812C]'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {subtasks.filter(s => s.status === 'done').length}/{subtasks.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('notes')}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
                activeTab === 'notes'
                  ? 'border-[#FE812C] text-[#FE812C]'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              Update Notes
              {notesCount > 0 && (
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none',
                  activeTab === 'notes'
                    ? 'bg-[#FE812C]/15 text-[#FE812C]'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {notesCount}
                </span>
              )}
            </button>

            {!isReadOnly && (
              <div className="ml-auto flex items-center gap-2 pr-1">
                {breakdownError && (
                  <span className="text-xs text-destructive">{breakdownError}</span>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (breakdownItems.length > 0) { setBreakdownItems([]); setBreakdownError(''); return; }
                    setBreakdownLoading(true);
                    setBreakdownError('');
                    try {
                      const items = await taskService.breakdownTask(task._id!);
                      setBreakdownItems(items);
                      handleTabChange('details');
                    } catch {
                      setBreakdownError('AI breakdown failed. Please try again.');
                    } finally {
                      setBreakdownLoading(false);
                    }
                  }}
                  disabled={breakdownLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {breakdownLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Sparkles size={13} className="text-[#FE812C]" />
                  )}
                  {breakdownItems.length > 0 ? 'Clear' : 'AI Breakdown'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Details tab ─────────────────────────────────── */}
        {(!task?._id || activeTab === 'details') && (
          <div
            key={`details-${task?._id ?? 'new'}`}
            className={cn(
              task?._id && 'animate-in fade-in-0 duration-200',
              task?._id && activeTab === 'details' && 'slide-in-from-left-2',
            )}
          >
            <form onSubmit={handleSubmit} className="space-y-5 mt-3">
              {(error || externalError) && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3 py-2 text-sm">
                  {error || externalError}
                </div>
              )}

              {canAssign && lockedProjectId ? (
                // minmax(0,…) stops a long milestone name from inflating its
                // grid track and squeezing the title input — the select value
                // truncates inside its fixed fraction instead.
                <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)] gap-3 items-start">
                  <div className="space-y-2">
                    <Label htmlFor="task-title" className="font-medium">Title</Label>
                    <Input
                      id="task-title"
                      placeholder="Enter task title..."
                      value={title}
                      onChange={(e) => { setTitle(e.target.value); setError(''); }}
                      className="rounded-xl"
                      autoFocus={!isReadOnly}
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-medium">Milestone</Label>
                    {projectMilestones.length > 0 ? (
                      <Select
                        value={milestoneId ?? '__none__'}
                        onValueChange={v => setMilestoneId(v === '__none__' ? null : v)}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="rounded-xl text-xs h-8 px-2 w-full min-w-0"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent position="popper" className="z-[200]">
                          <SelectItem value="__none__">None</SelectItem>
                          {projectMilestones.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="h-8 rounded-xl bg-muted/50 border border-border flex items-center px-2 text-xs text-muted-foreground">None</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="task-title" className="font-medium">Title</Label>
                  <Input
                    id="task-title"
                    placeholder="Enter task title..."
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setError(''); }}
                    className="rounded-xl"
                    autoFocus={!isReadOnly}
                    disabled={isReadOnly}
                  />
                </div>
              )}

              {breakdownItems.length > 0 && task?._id && !isReadOnly && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Sparkles size={11} className="text-[#FE812C]" />
                      AI Suggested Breakdown
                    </span>
                    <button
                      type="button"
                      onClick={() => setBreakdownItems([])}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {breakdownItems.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1 w-3.5 h-3.5 rounded border border-border shrink-0" />
                        <span className="leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={addingBreakdown !== null}
                      onClick={async () => {
                        setAddingBreakdown('notes');
                        try {
                          for (const item of breakdownItems) {
                            await taskNoteService.addNote(task._id!, `<p>${item}</p>`);
                          }
                          setBreakdownItems([]);
                          setActiveTab('notes');
                          setNotesEverOpened(true);
                        } catch {
                          setBreakdownError('Failed to add items as notes.');
                        } finally {
                          setAddingBreakdown(null);
                        }
                      }}
                      className="rounded-lg text-xs gap-1.5 h-7 px-3"
                    >
                      {addingBreakdown === 'notes' ? <Loader2 size={12} className="animate-spin" /> : <List size={12} />}
                      Add as Notes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={addingBreakdown !== null}
                      onClick={async () => {
                        setAddingBreakdown('subtasks');
                        try {
                          for (const item of breakdownItems) {
                            await subtaskService.create(task._id!, { title: item });
                          }
                          const refreshed = await subtaskService.list(task._id!);
                          setSubtasks(refreshed.data);
                          setBreakdownItems([]);
                          setActiveTab('subtasks');
                        } catch {
                          setBreakdownError('Failed to add items as subtasks.');
                        } finally {
                          setAddingBreakdown(null);
                        }
                      }}
                      className="rounded-lg text-xs gap-1.5 h-7 px-3"
                    >
                      {addingBreakdown === 'subtasks' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Add as Subtasks
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-start">
                <div className="space-y-2">
                  <Label className="font-medium">Description</Label>
                  <DescriptionEditor
                    key={task?._id ?? (open ? 'new-open' : 'new-closed')}
                    value={description}
                    onChange={setDescription}
                    disabled={isReadOnly}
                    className="min-h-[160px]"
                  />
                </div>
                <div className="space-y-2.5 w-full sm:w-[160px] shrink-0">
                  <div className="space-y-1.5">
                    {lockedProjectId && !showDirectStatus ? (
                      <>
                        <Label className="text-xs">Status</Label>
                        {projectColumns.length > 0 ? (
                          <Select
                            value={columnId ?? ''}
                            onValueChange={(newColId) => {
                              setColumnId(newColId);
                              const s = statusForColumn(projectColumns, newColId);
                              if (s) setStatus(s);
                            }}
                            disabled={isReadOnly}>
                            <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {projectColumns.map(col => (
                                <SelectItem key={col.id} value={col.id}>{col.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="h-8 rounded-xl bg-muted/50 border border-border animate-pulse" />
                        )}
                      </>
                    ) : (
                      <>
                        <Label className="text-xs">Status</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as 'todo' | 'doing' | 'done')} disabled={isReadOnly}>
                          <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">To Do</SelectItem>
                            <SelectItem value="doing">Doing</SelectItem>
                            <SelectItem value="done">Done</SelectItem>
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority</Label>
                    <Select value={priority} onValueChange={(v) => setPriority(v as 'low' | 'medium' | 'high')} disabled={isReadOnly}>
                      <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {lockedProjectId && projectMembers && projectMembers.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Assignee</Label>
                      {canAssign ? (
                        <Select
                          value={assignedTo ?? '__none__'}
                          onValueChange={(v) => setAssignedTo(v === '__none__' ? null : v)}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Unassigned</SelectItem>
                            {projectMembers.map(m => (
                              <SelectItem key={m.profileId} value={m.profileId}>
                                {m.profile?.name ?? m.profile?.email ?? m.profileId}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : canSelfAssignOnly ? (
                        <div className="flex items-center h-8 px-2 rounded-xl border border-border bg-muted/30 text-xs text-foreground select-none truncate">
                          {(() => {
                            const m = projectMembers.find(x => x.profileId === myProfileId);
                            const name = m?.profile?.name ?? m?.profile?.email;
                            return name ? `${name} (me)` : 'Me';
                          })()}
                        </div>
                      ) : (
                        <div className="flex items-center h-8 px-2 rounded-xl border border-border bg-muted/50 text-xs text-muted-foreground select-none truncate">
                          {assignedTo
                            ? (projectMembers.find(m => m.profileId === assignedTo)?.profile?.name
                                ?? projectMembers.find(m => m.profileId === assignedTo)?.profile?.email
                                ?? 'Assigned')
                            : 'Unassigned'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const showProject = lockedProjectId || projects.filter(p => !p.archivedAt && !p.deletedAt).length > 0;
                return showProject ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="task-tags" className="font-medium">Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                      <Input id="task-tags" placeholder="bug, feature, etc." value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="rounded-xl" disabled={isReadOnly} />
                    </div>
                    <div className="space-y-2">
                      <Label className="font-medium">
                        {lockedProjectId ? 'Project' : <>Project <span className="text-muted-foreground font-normal">(optional)</span></>}
                      </Label>
                      {lockedProjectId ? (
                        <div className="flex items-center h-9 px-3 rounded-xl border border-border bg-muted/50 text-sm text-muted-foreground cursor-not-allowed select-none truncate">
                          {lockedProjectName || projects.find(p => p.id === lockedProjectId)?.name || lockedProjectId}
                        </div>
                      ) : (
                        // Moving an existing task between projects isn't supported by
                        // the update API (projectId is stripped server-side), so only
                        // offer the picker on create — editing showed a select whose
                        // choice silently did nothing.
                        <Select value={projectId} onValueChange={setProjectId} disabled={isReadOnly || !!task?._id}>
                          <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {projects.filter(p => !p.archivedAt && !p.deletedAt).map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="task-tags" className="font-medium">Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                    <Input id="task-tags" placeholder="bug, feature, etc." value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} className="rounded-xl" disabled={isReadOnly} />
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-[4fr_4fr_2fr] gap-3">
                <div className="space-y-2">
                  <Label htmlFor="task-scheduled" className="font-medium">Scheduled for</Label>
                  <Input id="task-scheduled" type="datetime-local" step="60" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="rounded-xl" disabled={isReadOnly} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-deadline" className="font-medium">Deadline <span className="text-muted-foreground font-normal">(opt.)</span></Label>
                  {isRecurring ? (
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic">
                      Not applicable for recurring tasks
                    </div>
                  ) : (
                    <Input id="task-deadline" type="datetime-local" step="60" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="rounded-xl" disabled={isReadOnly} />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-estimated-hours" className="font-medium">Est. hours <span className="text-muted-foreground font-normal">(opt.)</span></Label>
                  <Input
                    id="task-estimated-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 4"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                    className="rounded-xl"
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              {!isReadOnly && (
                <div className="space-y-2.5 pt-0.5">
                  <div className="flex items-center gap-2">
                    <input
                      id="task-recurring"
                      type="checkbox"
                      checked={isRecurring}
                      onChange={(e) => {
                        setIsRecurring(e.target.checked);
                        if (e.target.checked) setDeadline('');
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const next = !isRecurring; setIsRecurring(next); if (next) setDeadline(''); } }}
                      className="w-4 h-4 rounded accent-[#FE812C] cursor-pointer"
                    />
                    <Label htmlFor="task-recurring" className="cursor-pointer font-normal">Make this a recurring task</Label>
                  </div>
                  {isRecurring && (
                    <div className="pl-6">
                      <div className="flex flex-wrap gap-3 items-start">
                        <div className="space-y-1.5 w-[72px] shrink-0">
                          <Label className="text-xs">Every</Label>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            value={recurrenceInterval}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              setRecurrenceInterval(isNaN(v) || v < 1 ? 1 : v > 365 ? 365 : v);
                            }}
                            className="rounded-xl h-9 text-center px-2"
                          />
                        </div>
                        <div className="space-y-1.5 w-[130px] shrink-0">
                          <Label className="text-xs">Unit</Label>
                          <Select value={recurrenceUnit} onValueChange={(v) => setRecurrenceUnit(v as 'DAILY' | 'WEEKLY' | 'MONTHLY')}>
                            <SelectTrigger className="rounded-xl !h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="DAILY">{recurrenceInterval > 1 ? 'Days' : 'Day'}</SelectItem>
                              <SelectItem value="WEEKLY">{recurrenceInterval > 1 ? 'Weeks' : 'Week'}</SelectItem>
                              <SelectItem value="MONTHLY">{recurrenceInterval > 1 ? 'Months' : 'Month'}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5 w-[185px] shrink-0 ml-1">
                          <Label htmlFor="task-recurrence-end" className="text-xs">End date <span className="text-muted-foreground font-normal">(opt.)</span></Label>
                          <Input id="task-recurrence-end" type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} className="rounded-xl h-9" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {task?.createdAt && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Created at</Label>
                  <p className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/40 rounded-xl">{formatCreatedAt(task.createdAt)}</p>
                </div>
              )}

              {infiniteRecurringWarn && (
                <div className="rounded-xl border border-orange-300/60 bg-orange-50/80 dark:bg-orange-950/20 dark:border-orange-800/40 px-4 py-3 text-sm flex flex-col gap-2.5">
                  <p className="font-medium text-orange-800 dark:text-orange-300 text-xs leading-snug">
                    ⚠️ No end date set — this task will repeat indefinitely. Are you sure?
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setInfiniteRecurringWarn(false)} className="rounded-xl h-7 text-xs px-3">
                      Set an end date
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => { setInfiniteRecurringWarn(false); onSubmit(buildSubmitPayload()); }}
                      className="rounded-xl h-7 text-xs px-3 bg-[#FE812C] hover:bg-[#e5732a] text-white"
                    >
                      Yes, continue
                    </Button>
                  </div>
                </div>
              )}

              {isReadOnly && (
                <p className="text-xs text-muted-foreground text-center py-1 bg-muted/40 rounded-xl px-3">
                  This task was assigned to you. Contact your manager to make changes.
                </p>
              )}

              <DialogFooter className="pt-1 flex-col gap-2 sm:flex-row sm:items-center !-mx-6 !-mb-6">
                {onCancelFromDate && task?._id && task?.recurrenceParentId && (
                  <div className="flex-1 flex justify-start">
                    {confirmCancelFrom ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Cancel all future occurrences?</span>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmCancelFrom(false)} className="h-7 px-2 text-xs rounded-lg">Keep</Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => { setConfirmCancelFrom(false); onCancelFromDate(); }} className="h-7 px-2 text-xs rounded-lg">Yes, cancel</Button>
                      </div>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmCancelFrom(true)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl text-xs h-8 px-3">
                        Cancel from this date onwards
                      </Button>
                    )}
                  </div>
                )}
                <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
                  {isReadOnly ? 'Close' : 'Cancel'}
                </Button>
                {!isReadOnly && (
                  <Button type="submit" disabled={loading} className="rounded-xl bg-[#FE812C] hover:bg-[#e5732a] text-white">
                    {loading ? 'Saving...' : task?._id ? 'Update Task' : 'Create Task'}
                  </Button>
                )}
              </DialogFooter>
            </form>
          </div>
        )}

        {/* ── Subtasks tab ─────────────────────────────────── */}
        {task?._id && activeTab === 'subtasks' && (
          <div
            key="subtasks-content"
            className={cn('mt-3 space-y-3 animate-in fade-in-0 duration-200', slideIn)}
          >
            {/* Loading */}
            {subtasksLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Loading...
              </div>
            ) : (
              <>
                {/* Empty state */}
                {subtasks.length === 0 && (
                  <div className="text-center py-10 space-y-1">
                    <p className="text-sm text-muted-foreground">No subtasks yet.</p>
                    {!isReadOnly && <p className="text-xs text-muted-foreground/60">Add one below to break this task into steps.</p>}
                  </div>
                )}

                {/* Subtask list */}
                {subtasks.length > 0 && (
                  <div className="space-y-0.5 max-h-[320px] overflow-y-auto scrollbar-hide pr-1 -mx-1 px-1">
                    {subtasks.map(s => {
                      const isConfirming = confirmDeleteSubtaskId === s._id;
                      const isDeleting   = deletingSubtaskIds.has(s._id);
                      return (
                        <div
                          key={s._id}
                          className={cn(
                            'flex items-center gap-2 group py-1.5 px-2 rounded-xl transition-all duration-200 hover:bg-muted/40',
                            isDeleting && 'opacity-0 -translate-y-1 scale-[0.98] pointer-events-none',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => void handleToggleSubtask(s)}
                            className={cn(
                              'shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                              s.status === 'done' ? 'bg-primary border-primary' : 'border-border hover:border-primary',
                            )}
                          >
                            {s.status === 'done' && <Check size={9} className="text-primary-foreground" strokeWidth={3} />}
                          </button>
                          <span className={cn('flex-1 text-sm truncate', s.status === 'done' && 'line-through text-muted-foreground')}>
                            {s.title}
                          </span>
                          {!isReadOnly && (
                            isConfirming ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150 shrink-0">
                                <span className="text-xs text-muted-foreground">Delete?</span>
                                <button type="button" onClick={() => setConfirmDeleteSubtaskId(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted">
                                  Keep
                                </button>
                                <button type="button" onClick={() => handleDeleteSubtask(s._id)}
                                  className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors px-1.5 py-0.5 rounded-md hover:bg-destructive/10">
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSubtaskId(s._id)}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive transition-all shrink-0"
                              >
                                <Trash2 size={11} />
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add new */}
                {!isReadOnly && (
                  <div className="flex gap-2 pt-1">
                    <Input
                      placeholder="Add a subtask..."
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAddSubtask(); } }}
                      className="rounded-xl h-9 text-sm"
                      autoFocus
                    />
                    <Button
                      type="button"
                      onClick={() => void handleAddSubtask()}
                      disabled={!newSubtaskTitle.trim() || submittingSubtask}
                      className="shrink-0 rounded-xl h-9 px-3 bg-[#FE812C] hover:bg-[#e5732a] text-white text-xs gap-1"
                    >
                      {submittingSubtask ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Add
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Update Notes tab — lazy-mounted on first visit ── */}
        {task?._id && notesEverOpened && (
          <div hidden={activeTab !== 'notes'}>
            <Suspense
              fallback={
                <div className="mt-3 py-10 flex items-center justify-center">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              }
            >
              <TaskDialogNotesTab
                taskId={task._id}
                currentUserEmail={user?.email}
                animationClass={slideIn}
                onCountChange={setNotesCount}
              />
            </Suspense>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
