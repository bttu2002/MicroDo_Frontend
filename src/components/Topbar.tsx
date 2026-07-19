import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useDepartmentStore } from '@/store/departmentStore';
import { useSocketStore } from '@/store/socketStore';
import { Link, useNavigate } from 'react-router-dom';
import type { Notification } from '@/types';
import { cn } from '@/lib/utils';
import ThemeToggle from '@/components/ThemeToggle';
import TimerPanel from '@/components/TimerPanel';
import { Bell, CheckCheck, BellOff } from 'lucide-react';

interface TopbarProps {
  sidebarCollapsed: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Topbar({ sidebarCollapsed }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const { notifications, unreadCount, loading, fetchNotifications, fetchUnreadCount, markAsRead, markAllAsRead } =
    useNotificationStore();
  const myDepartments = useDepartmentStore((s) => s.myDepartments);
  const navigate = useNavigate();

  const connected = useSocketStore((s) => s.connected);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch unread count on mount and poll every 30s — skip when server is unreachable
  useEffect(() => {
    if (connected) fetchUnreadCount();
    const interval = setInterval(() => {
      if (useSocketStore.getState().connected) fetchUnreadCount();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, connected]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      fetchNotifications();
    }
  }, [dropdownOpen, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getDeptTaskRoute = (deptId: string, taskId: string, highlightCommentId?: string) => {
    const membership = myDepartments.find((m) => m.department.id === deptId);
    const isManager = membership?.role === 'OWNER' || membership?.role === 'ADMIN';
    const state = { openTaskId: taskId, ...(highlightCommentId ? { highlightCommentId } : {}) };
    return isManager
      ? { path: `/dashboard/departments/${deptId}`, state }
      : { path: '/dashboard/tasks', state };
  };

  const handleNotificationClick = (n: Notification) => {
    if (!n.readAt) markAsRead(n.id);
    setDropdownOpen(false);

    if (n.entityType === 'project' && n.entityId) {
      navigate(`/dashboard/projects/${n.entityId}/tasks`);
    } else if (n.entityType === 'task' && n.payload?.taskId) {
      const taskId = n.payload.taskId as string;
      if (typeof n.payload.departmentId === 'string') {
        const { path, state } = getDeptTaskRoute(n.payload.departmentId, taskId);
        navigate(path, { state });
      } else if (typeof n.payload.projectId === 'string') {
        navigate(`/dashboard/projects/${n.payload.projectId}/tasks`, {
          state: { openTaskId: taskId, openNotesTab: n.type === 'NOTE_ADDED' },
        });
      } else {
        navigate('/dashboard/tasks', { state: { openTaskId: taskId } });
      }
    } else if (n.entityType === 'comment' && n.payload?.taskId) {
      const taskId    = n.payload.taskId    as string;
      const commentId = n.payload.commentId as string | undefined;
      if (typeof n.payload.projectId === 'string') {
        navigate(`/dashboard/projects/${n.payload.projectId}/tasks`, {
          state: { openTaskId: taskId, highlightCommentId: commentId },
        });
      } else if (typeof n.payload.departmentId === 'string') {
        const { path, state } = getDeptTaskRoute(n.payload.departmentId, taskId, commentId);
        navigate(path, { state });
      } else {
        navigate('/dashboard/tasks', {
          state: { openTaskId: taskId, highlightCommentId: commentId },
        });
      }
    }
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-20 h-16 bg-background/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6 transition-all duration-300',
        sidebarCollapsed ? 'lg:pl-6' : 'lg:pl-6'
      )}
    >
      {/* Left: Empty flex space */}
      <div className="flex items-center gap-4 flex-1" />

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Timer Panel */}
        <TimerPanel />

        {/* Notification Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
          >
            <Bell size={18} className="text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-2rem))] bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-50">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                  >
                    <CheckCheck size={14} />
                    Mark all read
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-[360px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40">
                {loading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                    <BellOff size={28} className="opacity-40" />
                    <span className="text-sm">No notifications yet</span>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={cn(
                        'w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors',
                        !n.readAt && 'bg-primary/5'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {!n.readAt && (
                          <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />
                        )}
                        <div className={cn('flex-1 min-w-0', n.readAt && 'pl-4')}>
                          <p className={cn('text-xs leading-snug text-foreground', !n.readAt && 'font-semibold')}>
                            {n.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">{formatRelativeTime(n.createdAt)}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <Link to="/dashboard/profile" className="block cursor-pointer hover:opacity-80 transition-opacity">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user?.name || user?.email || 'User'}
              className="w-9 h-9 rounded-full object-cover ml-1"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold ml-1">
              {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
        </Link>
      </div>
    </header>
  );
}
