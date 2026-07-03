import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationService } from '@/services/notificationService';
import { queryKeys } from '@/lib/queryClient';
import type { Notification } from '@/types';

// Read hook for the notifications feed. Consumers get automatic dedupe when
// the drawer opens in multiple places (topbar bell + settings link) and the
// list refetches when the tab regains focus so counts stay accurate without
// having to plumb socket events into React state.
export function useNotificationsQuery(params?: { limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications(params),
    queryFn:  async () => {
      const res = await notificationService.getNotifications(params ?? {});
      return res.data;
    },
  });
}

export function useUnreadCountQuery() {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn:  async () => {
      const res = await notificationService.getUnreadCount();
      return res.data.count;
    },
  });
}

// Mark-as-read mutation — patches the cached list optimistically so the bell
// clears immediately, then reconciles with the server.
export function useMarkNotificationReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.notifications() });
      const previous = qc.getQueryData<Notification[]>(queryKeys.notifications());
      if (previous) {
        qc.setQueryData<Notification[]>(
          queryKeys.notifications(),
          previous.map(n => n.id === id ? { ...n, readAt: new Date().toISOString() } : n),
        );
      }
      const prevCount = qc.getQueryData<number>(queryKeys.unreadCount);
      if (typeof prevCount === 'number') {
        qc.setQueryData(queryKeys.unreadCount, Math.max(0, prevCount - 1));
      }
      return { previous, prevCount };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKeys.notifications(), ctx.previous);
      if (typeof ctx?.prevCount === 'number') qc.setQueryData(queryKeys.unreadCount, ctx.prevCount);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.unreadCount });
    },
  });
}

export function useMarkAllReadMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => {
      qc.setQueryData(queryKeys.unreadCount, 0);
      qc.invalidateQueries({ queryKey: queryKeys.notifications() });
    },
  });
}
