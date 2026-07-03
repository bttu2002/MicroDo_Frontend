import { create } from 'zustand';
import { projectService, type CreateProjectData, type UpdateProjectData } from '@/services/projectService';
import type { Project, ProjectMember, ProjectMemberRole } from '@/types';

interface ProjectState {
  // ── List state ───────────────────────────────────────────────
  projects: Project[];
  loading: boolean;
  hasFetched: boolean;

  // ── Current project (detail view) ────────────────────────────
  currentProject: Project | null;
  currentLoading: boolean;

  // ── Actions: list ────────────────────────────────────────────
  fetchProjects: () => Promise<void>;
  silentFetch: () => Promise<void>;
  hydrateProjects: (list: Project[]) => void;

  // ── Actions: single project ───────────────────────────────────
  fetchProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;

  // ── Actions: CRUD ─────────────────────────────────────────────
  createProject: (data: CreateProjectData) => Promise<Project>;
  updateProject: (id: string, data: UpdateProjectData) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  // ── Actions: lifecycle (optimistic-safe) ──────────────────────
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;
  leaveProject: (id: string) => Promise<void>;

  // ── Actions: ownership transfer (wait for backend) ────────────
  transferOwnership: (id: string, newOwnerId: string) => Promise<ProjectMember>;

  // ── Actions: members (optimistic-safe) ───────────────────────
  addMember: (projectId: string, data: { profileId: string; role?: ProjectMemberRole }) => Promise<ProjectMember>;
  removeMember: (projectId: string, profileId: string) => Promise<void>;
  updateMemberRole: (projectId: string, profileId: string, role: ProjectMemberRole) => Promise<void>;

  // ── Actions: department links ─────────────────────────────────
  linkDepartment: (projectId: string, departmentId: string) => Promise<void>;
  unlinkDepartment: (projectId: string, departmentId: string) => Promise<void>;

  // ── Reset ─────────────────────────────────────────────────────
  reset: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  hasFetched: false,
  currentProject: null,
  currentLoading: false,

  // ── List ──────────────────────────────────────────────────────

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const res = await projectService.getProjects();
      set({ projects: res.data, hasFetched: true });
    } catch {
      set({ hasFetched: true });
    } finally {
      set({ loading: false });
    }
  },

  silentFetch: async () => {
    try {
      const res = await projectService.getProjects();
      set({ projects: res.data });
    } catch {
      // silent — don't disrupt UI
    }
  },

  hydrateProjects: (list: Project[]) => set({ projects: list, hasFetched: true }),

  // ── Single project ────────────────────────────────────────────

  fetchProject: async (id: string) => {
    set({ currentLoading: true });
    try {
      const res = await projectService.getProjectById(id);
      set({ currentProject: res.data });
    } finally {
      set({ currentLoading: false });
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  // ── CRUD ──────────────────────────────────────────────────────

  createProject: async (data) => {
    const res = await projectService.createProject(data);
    await get().silentFetch();
    return res.data;
  },

  updateProject: async (id, data) => {
    // Optimistic update on list + currentProject
    const prev = get().projects;
    const prevCurrent = get().currentProject;

    set({
      projects: prev.map((p) => (p.id === id ? { ...p, ...data } : p)),
      currentProject: prevCurrent?.id === id ? { ...prevCurrent, ...data } : prevCurrent,
    });

    try {
      const res = await projectService.updateProject(id, data);
      set({
        projects: prev.map((p) => (p.id === id ? res.data : p)),
        currentProject: prevCurrent?.id === id ? res.data : prevCurrent,
      });
    } catch (err) {
      set({ projects: prev, currentProject: prevCurrent });
      throw err;
    }
  },

  deleteProject: async (id) => {
    await projectService.deleteProject(id);
    await get().silentFetch();
    if (get().currentProject?.id === id) {
      set({ currentProject: null });
    }
  },

  // ── Lifecycle ─────────────────────────────────────────────────

  archiveProject: async (id) => {
    const prev = get().projects;
    const prevCurrent = get().currentProject;
    const now = new Date().toISOString();

    // Optimistic
    set({
      projects: prev.map((p) => (p.id === id ? { ...p, archivedAt: now } : p)),
      currentProject: prevCurrent?.id === id ? { ...prevCurrent, archivedAt: now } : prevCurrent,
    });

    try {
      const res = await projectService.archiveProject(id);
      set({
        projects: prev.map((p) => (p.id === id ? res.data : p)),
        currentProject: prevCurrent?.id === id ? res.data : prevCurrent,
      });
    } catch (err) {
      set({ projects: prev, currentProject: prevCurrent });
      throw err;
    }
  },

  unarchiveProject: async (id) => {
    const prev = get().projects;
    const prevCurrent = get().currentProject;

    // Optimistic
    set({
      projects: prev.map((p) => (p.id === id ? { ...p, archivedAt: null } : p)),
      currentProject: prevCurrent?.id === id ? { ...prevCurrent, archivedAt: null } : prevCurrent,
    });

    try {
      const res = await projectService.unarchiveProject(id);
      set({
        projects: prev.map((p) => (p.id === id ? res.data : p)),
        currentProject: prevCurrent?.id === id ? res.data : prevCurrent,
      });
    } catch (err) {
      set({ projects: prev, currentProject: prevCurrent });
      throw err;
    }
  },

  leaveProject: async (id) => {
    // Wait for backend — affects own membership
    await projectService.leaveProject(id);
    await get().silentFetch();
    if (get().currentProject?.id === id) {
      set({ currentProject: null });
    }
  },

  // ── Ownership transfer (no optimistic — permission-sensitive) ─

  transferOwnership: async (id, newOwnerId) => {
    const res = await projectService.transferOwnership(id, newOwnerId);
    // Refresh both list and current to get accurate role state
    await get().silentFetch();
    if (get().currentProject?.id === id) {
      await get().fetchProject(id);
    }
    return res.data;
  },

  // ── Members (optimistic-safe) ─────────────────────────────────

  addMember: async (projectId, data) => {
    const res = await projectService.addMember(projectId, data);
    const newMember = res.data;

    // Optimistic: append to currentProject.members
    const current = get().currentProject;
    if (current?.id === projectId && current.members) {
      set({
        currentProject: {
          ...current,
          members: [...current.members, newMember],
          _count: current._count
            ? { ...current._count, members: current._count.members + 1 }
            : undefined,
        },
      });
    }

    return newMember;
  },

  removeMember: async (projectId, profileId) => {
    const current = get().currentProject;
    const prevMembers = current?.members;

    // Optimistic: remove from currentProject.members
    if (current?.id === projectId && prevMembers) {
      set({
        currentProject: {
          ...current,
          members: prevMembers.filter((m) => m.profileId !== profileId),
          _count: current._count
            ? { ...current._count, members: Math.max(0, current._count.members - 1) }
            : undefined,
        },
      });
    }

    try {
      await projectService.removeMember(projectId, profileId);
    } catch (err) {
      // Rollback
      if (current?.id === projectId && prevMembers) {
        set({ currentProject: { ...current, members: prevMembers } });
      }
      throw err;
    }
  },

  updateMemberRole: async (projectId, profileId, role) => {
    const current = get().currentProject;
    const prevMembers = current?.members;

    // Optimistic: update role in currentProject.members
    if (current?.id === projectId && prevMembers) {
      set({
        currentProject: {
          ...current,
          members: prevMembers.map((m) =>
            m.profileId === profileId ? { ...m, role } : m
          ),
        },
      });
    }

    try {
      await projectService.updateMemberRole(projectId, profileId, role);
    } catch (err) {
      // Rollback
      if (current?.id === projectId && prevMembers) {
        set({ currentProject: { ...current, members: prevMembers } });
      }
      throw err;
    }
  },

  // ── Department links ──────────────────────────────────────────

  linkDepartment: async (projectId, departmentId) => {
    await projectService.linkDepartment(projectId, departmentId);
    // Refresh currentProject to get updated departments list
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId);
    }
  },

  unlinkDepartment: async (projectId, departmentId) => {
    await projectService.unlinkDepartment(projectId, departmentId);
    if (get().currentProject?.id === projectId) {
      await get().fetchProject(projectId);
    }
  },

  // ── Reset (on logout) ─────────────────────────────────────────

  reset: () =>
    set({
      projects: [],
      loading: false,
      hasFetched: false,
      currentProject: null,
      currentLoading: false,
    }),
}));
