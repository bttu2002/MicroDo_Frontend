import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectService, type CreateProjectData, type UpdateProjectData } from '@/services/projectService';
import { queryKeys } from '@/lib/queryClient';
import type { Project } from '@/types';

// Read hook — pulls project list from TanStack Query cache. Cache is shared
// across every mounted consumer so multiple sidebar/topbar/page reads collapse
// to one network request within the staleTime window (30s default).
export function useProjectsQuery() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn:  async () => {
      const res = await projectService.getProjects();
      return res.data;
    },
  });
}

// Single-project detail. Only fires when `id` is truthy so pages that guard
// with `if (!projectId)` don't need to pre-check.
export function useProjectQuery(id: string | undefined) {
  return useQuery({
    queryKey: id ? queryKeys.project(id) : ['projects', 'disabled'],
    queryFn:  async () => {
      const res = await projectService.getProjectById(id!);
      return res.data;
    },
    enabled: !!id,
  });
}

// Mutation hook — invalidates the projects list cache on success so every
// mounted useProjectsQuery consumer refetches automatically without any
// eventing plumbing.
export function useCreateProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectData) => projectService.createProject(data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectData }) =>
      projectService.updateProject(id, data),
    onSuccess: (_res, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
      qc.invalidateQueries({ queryKey: queryKeys.project(id) });
    },
  });
}

export function useDeleteProjectMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => projectService.deleteProject(id),
    // Optimistic remove-from-list to keep the UI feeling instant; the
    // invalidate after settles the true state whether success or failure.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.projects });
      const previous = qc.getQueryData<Project[]>(queryKeys.projects);
      if (previous) {
        qc.setQueryData<Project[]>(queryKeys.projects, previous.filter(p => p.id !== id));
      }
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.projects, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}
