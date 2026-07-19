import { useState } from 'react';
import { ChevronRight, ChevronDown, GripVertical, Calendar, User, Plus, Trash2, Loader2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { usePlanningStore } from '@/store/planningStore';
import SubtaskNode from './SubtaskNode';
import type { PlanningTask, PlanningSubtask, ProjectMember } from '@/types';

const statusColors: Record<string, string> = {
  todo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  doing: 'bg-[#FE812C]/10 text-[#FE812C]',
  done: 'bg-primary/10 text-primary',
};

const statusLabels: Record<string, string> = {
  todo: 'To Do',
  doing: 'In Progress',
  done: 'Done',
};

const priorityColors: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-amber-500',
  low: 'text-emerald-500',
};

interface Props {
  task: PlanningTask;
  milestoneId: string;
  canEdit: boolean;
  projectMembers?: ProjectMember[];
  onOpenTask: (taskId: string) => void;
  onToggleSubtask: (task: PlanningTask, subtask: PlanningSubtask) => void;
  onAddSubtask?: (task: PlanningTask) => void;
  onDeleteTask?: (taskId: string) => Promise<void>;
  isDragging?: boolean;
}

export default function TaskNode({
  task, milestoneId, canEdit, projectMembers, onOpenTask, onToggleSubtask, onAddSubtask, onDeleteTask, isDragging,
}: Props) {
  const { expandedTasks, toggleTask } = usePlanningStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isExpanded = expandedTasks.has(task.id);
  const subtaskList = task.subtasks ?? [];
  const hasSubtasks = subtaskList.length > 0;

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging,
  } = useSortable({ id: task.id, data: { type: 'task', milestoneId } });

  const { setNodeRef: setSubtaskDropRef, isOver: isSubtaskOver } = useDroppable({
    id: `subtask-drop-${task.id}`,
    data: { type: 'subtask-drop', taskId: task.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging || isDragging ? 0.4 : 1,
  };

  const assignee = projectMembers?.find(m => m.profileId === task.assignedTo);
  const subtaskDone = task.subtaskProgress?.done ?? 0;
  const subtaskTotal = task.subtaskProgress?.total ?? subtaskList.length;
  const showSubtaskBadge = subtaskTotal > 0;

  return (
    <div ref={setNodeRef} style={style} className="group">
      <div className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-muted/40 transition-colors">
        {/* Drag handle */}
        {canEdit && (
          <button
            {...attributes} {...listeners}
            className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground opacity-40 group-hover:opacity-100 transition-opacity touch-none"
          >
            <GripVertical size={13} />
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => hasSubtasks && toggleTask(task.id)}
          className={`shrink-0 transition-colors ${hasSubtasks ? 'text-muted-foreground hover:text-foreground cursor-pointer' : 'text-transparent cursor-default'}`}
        >
          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Task title */}
        <button
          onClick={() => onOpenTask(task.id)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`text-sm font-medium truncate block ${task.status === 'done' ? 'line-through text-muted-foreground/60' : 'text-foreground hover:text-primary'} transition-colors`}>
            {task.title}
          </span>
        </button>

        {/* Badges row */}
        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            {isDeleting ? (
              <Loader2 size={12} className="animate-spin text-destructive" />
            ) : (
              <>
                <span className="text-[10px] text-destructive font-medium">Delete task?</span>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted text-muted-foreground transition-colors"
                >
                  No
                </button>
                <button
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await onDeleteTask!(task.id);
                    } finally {
                      setIsDeleting(false);
                      setConfirmDelete(false);
                    }
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
                >
                  Yes
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Status */}
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColors[task.status]}`}>
              {statusLabels[task.status]}
            </span>

            {/* Priority */}
            {task.priority && (
              <span className={`text-[10px] font-bold uppercase ${priorityColors[task.priority]}`}>
                {task.priority}
              </span>
            )}

            {/* Subtask progress */}
            {showSubtaskBadge && (
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {subtaskDone}/{subtaskTotal}
              </span>
            )}

            {/* Deadline — hidden on phones so the task title keeps its width */}
            {task.deadline && (
              <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Calendar size={9} />
                {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}

            {/* Assignee — hidden on phones so the task title keeps its width */}
            {assignee && (
              <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground">
                {assignee.profile?.avatar
                  ? <img src={assignee.profile.avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                  : <User size={10} />}
                <span className="max-w-[60px] truncate">{assignee.profile?.name ?? assignee.profile?.email}</span>
              </span>
            )}

            {/* Add subtask button */}
            {canEdit && onAddSubtask && (
              <button
                onClick={() => onAddSubtask(task)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                title="Add subtask"
                aria-label="Add subtask"
              >
                <Plus size={11} />
              </button>
            )}

            {/* Delete task button */}
            {canEdit && onDeleteTask && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Subtasks (expanded) */}
      {isExpanded && hasSubtasks && (
        <div
          ref={setSubtaskDropRef}
          className={`ml-8 border-l pl-2 mt-0.5 space-y-0.5 min-h-[4px] transition-colors ${isSubtaskOver ? 'border-primary/40 bg-primary/5 rounded' : 'border-border/40'}`}
        >
          {subtaskList.map(s => (
            <SubtaskNode
              key={s.id}
              subtask={s}
              parentTaskId={task.id}
              onToggle={(sub) => onToggleSubtask(task, sub)}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
