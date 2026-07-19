import { useState, useEffect, useCallback } from 'react';
import { adminTeamService, type AssignTaskPayload } from '@/services/adminTeamService';
import { projectService } from '@/services/projectService';
import { getApiErrorMessage } from '@/services/api';
import type { TeamOverviewMember, Project } from '@/types';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: TeamOverviewMember | null;
  onSuccess: () => void;
}

const NONE = '__none__';

export default function AssignTaskDialog({ open, onOpenChange, member, onSuccess }: AssignTaskDialogProps) {
  const [title, setTitle]                   = useState('');
  const [description, setDescription]       = useState('');
  const [status, setStatus]                 = useState<'todo' | 'doing' | 'done'>('todo');
  const [priority, setPriority]             = useState('');
  const [deadline, setDeadline]             = useState('');
  const [scheduledAt, setScheduledAt]       = useState('');
  const [tags, setTags]                     = useState('');
  const [estHours, setEstHours]             = useState('');
  const [projectId, setProjectId]           = useState(NONE);
  const [isRecurring, setIsRecurring]       = useState(false);
  const [recurrenceUnit, setRecurrenceUnit] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | ''>('');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceEndDate, setRecurrenceEndDate]   = useState('');
  const [infiniteWarn, setInfiniteWarn]     = useState(false);
  const [error, setError]                   = useState('');

  const [projects, setProjects]               = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [submitting, setSubmitting]           = useState(false);

  const reset = useCallback(() => {
    setTitle(''); setDescription(''); setStatus('todo'); setPriority('');
    setDeadline(''); setScheduledAt(''); setTags(''); setEstHours('');
    setProjectId(NONE); setIsRecurring(false); setRecurrenceUnit('');
    setRecurrenceInterval(1); setRecurrenceEndDate('');
    setInfiniteWarn(false); setError('');
  }, []);

  useEffect(() => {
    if (!open) { reset(); return; }
    setProjectsLoading(true);
    projectService.getProjects()
      .then(res => setProjects(res.data.filter(p => !p.deletedAt && !p.archivedAt)))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false));
  }, [open, reset]);

  const buildPayload = (): AssignTaskPayload => {
    const payload: AssignTaskPayload = {
      title: title.trim(),
      status,
      targetProfileId: member!.profileId,
      isRecurring,
      recurrenceType: isRecurring ? (recurrenceUnit as 'DAILY' | 'WEEKLY' | 'MONTHLY') : null,
      recurrenceInterval: isRecurring && recurrenceInterval > 1 ? recurrenceInterval : null,
      recurrenceEndDate: isRecurring && recurrenceEndDate
        ? new Date(`${recurrenceEndDate}T23:59:59`).toISOString()
        : null,
    };
    if (description.trim()) payload.description   = description.trim();
    if (priority)           payload.priority       = priority as 'low' | 'medium' | 'high';
    if (!isRecurring && deadline) payload.deadline = new Date(deadline).toISOString();
    if (scheduledAt)        payload.scheduledAt    = new Date(scheduledAt).toISOString();
    if (tags.trim())        payload.tags           = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (estHours)           payload.estimatedHours = parseFloat(estHours);
    if (projectId !== NONE) payload.projectId      = projectId;
    return payload;
  };

  const submit = async () => {
    if (!member) return;
    if (!title.trim()) { setError('Title is required'); return; }
    if (isRecurring && !recurrenceUnit) { setError('Please select how often this task repeats'); return; }
    if (isRecurring && !recurrenceEndDate) { setInfiniteWarn(true); return; }

    setSubmitting(true);
    setError('');
    try {
      await adminTeamService.assignTask(buildPayload());
      toast.success('Task assigned successfully');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to assign task'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitIgnoringEndDate = async () => {
    setInfiniteWarn(false);
    setSubmitting(true);
    try {
      await adminTeamService.assignTask(buildPayload());
      toast.success('Task assigned successfully');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to assign task'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] rounded-2xl max-h-[90vh] overflow-x-hidden overflow-y-auto scrollbar-hide !p-6">
        <DialogHeader className="pr-2">
          <DialogTitle className="text-xl font-bold">Assign Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-3">
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="at-title" className="font-medium">Title</Label>
            <Input
              id="at-title"
              placeholder="Enter task title..."
              value={title}
              onChange={e => { setTitle(e.target.value); setError(''); }}
              className="rounded-xl"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) void submit(); }}
            />
          </div>

          {/* Description (left) + Status / Priority / Assigning-to (right) */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">Description</Label>
              <Textarea
                placeholder="Add a description (optional)..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="rounded-xl min-h-[160px] resize-none"
              />
            </div>

            <div className="space-y-2.5 w-[160px] shrink-0">
              {/* Assigning to */}
              {member && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Assigning to</Label>
                  <div className="flex items-center gap-1.5 h-8 px-2 rounded-xl border border-border bg-muted/50 text-xs text-foreground select-none min-w-0">
                    {member.avatar ? (
                      <img src={member.avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[9px] font-bold shrink-0">
                        {(member.name ?? member.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="truncate">{member.name ?? member.email}</span>
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={v => setStatus(v as typeof status)}>
                  <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="doing">Doing</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-xs">Priority</Label>
                <Select value={priority || NONE} onValueChange={v => setPriority(v === NONE ? '' : v)}>
                  <SelectTrigger className="rounded-xl text-xs h-8 px-2"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tags + Project */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">
                Tags <span className="text-muted-foreground font-normal">(comma-separated)</span>
              </Label>
              <Input
                placeholder="bug, feature, etc."
                value={tags}
                onChange={e => setTags(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">
                Project <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {projectsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                      <Loader2 size={12} className="animate-spin" /> Loading...
                    </div>
                  ) : (
                    projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {projectId === NONE && (
                <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-500 flex items-start gap-1">
                  <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                  Without a project, this task is personal to the assignee and won't appear on any project's Planning board.
                </p>
              )}
            </div>
          </div>

          {/* Scheduled + Deadline + Est. hours */}
          <div className="grid grid-cols-[4fr_4fr_2fr] gap-3">
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">Scheduled for</Label>
              <Input
                type="datetime-local"
                step="60"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
                className="rounded-xl w-full"
              />
            </div>
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">
                Deadline <span className="text-muted-foreground font-normal">(opt.)</span>
              </Label>
              {isRecurring ? (
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground italic h-9 flex items-center">
                  Not applicable
                </div>
              ) : (
                <Input
                  type="datetime-local"
                  step="60"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  className="rounded-xl w-full"
                />
              )}
            </div>
            <div className="space-y-2 min-w-0">
              <Label className="font-medium">
                Est. hours <span className="text-muted-foreground font-normal">(opt.)</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 4"
                value={estHours}
                onChange={e => setEstHours(e.target.value)}
                className="rounded-xl w-full"
              />
            </div>
          </div>

          {/* Recurring checkbox + panel */}
          <div className="space-y-2.5 pt-0.5">
            <div className="flex items-center gap-2">
              <input
                id="at-recurring"
                type="checkbox"
                checked={isRecurring}
                onChange={e => {
                  setIsRecurring(e.target.checked);
                  if (e.target.checked) setDeadline('');
                  setError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = !isRecurring;
                    setIsRecurring(next);
                    if (next) setDeadline('');
                  }
                }}
                className="w-4 h-4 rounded accent-[#FE812C] cursor-pointer"
              />
              <Label htmlFor="at-recurring" className="cursor-pointer font-normal">
                Make this a recurring task
              </Label>
            </div>

            {isRecurring && (
              <div className="pl-6">
                <div className="flex gap-3 items-start">
                  <div className="space-y-1.5 w-[72px] shrink-0">
                    <Label className="text-xs">Every</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={recurrenceInterval}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        setRecurrenceInterval(isNaN(v) || v < 1 ? 1 : v > 365 ? 365 : v);
                      }}
                      className="rounded-xl h-9 text-center px-2"
                    />
                  </div>
                  <div className="space-y-1.5 w-[130px] shrink-0">
                    <Label className="text-xs">Unit</Label>
                    <Select
                      value={recurrenceUnit || NONE}
                      onValueChange={v => { setRecurrenceUnit(v === NONE ? '' : v as 'DAILY' | 'WEEKLY' | 'MONTHLY'); setError(''); }}
                    >
                      <SelectTrigger className="rounded-xl !h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Select</SelectItem>
                        <SelectItem value="DAILY">{recurrenceInterval > 1 ? 'Days' : 'Day'}</SelectItem>
                        <SelectItem value="WEEKLY">{recurrenceInterval > 1 ? 'Weeks' : 'Week'}</SelectItem>
                        <SelectItem value="MONTHLY">{recurrenceInterval > 1 ? 'Months' : 'Month'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 w-[185px] shrink-0 ml-1">
                    <Label className="text-xs">
                      End date <span className="text-muted-foreground font-normal">(opt.)</span>
                    </Label>
                    <Input
                      type="date"
                      value={recurrenceEndDate}
                      onChange={e => setRecurrenceEndDate(e.target.value)}
                      className="rounded-xl h-9"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Infinite recurring warning */}
          {infiniteWarn && (
            <div className="rounded-xl border border-orange-300/60 bg-orange-50/80 dark:bg-orange-950/20 dark:border-orange-800/40 px-4 py-3 text-sm flex flex-col gap-2.5">
              <p className="font-medium text-orange-800 dark:text-orange-300 text-xs leading-snug">
                ⚠️ No end date set — this task will repeat indefinitely. Are you sure?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setInfiniteWarn(false)}
                  className="rounded-xl h-7 text-xs px-3"
                >
                  Set an end date
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void submitIgnoringEndDate()}
                  className="rounded-xl h-7 text-xs px-3 bg-[#FE812C] hover:bg-[#e5732a] text-white"
                >
                  Yes, continue
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={submitting || !title.trim()}
            className="rounded-xl bg-[#FE812C] hover:bg-[#e5732a] text-white min-w-[120px]"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin mr-1.5" />Assigning...</>
              : 'Assign Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
