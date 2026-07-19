import { useRef, useState, useCallback, useLayoutEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import type { DateClickArg } from '@fullcalendar/interaction';
import { Plus } from 'lucide-react';
import { taskService } from '@/services/taskService';
import type { CreateTaskData } from '@/services/taskService';
import { getApiErrorMessage } from '@/services/api';
import type { Task } from '@/types';
import TaskDialog from '@/components/TaskDialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const CATEGORY_COLORS = {
  personal: '#3b82f6',
  assigned: '#a855f7',
} as const;

type TaskCategory = keyof typeof CATEGORY_COLORS;
type FilterValue = 'all' | TaskCategory;

const FILTER_LABELS: Record<FilterValue, string> = {
  all: 'All',
  personal: 'Personal',
  assigned: 'Assigned to me',
};

function getTaskCategory(task: Task, userId: string): TaskCategory {
  if (task.assignedTo && task.assignedTo === userId) return 'assigned';
  return 'personal';
}

function taskToEvent(task: Task, userId: string): EventInput {
  const color = CATEGORY_COLORS[getTaskCategory(task, userId)];
  return {
    id: task._id || task.id,
    title: task.title,
    start: task.scheduledAt ?? undefined,
    display: 'block',
    backgroundColor: color,
    borderColor: color,
    textColor: '#fff',
    extendedProps: { task },
  };
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

export default function CalendarPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?._id || user?.id || '';

  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [defaultDeadline, setDefaultDeadline] = useState<string | undefined>();
  const [defaultScheduledAt, setDefaultScheduledAt] = useState<string | undefined>();
  const [dialogLoading, setDialogLoading] = useState(false);
  const [currentRange, setCurrentRange] = useState<{ from: string; to: string } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FilterValue>('all');
  const stickyZoneRef = useRef<HTMLDivElement>(null);
  const [stickyH, setStickyH] = useState(111);

  useLayoutEffect(() => {
    const el = stickyZoneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStickyH(el.offsetHeight));
    ro.observe(el);
    setStickyH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const toolbarTop = 64 + stickyH;

  const fetchForRange = useCallback(async (from: string, to: string) => {
    setLoading(true);
    try {
      const res = await taskService.getTasks({ scheduledFrom: from, scheduledTo: to, limit: 100 });
      setEvents(res.data.map(task => taskToEvent(task, userId)));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const filteredEvents = useMemo(() => {
    if (categoryFilter === 'all') return events;
    return events.filter(ev => {
      const task = ev.extendedProps?.task as Task;
      return getTaskCategory(task, userId) === categoryFilter;
    });
  }, [events, categoryFilter, userId]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const from = info.startStr.substring(0, 10);
    const to = info.endStr.substring(0, 10);
    setCurrentRange({ from, to });
    fetchForRange(from, to);
  }, [fetchForRange]);

  const handleDateClick = (info: DateClickArg) => {
    if (info.allDay) {
      setDefaultScheduledAt(info.dateStr.substring(0, 10));
    } else {
      const d = info.date;
      const pad = (n: number) => String(n).padStart(2, '0');
      setDefaultScheduledAt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
    setSelectedTask(null);
    setDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const task = info.event.extendedProps.task as Task;
    setSelectedTask(task);
    setDefaultDeadline(undefined);
    setDefaultScheduledAt(undefined);
    setDialogOpen(true);
  };

  const handleCancelFromDate = async () => {
    if (!selectedTask?.recurrenceParentId || !selectedTask?.scheduledAt) return;
    const fromDate = selectedTask.scheduledAt.substring(0, 10);
    try {
      await taskService.cancelFromDate(selectedTask.recurrenceParentId, fromDate);
      setDialogOpen(false);
      setSelectedTask(null);
      if (currentRange) fetchForRange(currentRange.from, currentRange.to);
      toast.success('Cancelled occurrences from this date onwards');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to cancel occurrences'));
    }
  };

  const handleDialogSubmit = async (data: CreateTaskData & { status: 'todo' | 'doing' | 'done'; description: string }) => {
    setDialogLoading(true);
    try {
      if (selectedTask) {
        const res = await taskService.updateTask(selectedTask._id || selectedTask.id!, data);
        const updated = res.data;
        const taskId = selectedTask._id || selectedTask.id;
        const dateStr = (updated.scheduledAt ?? updated.createdAt).substring(0, 10);
        const inRange = currentRange ? dateStr >= currentRange.from && dateStr <= currentRange.to : true;
        setEvents(prev => {
          const filtered = prev.filter(ev => ev.id !== taskId);
          return inRange && updated.scheduledAt ? [...filtered, taskToEvent(updated, userId)] : filtered;
        });
        toast.success('Task updated');
      } else {
        const res = await taskService.createTask(data);
        const newTask = res.data;
        if (newTask.isRecurring && currentRange) {
          await fetchForRange(currentRange.from, currentRange.to);
        } else {
          const dateStr = (newTask.scheduledAt ?? newTask.createdAt).substring(0, 10);
          const inRange = currentRange ? dateStr >= currentRange.from && dateStr <= currentRange.to : true;
          if (inRange && newTask.scheduledAt) {
            setEvents(prev => [...prev, taskToEvent(newTask, userId)]);
          }
        }
        toast.success('Task created');
      }
      setDialogOpen(false);
      setSelectedTask(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Operation failed'));
    } finally {
      setDialogLoading(false);
    }
  };

  return (
    <div>
      {/* Sticky zone */}
      <div ref={stickyZoneRef} className="sticky top-16 z-10 bg-background -mx-6 px-6 pb-4">
        <div className="flex items-start justify-between pt-2 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-foreground">Calendar</h2>
            <p className="text-sm text-muted-foreground">Tasks by scheduled date</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => { setSelectedTask(null); setDefaultDeadline(undefined); setDefaultScheduledAt(undefined); setDialogOpen(true); }}
              className="bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl shadow-md shadow-[#FE812C]/20 gap-2"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Create Task</span>
            </Button>
          </div>
        </div>

        {/* Filter toggles + Legend */}
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            {(['all', 'personal', 'assigned'] as const).map((f) => {
              const isActive = categoryFilter === f;
              const color = f !== 'all' ? CATEGORY_COLORS[f] : undefined;
              return (
                <button
                  key={f}
                  onClick={() => setCategoryFilter(f)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold transition-all border',
                    isActive
                      ? color ? 'text-white border-transparent' : 'bg-foreground text-background border-transparent'
                      : 'bg-muted/50 text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                  )}
                  style={isActive && color ? { backgroundColor: color } : undefined}
                >
                  {FILTER_LABELS[f]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {(Object.entries(CATEGORY_COLORS) as [TaskCategory, string][]).map(([cat, color]) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span>{FILTER_LABELS[cat]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Calendar wrapper */}
      <div
        className={cn(
          'rounded-xl border border-border bg-card transition-opacity',
          loading && 'opacity-60 pointer-events-none',
        )}
      >
        <style>{`
          /* ── Base variables ── */
          .fc {
            --fc-border-color: var(--border);
            --fc-page-bg-color: transparent;
            --fc-today-bg-color: color-mix(in srgb, var(--primary) 8%, transparent);
            --fc-event-border-color: transparent;
          }

          /* Toolbar — FullCalendar's toolbar doesn't wrap by itself, so on
             phone widths the view buttons would push past the viewport */
          .fc .fc-toolbar.fc-header-toolbar {
            padding: 12px 16px; margin: 0;
            border-bottom: 1px solid var(--border);
            flex-wrap: wrap; row-gap: 6px;
          }
          .fc .fc-toolbar-title {
            font-size: 1rem; font-weight: 700; color: var(--foreground);
          }

          /* Buttons */
          .fc .fc-button {
            background: var(--muted);
            border: 1px solid var(--border);
            color: var(--foreground);
            border-radius: 0.5rem;
            font-size: 0.75rem; font-weight: 600;
            padding: 0.25rem 0.65rem;
            text-transform: none; box-shadow: none;
            transition: background 0.15s, color 0.15s, border-color 0.15s;
          }
          .fc .fc-button:hover {
            background: color-mix(in srgb, var(--muted) 60%, var(--foreground) 8%);
            border-color: color-mix(in srgb, var(--border) 50%, var(--foreground) 15%);
            color: var(--foreground);
          }
          .fc .fc-button-active,
          .fc .fc-button-primary:not(:disabled).fc-button-active {
            background: color-mix(in srgb, var(--primary) 12%, transparent) !important;
            color: var(--primary) !important;
            border-color: color-mix(in srgb, var(--primary) 35%, transparent) !important;
            box-shadow: none !important;
          }
          .fc .fc-button:focus { box-shadow: none !important; }
          .fc .fc-button-group .fc-button { border-radius: 0; }
          .fc .fc-button-group .fc-button:first-child { border-radius: 0.5rem 0 0 0.5rem; }
          .fc .fc-button-group .fc-button:last-child  { border-radius: 0 0.5rem 0.5rem 0; }

          /* Column headers (SUN MON…) */
          .fc .fc-col-header-cell {
            background: color-mix(in srgb, var(--muted) 60%, transparent);
          }
          .fc .fc-col-header-cell-cushion {
            font-size: 0.72rem; font-weight: 700; letter-spacing: 0.03em;
            color: var(--muted-foreground); text-decoration: none; padding: 6px 4px;
          }

          /* Day cell grid lines */
          .fc-theme-standard td, .fc-theme-standard th { border-color: var(--border); }

          /* Day number */
          .fc .fc-daygrid-day-number {
            font-size: 0.75rem; font-weight: 500;
            color: var(--muted-foreground); text-decoration: none;
            padding: 4px 6px;
            border-radius: 50%;
            min-width: 26px; height: 26px;
            display: inline-flex; align-items: center; justify-content: center;
            transition: background 0.12s, color 0.12s;
          }
          .fc .fc-daygrid-day:not(.fc-day-other):not(.fc-day-today):hover .fc-daygrid-day-number {
            background: color-mix(in srgb, var(--primary) 10%, transparent);
            color: var(--primary);
          }
          .fc .fc-day-other .fc-daygrid-day-number { opacity: 0.3; }

          /* Today */
          .fc .fc-daygrid-day.fc-day-today {
            background: color-mix(in srgb, var(--primary) 7%, transparent) !important;
          }
          .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
            background: var(--primary);
            color: var(--primary-foreground);
            font-weight: 700;
          }
          .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number:hover {
            background: color-mix(in srgb, var(--primary) 85%, var(--foreground) 15%);
            color: var(--primary-foreground);
          }

          /* Events */
          .fc .fc-event {
            border-radius: 4px; font-size: 0.72rem; padding: 0 4px;
            cursor: pointer; transition: opacity 0.12s, transform 0.12s;
            opacity: 1;
          }
          .fc .fc-event:hover { opacity: 0.85; transform: translateY(-1px); }
          .fc .fc-event-main { background: transparent !important; }

          /* ── Time axis column redesign ── */
          .fc .fc-timegrid-slot { height: 2rem; }

          /* Axis background + separator */
          .fc .fc-timegrid-axis {
            background: color-mix(in srgb, var(--muted) 30%, transparent);
          }

          /* Hour labels */
          .fc .fc-timegrid-slot-label-cushion {
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.03em;
            color: var(--muted-foreground);
            font-variant-numeric: tabular-nums;
            text-transform: uppercase;
            padding-right: 8px;
          }

          /* Axis cushion (all-day row label) */
          .fc .fc-timegrid-axis-cushion {
            font-size: 0.65rem;
            font-weight: 600;
            color: var(--muted-foreground);
            letter-spacing: 0.02em;
          }

          /* Half-hour slots: dashed border + hide label */
          .fc .fc-timegrid-slot.fc-timegrid-slot-minor {
            border-top-style: dashed !important;
            border-top-color: color-mix(in srgb, var(--border) 45%, transparent) !important;
          }
          .fc .fc-timegrid-slot.fc-timegrid-slot-minor .fc-timegrid-slot-label-cushion {
            visibility: hidden;
          }

          /* List view */
          .fc .fc-list-event-title { font-size: 0.8rem; }
          .fc .fc-list-event:hover td {
            background: color-mix(in srgb, var(--muted) 80%, transparent) !important;
            cursor: pointer;
          }
          .fc .fc-list-day-cushion {
            background: color-mix(in srgb, var(--muted) 60%, transparent);
          }
          .fc .fc-list-empty {
            background: transparent; color: var(--muted-foreground); font-size: 0.875rem;
          }

          /* Misc */
          .fc .fc-daygrid-day-frame { min-height: 80px; }

          /* ── Sticky toolbar & column headers ── */
          .fc .fc-toolbar.fc-header-toolbar {
            position: sticky;
            top: ${toolbarTop}px;
            z-index: 9;
            background: var(--card);
          }
          .fc .fc-col-header-cell {
            position: sticky;
            top: ${toolbarTop + 57}px;
            z-index: 8;
            background: color-mix(in srgb, var(--muted) 60%, transparent);
          }
        `}</style>
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
          }}
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day', list: 'Agenda' }}
          events={filteredEvents}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          navLinks={true}
          allDaySlot={false}
          dayMaxEvents={3}
          height="auto"
          aspectRatio={1.9}
          eventContent={(info) => {
            const task = info.event.extendedProps.task as Task;
            return (
              <div
                className={cn('truncate px-1 text-white text-[11px] font-medium', task.status === 'done' && 'line-through opacity-80')}
                title={info.event.title}
              >
                {info.event.title}
              </div>
            );
          }}
          eventDidMount={(info) => {
            const task = info.event.extendedProps.task as Task;
            info.el.title = `${task.title}\nStatus: ${task.status}\nPriority: ${task.priority}\nScheduled: ${formatCreatedAt(task.scheduledAt ?? task.createdAt)}`;
          }}
        />
      </div>

      <TaskDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setSelectedTask(null); setDefaultScheduledAt(undefined); }}
        onSubmit={handleDialogSubmit}
        task={selectedTask}
        loading={dialogLoading}
        defaultDeadline={defaultDeadline}
        defaultScheduledAt={defaultScheduledAt}
        onCancelFromDate={
          selectedTask?.isRecurring && selectedTask?.recurrenceParentId
            ? handleCancelFromDate
            : undefined
        }
      />
    </div>
  );
}
