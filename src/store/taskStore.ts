import { create } from 'zustand';
import type { Task, TasksResponse } from '@/types';
import { taskService, type CreateTaskData, type UpdateTaskData } from '@/services/taskService';
import { getApiErrorMessage } from '@/services/api';

type Pagination = TasksResponse['pagination'];
type ColumnKey = 'todo' | 'doing' | 'done';

interface TaskQueryParams {
  search?: string;
  status?: string;
  sortBy?: string;
  order?: string;
  page?: number;
  limit?: number;
  deadlineFrom?: string;
  deadlineTo?: string;
  personal?: boolean;
  projectId?: string;
  columnId?: string;
}

interface TaskState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  params: TaskQueryParams;
  pagination: Pagination | null;

  columnTasks: { todo: Task[]; doing: Task[]; done: Task[] };
  columnPaginations: { todo: Pagination | null; doing: Pagination | null; done: Pagination | null };
  columnLoading: boolean;
  personalBaseParams: Partial<TaskQueryParams>;

  projectColTasks: Record<string, Task[]>;
  projectColPaginations: Record<string, Pagination | null>;
  projectColLoading: boolean;
  projectColIds: string[];

  setParams: (newParams: Partial<TaskQueryParams>) => void;
  resetParams: (overrides?: Partial<TaskQueryParams>) => void;
  fetchTasks: () => Promise<void>;
  createTask: (data: CreateTaskData) => Promise<void>;
  updateTask: (id: string, data: UpdateTaskData) => Promise<void>;
  moveTask: (id: string, status: ColumnKey) => Promise<void>;
  moveTaskToColumn: (id: string, columnId: string, status?: ColumnKey) => Promise<void>;
  cancelRecurrence: (id: string, keepChildren: boolean) => Promise<string>;
  deleteTask: (id: string) => Promise<void>;
  silentFetch: () => Promise<void>;
  patchTask: (id: string, partial: Partial<Task>) => void;

  fetchPersonalTasks: (params: Partial<TaskQueryParams>, options?: { silent?: boolean }) => Promise<void>;
  loadMoreColumn: (status: ColumnKey) => Promise<void>;
  silentRefreshPersonal: () => Promise<void>;

  fetchProjectColTasks: (columnIds: string[], options?: { silent?: boolean }) => Promise<void>;
  loadMoreProjectCol: (columnId: string) => Promise<void>;
  silentRefreshProjectCols: () => Promise<void>;
  hydrateProjectBoard: (
    columnIds: string[],
    tasksByColumn: Record<string, { data: Task[]; pagination: Pagination | null }>,
  ) => void;
}

// M-3: in-flight guard — prevents duplicate pages on double-click "Load more"
const loadingMoreCols = new Set<string>();
// M-4: in-flight guard — prevents concurrent silentRefreshProjectCols from racing
// B-4: pendingProjectColRefresh ensures a missed event during a refresh triggers one more run
let refreshingProjectCols = false;
let pendingProjectColRefresh = false;
// D-1: debounce drag-triggered refreshes — rapid drags fire one refresh after the last drag
// settles (400ms), preventing stale in-flight refresh from overwriting later optimistic state
let personalDragRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let projectColDragRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleDebouncedPersonalRefresh = (getState: () => TaskState, delay = 400) => {
  if (personalDragRefreshTimer) clearTimeout(personalDragRefreshTimer);
  personalDragRefreshTimer = setTimeout(() => { personalDragRefreshTimer = null; void getState().silentRefreshPersonal(); }, delay);
};
const scheduleDebouncedProjectColRefresh = (getState: () => TaskState, delay = 400) => {
  if (projectColDragRefreshTimer) clearTimeout(projectColDragRefreshTimer);
  projectColDragRefreshTimer = setTimeout(() => { projectColDragRefreshTimer = null; void getState().silentRefreshProjectCols(); }, delay);
};
// D-2: track task IDs with in-flight status mutations — silentRefreshPersonal preserves their
// optimistic positions so a stale in-flight response cannot overwrite a later drag's state
const pendingPersonalMoves = new Set<string>();

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  params: { limit: 50, page: 1 },
  pagination: null,

  columnTasks: { todo: [], doing: [], done: [] },
  columnPaginations: { todo: null, doing: null, done: null },
  columnLoading: true,
  personalBaseParams: {},

  projectColTasks: {},
  projectColPaginations: {},
  projectColLoading: false,
  projectColIds: [],

  setParams: (newParams) => {
    const updatedParams = { ...get().params, ...newParams };
    if (!newParams.page && (newParams.search !== undefined || newParams.status !== undefined || newParams.sortBy !== undefined || newParams.deadlineFrom !== undefined || newParams.deadlineTo !== undefined)) {
      updatedParams.page = 1;
    }
    set({ params: updatedParams });
    void get().silentFetch();
  },

  resetParams: (overrides) => {
    set({ tasks: [], params: { limit: 50, page: 1, ...overrides }, personalBaseParams: {}, projectColIds: [], projectColTasks: {}, projectColPaginations: {} });
    // L-1: skip legacy fetchTasks when switching to project board (KanbanBoard handles col fetch)
    if (!overrides?.projectId) {
      get().fetchTasks();
    }
  },

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const res = await taskService.getTasks(get().params);
      set({ tasks: res.data, pagination: res.pagination, loading: false });
    } catch (err) {
      set({ error: getApiErrorMessage(err, 'Failed to fetch tasks'), loading: false });
    }
  },

  fetchPersonalTasks: async (params, options) => {
    const baseParams: Partial<TaskQueryParams> = { ...params, personal: true };
    if (!options?.silent) set({ columnLoading: true });
    set({ personalBaseParams: baseParams });
    try {
      const [todo, doing, done] = await Promise.all([
        taskService.getTasks({ ...baseParams, status: 'todo', page: 1, limit: 20 }),
        taskService.getTasks({ ...baseParams, status: 'doing', page: 1, limit: 20 }),
        taskService.getTasks({ ...baseParams, status: 'done', page: 1, limit: 20 }),
      ]);
      set({
        columnTasks: { todo: todo.data, doing: doing.data, done: done.data },
        columnPaginations: { todo: todo.pagination, doing: doing.pagination, done: done.pagination },
        columnLoading: false,
      });
    } catch {
      set({ columnLoading: false });
    }
  },

  loadMoreColumn: async (status) => {
    // M-3: skip if already fetching this column
    if (loadingMoreCols.has(status)) return;
    const pagination = get().columnPaginations[status];
    if (!pagination?.hasNextPage) return;
    loadingMoreCols.add(status);
    try {
      const res = await taskService.getTasks({
        ...get().personalBaseParams,
        status,
        page: pagination.currentPage + 1,
        limit: 20,
      });
      set({
        columnTasks: {
          ...get().columnTasks,
          [status]: [...get().columnTasks[status], ...res.data],
        },
        columnPaginations: {
          ...get().columnPaginations,
          [status]: res.pagination,
        },
      });
    } finally {
      loadingMoreCols.delete(status);
    }
  },

  silentRefreshPersonal: async () => {
    const baseParams = get().personalBaseParams;
    if (!baseParams.personal) return;
    try {
      const [todo, doing, done] = await Promise.allSettled([
        taskService.getTasks({ ...baseParams, status: 'todo', page: 1, limit: 20 }),
        taskService.getTasks({ ...baseParams, status: 'doing', page: 1, limit: 20 }),
        taskService.getTasks({ ...baseParams, status: 'done', page: 1, limit: 20 }),
      ]);
      // D-2: exclude pending-move tasks from server response, keep their current optimistic position
      const curr = get().columnTasks;
      const applyMerge = (serverTasks: Task[], currentTasks: Task[]) => {
        if (pendingPersonalMoves.size === 0) return serverTasks;
        const out = serverTasks.filter(t => !pendingPersonalMoves.has(t._id));
        for (const t of currentTasks) { if (pendingPersonalMoves.has(t._id)) out.push(t); }
        return out;
      };
      set({
        columnTasks: {
          todo: todo.status === 'fulfilled' ? applyMerge(todo.value.data, curr.todo) : curr.todo,
          doing: doing.status === 'fulfilled' ? applyMerge(doing.value.data, curr.doing) : curr.doing,
          done: done.status === 'fulfilled' ? applyMerge(done.value.data, curr.done) : curr.done,
        },
        columnPaginations: {
          todo: todo.status === 'fulfilled' ? todo.value.pagination : get().columnPaginations.todo,
          doing: doing.status === 'fulfilled' ? doing.value.pagination : get().columnPaginations.doing,
          done: done.status === 'fulfilled' ? done.value.pagination : get().columnPaginations.done,
        },
      });
    } catch {
      // silent
    }
  },

  createTask: async (data: CreateTaskData) => {
    await taskService.createTask(data);
    if (get().personalBaseParams.personal) {
      await get().silentRefreshPersonal();
    } else {
      await get().silentFetch();
    }
  },

  updateTask: async (id: string, data: UpdateTaskData) => {
    if (get().personalBaseParams.personal) {
      // Personal mode: optimistic update on columnTasks
      const prevColumnTasks = get().columnTasks;
      const updateInCol = (arr: Task[]) => arr.map(t => t._id === id ? { ...t, ...data } as Task : t);
      set({
        columnTasks: {
          todo: updateInCol(prevColumnTasks.todo),
          doing: updateInCol(prevColumnTasks.doing),
          done: updateInCol(prevColumnTasks.done),
        },
      });
      try {
        await taskService.updateTask(id, data);
        void get().silentRefreshPersonal();
      } catch (err) {
        set({ columnTasks: prevColumnTasks });
        throw err;
      }
    } else if (get().projectColIds.length > 0) {
      // M-6: project board mode — optimistic update via patchTask (covers projectColTasks)
      const prevProjectColTasks = get().projectColTasks;
      get().patchTask(id, data as unknown as Partial<Task>);
      try {
        await taskService.updateTask(id, data);
        scheduleDebouncedProjectColRefresh(get);
      } catch (err) {
        set({ projectColTasks: prevProjectColTasks });
        throw err;
      }
    } else {
      // Legacy list mode
      const prev = get().tasks;
      set({ tasks: prev.map(t => t._id === id ? { ...t, ...data } as Task : t) });
      try {
        await taskService.updateTask(id, data);
        void get().silentFetch();
      } catch (err) {
        set({ tasks: prev });
        throw err;
      }
    }
  },

  moveTask: async (id: string, status: ColumnKey) => {
    if (get().personalBaseParams.personal) {
      const prevColumnTasks = get().columnTasks;
      const allTasks = [...prevColumnTasks.todo, ...prevColumnTasks.doing, ...prevColumnTasks.done];
      const task = allTasks.find(t => t._id === id);
      if (!task) return;
      const prevStatus = task.status as ColumnKey;
      if (prevStatus === status) return;
      set({
        columnTasks: {
          ...prevColumnTasks,
          [prevStatus]: prevColumnTasks[prevStatus].filter(t => t._id !== id),
          [status]: [{ ...task, status }, ...prevColumnTasks[status]],
        },
      });
      pendingPersonalMoves.add(id);
      try {
        await taskService.updateTask(id, { status });
        scheduleDebouncedPersonalRefresh(get);
      } catch (err) {
        set({ columnTasks: prevColumnTasks });
        throw err;
      } finally {
        pendingPersonalMoves.delete(id);
      }
    } else {
      const prev = get().tasks;
      set({ tasks: prev.map((t) => (t._id === id ? { ...t, status } : t)) });
      try {
        await taskService.updateTask(id, { status });
      } catch (err) {
        set({ tasks: prev });
        throw err;
      }
    }
  },

  moveTaskToColumn: async (id: string, columnId: string, status?: ColumnKey) => {
    const prev = get().tasks;
    const prevColTasks = get().projectColTasks;
    set({ tasks: prev.map((t) => (t._id === id ? { ...t, columnId, ...(status && { status }) } : t)) });
    if (Object.keys(prevColTasks).length > 0) {
      const task = Object.values(prevColTasks).flat().find(t => t._id === id);
      if (task) {
        const srcColId = Object.entries(prevColTasks).find(([, colTasks]) => colTasks.some(t => t._id === id))?.[0];
        const updTask = { ...task, columnId, ...(status && { status }) } as Task;
        const newColTasks = { ...prevColTasks };
        if (srcColId && newColTasks[srcColId]) newColTasks[srcColId] = newColTasks[srcColId].filter(t => t._id !== id);
        // C-3: always initialize target column even if not yet in projectColTasks
        newColTasks[columnId] = [updTask, ...(newColTasks[columnId] ?? []).filter(t => t._id !== id)];
        set({ projectColTasks: newColTasks });
      }
    }
    try {
      await taskService.updateTask(id, { columnId, ...(status && { status }) });
      scheduleDebouncedProjectColRefresh(get);
    } catch (err) {
      set({ tasks: prev, projectColTasks: prevColTasks });
      throw err;
    }
  },

  cancelRecurrence: async (id: string, keepChildren: boolean) => {
    const res = await taskService.cancelRecurrence(id, keepChildren);
    if (get().personalBaseParams.personal) {
      await get().silentRefreshPersonal();
    } else {
      await get().silentFetch();
    }
    return res.message;
  },

  deleteTask: async (id: string) => {
    await taskService.deleteTask(id);
    if (get().personalBaseParams.personal) {
      await get().silentRefreshPersonal();
    } else {
      await get().silentFetch();
    }
  },

  silentFetch: async () => {
    try {
      if (get().personalBaseParams.personal) {
        await get().silentRefreshPersonal();
      } else if (get().projectColIds.length > 0) {
        await get().silentRefreshProjectCols();
      } else {
        const res = await taskService.getTasks(get().params);
        set({ tasks: res.data, pagination: res.pagination });
      }
    } catch {
      // silent
    }
  },

  // L-3: single set() call — avoids 3 separate re-renders
  // Matches on either `_id` (legacy Mongo id) or `id` (Prisma UUID) so socket
  // deltas keyed by Prisma UUID land on the same task as local writes keyed by
  // mongoId.
  patchTask: (id, partial) => {
    const matches = (t: Task) => t._id === id || t.id === id;
    const patchInCol = (arr: Task[]) => arr.map(t => matches(t) ? { ...t, ...partial } : t);
    const { tasks, columnTasks, projectColTasks } = get();
    const patchedProjectCols: Record<string, Task[]> = {};
    for (const [colId, colArr] of Object.entries(projectColTasks)) patchedProjectCols[colId] = patchInCol(colArr);
    set({
      tasks: tasks.map(t => matches(t) ? { ...t, ...partial } : t),
      columnTasks: {
        todo: patchInCol(columnTasks.todo),
        doing: patchInCol(columnTasks.doing),
        done: patchInCol(columnTasks.done),
      },
      ...(Object.keys(projectColTasks).length > 0 && { projectColTasks: patchedProjectCols }),
    });
  },

  fetchProjectColTasks: async (columnIds, options) => {
    const { params } = get();
    set({
      projectColIds: columnIds,
      // C-2: clear stale data immediately on non-silent fetch — prevents old project's tasks flashing
      ...(!options?.silent && { projectColLoading: true, projectColTasks: {}, projectColPaginations: {} }),
    });
    try {
      const results = await Promise.all(
        columnIds.map(colId => taskService.getTasks({ ...params, columnId: colId, page: 1, limit: 20 }))
      );
      const newColTasks: Record<string, Task[]> = {};
      const newColPaginations: Record<string, Pagination | null> = {};
      columnIds.forEach((colId, i) => {
        newColTasks[colId] = results[i].data;
        newColPaginations[colId] = results[i].pagination;
      });
      set({ projectColTasks: newColTasks, projectColPaginations: newColPaginations, projectColLoading: false });
    } catch {
      set({ projectColLoading: false });
    }
  },

  loadMoreProjectCol: async (columnId) => {
    // M-3: skip if already fetching this column
    if (loadingMoreCols.has(columnId)) return;
    const { params, projectColPaginations } = get();
    const pagination = projectColPaginations[columnId];
    if (!pagination?.hasNextPage) return;
    loadingMoreCols.add(columnId);
    try {
      const res = await taskService.getTasks({ ...params, columnId, page: pagination.currentPage + 1, limit: 20 });
      set({
        projectColTasks: { ...get().projectColTasks, [columnId]: [...(get().projectColTasks[columnId] ?? []), ...res.data] },
        projectColPaginations: { ...get().projectColPaginations, [columnId]: res.pagination },
      });
    } finally {
      loadingMoreCols.delete(columnId);
    }
  },

  // M-4: in-flight guard — if already refreshing, queue one pending retry instead of racing
  // B-4: pending flag ensures an event that arrived during refresh is not silently dropped
  silentRefreshProjectCols: async () => {
    if (refreshingProjectCols) { pendingProjectColRefresh = true; return; }
    const { projectColIds, params } = get();
    if (!projectColIds.length) return;
    refreshingProjectCols = true;
    try {
      const results = await Promise.allSettled(
        projectColIds.map(colId => taskService.getTasks({ ...params, columnId: colId, page: 1, limit: 20 }))
      );
      const newColTasks = { ...get().projectColTasks };
      const newColPaginations = { ...get().projectColPaginations };
      projectColIds.forEach((colId, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') {
          newColTasks[colId] = r.value.data;
          newColPaginations[colId] = r.value.pagination;
        }
      });
      set({ projectColTasks: newColTasks, projectColPaginations: newColPaginations });
    } catch {
      // silent
    } finally {
      refreshingProjectCols = false;
      if (pendingProjectColRefresh) {
        pendingProjectColRefresh = false;
        void get().silentRefreshProjectCols();
      }
    }
  },

  // Fed by the aggregated /projects/:id/board endpoint — skips the N per-column
  // network requests fetchProjectColTasks would otherwise fire on mount.
  hydrateProjectBoard: (columnIds, tasksByColumn) => {
    const newColTasks: Record<string, Task[]> = {};
    const newColPaginations: Record<string, Pagination | null> = {};
    for (const id of columnIds) {
      const bucket = tasksByColumn[id];
      newColTasks[id] = bucket?.data ?? [];
      newColPaginations[id] = bucket?.pagination ?? null;
    }
    set({
      projectColIds:         columnIds,
      projectColTasks:       newColTasks,
      projectColPaginations: newColPaginations,
      projectColLoading:     false,
    });
  },
}));
