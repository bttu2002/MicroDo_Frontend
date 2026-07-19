// Single source of truth for inferring a task status from a board column.
// KanbanBoard (drag-drop, per-column "+ add") and TaskDialog (column select)
// must all agree, and the backend mirrors the same rules in
// taskService.deriveStatusForColumn — name match wins, position is the fallback.

export interface ColumnLike {
  id: string;
  name: string;
  order: number;
}

const DONE_COL_NAME  = /\bdone\b|\bcomplete[d]?\b|\bfinish(ed)?\b/;
const TODO_COL_NAME  = /\bto[\s-]?do\b|\btodo\b|\bbacklog\b|\bnew\b/;
const DOING_COL_NAME = /\bdoing\b|\bin[\s-]?progress\b|\bprogress\b|\bactive\b|\bwip\b/;

export function statusForColumn(
  columns: ColumnLike[],
  columnId: string
): 'todo' | 'doing' | 'done' | null {
  const sorted = [...columns].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.id === columnId);
  if (idx === -1) return null;
  const name = sorted[idx].name.toLowerCase().trim();
  if (DONE_COL_NAME.test(name)) return 'done';
  if (TODO_COL_NAME.test(name)) return 'todo';
  if (DOING_COL_NAME.test(name)) return 'doing';
  if (idx === 0) return 'todo';
  if (idx === sorted.length - 1) return 'done';
  return 'doing';
}
