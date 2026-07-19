import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BoardColumn } from '@/types';
import { boardColumnService } from '@/services/boardColumnService';
import { taskService } from '@/services/taskService';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/services/api';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Priority = 'low' | 'medium' | 'high';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onCreated?: (count: number) => void;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  low:    'text-blue-500',
  medium: 'text-yellow-500',
  high:   'text-red-500',
};

export default function BulkCreateDialog({ open, onClose, projectId, onCreated }: Props) {
  const [text, setText]                         = useState('');
  const [columns, setColumns]                   = useState<BoardColumn[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [defaultPriority, setDefaultPriority]   = useState<Priority>('medium');
  const [loading, setLoading]                   = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    boardColumnService.getColumns(projectId)
      .then(res => {
        const sorted = [...res.data].sort((a, b) => a.order - b.order);
        setColumns(sorted);
        // Only set default if no column selected yet
        setSelectedColumnId(prev => prev || (sorted[0]?.id ?? ''));
      })
      .catch(() => {});
  }, [open, projectId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setText('');
      setSelectedColumnId('');
      setDefaultPriority('medium');
    }
  }, [open]);

  const parsedTasks = useMemo(() => {
    return text
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/\[(high|medium|low)\]/i);
        const title = trimmed.replace(/\[(high|medium|low)\]/gi, '').trim();
        if (!title) return null;
        return {
          title,
          priority: match ? (match[1].toLowerCase() as Priority) : undefined,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [text]);

  const handleCreate = async () => {
    if (parsedTasks.length === 0) return;
    setLoading(true);
    try {
      const result = await taskService.bulkCreateTasks({
        projectId,
        columnId: selectedColumnId || null,
        priority: defaultPriority,
        tasks: parsedTasks,
      });
      const count = result.data.count;
      toast.success(`${count} task${count === 1 ? '' : 's'} created`);
      onCreated?.(count);
      onClose();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      {/* max-h + flex-col so footer never goes off-screen */}
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Bulk Create Tasks</DialogTitle>
        </DialogHeader>

        {/* Scrollable body — grows to fill available height */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
          <div>
            <Label className="mb-1.5 block text-sm">
              Paste tasks, one per line:
            </Label>
            <Textarea
              placeholder={'Design landing page\nWrite API docs [high]\nFix login bug'}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              className="resize-none font-mono text-sm"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Add{' '}
              <code className="bg-muted px-1 rounded text-[11px]">[high]</code>,{' '}
              <code className="bg-muted px-1 rounded text-[11px]">[medium]</code>, or{' '}
              <code className="bg-muted px-1 rounded text-[11px]">[low]</code>{' '}
              inline to override priority per task.
            </p>
          </div>

          {parsedTasks.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">
                Preview — {parsedTasks.length} task{parsedTasks.length === 1 ? '' : 's'}:
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2 bg-muted/30 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                {parsedTasks.map((item, i) => {
                  const prio = item.priority ?? defaultPriority;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 size={12} className="text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{item.title}</span>
                      <span className={cn('text-xs font-semibold uppercase tracking-wide', PRIORITY_COLORS[prio])}>
                        {prio}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {columns.length > 0 && (
              <div>
                <Label className="mb-1.5 block text-sm">Column</Label>
                {/* position="popper" — prevents overlay/escape-from-modal bug */}
                <Select value={selectedColumnId} onValueChange={setSelectedColumnId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[200]">
                    {columns.map(col => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={columns.length === 0 ? 'col-span-2' : ''}>
              <Label className="mb-1.5 block text-sm">Default Priority</Label>
              <Select value={defaultPriority} onValueChange={v => setDefaultPriority(v as Priority)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[200]">
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Footer always pinned at bottom */}
        <DialogFooter className="shrink-0 pt-2 gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={parsedTasks.length === 0 || loading}
            className="bg-[#FE812C] hover:bg-[#e5732a] text-white"
          >
            {loading
              ? 'Creating...'
              : `Create ${parsedTasks.length > 0 ? parsedTasks.length + ' ' : ''}Task${parsedTasks.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
