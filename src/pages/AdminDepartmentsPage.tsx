import { useEffect, useState, useCallback } from 'react';
import { adminService } from '@/services/adminService';
import { departmentService } from '@/services/departmentService';
import { invitationService } from '@/services/invitationService';
import type { DepartmentWithMembers, DepartmentMember, DepartmentMemberRole, DepartmentInvitation } from '@/types';
import { toast } from 'sonner';
import {
  Building2, Plus, Pencil, Trash2, Users, Loader2,
  X, Search, ChevronLeft, ChevronRight, UserPlus, UserMinus,
  Mail, Clock, RefreshCw,
} from 'lucide-react';
import { getApiErrorMessage } from '@/services/api';

const ROLE_COLORS: Record<string, string> = {
  OWNER:  'bg-[#FE812C]/10 text-[#FE812C] border-[#FE812C]/20',
  ADMIN:  'bg-purple-500/10 text-purple-500 border-purple-500/20',
  MEMBER: 'bg-primary/10 text-primary border-primary/20',
  VIEWER: 'bg-muted text-muted-foreground border-border',
};

export default function AdminDepartmentsPage() {
  // ── Departments list ─────────────────────────────────────────
  const [departments, setDepartments] = useState<DepartmentWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDepts, setTotalDepts] = useState(0);

  // ── Members panel ────────────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState<DepartmentWithMembers | null>(null);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // ── Create / Edit dialog ─────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editDept, setEditDept] = useState<DepartmentWithMembers | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Delete dialog ────────────────────────────────────────────
  const [deleteDept, setDeleteDept] = useState<DepartmentWithMembers | null>(null);
  const [forceDelete, setForceDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ── Invitations ──────────────────────────────────────────────
  const [invitations, setInvitations] = useState<DepartmentInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteLoading, setInviteLoading] = useState(false);

  // ── Remove member confirm ─────────────────────────────────────
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ userId: string; label: string } | null>(null);

  // ── Transfer ownership confirm ────────────────────────────────
  const [transferOwnerConfirm, setTransferOwnerConfirm] = useState<{ userId: string; label: string } | null>(null);
  const [transferOwnerLoading, setTransferOwnerLoading] = useState(false);

  // ── Members modal refreshing ──────────────────────────────────
  const [membersRefreshing, setMembersRefreshing] = useState(false);

  // ── Search & date filter (client-side) ───────────────────────
  const [deptSearch, setDeptSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Add member dialog ────────────────────────────────────────
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<{ id: string; email: string; name?: string | null }[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserLabel, setSelectedUserLabel] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('MEMBER');
  const [addMemberLoading, setAddMemberLoading] = useState(false);

  // ── Fetch departments ─────────────────────────────────────────
  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminService.getDepartments({ page: currentPage, limit: 10 });
      if (res.success) {
        setDepartments(res.data);
        setTotalPages(res.pagination.totalPages);
        setTotalDepts(res.pagination.total);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load departments'));
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  // ── Load members for selected dept ───────────────────────────
  const loadMembers = async (dept: DepartmentWithMembers) => {
    setSelectedDept(dept);
    setMembers([]);
    setInvitations([]);
    setMembersLoading(true);
    try {
      const res = await departmentService.getMembers(dept.id, { limit: 50 });
      if (res.success) setMembers(res.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to load members'));
    } finally {
      setMembersLoading(false);
    }
    // load invitations in background
    setInvitationsLoading(true);
    try {
      const invRes = await invitationService.getInvitations(dept.id);
      if (invRes.success) setInvitations(invRes.data);
    } catch { /* silent */ } finally {
      setInvitationsLoading(false);
    }
  };

  // ── Refresh members modal data ───────────────────────────────
  const refreshMembers = async () => {
    if (!selectedDept) return;
    setMembersRefreshing(true);
    try {
      const [membersRes, invRes] = await Promise.all([
        departmentService.getMembers(selectedDept.id, { limit: 50 }),
        invitationService.getInvitations(selectedDept.id),
      ]);
      if (membersRes.success) setMembers(membersRes.data);
      if (invRes.success) setInvitations(invRes.data);
    } catch { /* silent */ } finally {
      setMembersRefreshing(false);
    }
  };

  // ── Create / Edit ─────────────────────────────────────────────
  const openCreate = () => { setDeptName(''); setDeptDesc(''); setCreateOpen(true); };
  const openEdit = (dept: DepartmentWithMembers, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditDept(dept);
    setDeptName(dept.name);
    setDeptDesc(dept.description ?? '');
  };

  const handleSaveDept = async () => {
    if (!deptName.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editDept) {
        await adminService.updateDepartment(editDept.id, {
          name: deptName.trim(),
          description: deptDesc.trim() || undefined,
        });
        setDepartments(prev => prev.map(d =>
          d.id === editDept.id ? { ...d, name: deptName.trim(), description: deptDesc.trim() || undefined } : d
        ));
        if (selectedDept?.id === editDept.id) {
          setSelectedDept(prev => prev ? { ...prev, name: deptName.trim(), description: deptDesc.trim() || undefined } : prev);
        }
        toast.success('Department updated');
        setEditDept(null);
      } else {
        await adminService.createDepartment({ name: deptName.trim(), description: deptDesc.trim() || undefined });
        toast.success('Department created');
        setCreateOpen(false);
        fetchDepartments();
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to save department'));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────
  const handleDeleteDept = async () => {
    if (!deleteDept) return;
    setDeleting(true);
    try {
      await adminService.deleteDepartment(deleteDept.id, { force: forceDelete || undefined });
      setDepartments(prev => prev.filter(d => d.id !== deleteDept.id));
      if (selectedDept?.id === deleteDept.id) setSelectedDept(null);
      toast.success('Department deleted');
      setDeleteDept(null);
      setForceDelete(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to delete department'));
    } finally {
      setDeleting(false);
    }
  };

  // ── Remove member ─────────────────────────────────────────────
  const handleRemoveMember = async () => {
    if (!selectedDept || !removeMemberConfirm) return;
    const { userId, label } = removeMemberConfirm;
    try {
      await departmentService.removeMember(selectedDept.id, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      setDepartments(prev => prev.map(d =>
        d.id === selectedDept.id && d._count
          ? { ...d, _count: { ...d._count, members: Math.max(0, (d._count.members ?? d._count.memberships ?? 0) - 1), memberships: Math.max(0, (d._count.memberships ?? d._count.members ?? 0) - 1) } }
          : d
      ));
      toast.success(`Removed ${label}`);
      setRemoveMemberConfirm(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to remove member'));
    }
  };

  // ── Change role ───────────────────────────────────────────────
  const handleChangeRole = (userId: string, newRole: string) => {
    if (!selectedDept) return;
    if (newRole === 'OWNER') {
      const member = members.find(m => m.userId === userId);
      const label = member?.profile?.name ?? member?.profile?.email ?? userId;
      setTransferOwnerConfirm({ userId, label });
      return;
    }
    void (async () => {
      try {
        await departmentService.changeMemberRole(selectedDept.id, userId, { role: newRole });
        setMembers(prev => prev.map(m =>
          m.userId === userId ? { ...m, role: newRole as DepartmentMemberRole } : m
        ));
        toast.success('Role updated');
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to update role'));
      }
    })();
  };

  // ── Transfer ownership ────────────────────────────────────────
  const handleTransferOwnership = async () => {
    if (!selectedDept || !transferOwnerConfirm) return;
    setTransferOwnerLoading(true);
    try {
      await departmentService.transferOwnership(selectedDept.id, { newOwnerId: transferOwnerConfirm.userId });
      setMembers(prev => prev.map(m => {
        if (m.userId === transferOwnerConfirm.userId) return { ...m, role: 'OWNER' as DepartmentMemberRole };
        if (m.role === 'OWNER') return { ...m, role: 'MEMBER' as DepartmentMemberRole };
        return m;
      }));
      toast.success(`Ownership transferred to ${transferOwnerConfirm.label}`);
      setTransferOwnerConfirm(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to transfer ownership'));
    } finally {
      setTransferOwnerLoading(false);
    }
  };

  // ── Invite by Email ───────────────────────────────────────────
  const closeInviteDialog = () => {
    setInviteOpen(false);
    setInviteEmail('');
    setInviteRole('MEMBER');
  };

  const handleSendInvite = async () => {
    if (!selectedDept || !inviteEmail.trim()) { toast.error('Email is required'); return; }
    setInviteLoading(true);
    try {
      await invitationService.sendInvitation(selectedDept.id, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success('Invitation sent');
      closeInviteDialog();
      // refresh invitations list
      const invRes = await invitationService.getInvitations(selectedDept.id);
      if (invRes.success) setInvitations(invRes.data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to send invitation'));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    if (!selectedDept) return;
    try {
      await invitationService.cancelInvitation(selectedDept.id, invitationId);
      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      toast.success('Invitation cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to cancel invitation'));
    }
  };

  // ── Close members modal on Escape ───────────────────────────
  useEffect(() => {
    if (!selectedDept) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inviteOpen) { closeInviteDialog(); return; }
        if (addMemberOpen) { closeAddMember(); return; }
        setSelectedDept(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedDept, inviteOpen, addMemberOpen]);

  // ── Member search (debounced) ────────────────────────────────
  useEffect(() => {
    if (!memberSearch.trim()) { setMemberSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setMemberSearchLoading(true);
      try {
        const res = await adminService.getUsers({ search: memberSearch, limit: 8 });
        if (res.success) {
          setMemberSearchResults(res.data.users.map(u => ({
            id: u.id ?? u._id,
            email: u.email,
            name: u.name,
          })));
        }
      } catch { /* silent */ } finally {
        setMemberSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  const selectUser = (u: { id: string; email: string; name?: string | null }) => {
    setSelectedUserId(u.id);
    setSelectedUserLabel(u.name ? `${u.name} (${u.email})` : u.email);
    setMemberSearch(u.name ?? u.email);
    setMemberSearchResults([]);
  };

  const closeAddMember = () => {
    setAddMemberOpen(false);
    setMemberSearch(''); setMemberSearchResults([]);
    setSelectedUserId(''); setSelectedUserLabel('');
    setAddMemberRole('MEMBER');
  };

  const handleAddMember = async () => {
    if (!selectedDept || !selectedUserId) { toast.error('Please select a user'); return; }
    setAddMemberLoading(true);
    try {
      await departmentService.addMember(selectedDept.id, { userId: selectedUserId, role: addMemberRole });
      toast.success('Member added');
      closeAddMember();
      const res = await departmentService.getMembers(selectedDept.id, { limit: 50 });
      if (res.success) {
        setMembers(res.data);
        setDepartments(prev => prev.map(d =>
          d.id === selectedDept.id && d._count
            ? { ...d, _count: { ...d._count, members: res.pagination.total, memberships: res.pagination.total } }
            : d
        ));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to add member'));
    } finally {
      setAddMemberLoading(false);
    }
  };

  const filteredDepts = departments.filter((d) => {
    const matchesSearch = !deptSearch.trim() || d.name.toLowerCase().includes(deptSearch.toLowerCase());
    const created = new Date(d.createdAt);
    const matchesFrom = !dateFrom || created >= new Date(dateFrom);
    const matchesTo = !dateTo || created <= new Date(dateTo + 'T23:59:59');
    return matchesSearch && matchesFrom && matchesTo;
  });

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Departments</h1>
          <p className="text-muted-foreground mt-1">
            Manage teams, members, and access roles
            {totalDepts > 0 && <span className="ml-2 text-xs font-medium text-primary">({totalDepts} total)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchDepartments}
            disabled={loading}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-[#FE812C] hover:bg-[#e5732a] text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <Plus size={16} /> New Department
          </button>
        </div>
      </div>

      {/* Search & Filter toolbar */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-sm">
        <div className="relative flex-1 min-w-0 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search department name..."
            value={deptSearch}
            onChange={(e) => setDeptSearch(e.target.value)}
            className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Created:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-2.5 py-2 text-xs outline-none transition-all"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-2.5 py-2 text-xs outline-none transition-all"
            title="To date"
          />
          {(deptSearch || dateFrom || dateTo) && (
            <button
              onClick={() => { setDeptSearch(''); setDateFrom(''); setDateTo(''); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear filters"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Departments Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Description</th>
                <th className="px-6 py-4 font-semibold">Members</th>
                <th className="px-6 py-4 font-semibold">Tasks</th>
                <th className="px-6 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center">
                  <Loader2 className="animate-spin text-primary mx-auto mb-2" size={24} />
                  <p className="text-muted-foreground">Loading departments...</p>
                </td></tr>
              ) : filteredDepts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center">
                  <Building2 size={32} className="mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground">{departments.length === 0 ? 'No departments yet. Create your first one.' : 'No departments match your filters.'}</p>
                </td></tr>
              ) : filteredDepts.map((dept) => (
                <tr
                  key={dept.id}
                  className={`border-b border-border last:border-0 transition-colors ${
                    selectedDept?.id === dept.id ? 'bg-primary/5 border-primary/20' : 'hover:bg-muted/30'
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#FE812C]/10 flex items-center justify-center shrink-0">
                        <Building2 size={14} className="text-[#FE812C]" />
                      </div>
                      <span className="font-semibold text-foreground">{dept.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <span className="line-clamp-1 max-w-[180px] block">{dept.description ?? '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => loadMembers(dept)}
                      className="flex items-center gap-1 text-muted-foreground text-xs font-medium hover:text-primary transition-colors"
                    >
                      <Users size={13} /> {dept._count?.memberships ?? dept._count?.members ?? 0}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">{dept._count?.tasks ?? 0}</td>
                  <td className="px-6 py-4 text-muted-foreground text-xs">
                    {new Date(dept.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => selectedDept?.id === dept.id ? setSelectedDept(null) : loadMembers(dept)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          selectedDept?.id === dept.id
                            ? 'bg-primary/20 text-primary'
                            : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                        }`}
                      >
                        <Users size={11} /> Members
                      </button>
                      <button
                        onClick={(e) => openEdit(dept, e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Edit"
                      ><Pencil size={14} /></button>
                      <button
                        onClick={() => { setDeleteDept(dept); setForceDelete(false); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      ><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page <span className="font-medium text-foreground">{currentPage}</span> of{' '}
              <span className="font-medium text-foreground">{totalPages}</span>
            </span>
            <div className="flex items-center gap-2">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Members Modal */}
      {selectedDept && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedDept(null)}
          onKeyDown={(e) => e.key === 'Escape' && setSelectedDept(null)}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div
            className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Users size={16} className="text-muted-foreground shrink-0" />
                <h3 className="font-semibold text-foreground truncate">
                  Members of <span className="text-[#FE812C]">{selectedDept.name}</span>
                </h3>
                {!membersLoading && (
                  <span className="text-xs text-muted-foreground shrink-0">({members.length})</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={refreshMembers}
                  disabled={membersRefreshing}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw size={14} className={membersRefreshing ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={() => setInviteOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground rounded-xl text-xs font-semibold transition-colors"
                >
                  <Mail size={13} /> Invite by Email
                </button>
                <button
                  onClick={() => setAddMemberOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-xs font-semibold transition-colors"
                >
                  <UserPlus size={13} /> Add Member
                </button>
                <button
                  onClick={() => setSelectedDept(null)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto">
              {membersLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="animate-spin text-primary mx-auto" size={22} />
                </div>
              ) : members.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No active members yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border sticky top-0">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Member</th>
                        <th className="px-4 py-2.5 font-semibold">Role</th>
                        <th className="px-4 py-2.5 font-semibold">Joined</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => (
                        <tr key={member.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
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
                                <p className={`text-muted-foreground truncate ${member.profile?.name ? 'text-[11px]' : 'text-xs font-medium text-foreground'}`}>
                                  {member.profile?.email}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {member.role === 'OWNER' ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ROLE_COLORS['OWNER']}`}>
                                OWNER
                              </span>
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) => handleChangeRole(member.userId, e.target.value)}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer outline-none bg-transparent ${ROLE_COLORS[member.role] ?? ''}`}
                              >
                                <option value="OWNER">OWNER</option>
                                <option value="ADMIN">ADMIN</option>
                                <option value="MEMBER">MEMBER</option>
                                <option value="VIEWER">VIEWER</option>
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-[11px]">
                            {new Date(member.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {member.role !== 'OWNER' && (
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

              {/* Pending Invitations section */}
              <div className="border-t border-border px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={14} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Pending Invitations
                  </span>
                  {!invitationsLoading && invitations.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-muted rounded-full text-xs text-muted-foreground font-medium">
                      {invitations.length}
                    </span>
                  )}
                </div>
                {invitationsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 size={12} className="animate-spin" /> Loading...
                  </div>
                ) : invitations.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">No pending invitations.</p>
                ) : (
                  <div className="space-y-2">
                    {invitations.map((inv) => {
                      const expiresAt = new Date(inv.expiresAt);
                      const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / 86400000);
                      const expired = daysLeft <= 0;
                      return (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/40 rounded-xl"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                              <Mail size={12} className="text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{inv.email}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ROLE_COLORS[inv.role] ?? ''}`}>
                                  {inv.role}
                                </span>
                                <span className={`flex items-center gap-0.5 text-[10px] ${expired ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  <Clock size={9} />
                                  {expired ? 'Expired' : `${daysLeft}d left`}
                                </span>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleCancelInvitation(inv.id)}
                            className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Cancel invitation"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      {(createOpen || editDept) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              {editDept ? 'Edit Department' : 'New Department'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name *</label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveDept()}
                  placeholder="Engineering, Marketing..."
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl px-3 py-2 text-sm outline-none transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={deptDesc}
                  onChange={(e) => setDeptDesc(e.target.value)}
                  placeholder="Optional description..."
                  rows={3}
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl px-3 py-2 text-sm outline-none transition-all resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setCreateOpen(false); setEditDept(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >Cancel</button>
              <button
                onClick={handleSaveDept}
                disabled={saving || !deptName.trim()}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#FE812C] hover:bg-[#e5732a] disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving...' : editDept ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteDept && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Delete Department</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Are you sure you want to delete{' '}
                <span className="font-semibold text-foreground">{deleteDept.name}</span>?
              </p>
              {(deleteDept._count?.memberships ?? deleteDept._count?.members ?? 0) > 0 && (
                <p className="text-destructive font-medium">
                  This department has {deleteDept._count?.memberships ?? deleteDept._count?.members ?? 0} active member(s).
                </p>
              )}
            </div>
            {(deleteDept._count?.memberships ?? deleteDept._count?.members ?? 0) > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={forceDelete}
                  onChange={(e) => setForceDelete(e.target.checked)}
                  className="rounded accent-destructive"
                />
                <span className="text-muted-foreground">Force delete and remove all members</span>
              </label>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setDeleteDept(null); setForceDelete(false); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >Cancel</button>
              <button
                onClick={handleDeleteDept}
                disabled={deleting || ((deleteDept._count?.memberships ?? deleteDept._count?.members ?? 0) > 0 && !forceDelete)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 disabled:opacity-60 transition-colors"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Member Confirm Dialog */}
      {removeMemberConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Remove Member</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">{removeMemberConfirm.label}</span>{' '}
              from this department?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRemoveMemberConfirm(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >Cancel</button>
              <button
                onClick={handleRemoveMember}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors"
              >Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite by Email Dialog */}
      {inviteOpen && selectedDept && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              Invite to <span className="text-[#FE812C]">{selectedDept.name}</span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Email Address *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendInvite()}
                    placeholder="user@example.com"
                    className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all"
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeInviteDialog}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >Cancel</button>
              <button
                onClick={handleSendInvite}
                disabled={inviteLoading || !inviteEmail.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {inviteLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {inviteLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Ownership Confirm Dialog */}
      {transferOwnerConfirm && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FE812C]/10 flex items-center justify-center shrink-0">
                <Users size={18} className="text-[#FE812C]" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Transfer Ownership</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Transfer ownership of <span className="font-semibold text-foreground">{selectedDept?.name}</span> to{' '}
              <span className="font-semibold text-foreground">{transferOwnerConfirm.label}</span>?
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-xl px-3 py-2">
              The current OWNER will be demoted to <span className="font-semibold">MEMBER</span>.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setTransferOwnerConfirm(null)}
                disabled={transferOwnerLoading}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={handleTransferOwnership}
                disabled={transferOwnerLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#FE812C] hover:bg-[#e5732a] disabled:opacity-60 transition-colors"
              >
                {transferOwnerLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                {transferOwnerLoading ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Dialog */}
      {addMemberOpen && selectedDept && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              Add Member to <span className="text-[#FE812C]">{selectedDept.name}</span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Search User</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      if (selectedUserId) { setSelectedUserId(''); setSelectedUserLabel(''); }
                    }}
                    placeholder="Search by email or name..."
                    className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl pl-9 pr-3 py-2 text-sm outline-none transition-all"
                    autoFocus
                  />
                </div>
                {memberSearchLoading && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" /> Searching...
                  </p>
                )}
                {memberSearchResults.length > 0 && !selectedUserId && (
                  <div className="mt-1 border border-border rounded-xl bg-card shadow-sm overflow-hidden max-h-44 overflow-y-auto">
                    {memberSearchResults.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => selectUser(u)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm transition-colors border-b border-border last:border-0"
                      >
                        <span className="font-medium text-foreground">{u.name ?? u.email}</span>
                        {u.name && <span className="text-muted-foreground text-xs ml-2">{u.email}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedUserId && (
                  <p className="text-xs text-primary mt-1.5 font-medium">
                    ✓ {selectedUserLabel}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Role</label>
                <select
                  value={addMemberRole}
                  onChange={(e) => setAddMemberRole(e.target.value)}
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-3 py-2 text-sm outline-none cursor-pointer"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="MEMBER">MEMBER</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={closeAddMember}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={addMemberLoading || !selectedUserId}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {addMemberLoading ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
