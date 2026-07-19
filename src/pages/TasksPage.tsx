import React, { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import KanbanBoard from '@/components/KanbanBoard';
import type { KanbanBoardRef } from '@/components/KanbanBoard';
import BulkCreatePersonalDialog from '@/components/BulkCreatePersonalDialog';
import { Search, Plus, Layers, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTaskStore } from '@/store/taskStore';
import DateRangePicker from '@/components/DateRangePicker';
import type { DateRange } from '@/components/DateRangePicker';
import TimerStartButton from '@/components/TimerStartButton';
import { cn } from '@/lib/utils';

const DATE_SORT_OPTIONS = [
  { value: '', label: 'Sort by Date' },
  { value: 'createdAt-desc', label: 'Newest First' },
  { value: 'createdAt-asc', label: 'Oldest First' },
  { value: 'deadline-asc', label: 'Deadline (Earliest)' },
  { value: 'deadline-desc', label: 'Deadline (Latest)' },
];

const PRIORITY_SORT_OPTIONS = [
  { value: '', label: 'Sort by Priority' },
  { value: 'priority-desc', label: 'High → Low' },
  { value: 'priority-asc', label: 'Low → High' },
];

export default function TasksPage() {
  const boardRef = useRef<KanbanBoardRef>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { fetchPersonalTasks, silentRefreshPersonal } = useTaskStore();
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);

  const [searchValue, setSearchValue] = React.useState('');
  const [dateSort, setDateSort] = React.useState('');
  const [prioritySort, setPrioritySort] = React.useState('');
  const [deadlineFrom, setDeadlineFrom] = React.useState<string | null>(null);
  const [deadlineTo, setDeadlineTo] = React.useState<string | null>(null);
  const [dateSortOpen, setDateSortOpen] = React.useState(false);
  const [prioritySortOpen, setPrioritySortOpen] = React.useState(false);
  const dateSortRef = useRef<HTMLDivElement>(null);
  const prioritySortRef = useRef<HTMLDivElement>(null);

  const buildParams = React.useCallback(() => ({
    personal: true as const,
    search: searchValue || undefined,
    sortBy: dateSort ? dateSort.split('-')[0] : prioritySort ? prioritySort.split('-')[0] : undefined,
    order: dateSort ? dateSort.split('-')[1] : prioritySort ? prioritySort.split('-')[1] : undefined,
    deadlineFrom: deadlineFrom ?? undefined,
    deadlineTo: deadlineTo ?? undefined,
  }), [searchValue, dateSort, prioritySort, deadlineFrom, deadlineTo]);

  React.useEffect(() => {
    void fetchPersonalTasks({ personal: true });
  }, [fetchPersonalTasks]);

  React.useEffect(() => {
    if (!dateSortOpen && !prioritySortOpen) return;
    const handleClose = (e: MouseEvent) => {
      if (dateSortRef.current && !dateSortRef.current.contains(e.target as Node)) setDateSortOpen(false);
      if (prioritySortRef.current && !prioritySortRef.current.contains(e.target as Node)) setPrioritySortOpen(false);
    };
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, [dateSortOpen, prioritySortOpen]);

  React.useEffect(() => {
    if (location.state?.openCreate) {
      const timer = setTimeout(() => {
        if (boardRef.current) {
          boardRef.current.openCreateTask();
          navigate(location.pathname, { replace: true, state: {} });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    const { openTaskId, highlightCommentId } = (location.state ?? {}) as { openTaskId?: string; highlightCommentId?: string };
    if (openTaskId) {
      const timer = setTimeout(() => {
        if (boardRef.current) {
          boardRef.current.openTaskById(openTaskId, highlightCommentId);
          navigate(location.pathname, { replace: true, state: {} });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location, navigate]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchPersonalTasks(buildParams(), { silent: true });
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDeadlineRange = (range: DateRange) => {
    const from = range.from ?? null;
    const to = range.to ?? null;
    setDeadlineFrom(from);
    setDeadlineTo(to);
    void fetchPersonalTasks({ ...buildParams(), deadlineFrom: from ?? undefined, deadlineTo: to ?? undefined }, { silent: true });
  };

  const handleDateSortChange = (value: string) => {
    setDateSort(value);
    setPrioritySort('');
    const [sb, ord] = value ? value.split('-') : [undefined, undefined];
    void fetchPersonalTasks({ ...buildParams(), sortBy: sb, order: ord }, { silent: true });
  };

  const handlePrioritySortChange = (value: string) => {
    setPrioritySort(value);
    setDateSort('');
    const [sb, ord] = value ? value.split('-') : [undefined, undefined];
    void fetchPersonalTasks({ ...buildParams(), sortBy: sb, order: ord }, { silent: true });
  };

  const handleClearFilters = () => {
    setDateSort('');
    setPrioritySort('');
    setDeadlineFrom(null);
    setDeadlineTo(null);
    void fetchPersonalTasks({ personal: true, search: searchValue || undefined }, { silent: true });
  };

  const hasActiveFilter = !!(dateSort || prioritySort || deadlineFrom || deadlineTo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-y-2 pt-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-foreground">Task Tracker</h2>
          <span className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TimerStartButton fetchParams={{ status: 'doing', personal: true, limit: 50 }} />
          <Button variant="outline" onClick={() => setBulkDialogOpen(true)} className="rounded-xl gap-2">
            <Layers size={16} />
            <span className="hidden sm:inline">Bulk Create</span>
          </Button>
          <Button onClick={() => boardRef.current?.openCreateTask()} className="bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl shadow-md shadow-[#FE812C]/20 gap-2">
            <Plus size={18} />
            <span className="hidden sm:inline">Create Task</span>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={14} />
          <input
            type="text"
            placeholder="Search tasks by title..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
          />
        </div>

        <DateRangePicker value={{ from: deadlineFrom, to: deadlineTo }} onChange={handleDeadlineRange} compactLg />

        {/* Date Sort */}
        <div className="relative" ref={dateSortRef}>
          <button
            type="button"
            onClick={() => { setDateSortOpen(o => !o); setPrioritySortOpen(false); }}
            className={cn(
              'flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-muted/80 whitespace-nowrap',
              dateSort && 'border-primary/50 text-primary bg-primary/5',
            )}
          >
            {DATE_SORT_OPTIONS.find(o => o.value === dateSort)?.label ?? 'Sort by Date'}
            <ChevronDown size={14} className={cn('text-muted-foreground transition-transform shrink-0', dateSortOpen && 'rotate-180')} />
          </button>
          {dateSortOpen && (
            <div className="absolute top-full mt-1 left-0 z-30 bg-card border border-border rounded-xl shadow-lg min-w-[175px] overflow-hidden">
              {DATE_SORT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { handleDateSortChange(opt.value); setDateSortOpen(false); }}
                  className={cn('w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted transition-colors', dateSort === opt.value && 'bg-primary/5 text-primary font-medium')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority Sort */}
        <div className="relative" ref={prioritySortRef}>
          <button
            type="button"
            onClick={() => { setPrioritySortOpen(o => !o); setDateSortOpen(false); }}
            className={cn(
              'flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-muted/80 whitespace-nowrap',
              prioritySort && 'border-primary/50 text-primary bg-primary/5',
            )}
          >
            {PRIORITY_SORT_OPTIONS.find(o => o.value === prioritySort)?.label ?? 'Sort by Priority'}
            <ChevronDown size={14} className={cn('text-muted-foreground transition-transform shrink-0', prioritySortOpen && 'rotate-180')} />
          </button>
          {prioritySortOpen && (
            <div className="absolute top-full mt-1 left-0 z-30 bg-card border border-border rounded-xl shadow-lg min-w-[155px] overflow-hidden">
              {PRIORITY_SORT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => { handlePrioritySortChange(opt.value); setPrioritySortOpen(false); }}
                  className={cn('w-full flex items-center px-3 py-2 text-xs text-left hover:bg-muted transition-colors', prioritySort === opt.value && 'bg-primary/5 text-primary font-medium')}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasActiveFilter && (
          <button onClick={handleClearFilters}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg hover:bg-muted transition-colors border border-border">
            Clear
          </button>
        )}
      </div>

      <KanbanBoard ref={boardRef} />

      <BulkCreatePersonalDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        onCreated={() => void silentRefreshPersonal()}
      />
    </div>
  );
}
