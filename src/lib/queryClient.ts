import { QueryClient } from '@tanstack/react-query';

// Shared client so all callers (queries, mutations, invalidations) hit the same
// cache. Defaults biased toward "app is a live dashboard, refetch is cheap":
//   - staleTime 30s so tab-switch bursts don't hammer the API
//   - refetchOnWindowFocus enabled so returning to the tab pulls fresh data
//   - retry only once — the axios interceptor already redirects on 401 and
//     other errors surface immediately in the UI
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:              30_000,
      gcTime:                 5 * 60_000,
      refetchOnWindowFocus:   true,
      refetchOnReconnect:     true,
      retry:                  1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Central place to look up query keys — keeps consumers consistent when
// invalidating from mutations elsewhere in the app.
export const queryKeys = {
  projects:      ['projects'] as const,
  project:       (id: string) => ['projects', id] as const,
  projectBoard:  (id: string) => ['projects', id, 'board'] as const,
  notifications: (params?: Record<string, unknown>) =>
    params ? (['notifications', params] as const) : (['notifications'] as const),
  unreadCount:   ['notifications', 'unread-count'] as const,
} as const;
