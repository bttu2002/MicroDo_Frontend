import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FolderOpen, ArrowLeft, Loader2, UserPlus, UserMinus,
  Search, X, Check, Trash2, Archive, ArchiveRestore, LogOut,
  Send, Building2, Plus, Info,
} from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useAuthStore } from '@/store/authStore';
import { useDepartmentStore } from '@/store/departmentStore';
import { userService } from '@/services/userService';
import { projectService } from '@/services/projectService';
import { departmentService } from '@/services/departmentService';
import { slackConfigService } from '@/services/slackConfigService';
import type { SlackConfig, EmojiMappings, WebhookSecretInfo } from '@/services/slackConfigService';
import type { ProjectDepartmentLink } from '@/types';
import PlanningTreeView from '@/components/planning/PlanningTreeView';
import TimelineView from '@/components/planning/TimelineView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/services/api';
import type { ProjectMemberRole } from '@/types';

const COMMON_TIMEZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'Pacific/Honolulu (UTC−10)', value: 'Pacific/Honolulu' },
  { label: 'America/Los_Angeles (UTC−8/−7)', value: 'America/Los_Angeles' },
  { label: 'America/Denver (UTC−7/−6)', value: 'America/Denver' },
  { label: 'America/Chicago (UTC−6/−5)', value: 'America/Chicago' },
  { label: 'America/New_York (UTC−5/−4)', value: 'America/New_York' },
  { label: 'America/Sao_Paulo (UTC−3)', value: 'America/Sao_Paulo' },
  { label: 'Europe/London (UTC+0/+1)', value: 'Europe/London' },
  { label: 'Europe/Paris (UTC+1/+2)', value: 'Europe/Paris' },
  { label: 'Europe/Berlin (UTC+1/+2)', value: 'Europe/Berlin' },
  { label: 'Europe/Moscow (UTC+3)', value: 'Europe/Moscow' },
  { label: 'Asia/Dubai (UTC+4)', value: 'Asia/Dubai' },
  { label: 'Asia/Kolkata (UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'Asia/Bangkok (UTC+7)', value: 'Asia/Bangkok' },
  { label: 'Asia/Ho_Chi_Minh (UTC+7)', value: 'Asia/Ho_Chi_Minh' },
  { label: 'Asia/Singapore (UTC+8)', value: 'Asia/Singapore' },
  { label: 'Asia/Shanghai (UTC+8)', value: 'Asia/Shanghai' },
  { label: 'Asia/Tokyo (UTC+9)', value: 'Asia/Tokyo' },
  { label: 'Australia/Sydney (UTC+10/+11)', value: 'Australia/Sydney' },
  { label: 'Pacific/Auckland (UTC+12/+13)', value: 'Pacific/Auckland' },
];

function isValidHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.includes('.');
  }
  catch { return false; }
}


interface UserOption {
  id: string;
  email: string;
  name?: string | null;
  avatar?: string | null;
  username?: string | null;
}

interface AddMemberDeptTab {
  dept: { id: string; name: string };
  members: UserOption[];
}

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-[#FE812C]/10 text-[#FE812C] border-[#FE812C]/20',
  MANAGER: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  MEMBER: 'bg-primary/10 text-primary border-primary/20',
  VIEWER: 'bg-muted text-muted-foreground border-border',
};

export default function ProjectManagerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const {
    currentProject, currentLoading,
    fetchProject, setCurrentProject, updateProject, archiveProject, unarchiveProject,
    deleteProject, leaveProject, transferOwnership,
    removeMember, updateMemberRole,
  } = useProjectStore();
  const currentUser = useAuthStore((s) => s.user);
  const allMemberships = useDepartmentStore((s) => s.allMemberships);

  const [tab, setTab] = useState<'members' | 'planning' | 'timeline' | 'settings'>('members');

  // ── Settings form state ────────────────────────────────────────────────────
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [transferConfirm, setTransferConfirm] = useState<{ profileId: string; label: string } | null>(null);
  const [transferLoading, setTransferLoading] = useState(false);

  // ── Linked departments state ──────────────────────────────────────────────
  const [linkedDepts, setLinkedDepts] = useState<ProjectDepartmentLink[]>([]);
  const [linkableDepts, setLinkableDepts] = useState<{ id: string; name: string }[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [linkingDept, setLinkingDept] = useState(false);
  const [unlinkingDeptId, setUnlinkingDeptId] = useState<string | null>(null);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [importSuggestion, setImportSuggestion] = useState<{ departmentId: string; departmentName: string } | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // ── Slack config state ────────────────────────────────────────────────────
  const [slackConfig, setSlackConfig] = useState<SlackConfig | null>(null);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackTestingDaily, setSlackTestingDaily] = useState(false);
  const [slackTestingWeekly, setSlackTestingWeekly] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackManagerUrl, setSlackManagerUrl] = useState('');
  const [slackMemberUrl, setSlackMemberUrl] = useState('');
  const [slackDailyEnabled, setSlackDailyEnabled] = useState(true);
  const [slackWeeklyEnabled, setSlackWeeklyEnabled] = useState(true);
  const [slackTimezone, setSlackTimezone] = useState('');
  const [slackDailyTime, setSlackDailyTime] = useState('18:00');
  const [slackWeeklyDay, setSlackWeeklyDay] = useState(5);
  const [slackWeeklyTime, setSlackWeeklyTime] = useState('17:00');
  // Phase 8 — Emoji mappings: rows in local edit state; stored as canonical names
  const [emojiRows, setEmojiRows] = useState<Array<{ emoji: string; profileId: string }>>([]);
  const [emojiSaving, setEmojiSaving] = useState(false);
  // Phase 8 — Webhook secret: only masked info from GET; full secret only right after regenerate
  const [webhookSecretInfo, setWebhookSecretInfo] = useState<WebhookSecretInfo | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [secretRegenerating, setSecretRegenerating] = useState(false);
  const [secretConfirm, setSecretConfirm] = useState(false);

  // ── Add member state ───────────────────────────────────────────────────────
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<UserOption[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [addRole, setAddRole] = useState<ProjectMemberRole>('MEMBER');
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberDepts, setAddMemberDepts] = useState<AddMemberDeptTab[]>([]);
  const [activeDeptTab, setActiveDeptTab] = useState<string>('search');
  const [addMemberDeptsLoading, setAddMemberDeptsLoading] = useState(false);
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ profileId: string; label: string } | null>(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);

  const currentUserId = currentUser?.id ?? currentUser?._id;

  useEffect(() => {
    if (projectId) fetchProject(projectId);
  }, [projectId, fetchProject]);

  useEffect(() => {
    if (currentProject) {
      setEditName(currentProject.name);
      setEditDesc(currentProject.description ?? '');
    }
  }, [currentProject]);

  const myMembership = currentProject?.members?.find((m) => m.profileId === currentUserId);
  const myRole = myMembership?.role;
  const isOwner = myRole === 'OWNER';
  const isOwnerOrManager = isOwner || myRole === 'MANAGER';
  const isReadOnly = !myMembership && (currentProject?.departments ?? []).some((link) =>
    allMemberships.some(
      (m) => m.department.id === link.departmentId &&
             ['OWNER', 'ADMIN'].includes(m.role) &&
             m.status === 'ACTIVE'
    )
  );

  useEffect(() => {
    if (tab !== 'settings' || !projectId || !isOwnerOrManager) return;

    setSlackLoading(true);
    slackConfigService.get(projectId)
      .then((cfg) => {
        setSlackConfig(cfg);
        if (cfg) {
          setSlackWebhookUrl(cfg.webhookUrl);
          setSlackManagerUrl(cfg.managerWebhookUrl ?? '');
          setSlackMemberUrl(cfg.memberWebhookUrl ?? '');
          setSlackDailyEnabled(cfg.dailyEnabled);
          setSlackWeeklyEnabled(cfg.weeklyEnabled);
          setSlackTimezone(cfg.timezone ?? '');
          setSlackDailyTime(cfg.dailyTime ?? '18:00');
          setSlackWeeklyDay(cfg.weeklyDay ?? 5);
          setSlackWeeklyTime(cfg.weeklyTime ?? '17:00');
          // Load Phase 8 data in parallel (ignore errors — non-critical)
          slackConfigService.getEmojiMappings(projectId)
            .then((m) => {
              setEmojiRows(m ? Object.entries(m).map(([emoji, profileId]) => ({ emoji, profileId })) : []);
            })
            .catch(() => {});
          slackConfigService.getWebhookSecretInfo(projectId)
            .then(setWebhookSecretInfo)
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setSlackLoading(false));

    setDeptsLoading(true);
    Promise.all([
      projectService.getDepartments(projectId),
      departmentService.getLinkable(),
    ])
      .then(([deptRes, linkable]) => {
        setLinkedDepts(deptRes.data ?? []);
        setLinkableDepts(linkable);
      })
      .catch(() => {})
      .finally(() => setDeptsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, projectId]);

  const handleSaveSlack = async () => {
    if (!projectId || !slackWebhookUrl.trim()) return;
    setSlackSaving(true);
    try {
      const saved = await slackConfigService.save(projectId, {
        webhookUrl: slackWebhookUrl.trim(),
        dailyEnabled: slackDailyEnabled,
        weeklyEnabled: slackWeeklyEnabled,
        managerWebhookUrl: slackManagerUrl.trim() || null,
        memberWebhookUrl: slackMemberUrl.trim() || null,
        timezone: slackTimezone,
        dailyTime: slackDailyTime,
        weeklyDay: slackWeeklyDay,
        weeklyTime: slackWeeklyTime,
      });
      setSlackConfig(saved);
      toast.success('Slack integration saved');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save Slack config'));
    } finally {
      setSlackSaving(false);
    }
  };

  const handleTestDaily = async () => {
    if (!projectId) return;
    setSlackTestingDaily(true);
    try {
      await slackConfigService.test(projectId, 'daily');
      toast.success('Daily test digest sent to Slack');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to send daily test'));
    } finally {
      setSlackTestingDaily(false);
    }
  };

  const handleTestWeekly = async () => {
    if (!projectId) return;
    setSlackTestingWeekly(true);
    try {
      await slackConfigService.test(projectId, 'weekly');
      toast.success('Weekly test digest sent to Slack');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to send weekly test'));
    } finally {
      setSlackTestingWeekly(false);
    }
  };

  const handleRemoveSlack = async () => {
    if (!projectId) return;
    try {
      await slackConfigService.remove(projectId);
      setSlackConfig(null);
      setSlackWebhookUrl('');
      setSlackManagerUrl('');
      setSlackMemberUrl('');
      setSlackDailyEnabled(true);
      setSlackWeeklyEnabled(true);
      setSlackTimezone('');
      setSlackDailyTime('18:00');
      setSlackWeeklyDay(5);
      setSlackWeeklyTime('17:00');
      setEmojiRows([]);
      setWebhookSecretInfo(null);
      setRevealedSecret(null);
      toast.success('Slack integration removed');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove Slack config'));
    }
  };

  const handleSaveEmojiMappings = async () => {
    if (!projectId) return;
    setEmojiSaving(true);
    try {
      // Convert rows to canonical mappings object (keys already canonical, no colons)
      const mappings: EmojiMappings = {};
      for (const row of emojiRows) {
        if (row.emoji && row.profileId) mappings[row.emoji] = row.profileId;
      }
      const saved = await slackConfigService.saveEmojiMappings(projectId, mappings);
      setEmojiRows(saved ? Object.entries(saved).map(([emoji, profileId]) => ({ emoji, profileId })) : []);
      toast.success('Emoji mappings saved');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save emoji mappings'));
    } finally {
      setEmojiSaving(false);
    }
  };

  const handleRegenerateSecret = async () => {
    if (!projectId) return;
    setSecretRegenerating(true);
    setSecretConfirm(false);
    try {
      const result = await slackConfigService.regenerateWebhookSecret(projectId);
      setRevealedSecret(result.secret);
      setWebhookSecretInfo({ hasSecret: true, masked: result.masked });
      toast.success('New webhook secret generated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to regenerate webhook secret'));
    } finally {
      setSecretRegenerating(false);
    }
  };

  const canChangeRole = (memberRole: string) => {
    if (isOwner) return memberRole !== 'OWNER';
    // MANAGER can only change MEMBER or VIEWER (cannot touch OWNER or another MANAGER)
    if (myRole === 'MANAGER') return memberRole === 'MEMBER' || memberRole === 'VIEWER';
    return false;
  };

  const canRemove = (memberRole: string) => {
    if (isOwner) return memberRole !== 'OWNER';
    if (myRole === 'MANAGER') return memberRole === 'MEMBER' || memberRole === 'VIEWER';
    return false;
  };

  // ── User search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!memberSearch.trim() || activeDeptTab !== 'search') { if (!memberSearch.trim()) setMemberSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setMemberSearchLoading(true);
      try {
        const res = await userService.searchUsers({ q: memberSearch, limit: 10 });
        if (res.success) {
          setMemberSearchResults(res.data.users.map((u) => ({ id: u.id, email: u.email, name: u.name, avatar: u.avatar, username: u.username })));
        }
      } catch { setMemberSearchResults([]); } finally {
        setMemberSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [memberSearch, activeDeptTab]);

  const openAddMember = async () => {
    setAddMemberOpen(true);
    setActiveDeptTab('search');
    if (!projectId) return;
    setAddMemberDeptsLoading(true);
    try {
      const res = await projectService.getLinkedDeptMembers(projectId);
      const depts = res.data ?? [];
      setAddMemberDepts(depts);
      if (depts.length > 0) setActiveDeptTab(depts[0].dept.id);
    } catch { setAddMemberDepts([]); } finally {
      setAddMemberDeptsLoading(false);
    }
  };

  const closeAddMember = () => {
    setAddMemberOpen(false);
    setMemberSearch('');
    setMemberSearchResults([]);
    setSelectedUsers([]);
    setAddRole('MEMBER');
    setAddMemberDepts([]);
  };

  const toggleUser = (user: UserOption) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.filter((u) => u.id !== user.id) : [...prev, user];
    });
  };

  const handleBulkAdd = async () => {
    if (!projectId || selectedUsers.length === 0) { toast.error('Please select at least one user'); return; }
    setAddMemberLoading(true);
    try {
      const res = await projectService.bulkAddMembers(projectId, selectedUsers.map((u) => ({ profileId: u.id, role: addRole })));
      toast.success(res.message);
      const membersRes = await projectService.getMembers(projectId);
      if (membersRes.success && currentProject) {
        setCurrentProject({ ...currentProject, members: membersRes.data as typeof currentProject.members });
      }
      closeAddMember();
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to add members'));
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!projectId || !removeMemberConfirm) return;
    setRemoveMemberLoading(true);
    try {
      await removeMember(projectId, removeMemberConfirm.profileId);
      toast.success(`Removed ${removeMemberConfirm.label}`);
      setRemoveMemberConfirm(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove member'));
    } finally {
      setRemoveMemberLoading(false);
    }
  };

  const handleRoleChange = async (profileId: string, newRole: ProjectMemberRole) => {
    if (!projectId) return;
    if (newRole === 'OWNER') {
      const m = currentProject?.members?.find((x) => x.profileId === profileId);
      setTransferConfirm({ profileId, label: m?.profile?.name ?? m?.profile?.email ?? profileId });
      return;
    }
    try {
      await updateMemberRole(projectId, profileId, newRole);
      toast.success('Role updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update role'));
    }
  };

  const handleTransferOwnership = async () => {
    if (!projectId || !transferConfirm) return;
    setTransferLoading(true);
    try {
      await transferOwnership(projectId, transferConfirm.profileId);
      toast.success(`Ownership transferred to ${transferConfirm.label}`);
      setTransferConfirm(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to transfer ownership'));
    } finally {
      setTransferLoading(false);
    }
  };

  const handleLinkDept = async () => {
    if (!projectId || !selectedDeptId) return;
    setLinkingDept(true);
    const deptName = linkableDepts.find(d => d.id === selectedDeptId)?.name ?? selectedDeptId;
    try {
      await projectService.linkDepartment(projectId, selectedDeptId);
      const res = await projectService.getDepartments(projectId);
      setLinkedDepts(res.data ?? []);
      setSelectedDeptId('');
      toast.success('Department linked');
      setImportSuggestion({ departmentId: selectedDeptId, departmentName: deptName });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to link department'));
    } finally {
      setLinkingDept(false);
    }
  };

  const handleImportMembers = async () => {
    if (!projectId || !importSuggestion) return;
    setImportLoading(true);
    try {
      const res = await projectService.importDepartmentMembers(projectId, importSuggestion.departmentId);
      toast.success(res.message);
      setImportSuggestion(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to import members'));
    } finally {
      setImportLoading(false);
    }
  };

  const handleUnlinkDept = async (departmentId: string) => {
    if (!projectId) return;
    setUnlinkingDeptId(departmentId);
    try {
      await projectService.unlinkDepartment(projectId, departmentId);
      const res = await projectService.getDepartments(projectId);
      setLinkedDepts(res.data ?? []);
      toast.success('Department unlinked');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to unlink department'));
    } finally {
      setUnlinkingDeptId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!projectId || !editName.trim()) return;
    setSettingsSaving(true);
    try {
      await updateProject(projectId, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      toast.success('Project updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update project'));
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!projectId || !currentProject) return;
    setArchiveLoading(true);
    try {
      if (currentProject.archivedAt) {
        await unarchiveProject(projectId);
        toast.success('Project restored');
      } else {
        await archiveProject(projectId);
        toast.success('Project archived');
      }
      setArchiveConfirm(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update archive status'));
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    setDeleteLoading(true);
    try {
      await deleteProject(projectId);
      toast.success('Project deleted');
      navigate('/dashboard/projects');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete project'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!projectId) return;
    setLeaveLoading(true);
    try {
      await leaveProject(projectId);
      toast.success('Left project');
      navigate('/dashboard/projects');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to leave project'));
    } finally {
      setLeaveLoading(false);
    }
  };

  if (currentLoading || !currentProject) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );
  }

  const members = currentProject.members ?? [];
  const availableDepts = linkableDepts.filter(
    (dept) => !linkedDepts.some((ld) => ld.departmentId === dept.id)
  );

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard/projects')}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-10 h-10 rounded-xl bg-[#FE812C]/10 flex items-center justify-center shrink-0">
              <FolderOpen size={18} className="text-[#FE812C]" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-foreground">{currentProject.name}</h1>
              {currentProject.description && (
                <p className="text-xs text-muted-foreground">{currentProject.description}</p>
              )}
            </div>
            {myRole && (
              <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', ROLE_COLORS[myRole] ?? '')}>
                {myRole}
              </span>
            )}
            {currentProject.archivedAt && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                ARCHIVED
              </span>
            )}
          </div>
          <button
            onClick={() => navigate(`/dashboard/projects/${projectId}/tasks`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FE812C]/10 text-[#FE812C] hover:bg-[#FE812C]/20 text-sm font-semibold transition-colors"
          >
            <FolderOpen size={14} />
            View Tasks
          </button>
        </div>

        {/* Read-only notice */}
        {isReadOnly && (
          <div className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-700 dark:text-blue-300">
            <Info size={14} className="shrink-0" />
            You have view-only access to this project via department membership.
          </div>
        )}

        {/* Tabs — scrollable strip so all 4 stay reachable on phones */}
        <div className="flex items-center gap-1 border-b border-border overflow-x-auto scrollbar-hide">
          {(['members', 'planning', 'timeline', 'settings'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'members' ? `Members (${members.length})` : t === 'planning' ? 'Roadmap & Planning' : t === 'timeline' ? 'Timeline' : 'Settings'}
            </button>
          ))}
        </div>

        {/* ── Members tab ── */}
        {tab === 'members' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              {isOwnerOrManager && (
                <button
                  onClick={openAddMember}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <UserPlus size={13} /> Add Member
                </button>
              )}
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {members.length === 0 ? (
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
                                {member.profile?.name && (
                                  <p className="font-medium text-foreground text-xs truncate">{member.profile.name}</p>
                                )}
                                <p className={cn('truncate', member.profile?.name ? 'text-[11px] text-muted-foreground' : 'text-xs font-medium text-foreground')}>
                                  {member.profile?.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {canChangeRole(member.role) ? (
                              <select
                                value={member.role}
                                onChange={(e) => handleRoleChange(member.profileId, e.target.value as ProjectMemberRole)}
                                className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer outline-none bg-transparent', ROLE_COLORS[member.role] ?? '')}
                              >
                                {isOwner && <option value="OWNER">OWNER</option>}
                                {isOwner && <option value="MANAGER">MANAGER</option>}
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
                            {canRemove(member.role) && member.profileId !== currentUserId && (
                              <button
                                onClick={() => setRemoveMemberConfirm({ profileId: member.profileId, label: member.profile?.name ?? member.profile?.email ?? member.profileId })}
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

              {/* Transfer ownership */}
              {isOwner && members.filter((m) => m.role !== 'OWNER').length > 0 && (
                <div className="border-t border-border px-4 py-3 flex justify-end">
                  <button
                    onClick={() => {
                      const candidates = members.filter((m) => m.role !== 'OWNER');
                      if (candidates.length === 1) {
                        const c = candidates[0];
                        setTransferConfirm({ profileId: c.profileId, label: c.profile?.name ?? c.profile?.email ?? c.profileId });
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

        {/* ── Planning tab ── */}
        {tab === 'planning' && projectId && (
          <PlanningTreeView
            projectId={projectId}
            canManage={isOwnerOrManager}
            projectMembers={members as unknown as import('@/types').ProjectMember[]}
          />
        )}

        {/* ── Timeline tab ── */}
        {tab === 'timeline' && projectId && (
          <TimelineView
            projectId={projectId}
            onNavigateToPlanning={(milestoneId) => {
              setTab('planning');
              // milestoneId forwarded for future highlight support
              void milestoneId;
            }}
          />
        )}

        {/* ── Settings tab ── */}
        {tab === 'settings' && (
          <div className="space-y-6">
          {/* ── Top row: Project Details | Linked Departments | Archive + Danger ── */}
          <div className={cn(
            'grid gap-6',
            isOwnerOrManager ? 'grid-cols-1 xl:grid-cols-10' : 'grid-cols-1 xl:grid-cols-2'
          )}>
            {/* Project Details — 3/10 */}
            <div className={cn(
              'bg-card border border-border rounded-2xl p-5 space-y-4',
              isOwnerOrManager && 'xl:col-span-3'
            )}>
              <h3 className="font-semibold text-foreground text-sm">Project Details</h3>
              <div className="space-y-1.5">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-xl"
                  disabled={!isOwnerOrManager}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="project-desc"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Project description..."
                  className="rounded-xl"
                  disabled={!isOwnerOrManager}
                />
              </div>
              {isOwnerOrManager && (
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveSettings}
                    disabled={settingsSaving || !editName.trim()}
                    className="bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl gap-2"
                  >
                    {settingsSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    {settingsSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </div>

            {/* Linked Departments — 4/10 (isOwnerOrManager only) */}
            {isOwnerOrManager && (
              <div className="xl:col-span-4 bg-card border border-border rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 size={14} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Linked Departments</h3>
                    <p className="text-xs text-muted-foreground">Organizational context for this project</p>
                  </div>
                </div>

                {deptsLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 size={14} className="animate-spin" /> Loading...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {linkedDepts.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {linkedDepts.map((link) => (
                          <span
                            key={link.departmentId}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                          >
                            {link.department?.name ?? link.departmentId}
                            <button
                              onClick={() => handleUnlinkDept(link.departmentId)}
                              disabled={unlinkingDeptId === link.departmentId}
                              className="hover:text-destructive transition-colors disabled:opacity-50 ml-0.5"
                              title="Unlink department"
                            >
                              {unlinkingDeptId === link.departmentId
                                ? <Loader2 size={10} className="animate-spin" />
                                : <X size={10} />}
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <select
                        value={selectedDeptId}
                        onChange={(e) => setSelectedDeptId(e.target.value)}
                        className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                      >
                        <option value="">Select a department...</option>
                        {availableDepts.map((dept) => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleLinkDept}
                        disabled={linkingDept || !selectedDeptId}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-primary/10 text-primary hover:bg-primary hover:text-white disabled:opacity-50 transition-colors shrink-0"
                      >
                        {linkingDept ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        Link
                      </button>
                    </div>

                    {linkedDepts.length === 0 && availableDepts.length === 0 && !deptsLoading && (
                      <p className="text-sm text-muted-foreground">No departments available to link.</p>
                    )}

                    <p className="text-xs text-muted-foreground bg-muted/30 rounded-xl px-3 py-2">
                      Department OWNER/ADMIN can view this project. Project membership must still be managed explicitly.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Archive + Danger Zone — 3/10 */}
            <div className={cn(
              'flex flex-col gap-4',
              isOwnerOrManager && 'xl:col-span-3'
            )}>
              {/* Archive / Restore */}
              {isOwnerOrManager && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">
                        {currentProject.archivedAt ? 'Restore Project' : 'Archive Project'}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {currentProject.archivedAt
                          ? 'Restore this project to make it active again.'
                          : 'Archiving hides the project from active views. You can restore it later.'}
                      </p>
                    </div>
                    <button
                      onClick={() => setArchiveConfirm(true)}
                      disabled={archiveLoading}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 shrink-0',
                        currentProject.archivedAt
                          ? 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      )}
                    >
                      {currentProject.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      {currentProject.archivedAt ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              )}

              {/* Danger zone */}
              <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-5 space-y-4">
                <h3 className="font-semibold text-destructive text-sm">Danger Zone</h3>

                {!isOwner && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Leave Project</p>
                      <p className="text-xs text-muted-foreground">You will lose access to this project.</p>
                    </div>
                    <button
                      onClick={() => setLeaveConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive hover:text-white text-xs font-semibold transition-colors shrink-0"
                    >
                      <LogOut size={13} /> Leave
                    </button>
                  </div>
                )}

                {isOwner && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Delete Project</p>
                      <p className="text-xs text-muted-foreground">Permanently delete the project and all associated data.</p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-destructive/30 text-destructive hover:bg-destructive hover:text-white text-xs font-semibold transition-colors shrink-0"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Slack Integration ── */}
          {isOwnerOrManager && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#4A154B]/10 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 122.8 122.8" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                    <path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9zm6.5 0c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/>
                    <path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2zm0 6.5c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/>
                    <path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2zm-6.5 0c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/>
                    <path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9zm0-6.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Slack Integration</h3>
                  <p className="text-xs text-muted-foreground">Send daily &amp; weekly digest reports to Slack channels</p>
                </div>
                {slackConfig && (
                  <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Connected
                  </span>
                )}
              </div>

              {slackLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 size={14} className="animate-spin" /> Loading...
                </div>
              ) : (
                <div className="space-y-4">
                  {(() => {
                    const webhookErr = slackWebhookUrl.trim() !== '' && !isValidHttpsUrl(slackWebhookUrl.trim());
                    const managerErr = slackManagerUrl.trim() !== '' && !isValidHttpsUrl(slackManagerUrl.trim());
                    const memberErr  = slackMemberUrl.trim()  !== '' && !isValidHttpsUrl(slackMemberUrl.trim());
                    return (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="slack-webhook">Webhook URL <span className="text-destructive">*</span></Label>
                          <Input
                            id="slack-webhook"
                            value={slackWebhookUrl}
                            onChange={(e) => setSlackWebhookUrl(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                            className="rounded-xl font-mono text-xs"
                            aria-invalid={webhookErr || undefined}
                          />
                          {webhookErr
                            ? <p className="text-[11px] text-destructive">Must be a valid https:// URL</p>
                            : <p className="text-[11px] text-muted-foreground">Main channel for digest messages</p>
                          }
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label htmlFor="slack-manager-url">Manager Webhook <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                              id="slack-manager-url"
                              value={slackManagerUrl}
                              onChange={(e) => setSlackManagerUrl(e.target.value)}
                              placeholder="https://hooks.slack.com/..."
                              className="rounded-xl font-mono text-xs"
                              aria-invalid={managerErr || undefined}
                            />
                            {managerErr && <p className="text-[11px] text-destructive">Must be a valid https:// URL</p>}
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="slack-member-url">Member Webhook <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input
                              id="slack-member-url"
                              value={slackMemberUrl}
                              onChange={(e) => setSlackMemberUrl(e.target.value)}
                              placeholder="https://hooks.slack.com/..."
                              className="rounded-xl font-mono text-xs"
                              aria-invalid={memberErr || undefined}
                            />
                            {memberErr && <p className="text-[11px] text-destructive">Must be a valid https:// URL</p>}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Timezone + Daily + Weekly — 3 columns on same row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                    {/* Timezone card */}
                    <div className="rounded-xl border border-border/60 px-3 py-2.5 space-y-2">
                      <span className="text-sm font-medium">
                        Timezone <span className="text-destructive text-xs">*</span>
                      </span>
                      <div className="space-y-1">
                        <select
                          id="slack-timezone"
                          value={slackTimezone}
                          onChange={(e) => setSlackTimezone(e.target.value)}
                          className={cn(
                            'w-full rounded-lg border px-2 py-1.5 text-xs transition-colors cursor-pointer outline-none focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring bg-transparent dark:bg-input/30 text-foreground [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border',
                            !slackTimezone ? 'border-destructive' : 'border-input'
                          )}
                        >
                          <option value="" disabled className="bg-popover text-muted-foreground">— Select timezone —</option>
                          {COMMON_TIMEZONES.map(t => (
                            <option key={t.value} value={t.value} className="bg-popover text-foreground">{t.label}</option>
                          ))}
                        </select>
                        {!slackTimezone && (
                          <p className="text-[10px] text-destructive">Required to schedule digests</p>
                        )}
                      </div>
                    </div>

                    {/* Daily digest card */}
                    <div className={cn(
                      'rounded-xl border border-border/60 px-3 py-2.5 space-y-2 transition-opacity',
                      !slackDailyEnabled && 'opacity-50'
                    )}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSlackDailyEnabled(!slackDailyEnabled)}
                          className={cn('relative rounded-full transition-colors shrink-0', slackDailyEnabled ? 'bg-[#FE812C]' : 'bg-muted-foreground/30')}
                          style={{ height: '18px', width: '32px' }}
                        >
                          <span className={cn('absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform', slackDailyEnabled ? 'translate-x-[14px]' : 'translate-x-0')} />
                        </button>
                        <span className="text-sm font-medium">Daily digest</span>
                      </div>
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-xs text-muted-foreground">Send at</span>
                        <input
                          type="time"
                          value={slackDailyTime}
                          onChange={(e) => setSlackDailyTime(e.target.value)}
                          className="rounded-lg border border-input bg-transparent dark:bg-input/30 h-7 text-xs text-foreground px-2 cursor-pointer outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring [color-scheme:light] dark:[color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Weekly digest card */}
                    <div className={cn(
                      'rounded-xl border border-border/60 px-3 py-2.5 space-y-2 transition-opacity',
                      !slackWeeklyEnabled && 'opacity-50'
                    )}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSlackWeeklyEnabled(!slackWeeklyEnabled)}
                          className={cn('relative rounded-full transition-colors shrink-0', slackWeeklyEnabled ? 'bg-[#FE812C]' : 'bg-muted-foreground/30')}
                          style={{ height: '18px', width: '32px' }}
                        >
                          <span className={cn('absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform', slackWeeklyEnabled ? 'translate-x-[14px]' : 'translate-x-0')} />
                        </button>
                        <span className="text-sm font-medium">Weekly digest</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pl-1">
                        <select
                          value={slackWeeklyDay}
                          onChange={(e) => setSlackWeeklyDay(Number(e.target.value))}
                          className="rounded-lg border border-input bg-transparent dark:bg-input/30 px-1.5 h-7 text-xs text-foreground cursor-pointer outline-none focus:outline-none focus:ring-2 focus:ring-ring/50"
                        >
                          <option value={0} className="bg-popover text-foreground">Sunday</option>
                          <option value={1} className="bg-popover text-foreground">Monday</option>
                          <option value={2} className="bg-popover text-foreground">Tuesday</option>
                          <option value={3} className="bg-popover text-foreground">Wednesday</option>
                          <option value={4} className="bg-popover text-foreground">Thursday</option>
                          <option value={5} className="bg-popover text-foreground">Friday</option>
                          <option value={6} className="bg-popover text-foreground">Saturday</option>
                        </select>
                        <span className="text-xs text-muted-foreground mx-0.5">at</span>
                        <input
                          type="time"
                          value={slackWeeklyTime}
                          onChange={(e) => setSlackWeeklyTime(e.target.value)}
                          className="rounded-lg border border-input bg-transparent dark:bg-input/30 h-7 text-xs text-foreground px-2 cursor-pointer outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring [color-scheme:light] dark:[color-scheme:dark]"
                        />
                      </div>
                    </div>

                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <Button
                      onClick={handleSaveSlack}
                      disabled={
                        slackSaving ||
                        !slackWebhookUrl.trim() ||
                        !isValidHttpsUrl(slackWebhookUrl.trim()) ||
                        (slackManagerUrl.trim() !== '' && !isValidHttpsUrl(slackManagerUrl.trim())) ||
                        (slackMemberUrl.trim() !== '' && !isValidHttpsUrl(slackMemberUrl.trim())) ||
                        !slackTimezone ||
                        !slackDailyTime || !slackWeeklyTime
                      }
                      className="bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl gap-2 h-8 text-xs px-3"
                    >
                      {slackSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      {slackSaving ? 'Saving...' : 'Save'}
                    </Button>
                    <button
                      onClick={handleTestDaily}
                      disabled={slackTestingDaily || !slackConfig || !slackDailyEnabled}
                      title={!slackConfig ? 'Save config first' : !slackDailyEnabled ? 'Enable daily digest first' : undefined}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {slackTestingDaily ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {slackTestingDaily ? 'Sending...' : 'Test Daily'}
                    </button>
                    <button
                      onClick={handleTestWeekly}
                      disabled={slackTestingWeekly || !slackConfig || !slackWeeklyEnabled}
                      title={!slackConfig ? 'Save config first' : !slackWeeklyEnabled ? 'Enable weekly digest first' : undefined}
                      className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {slackTestingWeekly ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      {slackTestingWeekly ? 'Sending...' : 'Test Weekly'}
                    </button>
                    {slackConfig && (
                      <button
                        onClick={handleRemoveSlack}
                        className="flex items-center gap-1.5 px-3 h-8 rounded-xl border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive hover:text-white transition-colors ml-auto"
                      >
                        <X size={12} /> Remove
                      </button>
                    )}
                  </div>

                  {/* ── n8n Automation: Webhook Secret + Emoji Mapping ── */}
                  {slackConfig && (
                    <>
                      <div className="border-t border-border/50" />

                      {/* Emoji Mapping — header row contains compact secret control */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Slack Emoji → Member Mapping</p>
                            <p className="text-xs text-muted-foreground">When n8n detects an emoji in Slack, it creates a task assigned to the mapped member.</p>
                          </div>
                          {/* Webhook Secret — compact inline */}
                          {!revealedSecret && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">n8n secret:</span>
                              {webhookSecretInfo?.hasSecret ? (
                                <>
                                  <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 border border-border/60 whitespace-nowrap tracking-wide">
                                    {webhookSecretInfo.masked}
                                  </code>
                                  <button
                                    type="button"
                                    onClick={() => setSecretConfirm(true)}
                                    disabled={secretRegenerating}
                                    className="text-[11px] text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-2 h-6 hover:bg-muted transition-colors disabled:opacity-40 whitespace-nowrap"
                                  >
                                    {secretRegenerating ? <Loader2 size={10} className="animate-spin inline" /> : 'Regenerate'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setSecretConfirm(true)}
                                  disabled={secretRegenerating}
                                  className="flex items-center gap-1 text-[11px] text-[#FE812C] border border-[#FE812C]/40 rounded-lg px-2 h-6 hover:bg-[#FE812C]/10 transition-colors disabled:opacity-40 whitespace-nowrap"
                                >
                                  {secretRegenerating ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                                  Generate
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Revealed secret banner */}
                        {revealedSecret && (
                          <div className="rounded-xl bg-[#FE812C]/10 border border-[#FE812C]/30 px-3 py-2.5 space-y-1.5">
                            <p className="text-[10px] text-[#FE812C] font-medium uppercase tracking-wide">Copy now — will not be shown again</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs font-mono break-all text-foreground">{revealedSecret}</code>
                              <button
                                type="button"
                                onClick={() => { void navigator.clipboard.writeText(revealedSecret); toast.success('Secret copied'); }}
                                className="shrink-0 px-2 h-7 rounded-lg border border-[#FE812C]/40 text-[#FE812C] text-xs font-medium hover:bg-[#FE812C]/10 transition-colors"
                              >Copy</button>
                              <button
                                type="button"
                                onClick={() => setRevealedSecret(null)}
                                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                              ><X size={12} /></button>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                          {emojiRows.map((row, i) => {
                            const isValidEmoji = /^[a-z0-9_+-]+$/.test(row.emoji);
                            return (
                              <div key={i} className="flex items-center gap-1 min-w-0 rounded-lg border border-border bg-muted/20 px-2 py-1.5">
                                <span className="text-[10px] text-muted-foreground shrink-0">:</span>
                                <Input
                                  value={row.emoji}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/:/g, '').toLowerCase();
                                    setEmojiRows(rows => rows.map((r, idx) => idx === i ? { ...r, emoji: val } : r));
                                  }}
                                  placeholder="emoji"
                                  className={cn(
                                    'h-6 text-[10px] rounded px-1 min-w-0 flex-[2] border-border bg-background focus-visible:ring-1',
                                    row.emoji && !isValidEmoji && 'border-destructive',
                                  )}
                                />
                                <span className="text-[10px] text-muted-foreground shrink-0">:</span>
                                <select
                                  value={row.profileId}
                                  onChange={(e) => setEmojiRows(rows => rows.map((r, idx) => idx === i ? { ...r, profileId: e.target.value } : r))}
                                  className="h-6 flex-[3] min-w-0 rounded border border-input bg-transparent dark:bg-input/30 text-[10px] text-foreground cursor-pointer outline-none focus:ring-1 focus:ring-ring/50 px-0.5 truncate"
                                >
                                  <option value="" className="bg-popover text-muted-foreground">—</option>
                                  {members.map((m) => (
                                    <option key={m.profileId} value={m.profileId} className="bg-popover text-foreground">
                                      {m.profile?.name ?? m.profile?.email ?? m.profileId}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setEmojiRows(rows => rows.filter((_, idx) => idx !== i))}
                                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                ><X size={10} /></button>
                              </div>
                            );
                          })}

                          {emojiRows.length < 4 && (
                            <button
                              type="button"
                              onClick={() => setEmojiRows(rows => [...rows, { emoji: '', profileId: '' }])}
                              className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg border border-dashed border-border/60 hover:border-border py-1.5"
                            >
                              <Plus size={12} /> Add mapping
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={handleSaveEmojiMappings}
                            disabled={
                              emojiSaving ||
                              emojiRows.some(r => !r.emoji || !r.profileId || !/^[a-z0-9_+-]+$/.test(r.emoji))
                            }
                            className="flex items-center gap-1.5 px-3 h-7 rounded-xl bg-[#FE812C] hover:bg-[#e5732a] text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {emojiSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            {emojiSaving ? 'Saving...' : 'Save mappings'}
                          </button>
                          <p className="text-[10px] text-muted-foreground">Lowercase letters, digits, _ - + · Max 4</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Webhook secret regenerate confirm */}
      {secretConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">Regenerate Webhook Secret</h3>
            <p className="text-sm text-muted-foreground">
              The current secret will be <span className="font-semibold text-foreground">immediately invalidated</span>. Any n8n workflows using it will stop working until updated. Continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSecretConfirm(false)}
                disabled={secretRegenerating}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={() => void handleRegenerateSecret()}
                disabled={secretRegenerating}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-[#FE812C] hover:bg-[#e5732a] text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {secretRegenerating && <Loader2 size={14} className="animate-spin" />}
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive confirm */}
      {archiveConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">
              {currentProject.archivedAt ? 'Restore Project' : 'Archive Project'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {currentProject.archivedAt ? (
                <>Restore <span className="font-semibold text-foreground">{currentProject.name}</span>? It will become active again.</>
              ) : (
                <>Archive <span className="font-semibold text-foreground">{currentProject.name}</span>? It will be hidden from active views.</>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setArchiveConfirm(false)}
                disabled={archiveLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchive}
                disabled={archiveLoading}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60',
                  currentProject.archivedAt
                    ? 'bg-primary hover:bg-primary/90'
                    : 'bg-amber-500 hover:bg-amber-600'
                )}
              >
                {archiveLoading && <Loader2 size={14} className="animate-spin" />}
                {archiveLoading ? 'Processing...' : currentProject.archivedAt ? 'Restore' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add member modal ── */}
      {addMemberOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Add Members</h3>
                {selectedUsers.length > 0 && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-full border border-primary/20">
                    {selectedUsers.length} selected
                  </span>
                )}
              </div>
              <button onClick={closeAddMember} className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Selected chips */}
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-muted/30 rounded-xl border border-border max-h-24 overflow-y-auto">
                {selectedUsers.map((u) => (
                  <span key={u.id} className="flex items-center gap-1 bg-card border border-border rounded-full pl-0.5 pr-2 py-0.5 text-xs">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                        {(u.name ?? u.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium text-foreground max-w-[120px] truncate">{u.name ?? u.email}</span>
                    <button onClick={() => toggleUser(u)} className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors">
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
                placeholder={activeDeptTab === 'search' ? 'Search by name, email, or @username...' : 'Filter by name, email, or @username...'}
                className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all"
                autoFocus
              />
            </div>

            {/* Dept tabs */}
            {addMemberDeptsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Loader2 size={12} className="animate-spin" /> Loading departments...
              </div>
            ) : addMemberDepts.length > 0 && (
              <div className="flex items-center gap-0.5 border-b border-border overflow-x-auto scrollbar-hide pb-0">
                <button
                  onClick={() => setActiveDeptTab('search')}
                  className={cn('px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    activeDeptTab === 'search' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  Search
                </button>
                {addMemberDepts.map((d) => (
                  <button
                    key={d.dept.id}
                    onClick={() => setActiveDeptTab(d.dept.id)}
                    className={cn('px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                      activeDeptTab === d.dept.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  >
                    {d.dept.name}
                  </button>
                ))}
              </div>
            )}

            {/* User list */}
            <div className="border border-border rounded-xl bg-card overflow-hidden max-h-52 overflow-y-auto">
              {activeDeptTab === 'search' ? (
                memberSearchLoading ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Searching...
                  </div>
                ) : memberSearch.trim() ? (
                  memberSearchResults.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">No users found</div>
                  ) : (
                    memberSearchResults
                      .filter((u) => !members.some((m) => m.profileId === u.id))
                      .map((u) => {
                        const isSelected = selectedUsers.some((s) => s.id === u.id);
                        return (
                          <button
                            key={u.id}
                            onClick={() => toggleUser(u)}
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
                    {addMemberDepts.length === 0 ? 'Type a name, email, or @username to search' : 'Switch to a department tab to browse members, or type to search'}
                  </div>
                )
              ) : (() => {
                const deptData = addMemberDepts.find((d) => d.dept.id === activeDeptTab);
                const existingIds = new Set(members.map((m) => m.profileId));
                const q = memberSearch.trim().toLowerCase();
                const filtered = (deptData?.members ?? []).filter((u) => {
                  if (!q) return !existingIds.has(u.id);
                  if (q.startsWith('@')) return (u.username?.toLowerCase().includes(q.slice(1)) ?? false) && !existingIds.has(u.id);
                  return ((u.name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) && !existingIds.has(u.id));
                });
                return filtered.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {q ? 'No matching members' : 'All department members are already in this project'}
                  </div>
                ) : filtered.map((u) => {
                  const isSelected = selectedUsers.some((s) => s.id === u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUser(u)}
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
                });
              })()}
            </div>

            {/* Role + submit */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as ProjectMemberRole)}
                  className="flex-1 bg-muted/50 border border-border rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="MANAGER">MANAGER</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={closeAddMember} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleBulkAdd}
                  disabled={addMemberLoading || selectedUsers.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#FE812C] hover:bg-[#e5732a] disabled:opacity-60 transition-colors"
                >
                  {addMemberLoading && <Loader2 size={14} className="animate-spin" />}
                  {addMemberLoading ? 'Adding...' : `Add${selectedUsers.length > 0 ? ` (${selectedUsers.length})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove member confirm */}
      {removeMemberConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">Remove Member</h3>
            <p className="text-sm text-muted-foreground">
              Remove <span className="font-semibold text-foreground">{removeMemberConfirm.label}</span> from this project?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRemoveMemberConfirm(null)}
                disabled={removeMemberLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveMember}
                disabled={removeMemberLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition-colors"
              >
                {removeMemberLoading && <Loader2 size={14} className="animate-spin" />}
                {removeMemberLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer ownership confirm */}
      {transferConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">Transfer Ownership</h3>
            <p className="text-sm text-muted-foreground">
              Transfer ownership of <span className="font-semibold text-foreground">{currentProject.name}</span> to{' '}
              <span className="font-semibold text-foreground">{transferConfirm.label}</span>?
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
              You will be demoted to <span className="font-semibold">MEMBER</span>.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setTransferConfirm(null)} disabled={transferLoading} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleTransferOwnership} disabled={transferLoading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-60 transition-colors">
                {transferLoading && <Loader2 size={14} className="animate-spin" />}
                {transferLoading ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">Delete Project</h3>
            <p className="text-sm text-muted-foreground">
              Permanently delete <span className="font-semibold text-foreground">{currentProject.name}</span>? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition-colors">
                {deleteLoading && <Loader2 size={14} className="animate-spin" />}
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave confirm */}
      {leaveConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold">Leave Project</h3>
            <p className="text-sm text-muted-foreground">
              Leave <span className="font-semibold text-foreground">{currentProject.name}</span>? You will lose access to this project.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setLeaveConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleLeave} disabled={leaveLoading} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition-colors">
                {leaveLoading && <Loader2 size={14} className="animate-spin" />}
                {leaveLoading ? 'Leaving...' : 'Leave Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import department members suggestion */}
      {importSuggestion && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <UserPlus size={16} className="text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Import Department Members?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Add all active members of <span className="font-semibold text-foreground">{importSuggestion.departmentName}</span> to this project as <span className="font-semibold text-foreground">MEMBER</span>. Members already in the project will be skipped.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setImportSuggestion(null)}
                disabled={importLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={handleImportMembers}
                disabled={importLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {importLoading && <Loader2 size={14} className="animate-spin" />}
                {importLoading ? 'Importing...' : 'Import Members'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
