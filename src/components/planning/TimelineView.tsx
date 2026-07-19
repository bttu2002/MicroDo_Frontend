import { useEffect, useState, useRef } from 'react';
import { Loader2, RefreshCw, Calendar, CheckCircle2, AlertCircle, Clock, Circle } from 'lucide-react';
import { planningService } from '@/services/planningService';
import { getApiErrorMessage } from '@/services/api';
import { toast } from 'sonner';
import type { TimelineData, TimelineMilestone } from '@/types';

interface Props {
  projectId: string;
  onNavigateToPlanning?: (milestoneId?: string) => void;
}

type Zoom = 'month' | 'week';

// ─── Helpers ────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function formatDate(iso: string | null, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', opts);
}

function barColor(m: TimelineMilestone): string {
  if (m.status === 'COMPLETED') return 'bg-muted-foreground/30';
  if (m.isOverdue)              return 'bg-red-500';
  if (m.deadline) {
    const daysLeft = diffDays(new Date(), new Date(m.deadline));
    if (daysLeft < 7)  return 'bg-amber-500';
  }
  return 'bg-primary';
}

function statusIcon(m: TimelineMilestone) {
  if (m.status === 'COMPLETED')          return <CheckCircle2 size={13} className="text-muted-foreground/60 shrink-0" />;
  if (m.isOverdue)                       return <AlertCircle  size={13} className="text-red-500 shrink-0" />;
  if (m.progress > 0)                    return <Clock        size={13} className="text-amber-500 shrink-0" />;
  return                                        <Circle       size={13} className="text-muted-foreground/40 shrink-0" />;
}

// ─── Month slots for header ─────────────────────────────────────

interface MonthSlot { label: string; leftPct: number; widthPct: number }

function buildMonthSlots(rangeStart: Date, totalDays: number): MonthSlot[] {
  const slots: MonthSlot[] = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor.getTime() < addDays(rangeStart, totalDays).getTime()) {
    const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const slotStart = Math.max(0, diffDays(rangeStart, cursor));
    const slotEnd   = Math.min(totalDays, diffDays(rangeStart, nextMonth));
    slots.push({
      label:    cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      leftPct:  (slotStart / totalDays) * 100,
      widthPct: ((slotEnd - slotStart) / totalDays) * 100,
    });
    cursor = nextMonth;
  }
  return slots;
}

// ─── Week slots for header ──────────────────────────────────────

interface WeekSlot { label: string; leftPct: number; widthPct: number }

function buildWeekSlots(rangeStart: Date, totalDays: number): WeekSlot[] {
  const slots: WeekSlot[] = [];
  // align to Monday
  const dow = rangeStart.getDay();
  let cursor = addDays(rangeStart, dow === 0 ? -6 : 1 - dow);
  while (diffDays(rangeStart, cursor) < totalDays) {
    const weekEnd = addDays(cursor, 7);
    const slotStart = Math.max(0, diffDays(rangeStart, cursor));
    const slotEnd   = Math.min(totalDays, diffDays(rangeStart, weekEnd));
    if (slotEnd > slotStart) {
      slots.push({
        label:    cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        leftPct:  (slotStart / totalDays) * 100,
        widthPct: ((slotEnd - slotStart) / totalDays) * 100,
      });
    }
    cursor = weekEnd;
  }
  return slots;
}

// ─── Tooltip ────────────────────────────────────────────────────

interface TooltipState { x: number; y: number; milestone: TimelineMilestone }

function Tooltip({ tip }: { tip: TooltipState }) {
  const { milestone: m } = tip;

  const plannedVsActual = (() => {
    if (m.status !== 'COMPLETED' || !m.completedAt || !m.deadline) return null;
    const diff = diffDays(new Date(m.deadline), new Date(m.completedAt));
    if (diff === 0) return { label: 'On time',            color: 'text-emerald-500', icon: '✓' };
    if (diff < 0)  return { label: `${Math.abs(diff)}d early`, color: 'text-emerald-500', icon: '✓' };
    return               { label: `${diff}d late`,        color: 'text-amber-500',   icon: '⚠' };
  })();

  return (
    <div
      className="fixed z-50 pointer-events-none bg-popover border border-border rounded-xl shadow-xl p-3 text-xs w-52"
      style={{ left: tip.x + 12, top: tip.y - 8 }}
    >
      <p className="font-semibold text-sm text-foreground truncate mb-1.5">{m.title}</p>
      <div className="space-y-1 text-muted-foreground">
        {m.startDate  && <p>Start: <span className="text-foreground">{formatDate(m.startDate,  { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>}
        {m.deadline   && <p>Planned: <span className={`font-medium ${m.isOverdue ? 'text-red-500' : 'text-foreground'}`}>{formatDate(m.deadline, { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>}
        <p>Progress: <span className="text-foreground font-medium">{m.progress}%</span></p>
        <p>Tasks: <span className="text-foreground">{m.taskCount}</span></p>
        {m.status === 'COMPLETED' && m.completedAt && (
          <p>Actual: <span className="text-emerald-500 font-medium">{formatDate(m.completedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span></p>
        )}
        {plannedVsActual && (
          <p className={`font-semibold ${plannedVsActual.color}`}>{plannedVsActual.icon} {plannedVsActual.label}</p>
        )}
        {m.isOverdue && <p className="text-red-500 font-medium">Overdue</p>}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────

export default function TimelineView({ projectId, onNavigateToPlanning }: Props) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<Zoom>('month');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await planningService.getTimeline(projectId);
      setData(d);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load timeline'));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { void load(); }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  if (!data) return null;

  if (data.milestones.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/50 text-sm gap-2">
        <Calendar size={32} className="opacity-40" />
        <p>No milestones to display.</p>
        <p className="text-xs">Add milestones in the Planning tab to see them here.</p>
      </div>
    );
  }

  // ── Time range ──────────────────────────────────────────────
  const rangeStart = addDays(new Date(data.projectStart), -3);
  const rangeEnd   = addDays(new Date(data.projectEnd),    3);
  const totalDays  = Math.max(diffDays(rangeStart, rangeEnd), 7);

  const today       = new Date();
  const todayOffset = diffDays(rangeStart, today);
  const todayPct    = Math.max(0, Math.min(100, (todayOffset / totalDays) * 100));
  const showToday   = todayOffset >= 0 && todayOffset <= totalDays;

  const monthSlots = buildMonthSlots(rangeStart, totalDays);
  const weekSlots  = buildWeekSlots(rangeStart, totalDays);

  // ── Bar geometry ────────────────────────────────────────────
  const barGeom = (m: TimelineMilestone) => {
    if (!m.deadline) return null;
    const endDate   = new Date(m.deadline);
    const startDate = m.startDate ? new Date(m.startDate) : addDays(endDate, -14);

    const startOff = diffDays(rangeStart, startDate);
    const endOff   = diffDays(rangeStart, endDate);
    const leftPct  = Math.max(0, (startOff / totalDays) * 100);
    const rightEdge = Math.min(100, (endOff  / totalDays) * 100);
    const widthPct  = Math.max(0.5, rightEdge - leftPct);
    const isPointOnly = !m.startDate;

    return { leftPct, widthPct, isPointOnly };
  };

  return (
    <div className="space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground font-medium">Zoom:</span>
          {(['month', 'week'] as Zoom[]).map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors capitalize ${
                zoom === z
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {showToday && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-primary" />
              Today: {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <button
            onClick={async () => { setIsRefreshing(true); await load(true); }}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-primary inline-block" />On track</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-500 inline-block" />&lt; 7 days</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-red-500 inline-block" />Overdue</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-muted-foreground/30 inline-block" />Completed</span>
        <span className="flex items-center gap-1.5">
          <span className="relative inline-flex items-center justify-center w-3 h-3">
            <span className="w-px h-3 bg-emerald-500 absolute" />
            <span className="w-1.5 h-1.5 rotate-45 bg-emerald-500 absolute" />
          </span>
          Actual
        </span>
        {!data.milestones.some(m => m.startDate) && (
          <span className="text-muted-foreground/60 italic">* No startDate — bars estimated from deadline</span>
        )}
      </div>

      {/* ── Timeline grid ── */}
      <div className="rounded-2xl border border-border overflow-hidden bg-card">
        <div className="flex">
          {/* Left panel — milestone names (narrower on phones so the timeline
              canvas keeps a usable scroll window) */}
          <div className="w-28 sm:w-44 shrink-0 border-r border-border">
            {/* Header spacer */}
            <div className="h-8 border-b border-border bg-muted/30" />
            {data.milestones.map((m, i) => (
              <div
                key={m.id}
                onMouseEnter={() => setHoveredRow(i)}
                onMouseLeave={() => setHoveredRow(null)}
                className={`flex items-center gap-1.5 px-3 h-12 border-b border-border/50 last:border-b-0 transition-colors ${
                  hoveredRow === i ? 'bg-primary/5' : i % 2 === 1 ? 'bg-muted/20' : ''
                }`}
              >
                {statusIcon(m)}
                <button
                  onClick={() => onNavigateToPlanning?.(m.id)}
                  className="text-xs font-medium text-foreground hover:text-primary transition-colors truncate text-left"
                  title={m.title}
                >
                  {m.title}
                </button>
              </div>
            ))}
          </div>

          {/* Right panel — time axis + bars */}
          <div className="flex-1 overflow-x-auto scrollbar-hide" ref={containerRef}>
            <div className="min-w-[500px]">
              {/* Time header */}
              <div className="relative h-8 border-b border-border bg-muted/30 overflow-hidden">
                {(zoom === 'month' ? monthSlots : weekSlots).map((slot, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full flex items-center border-r border-border/40 px-2"
                    style={{ left: `${slot.leftPct}%`, width: `${slot.widthPct}%` }}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground truncate">{slot.label}</span>
                  </div>
                ))}
                {/* Today header marker */}
                {showToday && (
                  <div
                    className="absolute top-0 h-full w-px bg-primary/60"
                    style={{ left: `${todayPct}%` }}
                  />
                )}
              </div>

              {/* Milestone rows */}
              {data.milestones.map((m, i) => {
                const geom = barGeom(m);
                const actualPct = (m.status === 'COMPLETED' && m.completedAt)
                  ? Math.max(0, Math.min(100, (diffDays(rangeStart, new Date(m.completedAt)) / totalDays) * 100))
                  : null;
                return (
                  <div
                    key={m.id}
                    onMouseEnter={(e) => { setHoveredRow(i); setTooltip({ x: e.clientX, y: e.clientY, milestone: m }); }}
                    onMouseMove={(e) => setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                    onMouseLeave={() => { setHoveredRow(null); setTooltip(null); }}
                    className={`relative h-12 border-b border-border/50 last:border-b-0 transition-colors ${
                      hoveredRow === i ? 'bg-primary/5' : i % 2 === 1 ? 'bg-muted/20' : ''
                    }`}
                  >
                    {/* Vertical grid lines (month/week separators) */}
                    {(zoom === 'month' ? monthSlots : weekSlots).map((slot, si) => (
                      <div
                        key={si}
                        className="absolute top-0 h-full w-px bg-border/30"
                        style={{ left: `${slot.leftPct}%` }}
                      />
                    ))}

                    {/* Today line */}
                    {showToday && (
                      <div
                        className="absolute top-0 h-full w-px bg-primary/30 z-10"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}

                    {/* Milestone bar */}
                    {geom && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 z-20 cursor-pointer group/bar"
                        style={{ left: `${geom.leftPct}%`, width: `${geom.widthPct}%` }}
                        onClick={() => onNavigateToPlanning?.(m.id)}
                      >
                        {geom.isPointOnly ? (
                          // Point marker (no startDate)
                          <div className={`w-3 h-3 rounded-full border-2 border-background ${barColor(m)} mx-auto`} />
                        ) : (
                          <div className="relative h-5">
                            <div className={`h-5 rounded-full ${barColor(m)} opacity-90 group-hover/bar:opacity-100 transition-opacity relative overflow-hidden`}>
                              {/* Progress fill */}
                              {m.status !== 'COMPLETED' && m.progress > 0 && (
                                <div
                                  className="absolute left-0 top-0 h-full bg-black/20 rounded-l-full"
                                  style={{ width: `${m.progress}%` }}
                                />
                              )}
                              {/* Progress % label (shown if bar wide enough) */}
                              {geom.widthPct > 8 && (
                                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 select-none">
                                  {m.progress}%
                                </span>
                              )}
                            </div>
                            {/* Assignee avatars */}
                            {m.assignees.length > 0 && (
                              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center -space-x-1 pointer-events-none z-10">
                                {m.assignees.slice(0, 3).map((a, ai) => (
                                  <div
                                    key={ai}
                                    title={a.name}
                                    className="w-3.5 h-3.5 rounded-full border border-white/50 overflow-hidden shrink-0 bg-white/20 flex items-center justify-center"
                                  >
                                    {a.avatar ? (
                                      <img src={a.avatar} alt={a.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="text-[6px] font-bold text-white leading-none">
                                        {a.name.charAt(0).toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {m.assignees.length > 3 && (
                                  <div className="w-3.5 h-3.5 rounded-full border border-white/50 bg-white/20 flex items-center justify-center shrink-0">
                                    <span className="text-[6px] font-bold text-white leading-none">
                                      +{m.assignees.length - 3}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actual completion marker — green vertical line + diamond */}
                    {actualPct !== null && (
                      <div
                        className="absolute top-0 h-full z-30 pointer-events-none"
                        style={{ left: `${actualPct}%` }}
                      >
                        <div className="absolute inset-y-0 left-0 w-px bg-emerald-500/80" />
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-emerald-500 border border-background" />
                      </div>
                    )}

                    {/* No deadline marker */}
                    {!geom && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          onClick={() => onNavigateToPlanning?.(m.id)}
                          className="text-[10px] text-muted-foreground/40 italic border border-dashed border-muted-foreground/20 rounded px-2 py-0.5 hover:text-muted-foreground hover:border-muted-foreground/50 transition-all"
                        >
                          + Add dates
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tooltip (portal-like fixed positioning) */}
      {tooltip && <Tooltip tip={tooltip} />}
    </div>
  );
}
