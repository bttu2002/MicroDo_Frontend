import api from './api';
import type {
  ProjectMember,
  ProjectMemberRole,
  ProjectsResponse,
  ProjectResponse,
  ProjectMembersResponse,
  ProjectDepartmentLink,
  BoardColumn,
  Task,
  TasksResponse,
} from '@/types';

type Pagination = TasksResponse['pagination'];

export interface CreateProjectData {
  name: string;
  description?: string;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
}

export const projectService = {
  // ── Project CRUD ──────────────────────────────────────────────

  getProjects: async (): Promise<ProjectsResponse> => {
    const response = await api.get<ProjectsResponse>('/projects');
    return response.data;
  },

  getProjectById: async (id: string): Promise<ProjectResponse> => {
    const response = await api.get<ProjectResponse>(`/projects/${id}`);
    return response.data;
  },

  // Aggregate for KanbanBoard cold-start (columns + tasks-per-column in one RTT)
  getBoard: async (
    id: string,
    limit = 20,
  ): Promise<{
    success: boolean;
    data: {
      columns: BoardColumn[];
      tasksByColumn: Record<string, { data: Task[]; pagination: Pagination }>;
    };
  }> => {
    const response = await api.get(`/projects/${id}/board`, { params: { limit } });
    return response.data;
  },

  createProject: async (data: CreateProjectData): Promise<ProjectResponse> => {
    const response = await api.post<ProjectResponse>('/projects', data);
    return response.data;
  },

  updateProject: async (id: string, data: UpdateProjectData): Promise<ProjectResponse> => {
    const response = await api.patch<ProjectResponse>(`/projects/${id}`, data);
    return response.data;
  },

  deleteProject: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },

  // ── Lifecycle ─────────────────────────────────────────────────

  archiveProject: async (id: string): Promise<ProjectResponse> => {
    const response = await api.patch<ProjectResponse>(`/projects/${id}/archive`);
    return response.data;
  },

  unarchiveProject: async (id: string): Promise<ProjectResponse> => {
    const response = await api.patch<ProjectResponse>(`/projects/${id}/unarchive`);
    return response.data;
  },

  leaveProject: async (id: string): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/projects/${id}/leave`);
    return response.data;
  },

  transferOwnership: async (id: string, newOwnerId: string): Promise<{ success: boolean; data: ProjectMember; message: string }> => {
    const response = await api.patch(`/projects/${id}/transfer-ownership`, { newOwnerId });
    return response.data;
  },

  // ── Members ───────────────────────────────────────────────────

  getMembers: async (projectId: string): Promise<ProjectMembersResponse> => {
    const response = await api.get<ProjectMembersResponse>(`/projects/${projectId}/members`);
    return response.data;
  },

  addMember: async (
    projectId: string,
    data: { profileId: string; role?: ProjectMemberRole }
  ): Promise<{ success: boolean; data: ProjectMember; message: string }> => {
    const response = await api.post(`/projects/${projectId}/members`, data);
    return response.data;
  },

  removeMember: async (
    projectId: string,
    profileId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/projects/${projectId}/members/${profileId}`);
    return response.data;
  },

  updateMemberRole: async (
    projectId: string,
    profileId: string,
    role: ProjectMemberRole
  ): Promise<{ success: boolean; data: ProjectMember; message: string }> => {
    const response = await api.patch(`/projects/${projectId}/members/${profileId}`, { role });
    return response.data;
  },

  bulkAddMembers: async (
    projectId: string,
    members: { profileId: string; role?: ProjectMemberRole }[]
  ): Promise<{ success: boolean; message: string; data: { added: number; skipped: number } }> => {
    const response = await api.post(`/projects/${projectId}/members/bulk`, { members });
    return response.data;
  },

  getLinkedDeptMembers: async (
    projectId: string
  ): Promise<{ success: boolean; data: { dept: { id: string; name: string }; members: { id: string; name: string | null; email: string; avatar: string | null; username: string | null }[] }[] }> => {
    const response = await api.get(`/projects/${projectId}/linked-department-members`);
    return response.data;
  },

  // ── Departments ───────────────────────────────────────────────

  getDepartments: async (projectId: string): Promise<{ success: boolean; data: ProjectDepartmentLink[] }> => {
    const response = await api.get(`/projects/${projectId}/departments`);
    return response.data;
  },

  linkDepartment: async (
    projectId: string,
    departmentId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.post(`/projects/${projectId}/departments`, { departmentId });
    return response.data;
  },

  unlinkDepartment: async (
    projectId: string,
    departmentId: string
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(`/projects/${projectId}/departments/${departmentId}`);
    return response.data;
  },

  importDepartmentMembers: async (
    projectId: string,
    departmentId: string
  ): Promise<{ success: boolean; message: string; data: { added: number } }> => {
    const response = await api.post(`/projects/${projectId}/members/import-department`, { departmentId });
    return response.data;
  },
};
