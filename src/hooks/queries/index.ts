// Barrel — import query hooks from a single path:
//   import { useProjectsQuery, useUnreadCountQuery } from '@/hooks/queries';
//
// Migration guidance:
//   Read paths — replace zustand selectors like `useProjectStore(s => s.projects)`
//   with `useProjectsQuery().data ?? []`. Delete the corresponding fetch effect.
//
//   Write paths — replace `useProjectStore().createProject(data)` with
//   `const m = useCreateProjectMutation(); m.mutate(data)`. Mutations invalidate
//   the relevant query cache so all other consumers pick up the change without
//   any manual eventing.
//
//   Socket handlers — for delta patches, call
//   `queryClient.setQueryData(queryKeys.X, updater)` instead of touching the
//   store. Structural changes can invalidate the query key instead of doing a
//   full refetch.

export * from './useProjects';
export * from './useNotifications';
