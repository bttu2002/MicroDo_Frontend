/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: string | null;
  to: string | null;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
  compact?: boolean;
  compactLg?: boolean;
}

// ─── Date helpers ──────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr(): string {
  return toStr(new Date());
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toStr(d);
}

function startOfMonth(dateStr: string): string {
  return dateStr.substring(0, 8) + '01';
}

function endOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  const last = new Date(parseInt(y), parseInt(m), 0).getDate();
  return `${y}-${m}-${pad(last)}`;
}

function subMonths(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() - n);
  return toStr(d);
}

function subYears(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setFullYear(d.getFullYear() - n);
  return toStr(d);
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['SU','MO','TU','WE','TH','FR','SA'];

function getMonthDays(year: number, month: number): { date: string; current: boolean }[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: { date: string; current: boolean }[] = [];

  const prevYear = month === 0 ? year - 1 : year;
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevDays = new Date(prevYear, prevMonth + 1, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    result.push({ date: `${prevYear}-${pad(prevMonth + 1)}-${pad(prevDays - i)}`, current: false });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    result.push({ date: `${year}-${pad(month + 1)}-${pad(d)}`, current: true });
  }

  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const trailing = 42 - result.length;
  for (let d = 1; d <= trailing; d++) {
    result.push({ date: `${nextYear}-${pad(nextMonth + 1)}-${pad(d)}`, current: false });
  }

  return result;
}

function formatRange(from: string | null, to: string | null): string {
  if (!from) return 'Select date range';
  const fp = from.split('-');
  const fd = `${MONTH_SHORT[parseInt(fp[1]) - 1]} ${parseInt(fp[2])}`;
  if (!to || from === to) return `${fd}, ${fp[0]}`;
  const tp = to.split('-');
  const td = `${MONTH_SHORT[parseInt(tp[1]) - 1]} ${parseInt(tp[2])}`;
  return fp[0] === tp[0] ? `${fd}–${td}, ${fp[0]}` : `${fd}, ${fp[0]} – ${td}, ${tp[0]}`;
}

// ─── Presets ──────────────────────────────────────────────────

interface Preset { label: string; get: () => { from: string; to: string } }

function buildPresets(): Preset[] {
  const t = todayStr();
  return [
    { label: 'Today',        get: () => ({ from: t, to: t }) },
    { label: 'Yesterday',    get: () => { const y = addDays(t, -1); return { from: y, to: y }; } },
    { label: 'This Month',   get: () => ({ from: startOfMonth(t), to: endOfMonth(t) }) },
    { label: 'Last 7 Days',  get: () => ({ from: addDays(t, -6), to: t }) },
    { label: 'Last 14 Days', get: () => ({ from: addDays(t, -13), to: t }) },
    { label: 'Last 30 Days', get: () => ({ from: addDays(t, -29), to: t }) },
    { label: 'Last 3 Months',get: () => ({ from: subMonths(t, 3), to: t }) },
    { label: 'Last 6 Months',get: () => ({ from: subMonths(t, 6), to: t }) },
    { label: 'Last Year',    get: () => ({ from: subYears(t, 1), to: t }) },
  ];
}

// ─── Month grid ───────────────────────────────────────────────

function MonthGrid({
  year, month, from, to, hover,
  onDayClick, onHover,
  prevArrow, nextArrow,
}: {
  year: number; month: number;
  from: string | null; to: string | null; hover: string | null;
  onDayClick: (d: string) => void;
  onHover: (d: string | null) => void;
  prevArrow?: () => void;
  nextArrow?: () => void;
}) {
  const days = getMonthDays(year, month);
  const t = todayStr();

  const rangeEnd = from && !to && hover ? (hover >= from ? hover : from) : to;
  const rangeStart = from && !to && hover && hover < from ? hover : from;

  return (
    <div className="flex flex-col gap-1.5" style={{ minWidth: 210 }}>
      <div className="flex items-center justify-between px-1 mb-1">
        {prevArrow
          ? <button onClick={prevArrow} className="p-1 rounded hover:text-emerald-400 transition-colors"><ChevronLeft size={15} /></button>
          : <div className="w-6" />}
        <span className="text-sm font-semibold text-foreground">{MONTH_NAMES[month]} {year}</span>
        {nextArrow
          ? <button onClick={nextArrow} className="p-1 rounded hover:text-emerald-400 transition-colors"><ChevronRight size={15} /></button>
          : <div className="w-6" />}
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map(wd => (
          <div key={wd} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{wd}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(({ date, current }) => {
          const isFrom   = date === rangeStart;
          const isTo     = date === rangeEnd && rangeEnd !== rangeStart;
          const inRange  = !!(rangeStart && rangeEnd && date > rangeStart && date < rangeEnd);
          const isSelected = isFrom || isTo || (date === from && !to && !hover);
          const isToday  = date === t;

          return (
            <button
              key={date}
              onClick={() => onDayClick(date)}
              onMouseEnter={() => onHover(date)}
              onMouseLeave={() => onHover(null)}
              className={cn(
                'relative flex items-center justify-center text-xs h-7 transition-all duration-75 select-none',
                !current && 'text-muted-foreground/25 pointer-events-none',
                current && !isSelected && !inRange && 'hover:bg-emerald-500/10 hover:text-emerald-400 rounded-full',
                isToday && !isSelected && 'text-emerald-400 font-semibold',
                isSelected && 'bg-emerald-500 text-white font-bold rounded-full z-10',
                inRange && !isSelected && 'bg-emerald-500/15 rounded-none',
                isFrom && to && to !== from && 'rounded-l-full rounded-r-none',
                isTo && 'rounded-r-full rounded-l-none',
              )}
            >
              {parseInt(date.split('-')[2])}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────

export function DateRangePicker({ value, onChange, className, compact, compactLg }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [tempFrom, setTempFrom] = useState<string | null>(value.from);
  const [tempTo, setTempTo] = useState<string | null>(value.to);
  const ref = useRef<HTMLDivElement>(null);
  const presets = buildPresets();

  const initLeft = () => {
    const d = value.from ? new Date(value.from + 'T00:00:00') : new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  };
  const [left, setLeft] = useState(initLeft);
  const [right, setRight] = useState(() => {
    const l = initLeft();
    return l.m === 11 ? { y: l.y + 1, m: 0 } : { y: l.y, m: l.m + 1 };
  });

  useEffect(() => {
    setTempFrom(value.from);
    setTempTo(value.to);
  }, [value.from, value.to]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setTempFrom(value.from);
        setTempTo(value.to);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, value]);

  const navigate = (dir: 1 | -1) => {
    const move = ({ y, m }: { y: number; m: number }) => {
      let nm = m + dir;
      let ny = y;
      if (nm < 0) { nm = 11; ny--; }
      if (nm > 11) { nm = 0; ny++; }
      return { y: ny, m: nm };
    };
    setLeft(move);
    setRight(move);
  };

  const handleDay = (date: string) => {
    if (!tempFrom || (tempFrom && tempTo)) {
      setTempFrom(date);
      setTempTo(null);
    } else {
      if (date >= tempFrom) {
        setTempTo(date);
        onChange({ from: tempFrom, to: date });
        setOpen(false);
      } else {
        onChange({ from: date, to: tempFrom });
        setOpen(false);
      }
    }
  };

  const handlePreset = (p: Preset) => {
    const r = p.get();
    onChange(r);
    setOpen(false);
  };

  const isActive = (p: Preset) => {
    if (!value.from || !value.to) return false;
    const r = p.get();
    return r.from === value.from && r.to === value.to;
  };

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      {compactLg ? (
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex items-center gap-2 text-sm border border-border rounded-lg px-3 py-2 bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-muted/80 whitespace-nowrap',
            (value.from || value.to) && 'border-primary/50 text-primary bg-primary/5',
          )}
        >
          <Calendar size={14} className="shrink-0" />
          <span>{value.from ? formatRange(value.from, value.to) : 'Deadline Range'}</span>
          <ChevronDown size={14} className={cn('text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
        </button>
      ) : compact ? (
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex items-center gap-1.5 text-xs border border-border rounded-lg px-2.5 py-1.5 bg-muted text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors hover:bg-muted/80 whitespace-nowrap',
            (value.from || value.to) && 'border-primary/50 text-primary bg-primary/5',
          )}
        >
          <Calendar size={12} className="shrink-0" />
          <span>{value.from ? formatRange(value.from, value.to) : 'Deadline Range'}</span>
          <ChevronDown size={12} className={cn('text-muted-foreground transition-transform shrink-0', open && 'rotate-180')} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          className={cn(
            'flex items-center gap-2.5 px-4 py-2 rounded-xl border text-sm font-medium transition-all',
            'bg-card border-border text-foreground hover:border-emerald-500/40 hover:bg-emerald-500/5',
            open && 'border-emerald-500/40 bg-emerald-500/5',
          )}
        >
          <Calendar size={15} className="text-emerald-500 shrink-0" />
          <div className="flex flex-col items-start leading-none gap-0.5">
            <span className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground">
              {value.from ? 'Custom Range' : 'Deadline Filter'}
            </span>
            <span className="text-sm font-semibold whitespace-nowrap">
              {formatRange(value.from, value.to)}
            </span>
          </div>
          <span className="ml-1 text-[9px] font-bold bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded shrink-0">ICT</span>
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden w-[min(530px,calc(100vw-2rem))]">

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-y-1 px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Selected Period</span>
              <span className="text-sm font-semibold text-foreground">{formatRange(tempFrom, tempTo)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Vietnam
              </button>
              <button className="px-2.5 py-1 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                Eastern Time
              </button>
              {(value.from || value.to) && (
                <button
                  onClick={() => { onChange({ from: null, to: null }); setOpen(false); }}
                  className="ml-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Body — stacks on phones: preset chips on top, calendar scrolls */}
          <div className="flex flex-col sm:flex-row">
            {/* Presets */}
            <div className="w-full sm:w-[130px] shrink-0 border-b sm:border-b-0 sm:border-r border-border p-2 flex flex-row flex-wrap sm:flex-col gap-0.5">
              {presets.map(p => (
                <button
                  key={p.label}
                  onClick={() => handlePreset(p)}
                  className={cn(
                    'text-left px-3 py-1.5 text-sm rounded-lg transition-all duration-100',
                    isActive(p)
                      ? 'bg-emerald-500/10 text-emerald-500 font-semibold'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendars — horizontal scroll keeps both months reachable on phones */}
            <div className="flex gap-4 p-4 overflow-x-auto">
              <MonthGrid
                year={left.y} month={left.m}
                from={tempFrom} to={tempTo} hover={hover}
                onDayClick={handleDay} onHover={setHover}
                prevArrow={() => navigate(-1)}
              />
              <div className="w-px bg-border shrink-0" />
              <MonthGrid
                year={right.y} month={right.m}
                from={tempFrom} to={tempTo} hover={hover}
                onDayClick={handleDay} onHover={setHover}
                nextArrow={() => navigate(1)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DateRangePicker;
