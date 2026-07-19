import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { taskService } from '@/services/taskService';
import { todoService } from '@/services/todoService';
import { getApiErrorMessage } from '@/services/api';
import type { TaskStats, Todo } from '@/types';

import {
  CheckSquare,
  ClipboardList,
  Clock,
  TrendingUp,
  Loader2,
  Plus,
  X,
  Check,
  Trash2,
  GripVertical,
  Pencil,
  Palette,
  Pin,
  PinOff,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const TODO_PREVIEW_LIMIT = 6;

const sortTodos = (arr: Todo[]) =>
  [...arr].sort((a, b) =>
    a.done !== b.done
      ? a.done ? 1 : -1
      : a.order !== b.order
        ? a.order - b.order
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

const extractTags = (text: string): string[] => {
  const matches = text.match(/#([a-zA-Z][a-zA-Z0-9_]*)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(1).toLowerCase()))];
};

type TagConfig = Record<string, { color: string; pinned: boolean; order: number }>;
const TAG_CONFIG_KEY = 'todo-tag-config';
const PRESET_COLORS = ['#6B7280', '#EF4444', '#F97316', '#EAB308', '#22C55E', '#14B8A6', '#3B82F6', '#A855F7'];

function loadTagConfig(): TagConfig {
  try { return JSON.parse(localStorage.getItem(TAG_CONFIG_KEY) ?? '{}'); } catch { return {}; }
}
function saveTagConfig(cfg: TagConfig) {
  localStorage.setItem(TAG_CONFIG_KEY, JSON.stringify(cfg));
}

function SortableTodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  justMoved,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newText: string) => void;
  justMoved: { id: string; dir: 'down' | 'up' } | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    disabled: todo.done || isEditing,
  });

  const startEdit = () => {
    setEditText(todo.text);
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== todo.text) onEdit(todo.id, trimmed);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 group px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all duration-200 ${
        todo.done ? 'opacity-50' : ''
      } ${isDragging ? 'shadow-md bg-card ring-1 ring-border z-10' : ''} ${
        justMoved?.id === todo.id
          ? justMoved.dir === 'down'
            ? 'animate-in fade-in slide-in-from-top-3 duration-300'
            : 'animate-in fade-in slide-in-from-bottom-3 duration-300'
          : ''
      }`}
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        tabIndex={-1}
        className={`shrink-0 mt-1 touch-none transition-colors ${
          todo.done || isEditing
            ? 'text-transparent cursor-default pointer-events-none'
            : 'cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/70'
        }`}
      >
        <GripVertical size={14} />
      </button>

      {/* Checkbox */}
      <button
        onClick={() => !isEditing && onToggle(todo)}
        className={`shrink-0 mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
          todo.done ? 'bg-primary border-primary' : 'border-border hover:border-primary'
        }`}
      >
        {todo.done && <Check size={11} className="text-primary-foreground" strokeWidth={3} />}
      </button>

      {/* Text / Edit input + tag badges */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={editInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
              if (e.key === 'Escape') setIsEditing(false);
            }}
            onBlur={saveEdit}
            maxLength={500}
            className="w-full text-sm bg-muted/50 border border-primary/40 rounded-lg px-2 py-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        ) : (
          <>
            <span className={`text-sm leading-tight break-words ${todo.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {todo.text}
            </span>
            {todo.tags && todo.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {todo.tags.map((t) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit */}
      {!todo.done && !isEditing && (
        <button
          onClick={startEdit}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
        >
          <Pencil size={13} />
        </button>
      )}

      {/* Delete */}
      {!isEditing && (
        <button
          onClick={() => onDelete(todo.id)}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function SortableSection({
  tag,
  sectionIdx,
  tagConfig,
  onColorChange,
  onPinToggle,
  children,
}: {
  tag: string;
  sectionIdx: number;
  tagConfig: TagConfig;
  onColorChange: (tag: string, color: string) => void;
  onPinToggle: (tag: string) => void;
  children: ReactNode;
}) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const cfg = tagConfig[tag];
  const color = cfg?.color ?? '';
  const isPinned = cfg?.pinned ?? false;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: `section-${tag}`,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-60 z-10 relative' : 'relative'}
    >
      <div className={`flex items-center gap-1.5 mb-1 group/section ${sectionIdx > 0 ? 'mt-3' : 'mt-1'}`}>
        {/* Drag handle */}
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          tabIndex={-1}
          className="opacity-0 group-hover/section:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/80 transition-opacity shrink-0"
        >
          <GripVertical size={15} />
        </button>

        <span
          className="text-[11px] font-semibold uppercase tracking-wide shrink-0"
          style={{ color: color || undefined }}
        >
          {tag}
        </span>
        {isPinned && (
          <Pin size={9} className="shrink-0 opacity-60" style={{ color: color || undefined }} />
        )}

        {/* Separator line */}
        <div
          className="flex-1 h-px"
          style={{ backgroundColor: color || 'hsl(var(--border))' }}
        />

        {/* Controls */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onPinToggle(tag)}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={isPinned ? 'Unpin section' : 'Pin section'}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowColorPicker((v) => !v)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Change color"
            >
              <Palette size={14} />
            </button>
            {showColorPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowColorPicker(false)} />
                <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-xl p-2 shadow-lg flex gap-1.5 flex-wrap w-[116px]">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => { onColorChange(tag, color === c ? '' : c); setShowColorPicker(false); }}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110 shrink-0"
                      style={{
                        backgroundColor: c,
                        outline: color === c ? `2px solid ${c}` : '2px solid transparent',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  // ── Task stats ──────────────────────────────────────────────
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  // ── Todos ───────────────────────────────────────────────────
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todosLoading, setTodosLoading] = useState(true);
  const [newText, setNewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [justMoved, setJustMoved] = useState<{ id: string; dir: 'down' | 'up' } | null>(null);
  const [tagConfig, setTagConfig] = useState<TagConfig>(() => loadTagConfig());
  const inputRef = useRef<HTMLInputElement>(null);

  const updateTagConfig = (updater: (prev: TagConfig) => TagConfig) => {
    setTagConfig((prev) => {
      const next = updater(prev);
      saveTagConfig(next);
      return next;
    });
  };

  const handleTagColor = (tag: string, color: string) => {
    updateTagConfig((prev) => ({
      ...prev,
      [tag]: { color, pinned: prev[tag]?.pinned ?? false, order: prev[tag]?.order ?? 999 },
    }));
  };

  const handleTagPin = (tag: string) => {
    updateTagConfig((prev) => ({
      ...prev,
      [tag]: { color: prev[tag]?.color ?? '', pinned: !(prev[tag]?.pinned ?? false), order: prev[tag]?.order ?? 999 },
    }));
  };

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      setStatsError('');
      try {
        const res = await taskService.getStats();
        if (res.success) setStats(res.data);
      } catch {
        setStatsError('Failed to load dashboard stats');
      } finally {
        setStatsLoading(false);
      }
    };

    const fetchTodos = async () => {
      setTodosLoading(true);
      try {
        const res = await todoService.getAll();
        setTodos(sortTodos(res.data));
      } catch {
        // silently fail — non-critical widget
      } finally {
        setTodosLoading(false);
      }
    };

    fetchStats();
    fetchTodos();
  }, []);

  const handleAddTodo = async () => {
    const text = newText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const tags = extractTags(text);
      const res = await todoService.create(text, tags);
      setTodos((prev) => sortTodos([res.data, ...prev]));
      setNewText('');
      inputRef.current?.focus();
    } catch (err) {
      console.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDone = async (todo: Todo) => {
    setJustMoved({ id: todo.id, dir: todo.done ? 'up' : 'down' });
    setTimeout(() => setJustMoved(null), 400);
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t))));
    try {
      await todoService.update(todo.id, { done: !todo.done });
    } catch {
      setTodos((prev) => sortTodos(prev.map((t) => (t.id === todo.id ? { ...t, done: todo.done } : t))));
    }
  };

  const handleDeleteTodo = async (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await todoService.delete(id);
    } catch {
      const res = await todoService.getAll();
      setTodos(sortTodos(res.data));
    }
  };

  const handleEditTodo = async (id: string, newText: string) => {
    const tags = extractTags(newText);
    setTodos((prev) => sortTodos(prev.map((t) => (t.id === id ? { ...t, text: newText, tags } : t))));
    try {
      await todoService.update(id, { text: newText, tags });
    } catch {
      const res = await todoService.getAll();
      setTodos(sortTodos(res.data));
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Section reorder
    if (activeId.startsWith('section-') && overId.startsWith('section-')) {
      const activeTag = activeId.slice('section-'.length);
      const overTag = overId.slice('section-'.length);
      const sectionTags = tagSections.filter((s) => s.tag !== null).map((s) => s.tag!);
      const oldIdx = sectionTags.indexOf(activeTag);
      const newIdx = sectionTags.indexOf(overTag);
      if (oldIdx === -1 || newIdx === -1) return;
      const newOrder = arrayMove(sectionTags, oldIdx, newIdx);
      updateTagConfig((prev) => {
        const next = { ...prev };
        newOrder.forEach((tag, i) => {
          next[tag] = { color: prev[tag]?.color ?? '', pinned: prev[tag]?.pinned ?? false, order: i };
        });
        return next;
      });
      return;
    }

    // Item reorder
    const sectionIdx = tagSections.findIndex((s) =>
      s.items.some((t) => t.id === activeId)
    );
    if (sectionIdx === -1) return;

    const section = tagSections[sectionIdx];
    const oldIdx = section.items.findIndex((t) => t.id === activeId);
    const newIdx = section.items.findIndex((t) => t.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;

    const updatedSections = tagSections.map((s, i) =>
      i === sectionIdx ? { ...s, items: arrayMove(s.items, oldIdx, newIdx) } : s
    );

    const allUndone = updatedSections.flatMap((s) => s.items.filter((t) => !t.done));
    const orderUpdates = allUndone.map((t, i) => ({ id: t.id, order: i }));
    const orderMap = new Map(orderUpdates.map(({ id, order }) => [id, order]));

    setTodos((prev) =>
      sortTodos(prev.map((t) => ({ ...t, order: orderMap.get(t.id) ?? t.order })))
    );

    try {
      await todoService.reorder(orderUpdates);
    } catch {
      const res = await todoService.getAll();
      setTodos(sortTodos(res.data));
    }
  };

  const visibleTodos = showAll ? todos : todos.slice(0, TODO_PREVIEW_LIMIT);
  const hiddenCount = todos.length - TODO_PREVIEW_LIMIT;

  // Group by tag: no-tag first, tagged sections sorted by tagConfig order
  const tagSections: { tag: string | null; items: Todo[] }[] = [];
  {
    const tagMap = new Map<string, Todo[]>();
    const noTagItems: Todo[] = [];
    for (const todo of visibleTodos) {
      if (!todo.tags || todo.tags.length === 0) {
        noTagItems.push(todo);
      } else {
        const primary = todo.tags[0];
        if (!tagMap.has(primary)) tagMap.set(primary, []);
        tagMap.get(primary)!.push(todo);
      }
    }
    if (noTagItems.length > 0) tagSections.push({ tag: null, items: noTagItems });

    // Collect all known tags: from todos + pinned ones
    const allTags = new Set<string>([...tagMap.keys()]);
    Object.entries(tagConfig).forEach(([tag, cfg]) => { if (cfg.pinned) allTags.add(tag); });

    const sortedTags = [...allTags].sort((a, b) => {
      const oA = tagConfig[a]?.order ?? 999;
      const oB = tagConfig[b]?.order ?? 999;
      return oA !== oB ? oA - oB : a.localeCompare(b);
    });

    for (const tag of sortedTags) {
      const items = tagMap.get(tag) ?? [];
      if (items.length > 0 || tagConfig[tag]?.pinned) {
        tagSections.push({ tag, items });
      }
    }
  }

  const quickActions = [
    { icon: CheckSquare, label: 'Create Task', color: 'text-[#FE812C]', path: '/dashboard/tasks', state: { openCreate: true } },
    { icon: ClipboardList, label: 'Plan Today', color: 'text-primary', path: '/dashboard/calendar' },
    { icon: Clock, label: 'View your performance', color: 'text-[#E298B9]', path: '/dashboard/analytics' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          Welcome Back, {user?.name || user?.email?.split('@')[0] || 'User'}
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your tasks.</p>
      </div>

      {/* Grid: 2 col × 2 row — Quick Todo spans full right column */}
      <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-5">
        {/* Row 1 Col 1 — Quick Actions Card */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground">How can I help you today?</h3>
          </div>
          <div className="space-y-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path, action.state ? { state: action.state } : undefined)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-muted/50 hover:bg-muted text-foreground text-sm font-medium transition-colors group"
                >
                  <Icon size={18} className={action.color} />
                  <span className="flex-1 text-left">{action.label}</span>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">→</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Col 2 Rows 1-2 — Quick Todo Card (spans full right column) */}
        <div className="md:row-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Wayer Todos</h3>
              <p className="text-xs text-muted-foreground">Small tasks, no project needed</p>
            </div>
            {todos.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {todos.filter((t) => t.done).length}/{todos.length} done
              </span>
            )}
          </div>

          {/* Input */}
          <div className="flex flex-col gap-1 mb-4">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                placeholder="Add a Wayer Todo..."
                maxLength={500}
                className="flex-1 text-sm bg-muted/50 border border-border rounded-xl px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
              />
              <button
                onClick={handleAddTodo}
                disabled={!newText.trim() || submitting}
                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              </button>
            </div>
            {newText.length >= 400 && (
              <p className={`text-[10px] text-right pr-1 transition-colors ${newText.length >= 480 ? 'text-destructive' : 'text-amber-500'}`}>
                {newText.length}/500
              </p>
            )}
          </div>

          {/* Todo List */}
          {todosLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="animate-spin text-primary" size={20} />
            </div>
          ) : todos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No todos yet — add one above!
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex-1 overflow-y-auto space-y-1">
              {/* No-tag section */}
              {tagSections.filter((s) => s.tag === null).map(({ items }) => (
                <SortableContext key="__no_tag__" items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {items.map((todo) => (
                      <SortableTodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={handleToggleDone}
                        onDelete={setPendingDeleteId}
                        onEdit={handleEditTodo}
                        justMoved={justMoved}
                      />
                    ))}
                  </div>
                </SortableContext>
              ))}

              {/* Tagged sections — sortable */}
              <SortableContext
                items={tagSections.filter((s) => s.tag !== null).map((s) => `section-${s.tag}`)}
                strategy={verticalListSortingStrategy}
              >
                {tagSections.filter((s) => s.tag !== null).map(({ tag, items }, idx) => (
                  <SortableSection
                    key={tag!}
                    tag={tag!}
                    sectionIdx={idx}
                    tagConfig={tagConfig}
                    onColorChange={handleTagColor}
                    onPinToggle={handleTagPin}
                  >
                    <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-1">
                        {items.map((todo) => (
                          <SortableTodoItem
                            key={todo.id}
                            todo={todo}
                            onToggle={handleToggleDone}
                            onDelete={setPendingDeleteId}
                            onEdit={handleEditTodo}
                            justMoved={justMoved}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </SortableSection>
                ))}
              </SortableContext>

              {/* Show more / less */}
              {!showAll && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  Show {hiddenCount} more...
                </button>
              )}
              {showAll && todos.length > TODO_PREVIEW_LIMIT && (
                <button
                  onClick={() => setShowAll(false)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-1.5 transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          </DndContext>
          )}
        </div>

        {/* Row 2 Col 1 — Task Progress Card */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Task Progress</h3>
              <p className="text-xs text-muted-foreground">Your current workflow snapshot</p>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">Live</span>
          </div>

          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-primary" size={24} />
            </div>
          ) : statsError ? (
            <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-xl px-4 py-3 text-sm font-medium">
              {statsError}
            </div>
          ) : stats ? (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-5">
                <div className="text-center">
                  <p className="text-xl sm:text-2xl font-bold text-primary">{stats.done}</p>
                  <p className="text-xs text-muted-foreground mt-1">Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-[#FE812C]">{stats.doing}</p>
                  <p className="text-xs text-muted-foreground mt-1">In Progress</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-500">{stats.todo}</p>
                  <p className="text-xs text-muted-foreground mt-1">To Do</p>
                </div>
              </div>
              <div className="bg-primary/10 rounded-xl p-3 flex items-center gap-2">
                <TrendingUp size={16} className="text-primary shrink-0" />
                <span className="text-xs font-medium text-primary">
                  {stats.total} total tasks tracked
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {/* Delete confirm dialog */}
      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 size={16} className="text-destructive" />
              Delete todo?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) handleDeleteTodo(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
