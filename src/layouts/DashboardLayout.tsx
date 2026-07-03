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
import { toast } from 'sonner';
import type { Notification } from '@/types';

export default function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const token = useAuthStore((s) => s.token);
  const fetchActiveSession = useTimeTrackingStore((s) => s.fetchActiveSession);
  const user = useAuthStore((s) => s.user);
  const fetchMyDepartments = useDepartmentStore((s) => s.fetchMyDepartments);
  const { connect, disconnect, updateToken, socket } = useSocketStore();
  const pushNotification = useNotificationStore((s) => s.pushNotification);
  const fetchUnreadCount = useNotificationStore((s) => s.fetchUnreadCount);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const hasFetchedProjects = useProjectStore((s) => s.hasFetched);
  const silentFetch = useTaskStore((s) => s.silentFetch);

  useEffect(() => {
    fetchProfile();
    fetchActiveSession();
  }, [fetchProfile, fetchActiveSession]);

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      fetchMyDepartments();
      if (!hasFetchedProjects) fetchProjects();
    }
  }, [user?.role, fetchMyDepartments, fetchProjects, hasFetchedProjects]);

  // Load initial unread notification count from DB on mount
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

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

    // Debounce silentFetch — 1 CRUD often emits multiple events (task:updated,
    // task:statusUpdated, planning:updated). Coalesce them into a single refetch.
    const handleTaskUpdated = () => {
      if (taskUpdatedTimerRef.current) clearTimeout(taskUpdatedTimerRef.current);
      taskUpdatedTimerRef.current = setTimeout(() => { void silentFetch(); }, 300);
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
