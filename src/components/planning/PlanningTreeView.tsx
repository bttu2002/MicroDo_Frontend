import { useEffect, useCallback, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Loader2, Plus, ChevronsUpDown, RefreshCw } from 'lucide-react';
import { usePlanningStore } from '@/store/planningStore';
import { useMilestoneStore } from '@/store/milestoneStore';
import MilestoneNode from './MilestoneNode';
import TaskNode from './TaskNode';
import type { PlanningTask, PlanningMilestone, PlanningSubtask, ProjectMember, Task } from '@/types';
import { planningService } from '@/services/planningService';
import { milestoneService } from '@/services/milestoneService';
import { subtaskService } from '@/services/subtaskService';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/services/api';
import TaskDialog from '@/components/TaskDialog';
import { useTaskStore } from '@/store/taskStore';
import { useSocketStore } from '@/store/socketStore';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  projectId: string;
  canManage: boolean;
  projectMembers?: ProjectMember[];
}

type ActiveDragItem =
  | { type: 'milestone'; item: PlanningMilestone }
  | { type: 'task'; item: PlanningTask; milestoneId: string }
  | { type: 'subtask'; item: PlanningSubtask; parentTaskId: string; milestoneId: string };

// Recalculates milestone progress from current task list (mirrors BE formula)
function computeProgress(tasks: PlanningTask[]) {
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}

export default function PlanningTreeView({ projectId, canManage, projectMembers }: Props) {
  const {
    tree, loading, error, expandedMilestones, fetchTree, refresh,
    patchMilestones, expandAll, collapseAll,
  } = usePlanningStore();

  const milestoneStore = useMilestoneStore();
  const { updateTask } = useTaskStore();
  const { socket, connected } = useSocketStore();

  const [activeDrag, setActiveDrag] = useState<ActiveDragItem | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [createForMilestone, setCreateForMilestone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', startDate: '', deadline: '' });
  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED'>('ALL');
  // Assignee filter for the "No Milestone" section — lets a manager see at a
  // glance which not-yet-planned tasks also have nobody responsible for them
  const [noMilestoneFilter, setNoMilestoneFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  useEffect(() => {
    fetchTree(projectId);
    return () => usePlanningStore.getState().reset();
  }, [projectId]);

  // Real-time planning sync (D-09) — re-join on reconnect via `connected` dep
  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit('join:project', projectId);
    const handler = () => { void usePlanningStore.getState().refresh(); };
    socket.on('planning:updated', handler);
    return () => { socket.off('planning:updated', handler); };
  }, [socket, connected, projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!tree) return;
    const { active } = event;
    const data = active.data.current as { type: string; milestoneId?: string; parentTaskId?: string } | undefined;

    if (data?.type === 'milestone') {
      const m = tree.milestones.find(m => m.id === active.id);
      if (m) setActiveDrag({ type: 'milestone', item: m });
    } else if (data?.type === 'task') {
      const milestoneId = data.milestoneId ?? '';
      const m = tree.milestones.find(m => m.id === milestoneId);
      const t = m?.tasks.find(t => t.id === active.id)
        ?? tree.unassigned.data.find(t => t.id === active.id);
      if (t) setActiveDrag({ type: 'task', item: t, milestoneId });
    } else if (data?.type === 'subtask') {
      const parentTaskId = data.parentTaskId ?? '';
      for (const m of tree.milestones) {
        const t = m.tasks.find(t => t.id === parentTaskId);
        if (t) {
          const s = t.subtasks.find(s => s.id === active.id);
          if (s) { setActiveDrag({ type: 'subtask', item: s, parentTaskId, milestoneId: m.id }); break; }
        }
      }
    }
  }, [tree]);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const data = await planningService.getTree(projectId);
      usePlanningStore.setState({ tree: data });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to refresh'));
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, projectId]);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual-only — no state mutation on over
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over || !tree) return;

    const activeData = active.data.current as { type: string; milestoneId?: string; parentTaskId?: string } | undefined;
    const overData = over.data.current as { type: string; milestoneId?: string; taskId?: string } | undefined;

    // ── CASE 1: Milestone reorder ──
    if (activeData?.type === 'milestone' && overData?.type === 'milestone' && active.id !== over.id) {
      const oldIndex = tree.milestones.findIndex(m => m.id === active.id);
      const newIndex = tree.milestones.findIndex(m => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(tree.milestones, oldIndex, newIndex);
      patchMilestones(reordered);

      const items = reordered.map((m, idx) => ({ id: m.id, order: idx }));
      try {
        await milestoneService.reorderMilestones(projectId, items);
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to reorder milestones'));
        await refresh();
      }
      return;
    }

    // ── CASE 2: Task reorder within same milestone ──
    if (activeData?.type === 'task' && overData?.type === 'task' && active.id !== over.id) {
      const srcMilestoneId = activeData.milestoneId!;
      const dstMilestoneId = overData.milestoneId!;

      if (srcMilestoneId === dstMilestoneId) {
        const mIdx = tree.milestones.findIndex(m => m.id === srcMilestoneId);
        if (mIdx === -1) return;

        const tasks = [...tree.milestones[mIdx]!.tasks];
        const oldIdx = tasks.findIndex(t => t.id === active.id);
        const newIdx = tasks.findIndex(t => t.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;

        const reorderedTasks = arrayMove(tasks, oldIdx, newIdx);
        const newMilestones = tree.milestones.map((m, i) =>
          i === mIdx ? { ...m, tasks: reorderedTasks } : m
        );
        patchMilestones(newMilestones);

        try {
          await planningService.reorderMilestoneTasks(projectId, srcMilestoneId, reorderedTasks.map(t => t.id));
        } catch (err) {
          toast.error(getApiErrorMessage(err, 'Failed to reorder tasks'));
          await refresh();
        }
        return;
      }
    }

    // ── CASE 3: Task moved to a different milestone ──
    if (activeData?.type === 'task') {
      const srcMilestoneId = activeData.milestoneId ?? '';

      // Accept drops on: milestone header, expanded drop zone, or a task inside another milestone
      const targetMilestoneId =
        overData?.type === 'milestone-drop' ? overData.milestoneId! :
        overData?.type === 'milestone' ? (over.id as string) :
        (overData?.type === 'task' && overData.milestoneId && overData.milestoneId !== srcMilestoneId)
          ? overData.milestoneId
          : null;

      if (!targetMilestoneId) return;
      if (srcMilestoneId === targetMilestoneId) return;

      const dstIdx = tree.milestones.findIndex(m => m.id === targetMilestoneId);
      if (dstIdx === -1) return;

      // ── Unassigned → milestone ──
      if (srcMilestoneId === '') {
        const task = tree.unassigned.data.find(t => t.id === active.id);
        if (!task) return;

        const newTask = { ...task, milestoneId: targetMilestoneId };
        const dstTasks = [...tree.milestones[dstIdx]!.tasks, newTask];
        const newMilestones = tree.milestones.map((m, i) =>
          i === dstIdx ? { ...m, tasks: dstTasks, progress: computeProgress(dstTasks) } : m
        );

        // Optimistic: move task out of unassigned, into milestone
        usePlanningStore.setState(state => ({
          tree: state.tree ? {
            ...state.tree,
            milestones: newMilestones,
            unassigned: {
              ...state.tree.unassigned,
              data: state.tree.unassigned.data.filter(t => t.id !== active.id),
              total: Math.max(0, state.tree.unassigned.total - 1),
            },
          } : null,
        }));

        try {
          await updateTask(task.id, { milestoneId: targetMilestoneId });
          await refresh();
        } catch (err) {
          toast.error(getApiErrorMessage(err, 'Failed to move task'));
          await refresh();
        }
        return;
      }

      // ── Milestone → different milestone ──
      const srcIdx = tree.milestones.findIndex(m => m.id === srcMilestoneId);
      if (srcIdx === -1) return;

      const task = tree.milestones[srcIdx]!.tasks.find(t => t.id === active.id);
      if (!task) return;

      const newTask = { ...task, milestoneId: targetMilestoneId };
      const newMilestones = tree.milestones.map((m, i) => {
        if (i === srcIdx) {
          const srcTasks = m.tasks.filter(t => t.id !== active.id);
          return { ...m, tasks: srcTasks, progress: computeProgress(srcTasks) };
        }
        if (i === dstIdx) {
          const dstTasks = [...m.tasks, newTask];
          return { ...m, tasks: dstTasks, progress: computeProgress(dstTasks) };
        }
        return m;
      });
      patchMilestones(newMilestones);

      try {
        await updateTask(task.id, { milestoneId: targetMilestoneId });
        await refresh();
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to move task'));
        await refresh();
      }
    }

    // ── CASE 4: Subtask moved to another task ──
    if (activeData?.type === 'subtask') {
      const subtaskId = active.id as string;
      const srcParentId = activeData.parentTaskId ?? '';

      const targetTaskId: string | null =
        overData?.type === 'subtask-drop' ? (overData.taskId ?? null) :
        overData?.type === 'task' ? (over.id as string) : null;

      if (!targetTaskId || targetTaskId === srcParentId) return;

      // Find subtask and source/dest milestones
      let foundSubtask: PlanningSubtask | null = null;
      let srcMilestoneId: string | null = null;
      for (const m of tree.milestones) {
        const t = m.tasks.find(t => t.id === srcParentId);
        if (t) {
          const s = t.subtasks.find(s => s.id === subtaskId);
          if (s) { foundSubtask = s; srcMilestoneId = m.id; break; }
        }
      }
      if (!foundSubtask || !srcMilestoneId) return;

      let dstMilestoneId: string | null = null;
      for (const m of tree.milestones) {
        if (m.tasks.find(t => t.id === targetTaskId)) { dstMilestoneId = m.id; break; }
      }
      if (!dstMilestoneId) return;

      // Optimistic update
      const capturedSubtask = foundSubtask;
      const newMilestones = tree.milestones.map(m => {
        // Same milestone: both tasks are in it
        if (m.id === srcMilestoneId && m.id === dstMilestoneId) {
          return {
            ...m,
            tasks: m.tasks.map(t => {
              if (t.id === srcParentId) {
                const newSubs = t.subtasks.filter(s => s.id !== subtaskId);
                return { ...t, subtasks: newSubs, subtaskProgress: { done: newSubs.filter(s => s.status === 'done').length, total: newSubs.length } };
              }
              if (t.id === targetTaskId) {
                const newSubs = [...t.subtasks, capturedSubtask];
                return { ...t, subtasks: newSubs, subtaskProgress: { done: newSubs.filter(s => s.status === 'done').length, total: newSubs.length } };
              }
              return t;
            }),
          };
        }
        if (m.id === srcMilestoneId) {
          return {
            ...m,
            tasks: m.tasks.map(t => {
              if (t.id !== srcParentId) return t;
              const newSubs = t.subtasks.filter(s => s.id !== subtaskId);
              return { ...t, subtasks: newSubs, subtaskProgress: { done: newSubs.filter(s => s.status === 'done').length, total: newSubs.length } };
            }),
          };
        }
        if (m.id === dstMilestoneId) {
          return {
            ...m,
            tasks: m.tasks.map(t => {
              if (t.id !== targetTaskId) return t;
              const newSubs = [...t.subtasks, capturedSubtask];
              return { ...t, subtasks: newSubs, subtaskProgress: { done: newSubs.filter(s => s.status === 'done').length, total: newSubs.length } };
            }),
          };
        }
        return m;
      });
      patchMilestones(newMilestones);

      try {
        await subtaskService.move(srcParentId, subtaskId, targetTaskId);
        void refresh();
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to move subtask'));
        await refresh();
      }
    }
  }, [tree, projectId, patchMilestones, refresh, updateTask]);

  const handleOpenTask = useCallback((taskId: string) => {
    if (!tree) return;
    let found: PlanningTask | null = null;
    for (const m of tree.milestones) {
      const t = m.tasks.find(t => t.id === taskId);
      if (t) { found = t; break; }
    }
    if (!found) {
      found = tree.unassigned.data.find(t => t.id === taskId) ?? null;
    }
    if (found) {
      setEditingTask({ ...found, _id: found.id } as unknown as Task);
    }
  }, [tree]);

  const handleAddTask = useCallback((milestoneId: string) => {
    setCreateForMilestone(milestoneId);
    setEditingTask({ _id: '__new__', title: '', description: '', status: 'todo', priority: 'medium', tags: [] } as unknown as Task);
  }, []);

  // Subtask toggle for the Unassigned Tasks section — mirrors
  // MilestoneNode.handleToggleSubtask but patches tree.unassigned (the old
  // `async () => {}` placeholder made these checkboxes silently do nothing).
  const handleToggleUnassignedSubtask = useCallback(async (task: PlanningTask, subtask: PlanningSubtask) => {
    const newStatus: 'todo' | 'done' = subtask.status === 'done' ? 'todo' : 'done';
    const currentTree = usePlanningStore.getState().tree;
    if (currentTree) {
      const newUnassigned = currentTree.unassigned.data.map(t => {
        if (t.id !== task.id) return t;
        const newSubs = t.subtasks.map(s =>
          s.id === subtask.id ? { ...s, status: newStatus as 'todo' | 'doing' | 'done' } : s
        );
        const done = newSubs.filter(s => s.status === 'done').length;
        return { ...t, subtasks: newSubs, subtaskProgress: { done, total: newSubs.length } };
      });
      usePlanningStore.setState({
        tree: { ...currentTree, unassigned: { ...currentTree.unassigned, data: newUnassigned } },
      });
    }
    try {
      await subtaskService.update(task.id, subtask.id, { status: newStatus });
      void refresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update subtask'));
      await refresh();
    }
  }, [refresh]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    // Optimistic: remove task from tree immediately
    const currentTree = usePlanningStore.getState().tree;
    if (currentTree) {
      const newMilestones = currentTree.milestones.map(m => ({
        ...m,
        tasks: m.tasks.filter(t => t.id !== taskId),
      }));
      const wasUnassigned = currentTree.unassigned.data.some(t => t.id === taskId);
      usePlanningStore.setState({
        tree: {
          ...currentTree,
          milestones: newMilestones,
          unassigned: wasUnassigned
            ? { ...currentTree.unassigned, data: currentTree.unassigned.data.filter(t => t.id !== taskId), total: Math.max(0, currentTree.unassigned.total - 1) }
            : currentTree.unassigned,
        },
      });
    }
    try {
      await useTaskStore.getState().deleteTask(taskId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete task'));
      void refresh(); // revert optimistic on error
    }
  }, [refresh]);

  const toIso = (val: string) => val ? `${val}T00:00:00.000Z` : null;

  const handleCreateMilestone = useCallback(async () => {
    if (!createForm.title.trim() || creatingMilestone) return;
    setCreatingMilestone(true);
    try {
      await milestoneStore.create(projectId, {
        title:       createForm.title.trim(),
        description: createForm.description.trim() || undefined,
        startDate:   toIso(createForm.startDate),
        deadline:    toIso(createForm.deadline),
      });
      await refresh();
      setShowCreateDialog(false);
      setCreateForm({ title: '', description: '', startDate: '', deadline: '' });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to create milestone'));
    } finally {
      setCreatingMilestone(false);
    }
  }, [createForm, creatingMilestone, milestoneStore, projectId, refresh]);

  // Overdue milestones bubble to top; within same rank, original server order preserved
  const sortedMilestones = [...(tree?.milestones ?? [])].sort((a, b) => {
    const rank = (m: typeof a) =>
      m.isOverdue && m.status !== 'COMPLETED' ? 0 :
      m.status === 'ACTIVE' ? 1 :
      m.status === 'COMPLETED' ? 2 : 3;
    return rank(a) - rank(b);
  });

  const filteredMilestones = statusFilter === 'ALL' ? sortedMilestones
    : statusFilter === 'OVERDUE' ? sortedMilestones.filter(m => m.isOverdue && m.status !== 'COMPLETED')
    : sortedMilestones.filter(m => m.status === statusFilter);

  const milestoneIds = filteredMilestones.map(m => m.id);

  const filterCounts = {
    ALL: sortedMilestones.length,
    ACTIVE: sortedMilestones.filter(m => m.status === 'ACTIVE' && !m.isOverdue).length,
    OVERDUE: sortedMilestones.filter(m => m.isOverdue && m.status !== 'COMPLETED').length,
    COMPLETED: sortedMilestones.filter(m => m.status === 'COMPLETED').length,
    CANCELLED: sortedMilestones.filter(m => m.status === 'CANCELLED').length,
  };

  if (loading || !tree) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive text-sm">
        {error}
        <button onClick={() => fetchTree(projectId)} className="ml-2 underline hover:no-underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (expandedMilestones.size > 0) collapseAll(); else expandAll();
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronsUpDown size={12} />
            {expandedMilestones.size > 0 ? 'Collapse all' : 'Expand all'}
          </button>
          <button
            onClick={() => void handleManualRefresh()}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {canManage && (
          <button
            onClick={() => { setCreateForm({ title: '', description: '', startDate: '', deadline: '' }); setShowCreateDialog(true); }}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={12} />
            New Milestone
          </button>
        )}
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {([ 'ALL', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'CANCELLED'] as const).map((f) => {
          const count = filterCounts[f];
          if (f !== 'ALL' && count === 0) return null;
          const active = statusFilter === f;
          const colors: Record<typeof f, string> = {
            ALL:       active ? 'bg-foreground text-background border-foreground' : 'text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground',
            ACTIVE:    active ? 'bg-blue-500 text-white border-blue-500' : 'text-blue-600 dark:text-blue-400 border-blue-500/30 hover:border-blue-500/60',
            OVERDUE:   active ? 'bg-destructive text-white border-destructive' : 'text-destructive border-destructive/30 hover:border-destructive/60',
            COMPLETED: active ? 'bg-emerald-500 text-white border-emerald-500' : 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:border-emerald-500/60',
            CANCELLED: active ? 'bg-muted-foreground text-background border-muted-foreground' : 'text-muted-foreground border-border hover:border-muted-foreground/50',
          };
          const labels: Record<typeof f, string> = { ALL: 'All', ACTIVE: 'Active', OVERDUE: 'Overdue', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
          return (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${colors[f]}`}
            >
              {labels[f]}
              <span className={`text-[10px] font-bold tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Create Milestone Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open && !creatingMilestone) {
          setShowCreateDialog(false);
          setCreateForm({ title: '', description: '', startDate: '', deadline: '' });
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Milestone</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="ms-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="ms-title"
                autoFocus
                placeholder="Milestone title..."
                value={createForm.title}
                onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') void handleCreateMilestone(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ms-desc">Description</Label>
              <Textarea
                id="ms-desc"
                placeholder="Optional description..."
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="resize-none text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ms-start">Start Date</Label>
                <Input
                  id="ms-start"
                  type="date"
                  value={createForm.startDate}
                  onChange={e => setCreateForm(f => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ms-deadline">Deadline</Label>
                <Input
                  id="ms-deadline"
                  type="date"
                  value={createForm.deadline}
                  onChange={e => setCreateForm(f => ({ ...f, deadline: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreateDialog(false); setCreateForm({ title: '', description: '', startDate: '', deadline: '' }); }}
              disabled={creatingMilestone}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleCreateMilestone()}
              disabled={!createForm.title.trim() || creatingMilestone}
              className="bg-[#FE812C] hover:bg-[#e5732a] text-white"
            >
              {creatingMilestone ? <><Loader2 size={14} className="animate-spin mr-1.5" />Creating...</> : 'Create Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DnD Context */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={milestoneIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {filteredMilestones.map(milestone => (
              <MilestoneNode
                key={milestone.id}
                milestone={milestone}
                canManage={canManage}
                projectMembers={projectMembers}
                onOpenTask={handleOpenTask}
                onAddTask={handleAddTask}
                projectId={projectId}
                onDeleteTask={canManage ? handleDeleteTask : undefined}
              />
            ))}
          </div>
        </SortableContext>

        {/* No-milestone tasks section — every parent project task not yet
            planned into a milestone, regardless of assignee. Filter chips
            split the list by assignee so nothing slips through. */}
        {tree.unassigned.data.length > 0 && (() => {
          const assignedTasks   = tree.unassigned.data.filter(t => t.assignedTo);
          const unassignedTasks = tree.unassigned.data.filter(t => !t.assignedTo);
          const visibleTasks =
            noMilestoneFilter === 'assigned'   ? assignedTasks :
            noMilestoneFilter === 'unassigned' ? unassignedTasks :
            tree.unassigned.data;
          const chips = [
            { key: 'all' as const,        label: 'All',        count: tree.unassigned.total },
            { key: 'assigned' as const,   label: 'Assigned',   count: assignedTasks.length },
            { key: 'unassigned' as const, label: 'Unassigned', count: unassignedTasks.length },
          ];
          return (
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border bg-muted/20">
                <span className="text-xs font-semibold text-muted-foreground">No Milestone</span>
                <div className="flex items-center gap-1 ml-1">
                  {chips.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setNoMilestoneFilter(chip.key)}
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                        noMilestoneFilter === chip.key
                          ? 'bg-primary/15 text-primary border border-primary/30'
                          : 'bg-muted text-muted-foreground border border-transparent hover:text-foreground'
                      }`}
                    >
                      {chip.label} {chip.count}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-1 ml-4 pl-3 border-l-2 border-dashed border-border/30 space-y-0.5">
                {visibleTasks.length === 0 ? (
                  <div className="py-2 text-[11px] text-muted-foreground italic">
                    No {noMilestoneFilter} tasks without a milestone.
                  </div>
                ) : visibleTasks.map(task => (
                  <TaskNode
                    key={task.id}
                    task={task}
                    milestoneId=""
                    canEdit={canManage}
                    projectMembers={projectMembers}
                    onOpenTask={handleOpenTask}
                    onToggleSubtask={handleToggleUnassignedSubtask}
                    onDeleteTask={canManage ? handleDeleteTask : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })()}

        {filteredMilestones.length === 0 && (
          <div className="text-center py-12 text-muted-foreground/50 text-sm">
            {statusFilter === 'ALL'
              ? 'No milestones yet. Create one to start planning.'
              : `No ${statusFilter.toLowerCase()} milestones.`}
          </div>
        )}

        {/* DnD overlay */}
        <DragOverlay>
          {activeDrag?.type === 'task' && (
            <div className="bg-card border border-primary/30 rounded-lg px-3 py-2 shadow-lg text-sm font-medium opacity-90">
              {activeDrag.item.title}
            </div>
          )}
          {activeDrag?.type === 'milestone' && (
            <div className="bg-card border border-primary/30 rounded-xl p-3 shadow-lg text-sm font-semibold opacity-90">
              {activeDrag.item.title}
            </div>
          )}
          {activeDrag?.type === 'subtask' && (
            <div className="bg-card border border-primary/30 rounded-lg px-2 py-1 shadow-lg text-xs font-medium opacity-90">
              {activeDrag.item.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Task edit dialog */}
      {editingTask && (
        <TaskDialog
          open={!!editingTask}
          onClose={() => { setEditingTask(null); setCreateForMilestone(null); refresh(); }}
          task={editingTask._id === '__new__' ? null : editingTask}
          onSubmit={async (data) => {
            setSubmitting(true);
            try {
              if (editingTask._id === '__new__') {
                await useTaskStore.getState().createTask({
                  ...data,
                  milestoneId: data.milestoneId ?? createForMilestone ?? undefined,
                });
              } else {
                await useTaskStore.getState().updateTask(editingTask._id, data);
              }
              await refresh();
              setEditingTask(null);
              setCreateForMilestone(null);
            } finally {
              setSubmitting(false);
            }
          }}
          lockedProjectId={projectId}
          showDirectStatus={true}
          projectMembers={projectMembers}
          canAssign={canManage}
          loading={submitting}
          onSubtasksChanged={() => refresh()}
          initialMilestoneId={createForMilestone}
          preloadedMilestones={tree?.milestones}
        />
      )}
    </div>
  );
}
