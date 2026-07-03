import { useState, useEffect, useMemo } from 'react';
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
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import { Bold, Italic, List, Pencil, Trash2, Check, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskNote } from '@/types';
import { taskNoteService } from '@/services/taskNoteService';

// ─── Helpers ──────────────────────────────────────────────────

function formatNoteTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isNoteEmpty(html: string): boolean {
  return !html.replace(/<[^>]*>/g, '').trim();
}

function wasEdited(note: TaskNote): boolean {
  return new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;
}

// ─── NoteItem ─────────────────────────────────────────────────

interface NoteItemProps {
  note: TaskNote;
  currentUserEmail?: string;
  editingNoteId: string | null;
  confirmDeleteNoteId: string | null;
  deletingNoteIds: Set<string>;
  newNoteId: string | null;
  onToggleDone: (note: TaskNote) => void;
  onStartEdit: (note: TaskNote) => void;
  onRequestDelete: (noteId: string) => void;
  onConfirmDelete: (noteId: string) => void;
  onCancelDelete: () => void;
  dragHandle?: React.ReactNode;
  isDragging?: boolean;
}

function NoteItem({
  note,
  currentUserEmail,
  editingNoteId,
  confirmDeleteNoteId,
  deletingNoteIds,
  newNoteId,
  onToggleDone,
  onStartEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  dragHandle,
  isDragging,
}: NoteItemProps) {
  const isOwnNote = note.author.email === currentUserEmail;
  const isEditing  = editingNoteId === note.id;
  const isConfirming = confirmDeleteNoteId === note.id;
  const isDeleting = deletingNoteIds.has(note.id);
  const isNew  = newNoteId === note.id;
  const edited = wasEdited(note);

  return (
    <div
      className={cn(
        'group flex items-start gap-2 px-2 py-2.5 rounded-xl transition-all duration-200',
        'hover:bg-muted/40',
        isDeleting && 'opacity-0 -translate-y-1 scale-[0.98] pointer-events-none',
        note.done && !isDeleting && 'opacity-50',
        isNew && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
        isDragging && 'opacity-30',
      )}
    >
      {dragHandle}

      <button
        type="button"
        onClick={() => onToggleDone(note)}
        className={cn(
          'shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors',
          note.done ? 'bg-primary border-primary' : 'border-border hover:border-primary',
        )}
      >
        {note.done && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] text-muted-foreground font-medium truncate">
            {note.author.name ?? note.author.email.split('@')[0]}
          </span>
          <span className="text-muted-foreground/40 text-[10px]">·</span>
          <span className="text-[11px] text-muted-foreground/70 shrink-0">
            {formatNoteTime(note.createdAt)}
            {edited && ' · edited'}
          </span>
        </div>

        {!isEditing && (
          <div
            className={cn(
              'text-sm prose prose-sm dark:prose-invert max-w-none',
              '[&_p]:my-0 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_p]:leading-snug',
              note.done && '[&_p]:line-through [&_li]:line-through [&_span]:line-through',
            )}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.content) }}
          />
        )}

        {isOwnNote && !isEditing && (
          isConfirming ? (
            <div className="flex items-center gap-2 mt-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
              <span className="text-xs text-muted-foreground">Delete this note?</span>
              <button type="button" onClick={onCancelDelete}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted">
                Keep
              </button>
              <button type="button" onClick={() => onConfirmDelete(note.id)}
                className="text-xs font-medium text-destructive hover:text-destructive/80 transition-colors px-1.5 py-0.5 rounded-md hover:bg-destructive/10">
                Yes, delete
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button type="button" onClick={() => onStartEdit(note)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Pencil size={10} /> Edit
              </button>
              <span className="text-muted-foreground/40 text-xs">·</span>
              <button type="button" onClick={() => onRequestDelete(note.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 size={10} /> Delete
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ─── SortableNoteItem ─────────────────────────────────────────

function SortableNoteItem(props: NoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.note.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      className={cn(
        'rounded-xl',
        isDragging && 'z-50 shadow-lg bg-background border border-border/60 opacity-90',
      )}
    >
      <NoteItem
        {...props}
        dragHandle={
          <button
            {...listeners}
            type="button"
            tabIndex={-1}
            className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-opacity touch-none"
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </div>
  );
}

// ─── NoteToolbarBtn ───────────────────────────────────────────

function NoteToolbarBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted',
        active && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────

interface Props {
  taskId: string;
  currentUserEmail?: string;
  animationClass?: string;
  // Reports the current note count to the parent so it can render the tab
  // badge without pre-fetching notes.
  onCountChange?: (count: number) => void;
}

export default function TaskDialogNotesTab({ taskId, currentUserEmail, animationClass, onCountChange }: Props) {
  const [notes, setNotes] = useState<TaskNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [deletingNoteIds, setDeletingNoteIds] = useState<Set<string>>(new Set());
  const [newNoteId, setNewNoteId] = useState<string | null>(null);

  const sortedNotes = useMemo(() => {
    const undone = notes.filter(n => !n.done).sort((a, b) => a.order - b.order);
    const done   = notes.filter(n =>  n.done).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return [...undone, ...done];
  }, [notes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const noteEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write a note...' }),
    ],
    content: '',
    onUpdate: ({ editor }) => setNoteContent(editor.getHTML()),
  });

  // Load notes on mount / task change
  useEffect(() => {
    setNotesLoading(true);
    taskNoteService.getNotes(taskId)
      .then(res => setNotes(res.data))
      .catch(() => {})
      .finally(() => setNotesLoading(false));
  }, [taskId]);

  // Sync count to parent so the tab badge stays in sync
  useEffect(() => {
    onCountChange?.(notes.length);
  }, [notes.length, onCountChange]);

  // Load editor content when entering edit mode
  useEffect(() => {
    if (editingNoteId && noteEditor) {
      const note = notes.find(n => n.id === editingNoteId);
      if (note) {
        noteEditor.commands.setContent(note.content);
        setNoteContent(note.content);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNoteId]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleAddNote = async () => {
    if (isNoteEmpty(noteContent) || noteSubmitting) return;
    setNoteSubmitting(true);
    try {
      const res = await taskNoteService.addNote(taskId, noteContent);
      setNotes(prev => [...prev, res.data]);
      setNewNoteId(res.data.id);
      setTimeout(() => setNewNoteId(null), 400);
      noteEditor?.commands.clearContent();
      setNoteContent('');
    } catch { /* silent */ } finally { setNoteSubmitting(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingNoteId || isNoteEmpty(noteContent) || noteSubmitting) return;
    setNoteSubmitting(true);
    try {
      const res = await taskNoteService.updateNote(taskId, editingNoteId, noteContent);
      setNotes(prev => prev.map(n => n.id === editingNoteId ? res.data : n));
      setEditingNoteId(null);
      noteEditor?.commands.clearContent();
      setNoteContent('');
    } catch { /* silent */ } finally { setNoteSubmitting(false); }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    noteEditor?.commands.clearContent();
    setNoteContent('');
  };

  const handleToggleDone = async (note: TaskNote) => {
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, done: !n.done } : n));
    try {
      const res = await taskNoteService.toggleDone(taskId, note.id);
      setNotes(prev => prev.map(n => n.id === note.id ? res.data : n));
    } catch {
      setNotes(prev => prev.map(n => n.id === note.id ? note : n));
    }
  };

  const handleDeleteNote = (noteId: string) => {
    setConfirmDeleteNoteId(null);
    setDeletingNoteIds(prev => new Set([...prev, noteId]));
    setTimeout(async () => {
      try {
        await taskNoteService.deleteNote(taskId, noteId);
        setNotes(prev => prev.filter(n => n.id !== noteId));
        setDeletingNoteIds(prev => { const s = new Set(prev); s.delete(noteId); return s; });
        if (editingNoteId === noteId) {
          setEditingNoteId(null);
          noteEditor?.commands.clearContent();
          setNoteContent('');
        }
      } catch {
        setDeletingNoteIds(prev => { const s = new Set(prev); s.delete(noteId); return s; });
      }
    }, 220);
  };

  const handleDragStart = () => {
    document.body.style.overflow = 'hidden';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    document.body.style.overflow = '';
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const undone = notes.filter(n => !n.done).sort((a, b) => a.order - b.order);
    const oldIdx = undone.findIndex(n => n.id === active.id);
    const newIdx = undone.findIndex(n => n.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(undone, oldIdx, newIdx).map((n, i) => ({ ...n, order: i }));
    const done = notes.filter(n => n.done);
    setNotes([...reordered, ...done]);

    taskNoteService.reorderNotes(taskId, reordered.map(n => n.id)).catch(() => {
      taskNoteService.getNotes(taskId).then(res => setNotes(res.data)).catch(() => {});
    });
  };

  const undoneNotes = sortedNotes.filter(n => !n.done);
  const doneNotes   = sortedNotes.filter(n =>  n.done);
  const noteProps = {
    currentUserEmail,
    editingNoteId,
    confirmDeleteNoteId,
    deletingNoteIds,
    newNoteId,
    onToggleDone: handleToggleDone,
    onStartEdit: (n: TaskNote) => setEditingNoteId(n.id),
    onRequestDelete: setConfirmDeleteNoteId,
    onConfirmDelete: handleDeleteNote,
    onCancelDelete: () => setConfirmDeleteNoteId(null),
  };

  return (
    <div
      key="notes-content"
      className={cn('mt-3 space-y-3 animate-in fade-in-0 duration-200', animationClass)}
    >
      {/* Notes feed */}
      <div className="space-y-0.5 max-h-[320px] overflow-y-auto scrollbar-hide pr-1 -mx-1 px-1">
        {notesLoading && (
          <p className="text-sm text-muted-foreground text-center py-8">Loading notes...</p>
        )}
        {!notesLoading && sortedNotes.length === 0 && (
          <div className="text-center py-10 space-y-1">
            <p className="text-sm text-muted-foreground">No notes yet.</p>
            <p className="text-xs text-muted-foreground/60">Add your first note below.</p>
          </div>
        )}

        {!notesLoading && sortedNotes.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => { document.body.style.overflow = ''; }}
          >
            <SortableContext items={undoneNotes.map(n => n.id)} strategy={verticalListSortingStrategy}>
              {undoneNotes.map(note => (
                <SortableNoteItem key={note.id} note={note} {...noteProps} />
              ))}
            </SortableContext>

            {doneNotes.length > 0 && (
              <div className={cn('space-y-0.5', undoneNotes.length > 0 && 'mt-1.5 pt-1.5 border-t border-border/40')}>
                {doneNotes.map(note => (
                  <NoteItem key={note.id} note={note} {...noteProps} />
                ))}
              </div>
            )}
          </DndContext>
        )}
      </div>

      {/* Editor area */}
      <div className="border-t border-border pt-3">
        {editingNoteId && (
          <p className="text-xs font-medium text-[#FE812C] mb-1.5 flex items-center gap-1">
            <Pencil size={10} /> Editing note
          </p>
        )}
        <div className="border border-input rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#FE812C]/20 transition-shadow">
          <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-muted/30">
            <NoteToolbarBtn active={noteEditor?.isActive('bold')} onClick={() => noteEditor?.chain().focus().toggleBold().run()} title="Bold"><Bold size={11} /></NoteToolbarBtn>
            <NoteToolbarBtn active={noteEditor?.isActive('italic')} onClick={() => noteEditor?.chain().focus().toggleItalic().run()} title="Italic"><Italic size={11} /></NoteToolbarBtn>
            <NoteToolbarBtn active={noteEditor?.isActive('bulletList')} onClick={() => noteEditor?.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={11} /></NoteToolbarBtn>
          </div>
          <EditorContent
            editor={noteEditor}
            className={cn(
              'px-3 py-2 min-h-[64px] text-sm',
              '[&_.ProseMirror]:outline-none',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
              '[&_.ProseMirror_p]:my-0.5',
            )}
          />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          {editingNoteId && (
            <Button type="button" variant="outline" onClick={handleCancelEdit} className="rounded-xl h-8 px-3 text-xs">
              Cancel
            </Button>
          )}
          <Button
            type="button"
            onClick={editingNoteId ? handleSaveEdit : handleAddNote}
            disabled={noteSubmitting || isNoteEmpty(noteContent)}
            className="rounded-xl h-8 px-4 text-xs bg-[#FE812C] hover:bg-[#e5732a] text-white"
          >
            {noteSubmitting ? 'Saving...' : editingNoteId ? 'Save Changes' : 'Add Note'}
          </Button>
        </div>
      </div>
    </div>
  );
}
