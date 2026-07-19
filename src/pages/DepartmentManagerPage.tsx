import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDepartmentStore } from '@/store/departmentStore';
import { useAuthStore } from '@/store/authStore';
import { departmentService, type LinkedProject } from '@/services/departmentService';
import { taskService } from '@/services/taskService';
import { invitationService } from '@/services/invitationService';
import { userService } from '@/services/userService';
import { toast } from 'sonner';
import {
  Building2, ChevronDown, RefreshCw, Loader2, Users, Clock, AlertTriangle, Zap, TrendingUp,
  ChevronLeft, ChevronRight, X, Check, UserPlus, UserMinus, Mail, Search, Timer, MessageSquare,
  ClipboardPlus, Pencil, Trash2, FolderOpen, Link2,
} from 'lucide-react';
import CommentDialog from '@/components/CommentDialog';
import TaskDialog from '@/components/TaskDialog';
import { cn } from '@/lib/utils';
import type {
  MyDepartmentMembership, MemberWorkload, DepartmentMember, DepartmentMemberRole,
  DepartmentInvitation, Task,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-[#FE812C]/10 text-[#FE812C] border-[#FE812C]/20',
  ADMIN: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  MEMBER: 'bg-primary/10 text-primary border-primary/20',
  VIEWER: 'bg-muted text-muted-foreground border-border',
};


function isOverdue(deadline?: string | null) {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

import { getApiErrorMessage } from '@/services/api';

// ─── Component ────────────────────────────────────────────────────────────────

export default function DepartmentManagerPage() {
  const { departmentId } = useParams<{ departmentId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { myDepartments, loading: storeLoading, hasFetched, fetchMyDepartments } = useDepartmentStore();

  // ── Page tabs ──────────────────────────────────────────────────────────────
  const [pageTab, setPageTab] = useState<'workload' | 'members' | 'projects'>('workload');
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherSearch, setSwitcherSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const managerDepts = myDepartments.filter((m) => m.role === 'OWNER' || m.role === 'ADMIN');

  // ── Workload ───────────────────────────────────────────────────────────────
  const [workload, setWorkload] = useState<MemberWorkload[]>([]);
  const [workloadLoading, setWorkloadLoading] = useState(false);
  const [workloadPage, setWorkloadPage] = useState(1);
  const [workloadTotal, setWorkloadTotal] = useState(0);
  const [workloadTotalPages, setWorkloadTotalPages] = useState(1);
  const WORKLOAD_LIMIT = 10;

  // ── Member Detail Panel (Step 10.6) ───────────────────────────────────────
  const [detailMember, setDetailMember] = useState<MemberWorkload | null>(null);
  const [detailTab, setDetailTab] = useState<'activity' | 'tasks' | 'assigned'>('activity');
  const [activityDoingTasks, setActivityDoingTasks] = useState<Task[]>([]);
  const [activityDoingLoading, setActivityDoingLoading] = useState(false);
  const [memberTasks, setMemberTasks] = useState<Task[]>([]);
  const [memberTasksLoading, setMemberTasksLoading] = useState(false);
  const [memberTaskFilter, setMemberTaskFilter] = useState<'all' | 'todo' | 'doing' | 'done'>('all');
  const [commentTask, setCommentTask] = useState<Task | null>(null);
  // ── Assigned tasks tab ───────────────────────────────────────────────────────
  const [assignedTasks, setAssignedTasks] = useState<Task[]>([]);
  const [assignedTasksLoading, setAssignedTasksLoading] = useState(false);
  const [assignedEditTask, setAssignedEditTask] = useState<Task | null>(null);
  const [assignedEditOpen, setAssignedEditOpen] = useState(false);
  const [assignedEditLoading, setAssignedEditLoading] = useState(false);
  const [assignedDeleteTask, setAssignedDeleteTask] = useState<Task | null>(null);
  const [assignedDeleteLoading, setAssignedDeleteLoading] = useState(false);

  // ── Member Management (Step 10.7) ─────────────────────────────────────────
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invitations, setInvitations] = useState<DepartmentInvitation[]>([]);
  const [, setInvitationsLoading] = useState(false);
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ userId: string; label: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<{ id: string; email: string; name?: string | null; username?: string | null; avatar?: string | null }[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedDeptUsers, setSelectedDeptUsers] = useState<{ id: string; email: string; name?: string | null; avatar?: string | null; username?: string | null }[]>([]);
  const [addMemberRole, setAddMemberRole] = useState('MEMBER');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [transferOwnerConfirm, setTransferOwnerConfirm] = useState<{ userId: string; label: string } | null>(null);
  const [transferOwnerLoading, setTransferOwnerLoading] = useState(false);

  // ── Linked Projects ────────────────────────────────────────────────────────
  const [linkedProjects, setLinkedProjects] = useState<LinkedProject[]>([]);
  const [linkedProjectsLoading, setLinkedProjectsLoading] = useState(false);

  // ── Auth / access ──────────────────────────────────────────────────────────
  const currentMembership: MyDepartmentMembership | undefined = myDepartments.find(
    (m) => m.department.id === departmentId
  );

  useEffect(() => {
    if (!hasFetched && !storeLoading && user?.role !== 'ADMIN') {
      fetchMyDepartments();
    }
  }, []);

  useEffect(() => {
    if (hasFetched && !storeLoading && !currentMembership) {
      navigate('/dashboard', { replace: true });
    }
  }, [hasFetched, storeLoading, currentMembership, navigate]);

  // ── Fetch workload ─────────────────────────────────────────────────────────
  const fetchWorkload = useCallback(async (deptId: string, page: number) => {
    setWorkloadLoading(true);
    try {
      const res = await departmentService.getWorkload(deptId, { page, limit: WORKLOAD_LIMIT });
      if (res.success) {
        setWorkload(res.data);
        setWorkloadTotal(res.pagination.total);
        setWorkloadTotalPages(res.pagination.totalPages);
      }
    } catch { /* empty */ } finally {
      setWorkloadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (departmentId && currentMembership) {
      setWorkloadPage(1);
      fetchWorkload(departmentId, 1);
    }
  }, [departmentId, currentMembership, fetchWorkload]);

  // ── Fetch members list ─────────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!departmentId) return;
    setMembersLoading(true);
    try {
      const [membersRes, invRes] = await Promise.all([
        departmentService.getMembers(departmentId, { limit: 100 }),
        invitationService.getInvitations(departmentId),
      ]);
      if (membersRes.success) setMembers(membersRes.data);
      if (invRes.success) setInvitations(invRes.data);
    } catch { /* empty */ } finally {
      setMembersLoading(false);
    }
    setInvitationsLoading(false);
  }, [departmentId]);

  useEffect(() => {
    if (pageTab === 'members' && departmentId && currentMembership) {
      fetchMembers();
    }
  }, [pageTab, departmentId, currentMembership, fetchMembers]);

  useEffect(() => {
    if (pageTab !== 'projects' || !departmentId || !currentMembership) return;
    setLinkedProjectsLoading(true);
    departmentService.getLinkedProjects(departmentId)
      .then(data => setLinkedProjects(data))
      .catch(() => {})
      .finally(() => setLinkedProjectsLoading(false));
  }, [pageTab, departmentId, currentMembership]);

  // ── Activity tab: fetch member's doing tasks + auto-refresh ──────────────
  const fetchActivityDoingTasks = useCallback(async (profileId: string) => {
    if (!departmentId) return;
    setActivityDoingLoading(true);
    try {
      const res = await departmentService.getMemberTasks(departmentId, profileId, { status: 'doing', limit: 50 });
      if (res.success) setActivityDoingTasks(res.data);
    } catch { /* empty */ } finally {
      setActivityDoingLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!detailMember || detailTab !== 'activity') return;
    fetchActivityDoingTasks(detailMember.profile.id);
    const interval = setInterval(() => fetchActivityDoingTasks(detailMember.profile.id), 30000);
    return () => clearInterval(interval);
  }, [detailMember, detailTab, fetchActivityDoingTasks]);

  // ── Detail panel: fetch tasks ──────────────────────────────────────────────
  const fetchMemberTasks = useCallback(async (profileId: string, filter: string) => {
    if (!departmentId) return;
    setMemberTasksLoading(true);
    try {
      const params = filter !== 'all' ? { status: filter, limit: 50 } : { limit: 50 };
      const res = await departmentService.getMemberTasks(departmentId, profileId, params);
      if (res.success) {
        const sorted = [...res.data].sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
        setMemberTasks(sorted);
      }
    } catch { /* empty */ } finally {
      setMemberTasksLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!detailMember || detailTab !== 'tasks') return;
    fetchMemberTasks(detailMember.profile.id, memberTaskFilter);
  }, [detailMember, detailTab, memberTaskFilter, fetchMemberTasks]);

  const fetchAssignedTasks = useCallback(async (profileId: string) => {
    if (!departmentId) return;
    setAssignedTasksLoading(true);
    try {
      const res = await departmentService.getMemberTasks(departmentId, profileId, { limit: 50 });
      if (res.success) {
        setAssignedTasks(res.data.filter((t) => t.assignedTo != null));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load assigned tasks'));
    } finally {
      setAssignedTasksLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (!detailMember || detailTab !== 'assigned') return;
    fetchAssignedTasks(detailMember.profile.id);
  }, [detailMember, detailTab, fetchAssignedTasks]);

  const handleAssignedEditSubmit = async (data: {
    title: string; description: string; status: 'todo' | 'doing' | 'done';
    deadline?: string; scheduledAt?: string | null; priority?: 'low' | 'medium' | 'high';
    tags?: string[]; isRecurring?: boolean;
    recurrenceType?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
    recurrenceInterval?: number | null; recurrenceEndDate?: string | null;
  }) => {
    if (!assignedEditTask || !detailMember) return;
    const taskId = assignedEditTask._id || assignedEditTask.id!;
    setAssignedEditLoading(true);
    try {
      await taskService.updateTask(taskId, {
        title: data.title, description: data.description,
        status: data.status, priority: data.priority,
        deadline: data.deadline, scheduledAt: data.scheduledAt ?? undefined,
        tags: data.tags, isRecurring: data.isRecurring,
        recurrenceType: data.recurrenceType ?? undefined,
        recurrenceInterval: data.recurrenceInterval ?? undefined,
        recurrenceEndDate: data.recurrenceEndDate ?? undefined,
      });
      toast.success('Task updated');
      setAssignedEditOpen(false);
      setAssignedEditTask(null);
      fetchAssignedTasks(detailMember.profile.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update task'));
    } finally {
      setAssignedEditLoading(false);
    }
  };

  const handleAssignedDeleteConfirm = async () => {
    if (!assignedDeleteTask || !detailMember) return;
    const taskId = assignedDeleteTask._id || assignedDeleteTask.id!;
    setAssignedDeleteLoading(true);
    try {
      await taskService.deleteTask(taskId);
      // Optimistically remove from list immediately — don't wait for re-fetch
      setAssignedTasks(prev => prev.filter(t => (t._id || t.id) !== taskId));
      setAssignedDeleteTask(null);
      toast.success('Task deleted');
      // Background sync to confirm server state
      fetchAssignedTasks(detailMember.profile.id);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete task'));
    } finally {
      setAssignedDeleteLoading(false);
    }
  };

  // ── User search for Add Member ─────────────────────────────────────────────
  useEffect(() => {
    if (!memberSearch.trim()) { setMemberSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setMemberSearchLoading(true);
      try {
        const res = await userService.searchUsers({ q: memberSearch, limit: 8 });
        if (res.success) {
          setMemberSearchResults(res.data.users.map(u => ({
            id: u.id, email: u.email, name: u.name, username: u.username, avatar: u.avatar,
          })));
        }
      } catch { setMemberSearchResults([]); } finally {
        setMemberSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    const ops: Promise<unknown>[] = [
      fetchMyDepartments(),
      departmentId ? fetchWorkload(departmentId, workloadPage) : Promise.resolve(),
    ];
    if (pageTab === 'members') ops.push(fetchMembers());
    await Promise.all(ops);
    setRefreshing(false);
  };

  // ── Member management actions ──────────────────────────────────────────────
  const handleChangeRole = (userId: string, newRole: string) => {
    if (!departmentId) return;
    if (newRole === 'OWNER') {
      const m = members.find(x => x.userId === userId);
      setTransferOwnerConfirm({ userId, label: m?.profile?.name ?? m?.profile?.email ?? userId });
      return;
    }
    void (async () => {
      try {
        await departmentService.changeMemberRole(departmentId, userId, { role: newRole });
        setMembers(prev => prev.map(m => m.userId === userId ? { ...m, role: newRole as DepartmentMemberRole } : m));
        toast.success('Role updated');
      } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to update role')); }
    })();
  };

  const handleRemoveMember = async () => {
    if (!departmentId || !removeMemberConfirm) return;
    const { userId, label } = removeMemberConfirm;
    try {
      await departmentService.removeMember(departmentId, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      toast.success(`Removed ${label}`);
      setRemoveMemberConfirm(null);
    } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to remove member')); }
  };

  const handleTransferOwnership = async () => {
    if (!departmentId || !transferOwnerConfirm) return;
    setTransferOwnerLoading(true);
    try {
      await departmentService.transferOwnership(departmentId, { newOwnerId: transferOwnerConfirm.userId });
      setMembers(prev => prev.map(m => {
        if (m.userId === transferOwnerConfirm.userId) return { ...m, role: 'OWNER' as DepartmentMemberRole };
        if (m.role === 'OWNER') return { ...m, role: 'MEMBER' as DepartmentMemberRole };
        return m;
      }));
      toast.success(`Ownership transferred to ${transferOwnerConfirm.label}`);
      setTransferOwnerConfirm(null);
    } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to transfer ownership')); } finally {
      setTransferOwnerLoading(false);
    }
  };

  const handleSendInvite = async () => {
    if (!departmentId || !inviteEmail.trim()) { toast.error('Email is required'); return; }
    setInviteLoading(true);
    try {
      await invitationService.sendInvitation(departmentId, { email: inviteEmail.trim(), role: inviteRole });
      toast.success('Invitation sent');
      setInviteOpen(false); setInviteEmail(''); setInviteRole('MEMBER');
      const invRes = await invitationService.getInvitations(departmentId);
      if (invRes.success) setInvitations(invRes.data);
    } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to send invitation')); } finally {
      setInviteLoading(false);
    }
  };

  const handleCancelInvitation = async (id: string) => {
    if (!departmentId) return;
    try {
      await invitationService.cancelInvitation(departmentId, id);
      setInvitations(prev => prev.filter(i => i.id !== id));
      toast.success('Invitation cancelled');
    } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to cancel invitation')); }
  };

  const closeAddMember = () => {
    setAddMemberOpen(false); setMemberSearch(''); setMemberSearchResults([]);
    setSelectedDeptUsers([]); setAddMemberRole('MEMBER');
  };

  const toggleDeptUser = (u: { id: string; email: string; name?: string | null; avatar?: string | null; username?: string | null }) => {
    setSelectedDeptUsers((prev) => prev.some(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u]);
  };

  const handleBulkAddDeptMembers = async () => {
    if (!departmentId || selectedDeptUsers.length === 0) { toast.error('Please select at least one user'); return; }
    setAddMemberLoading(true);
    try {
      const res = await departmentService.bulkAddMembers(departmentId, selectedDeptUsers.map(u => ({ userId: u.id, role: addMemberRole })));
      toast.success(res.message);
      closeAddMember();
      fetchMembers();
    } catch (err) { toast.error(getApiErrorMessage(err, 'Failed to add members')); } finally {
      setAddMemberLoading(false);
    }
  };

  // ── Loading / access guard ─────────────────────────────────────────────────
  if (storeLoading || !currentMembership) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const { department, role } = currentMembership;
  const isOwner = role === 'OWNER';
  const isOwnerOrAdmin = role === 'OWNER' || role === 'ADMIN';

  const canChangeRole = (memberRole: string) => {
    if (isOwner) return memberRole !== 'OWNER';
    if (role === 'ADMIN') return memberRole === 'MEMBER' || memberRole === 'VIEWER';
    return false;
  };

  const canRemove = (memberRole: string) => {
    if (isOwner) return memberRole !== 'OWNER';
    if (role === 'ADMIN') return memberRole === 'MEMBER' || memberRole === 'VIEWER';
    return false;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#FE812C]/10 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-[#FE812C]" />
            </div>

            {managerDepts.length > 1 ? (
              <div className="relative">
                <button
                  onClick={() => { setSwitcherOpen((o) => !o); setSwitcherSearch(''); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:bg-muted transition-colors"
                >
                  <span className="font-bold text-foreground text-lg leading-tight">{department.name}</span>
                  <ChevronDown size={16} className={cn('text-muted-foreground transition-transform', switcherOpen && 'rotate-180')} />
                </button>
                {switcherOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); }} />
                    <div className="absolute top-full mt-1 left-0 z-20 bg-card border border-border rounded-xl shadow-lg min-w-[220px] overflow-hidden">
                      {/* Search */}
                      <div className="p-2 border-b border-border">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search departments..."
                            value={switcherSearch}
                            onChange={(e) => setSwitcherSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full pl-7 pr-3 py-1.5 bg-muted/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50"
                          />
                        </div>
                      </div>
                      {/* List */}
                      <div className="max-h-[200px] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full">
                        {managerDepts
                          .filter((m) => m.department.name.toLowerCase().includes(switcherSearch.toLowerCase()))
                          .map((m) => (
                            <button
                              key={m.id}
                              onClick={() => { setSwitcherOpen(false); setSwitcherSearch(''); navigate(`/dashboard/departments/${m.department.id}`); }}
                              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-muted transition-colors', m.department.id === departmentId && 'bg-primary/5 text-primary font-medium')}
                            >
                              <Building2 size={14} className="shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">{m.department.name}</span>
                              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0', ROLE_COLORS[m.role] ?? '')}>{m.role}</span>
                            </button>
                          ))}
                        {managerDepts.filter((m) => m.department.name.toLowerCase().includes(switcherSearch.toLowerCase())).length === 0 && (
                          <p className="text-xs text-muted-foreground px-4 py-3 text-center">No departments found</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="font-bold text-foreground text-xl">{department.name}</span>
            )}

            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border shrink-0', ROLE_COLORS[role] ?? '')}>{role}</span>
          </div>

          <button onClick={handleRefresh} disabled={refreshing} className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors disabled:opacity-50" title="Refresh">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        {department.description && <p className="text-muted-foreground text-sm -mt-4">{department.description}</p>}

        {/* Summary bar */}
        {(() => {
          const activeCount = workload.filter((m) => m.hasActiveSession).length;
          const overdueCount = workload.reduce((sum, m) => sum + m.tasks.overdue, 0);
          const highPriorityCount = workload.reduce((sum, m) => sum + m.tasks.highPriority, 0);
          const nearDeadlineCount = workload.reduce((sum, m) => sum + m.tasks.nearDeadline, 0);
          const avgCompletion = workload.length > 0
            ? Math.round(workload.reduce((sum, m) => sum + (m.tasks.total > 0 ? Math.round((m.tasks.done / m.tasks.total) * 100) : 0), 0) / workload.length)
            : 0;
          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { icon: Users, label: 'Members', value: workloadTotal, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { icon: Clock, label: 'Active Sessions', value: activeCount, color: 'text-green-500', bg: 'bg-green-500/10' },
                { icon: AlertTriangle, label: 'Overdue Tasks', value: overdueCount, color: 'text-red-500', bg: 'bg-red-500/10' },
                { icon: Zap, label: 'High Priority', value: highPriorityCount, color: 'text-[#FE812C]', bg: 'bg-[#FE812C]/10' },
                { icon: Clock, label: 'Near Deadline', value: nearDeadlineCount, color: 'text-orange-500', bg: 'bg-orange-500/10' },
                { icon: TrendingUp, label: 'Avg. Completion', value: `${avgCompletion}%`, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', bg)}>
                    <Icon size={16} className={color} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground leading-none">{workloadLoading ? '–' : value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Page tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {([
            { key: 'workload',  label: 'Workload' },
            { key: 'members',   label: 'Members' },
            { key: 'projects',  label: 'Linked Projects' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPageTab(key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                pageTab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Workload tab ── */}
        {pageTab === 'workload' && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Member Workload <span className="text-muted-foreground font-normal">— click a row to see details</span></h2>
            </div>

            {workloadLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
            ) : workload.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Users size={32} className="text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No members found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {['Member', 'Job Title', 'Role', 'Todo', 'Doing', 'Done', 'Overdue', 'Near Deadline', 'Completion', 'Est. Hours', 'Session'].map((h, i) => (
                          <th key={h} className={cn('px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider', i === 0 ? 'px-5 text-left' : i < 3 ? 'text-left' : 'text-center')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {workload.map((m) => (
                        <tr
                          key={m.memberId}
                          onClick={() => { setDetailMember(m); setDetailTab('activity'); setMemberTasks([]); setMemberTaskFilter('all'); setAssignedTasks([]); }}
                          className={cn(
                            'transition-colors hover:bg-primary/5 cursor-pointer',
                            m.tasks.overdue > 0 && 'bg-red-500/5',
                            m.isOverloaded && 'ring-1 ring-inset ring-red-500/40',
                          )}
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {m.profile.avatar ? (
                                <img src={m.profile.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                  {(m.profile.name || m.profile.email).charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="font-medium text-foreground truncate">{m.profile.name || m.profile.email}</p>
                                  {m.isOverloaded && (
                                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 uppercase tracking-wide">Overloaded</span>
                                  )}
                                </div>
                                {m.profile.username && <p className="text-xs text-muted-foreground truncate">@{m.profile.username}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{m.profile.jobTitle || '—'}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', ROLE_COLORS[m.role] ?? 'bg-muted text-muted-foreground border-border')}>{m.role}</span>
                          </td>
                          <td className="px-3 py-3 text-center text-foreground font-medium">{m.tasks.todo}</td>
                          <td className="px-3 py-3 text-center text-foreground font-medium">{m.tasks.doing}</td>
                          <td className="px-3 py-3 text-center text-muted-foreground">{m.tasks.done}</td>
                          <td className="px-3 py-3 text-center">
                            {m.tasks.overdue > 0 ? (
                              <span className="inline-flex items-center gap-1 text-red-500 font-semibold"><AlertTriangle size={12} />{m.tasks.overdue}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {m.tasks.nearDeadline > 0 ? (
                              <span className="inline-flex items-center gap-1 text-orange-500 font-semibold"><Clock size={12} />{m.tasks.nearDeadline}</span>
                            ) : <span className="text-muted-foreground">0</span>}
                          </td>
                          <td className="px-3 py-3 text-center min-w-[90px]">
                            {(() => {
                              const pct = m.tasks.total > 0 ? Math.round((m.tasks.done / m.tasks.total) * 100) : 0;
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-xs font-semibold tabular-nums text-foreground">{pct}%</span>
                                  <div className="w-full max-w-[60px] h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-3 text-center min-w-[110px]">
                            {m.tasks.totalEstimatedHours > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className={cn('text-xs font-semibold tabular-nums', m.isOverloaded ? 'text-red-500' : 'text-foreground')}>
                                  {m.tasks.totalEstimatedHours}h
                                </span>
                                <div className="w-full max-w-[80px] h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div
                                    className={cn('h-full rounded-full transition-all', m.isOverloaded ? 'bg-red-500' : 'bg-primary')}
                                    style={{ width: `${Math.min((m.tasks.totalEstimatedHours / 40) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground">/40h</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {m.hasActiveSession ? (
                              <span className="inline-flex items-center gap-1.5 text-green-500 text-xs font-medium">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />Active
                              </span>
                            ) : <span className="text-muted-foreground text-xs">Idle</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {workloadTotalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Page {workloadPage} of {workloadTotalPages} ({workloadTotal} members)</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { const p = workloadPage - 1; setWorkloadPage(p); fetchWorkload(departmentId!, p); }} disabled={workloadPage === 1} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /></button>
                      <button onClick={() => { const p = workloadPage + 1; setWorkloadPage(p); fetchWorkload(departmentId!, p); }} disabled={workloadPage === workloadTotalPages} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight size={16} /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Linked Projects tab ── */}
        {pageTab === 'projects' && (
          <div className="space-y-3">
            {!linkedProjectsLoading && (
              <p className="text-sm text-muted-foreground">
                {linkedProjects.length} linked project{linkedProjects.length !== 1 ? 's' : ''}
              </p>
            )}

            {linkedProjectsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-primary" size={24} />
              </div>
            ) : linkedProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Link2 size={32} className="text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No projects linked to this department yet.</p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {linkedProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/dashboard/projects/${p.id}/tasks`)}
                    className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors text-left w-full group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FE812C]/10 flex items-center justify-center shrink-0">
                      <FolderOpen size={18} className="text-[#FE812C]" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {p.name}
                      </p>
                      {p.description && (
                        <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                      )}
                      <div className="flex items-center gap-3 pt-0.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users size={11} />
                          {p.memberCount} member{p.memberCount !== 1 ? 's' : ''}
                        </span>
                        {p.owner && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            {p.owner.avatar ? (
                              <img src={p.owner.avatar} className="w-3.5 h-3.5 rounded-full object-cover" />
                            ) : (
                              <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">
                                {p.owner.name?.[0]?.toUpperCase() ?? '?'}
                              </div>
                            )}
                            {p.owner.name ?? 'Unknown'}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(p.linkedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Members tab ── */}
        {pageTab === 'members' && (
          <div className="space-y-4">
            {/* Tab header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm text-muted-foreground">
                {membersLoading ? 'Loading...' : `${members.length} member${members.length !== 1 ? 's' : ''}`}
              </p>
              {isOwnerOrAdmin && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setInviteOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-xl text-xs font-semibold transition-colors">
                    <Mail size={13} /> Invite by Email
                  </button>
                  <button onClick={() => setAddMemberOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-semibold transition-colors">
                    <UserPlus size={13} /> Add Member
                  </button>
                </div>
              )}
            </div>

            {/* Members table */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {membersLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-primary" size={22} /></div>
              ) : members.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No members found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        {['Member', 'Role', 'Joined', 'Actions'].map((h, i) => (
                          <th key={h} className={cn('px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider', i < 3 ? 'text-left' : 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {members.map((member) => (
                        <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              {member.profile?.avatar ? (
                                <img src={member.profile.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                                  {(member.profile?.name ?? member.profile?.email ?? '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                {member.profile?.name && <p className="font-medium text-foreground text-xs truncate">{member.profile.name}</p>}
                                <p className={cn('truncate', member.profile?.name ? 'text-[11px] text-muted-foreground' : 'text-xs font-medium text-foreground')}>{member.profile?.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {canChangeRole(member.role) ? (
                              <select
                                value={member.role}
                                onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                                className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer outline-none bg-transparent', ROLE_COLORS[member.role] ?? '')}
                              >
                                {isOwner && <option value="OWNER">OWNER</option>}
                                <option value="ADMIN">ADMIN</option>
                                <option value="MEMBER">MEMBER</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                            ) : (
                              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', ROLE_COLORS[member.role] ?? '')}>{member.role}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
                            {new Date(member.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {canRemove(member.role) && (
                              <button
                                onClick={() => setRemoveMemberConfirm({ userId: member.userId, label: member.profile?.name ?? member.profile?.email ?? member.userId })}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Remove member"
                              >
                                <UserMinus size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pending invitations */}
              <div className="border-t border-border px-4 py-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Mail size={13} /> Pending Invitations
                  {invitations.length > 0 && <span className="px-1.5 py-0.5 bg-muted rounded-full text-xs">{invitations.length}</span>}
                </p>
                {invitations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No pending invitations.</p>
                ) : (
                  <div className="space-y-2">
                    {invitations.map((inv) => {
                      const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000);
                      const expired = daysLeft <= 0;
                      return (
                        <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 rounded-xl">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail size={12} className="text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{inv.email}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border', ROLE_COLORS[inv.role] ?? '')}>{inv.role}</span>
                                <span className={cn('text-[10px] flex items-center gap-0.5', expired ? 'text-destructive' : 'text-muted-foreground')}>
                                  <Clock size={9} />{expired ? 'Expired' : `${daysLeft}d left`}
                                </span>
                              </div>
                            </div>
                          </div>
                          {isOwnerOrAdmin && (
                            <button onClick={() => handleCancelInvitation(inv.id)} className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0" title="Cancel"><X size={13} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Transfer ownership */}
              {isOwner && members.filter(m => m.role !== 'OWNER').length > 0 && (
                <div className="border-t border-border px-4 py-3 flex justify-end">
                  <button
                    onClick={() => {
                      const candidates = members.filter(m => m.role !== 'OWNER');
                      if (candidates.length === 1) {
                        const c = candidates[0];
                        setTransferOwnerConfirm({ userId: c.userId, label: c.profile?.name ?? c.profile?.email ?? c.userId });
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-[#FE812C] transition-colors"
                  >
                    Transfer Ownership…
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Member Detail Panel (Step 10.6) ── */}
      {detailMember && (
        <div className="fixed inset-0 z-[45] flex animate-in fade-in duration-200">
          {/* Backdrop */}
          <div className="flex-1 bg-black/30" onClick={() => setDetailMember(null)} />
          {/* Panel */}
          <div className="w-[420px] max-w-[95vw] h-full bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ease-out">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {detailMember.profile.avatar ? (
                  <img src={detailMember.profile.avatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {(detailMember.profile.name || detailMember.profile.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate">{detailMember.profile.name || detailMember.profile.email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {detailMember.profile.username ? `@${detailMember.profile.username}` : (detailMember.profile.jobTitle || detailMember.profile.email)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => setDetailMember(null)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Detail tabs */}
            <div className="flex border-b border-border shrink-0">
              {(['activity', 'tasks', 'assigned'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={cn('flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px', detailTab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {t === 'activity' ? 'Activity' : t === 'tasks' ? 'Tasks' : 'Assigned'}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Activity tab — shows all doing tasks of this member in dept */}
              {detailTab === 'activity' && (
                <div className="space-y-2">
                  {activityDoingLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                  ) : activityDoingTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Timer size={18} className="text-muted-foreground/50" />
                      </div>
                      <p className="text-sm">No tasks in progress</p>
                    </div>
                  ) : (
                    activityDoingTasks.map(task => {
                      const overdue = isOverdue(task.deadline) && task.status !== 'done';
                      const taskKey = task._id || task.id || '';
                      return (
                        <div key={taskKey} className={cn('bg-card border rounded-xl p-3 space-y-1.5', overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border')}>
                          <div className="flex items-start gap-2">
                            <span className={cn('shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md', {
                              'bg-red-500/10 text-red-500': task.priority === 'high',
                              'bg-amber-500/10 text-amber-500': task.priority === 'medium',
                              'bg-emerald-500/10 text-emerald-500': task.priority === 'low',
                            })}>
                              {task.priority}
                            </span>
                            <p className="text-sm font-medium flex-1 min-w-0 truncate text-foreground">{task.title}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#FE812C]/10 text-[#FE812C]">
                              In Progress
                            </span>
                            {task.deadline && (
                              <span className={cn('text-[10px] flex items-center gap-0.5', overdue ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                {overdue && <AlertTriangle size={9} />}
                                📅 {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Assigned tab */}
              {detailTab === 'assigned' && (
                <div className="space-y-2">
                  {assignedTasksLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                  ) : assignedTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <ClipboardPlus size={28} className="opacity-20" />
                      <p className="text-sm">No assigned tasks yet</p>
                    </div>
                  ) : (
                    assignedTasks.map((task) => {
                      const overdue = isOverdue(task.deadline) && task.status !== 'done';
                      const taskKey = task._id || task.id || '';
                      return (
                        <div key={taskKey} className={cn('bg-card border rounded-xl p-3 space-y-1.5', overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border')}>
                          <div className="flex items-start gap-2">
                            <span className={cn('shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md', {
                              'bg-red-500/10 text-red-500': task.priority === 'high',
                              'bg-amber-500/10 text-amber-500': task.priority === 'medium',
                              'bg-emerald-500/10 text-emerald-500': task.priority === 'low',
                            })}>
                              {task.priority}
                            </span>
                            <p className={cn('text-sm font-medium flex-1 min-w-0 truncate', task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground')}>
                              {task.title}
                            </p>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                onClick={() => setCommentTask(task)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Comments"
                              >
                                <MessageSquare size={13} />
                              </button>
                              <button
                                onClick={() => { setAssignedEditTask(task); setAssignedEditOpen(true); }}
                                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setAssignedDeleteTask(task)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', {
                              'bg-blue-500/10 text-blue-600': task.status === 'todo',
                              'bg-[#FE812C]/10 text-[#FE812C]': task.status === 'doing',
                              'bg-primary/10 text-primary': task.status === 'done',
                            })}>
                              {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'In Progress' : 'Done'}
                            </span>
                            {task.deadline && (
                              <span className={cn('text-[10px] flex items-center gap-0.5', overdue ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                {overdue && <AlertTriangle size={9} />}
                                📅 {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {/* Delete confirm inline */}
                          {!!assignedDeleteTask && (assignedDeleteTask._id || assignedDeleteTask.id) === (task._id || task.id) && (
                            <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 mt-1">
                              <span className="text-xs text-destructive flex-1">Delete this task?</span>
                              <button onClick={handleAssignedDeleteConfirm} disabled={assignedDeleteLoading} className="text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-50">
                                {assignedDeleteLoading ? 'Deleting...' : 'Yes'}
                              </button>
                              <button onClick={() => setAssignedDeleteTask(null)} className="text-xs text-muted-foreground hover:text-foreground">No</button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tasks tab */}
              {detailTab === 'tasks' && (
                <div className="space-y-3">
                  {/* Filter buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(['all', 'todo', 'doing', 'done'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setMemberTaskFilter(f)}
                        className={cn('px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors capitalize', memberTaskFilter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground')}
                      >
                        {f === 'all' ? 'All' : f === 'todo' ? 'To Do' : f === 'doing' ? 'In Progress' : 'Done'}
                      </button>
                    ))}
                  </div>

                  {memberTasksLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={20} /></div>
                  ) : memberTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <p className="text-sm">No tasks found in this department</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {memberTasks.map((task) => {
                        const overdue = isOverdue(task.deadline) && task.status !== 'done';
                        const taskKey = task._id || task.id || '';
                        return (
                          <div key={taskKey} className={cn('bg-card border rounded-xl p-3 space-y-1.5', overdue ? 'border-destructive/30 bg-destructive/5' : 'border-border')}>
                            <div className="flex items-start gap-2">
                              <span className={cn('shrink-0 mt-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md', {
                                'bg-red-500/10 text-red-500': task.priority === 'high',
                                'bg-amber-500/10 text-amber-500': task.priority === 'medium',
                                'bg-emerald-500/10 text-emerald-500': task.priority === 'low',
                              })}>
                                {task.priority}
                              </span>
                              <p className={cn('text-sm font-medium flex-1 min-w-0', task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground')}>
                                {task.title}
                              </p>
                              <button
                                onClick={() => setCommentTask(task)}
                                className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                title="Comments"
                              >
                                <MessageSquare size={13} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md', {
                                'bg-blue-500/10 text-blue-600': task.status === 'todo',
                                'bg-[#FE812C]/10 text-[#FE812C]': task.status === 'doing',
                                'bg-primary/10 text-primary': task.status === 'done',
                              })}>
                                {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'In Progress' : 'Done'}
                              </span>
                              {task.deadline && (
                                <span className={cn('text-[10px] flex items-center gap-0.5', overdue ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                  {overdue && <AlertTriangle size={9} />}
                                  📅 {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Dialogs ── */}

      {/* Remove member confirm */}
      {removeMemberConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ease-out">
            <h3 className="text-lg font-bold">Remove Member</h3>
            <p className="text-sm text-muted-foreground">Remove <span className="font-semibold text-foreground">{removeMemberConfirm.label}</span> from this department?</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRemoveMemberConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleRemoveMember} className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors">Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite by email */}
      {inviteOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ease-out">
            <h3 className="text-lg font-bold">Invite to {department.name}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()} placeholder="user@example.com" className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all" autoFocus />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer">
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setInviteOpen(false); setInviteEmail(''); setInviteRole('MEMBER'); }} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleSendInvite} disabled={inviteLoading || !inviteEmail.trim()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {inviteLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add member directly */}
      {addMemberOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ease-out">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Add Members to {department.name}</h3>
                {selectedDeptUsers.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full border border-primary/20">
                    {selectedDeptUsers.length} selected
                  </span>
                )}
              </div>
              <button onClick={closeAddMember} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Selected chips */}
            {selectedDeptUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/30 rounded-xl border border-border max-h-24 overflow-y-auto">
                {selectedDeptUsers.map((u) => (
                  <span key={u.id} className="flex items-center gap-1 bg-card border border-border rounded-full pl-0.5 pr-2 py-0.5 text-xs">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-foreground max-w-[120px] truncate">{u.name ?? u.email}</span>
                    <button onClick={() => toggleDeptUser(u)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search by name, email, or @username..."
                className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all"
                autoFocus
              />
            </div>

            {/* Search results list */}
            <div className="border border-border rounded-xl bg-card overflow-hidden max-h-52 overflow-y-auto">
              {memberSearchLoading ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 size={12} className="animate-spin" /> Searching...
                </div>
              ) : memberSearch.trim() ? (
                memberSearchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">No users found</div>
                ) : (
                  memberSearchResults
                    .filter((u) => !members.some((m) => m.userId === u.id))
                    .map((u) => {
                      const isSelected = selectedDeptUsers.some((s) => s.id === u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleDeptUser(u)}
                          className={cn('w-full text-left px-3 py-2.5 hover:bg-muted text-sm transition-colors border-b border-border last:border-0 flex items-center gap-2.5', isSelected && 'bg-primary/5')}
                        >
                          {u.avatar ? (
                            <img src={u.avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                              {(u.name ?? u.email).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{u.name ?? u.email}</p>
                            {u.name && <p className="text-xs text-muted-foreground truncate">{u.email}{u.username ? ` · @${u.username}` : ''}</p>}
                          </div>
                          {isSelected && <Check size={14} className="text-primary shrink-0" />}
                        </button>
                      );
                    })
                )
              ) : (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Type a name, email, or @username to search
                </div>
              )}
            </div>

            {/* Role + submit */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Role</label>
                <select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value)} className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer">
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={closeAddMember} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                <button
                  onClick={handleBulkAddDeptMembers}
                  disabled={addMemberLoading || selectedDeptUsers.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {addMemberLoading && <Loader2 size={14} className="animate-spin" />}
                  {addMemberLoading ? 'Adding...' : `Add${selectedDeptUsers.length > 0 ? ` (${selectedDeptUsers.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit assigned task dialog */}
      <TaskDialog
        open={assignedEditOpen && !!assignedEditTask}
        onClose={() => { setAssignedEditOpen(false); setAssignedEditTask(null); }}
        onSubmit={handleAssignedEditSubmit}
        task={assignedEditTask}
        loading={assignedEditLoading}
      />

      {/* Comment dialog — opened from member detail panel Tasks tab */}
      {commentTask && (
        <CommentDialog
          open={true}
          onClose={() => setCommentTask(null)}
          task={commentTask}
        />
      )}

      {/* Transfer ownership */}
      {transferOwnerConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150 ease-out">
            <h3 className="text-lg font-bold">Transfer Ownership</h3>
            <p className="text-sm text-muted-foreground">Transfer ownership of <span className="font-semibold text-foreground">{department.name}</span> to <span className="font-semibold text-foreground">{transferOwnerConfirm.label}</span>?</p>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">You will be demoted to <span className="font-semibold">MEMBER</span>.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setTransferOwnerConfirm(null)} disabled={transferOwnerLoading} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleTransferOwnership} disabled={transferOwnerLoading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#FE812C] hover:bg-[#e5732a] disabled:opacity-60 transition-colors">
                {transferOwnerLoading && <Loader2 size={14} className="animate-spin" />}
                {transferOwnerLoading ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
