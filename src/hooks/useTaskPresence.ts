import { useEffect, useState, useCallback } from 'react';
import { useSocketStore } from '@/store/socketStore';
import { useAuthStore } from '@/store/authStore';

export interface PresenceUser {
  userId: string;
  name: string;
  avatar: string | null;
  isEditing: boolean;
}

export function useTaskPresence(taskId: string | null | undefined, open: boolean) {
  const socket = useSocketStore((s) => s.socket);
  const user = useAuthStore((s) => s.user);
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);

  const myId = (user as { id?: string; _id?: string } | null)?.id
    ?? (user as { _id?: string } | null)?._id;

  useEffect(() => {
    if (!socket || !taskId || !open) return;

    const name = (user as { name?: string } | null)?.name ?? user?.email ?? '';
    const avatar = (user as { avatar?: string | null } | null)?.avatar ?? null;

    const handlePresence = (data: { taskId: string; activeUsers: PresenceUser[] }) => {
      if (data.taskId !== taskId) return;
      setActiveUsers(data.activeUsers.filter((u) => u.userId !== myId));
    };

    const joinTask = () => {
      socket.emit('task:join', { taskId, name, avatar });
    };

    // Subscribe BEFORE emitting so we never miss the server response
    socket.on('task:presence', handlePresence);
    // Re-join on reconnect (server loses room membership on reconnect)
    socket.on('connect', joinTask);

    // Initial join — Socket.IO buffers this if not yet connected
    joinTask();

    return () => {
      socket.off('task:presence', handlePresence);
      socket.off('connect', joinTask);
      socket.emit('task:leave', { taskId });
      setActiveUsers([]);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, taskId, open]);

  const emitEditing = useCallback(
    (field: string) => {
      if (!socket || !taskId || !open) return;
      socket.emit('task:editing', { taskId, field });
    },
    [socket, taskId, open],
  );

  return { activeUsers, emitEditing };
}
