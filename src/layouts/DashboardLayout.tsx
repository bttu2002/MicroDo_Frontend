import { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { useTimeTrackingStore } from '@/store/timeTrackingStore';
import { useDepartmentStore } from '@/store/departmentStore';
import { useSocketStore } from '@/store/socketStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useProjectStore } from '@/store/projectStore';
import { useTaskStore } from '@/store/taskStore';
import { meService } from '@/services/meService';
import { toast } from 'sonner';
import type { Notification } from '@/types';

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const token = useAuthStore((s) => s.token);
  const { connect, disconnect, updateToken, socket } = useSocketStore();
  const pushNotification = useNotificationStore((s) => s.pushNotification);
  const silentFetch = useTaskStore((s) => s.silentFetch);

  // Single aggregated request replaces the 5 dashboard cold-start fetches
  // (profile + activeSession + memberships + unreadCount + projects). Each
  // store exposes a `hydrate*` action so this handler doesn't grow every time
  // a store adds bootstrap-relevant state.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    meService.getBootstrap()
      .then(res => {
        if (cancelled || !res.success) return;
        const d = res.data;
        useAuthStore.getState().hydrateProfile(d.profile);
        useTimeTrackingStore.getState().hydrateActiveSession(d.activeSession);
        useDepartmentStore.getState().hydrateMemberships(d.memberships);
        useNotificationStore.getState().hydrateUnreadCount(d.unreadCount);
        useProjectStore.getState().hydrateProjects(d.projects);
      })
      .catch(() => {
        // 401 → response interceptor already redirects to login. Other network
        // failures are silent; the stored user/token from localStorage keeps the
        // dashboard rendering with the last known state until the next refresh.
      });
    return () => { cancelled = true; };
  }, [token]);

  // Connect socket when authenticated; updateToken keeps auth fresh after token rotation
  useEffect(() => {
    if (!token) return;
    updateToken(token);
    connect(token);
    return () => { disconnect(); };
  }, [token, connect, disconnect, updateToken]);

  // Global socket event listeners
  const taskUpdatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!socket) return;

    const handleNotification = (data: Notification) => {
      pushNotification(data);
      toast(data.title, { description: data.message, duration: 4000 });
    };

    // Delta protocol: when the server includes `patch`, patch the store in
    // place — no refetch needed. A refetch is only queued when the patch
    // touches a field that affects task ordering (status/column/milestone/
    // parent) or when the payload predates the delta rollout.
    const STRUCTURAL = new Set(['status', 'columnId', 'milestoneId', 'parentTaskId']);
    const scheduleRefetch = () => {
      if (taskUpdatedTimerRef.current) clearTimeout(taskUpdatedTimerRef.current);
      taskUpdatedTimerRef.current = setTimeout(() => { void silentFetch(); }, 300);
    };
    const handleTaskUpdated = (event: {
      taskId: string;
      patch?: Record<string, unknown>;
      updatedFields?: string[];
    }) => {
      if (event.patch && event.taskId) {
        useTaskStore.getState().patchTask(event.taskId, event.patch as Partial<import('@/types').Task>);
        const structural = Object.keys(event.patch).some(k => STRUCTURAL.has(k));
        if (!structural) return;
      }
      scheduleRefetch();
    };

    socket.on('notification:new', handleNotification);
    socket.on('task:updated', handleTaskUpdated);

    return () => {
      socket.off('notification:new', handleNotification);
      socket.off('task:updated', handleTaskUpdated);
      if (taskUpdatedTimerRef.current) clearTimeout(taskUpdatedTimerRef.current);
    };
  }, [socket, pushNotification, silentFetch]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => {
          // On mobile, toggle the mobile drawer
          if (window.innerWidth < 1024) {
            setMobileOpen(!mobileOpen);
          } else {
            setSidebarCollapsed(!sidebarCollapsed);
          }
        }}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div
        className={cn(
          'transition-all duration-300',
          sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'
        )}
      >
        <Topbar sidebarCollapsed={sidebarCollapsed} />

        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
