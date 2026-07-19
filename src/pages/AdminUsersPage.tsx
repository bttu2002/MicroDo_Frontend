import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { adminService } from '@/services/adminService';
import { getApiErrorMessage } from '@/services/api';
import type { AdminUser } from '@/types';
import { toast } from 'sonner';
import {
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
  UserPlus,
  Mail,
} from 'lucide-react';

export default function AdminUsersPage() {
  const currentUser = useAuthStore(s => s.user);
  
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination & Search states
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{ user: AdminUser; action: 'ban' | 'unban' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Resend invite state
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Role change state
  const [roleChangingId, setRoleChangingId] = useState<string | null>(null);

  // Invite user modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Date filter (client-side)
  const [joinedFrom, setJoinedFrom] = useState('');
  const [joinedTo, setJoinedTo] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on new search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.getUsers({ 
        page: currentPage, 
        limit: 10, 
        search: debouncedSearch 
      });
      if (res.success) {
        setUsers(res.data.users);
        setTotalPages(res.data.pagination.totalPages);
        setTotalUsers(res.data.pagination.totalUsers);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Failed to load users');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleChangeRole = async (user: AdminUser, newRole: 'USER' | 'MANAGER') => {
    const userId = user.id ?? user._id;
    if (!userId) return;
    setRoleChangingId(userId);
    try {
      await adminService.changeUserRole(userId, newRole);
      setUsers(prev => prev.map(u => (u.id ?? u._id) === userId ? { ...u, role: newRole } : u));
      toast.success(`Role updated to ${newRole}`);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update role'));
    } finally {
      setRoleChangingId(null);
    }
  };

  const handleToggleClick = (user: AdminUser) => {
    const userId = user.id ?? user._id;
    if (userId === currentUser?.id || userId === currentUser?._id) {
      toast.error('You cannot change your own status');
      return;
    }
    setConfirmAction({ user, action: user.status === 'ACTIVE' ? 'ban' : 'unban' });
  };

  const confirmToggleStatus = async () => {
    if (!confirmAction) return;
    const { user, action } = confirmAction;
    const userId = user.id ?? user._id;
    if (!userId) return;

    setActionLoading(true);
    try {
      if (action === 'ban') {
        await adminService.banUser(userId);
        toast.success(`User ${user.email} has been banned`);
      } else {
        await adminService.unbanUser(userId);
        toast.success(`User ${user.email} has been unbanned`);
      }
      setUsers(prev => prev.map(u =>
        (u.id ?? u._id) === userId ? { ...u, status: action === 'ban' ? 'BANNED' : 'ACTIVE' } : u
      ));
      setConfirmAction(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to ${action} user`));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async (user: AdminUser) => {
    const userId = user.id ?? user._id;
    if (!userId) return;
    setResendingId(userId);
    try {
      const res = await adminService.resendInvite(userId);
      toast.success(res.message || 'Invitation resent successfully');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to resend invitation'));
    } finally {
      setResendingId(null);
    }
  };

  const resetInviteForm = () => {
    setInviteName('');
    setInviteUsername('');
    setInviteEmail('');
    setInviteError('');
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');

    if (!inviteName.trim() || !inviteUsername.trim() || !inviteEmail.trim()) {
      setInviteError('All fields are required');
      return;
    }

    setInviteLoading(true);
    try {
      const res = await adminService.createUser({
        name: inviteName.trim(),
        username: inviteUsername.trim(),
        email: inviteEmail.trim().toLowerCase(),
      });
      toast.success(res.message || 'Invitation sent successfully');
      setShowInviteModal(false);
      resetInviteForm();
      fetchUsers();
    } catch (err: unknown) {
      setInviteError(getApiErrorMessage(err, 'Failed to create user'));
    } finally {
      setInviteLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!joinedFrom && !joinedTo) return true;
    if (!u.createdAt) return true;
    const joined = new Date(u.createdAt);
    const matchesFrom = !joinedFrom || joined >= new Date(joinedFrom);
    const matchesTo = !joinedTo || joined <= new Date(joinedTo + 'T23:59:59');
    return matchesFrom && matchesTo;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage accounts, roles, and platform access</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
            <Users size={18} />
            {totalUsers} Total Accounts
          </div>
          <button
            onClick={() => { resetInviteForm(); setShowInviteModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <UserPlus size={16} />
            Invite User
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 shadow-sm">
        <div className="relative flex-1 min-w-0 group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={16} />
          <input
            type="text"
            placeholder="Search by email address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-all outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Joined:</span>
          <input
            type="date"
            value={joinedFrom}
            onChange={(e) => setJoinedFrom(e.target.value)}
            className="bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-2.5 py-2 text-xs outline-none transition-all"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={joinedTo}
            onChange={(e) => setJoinedTo(e.target.value)}
            className="bg-muted/50 border border-border focus:border-primary/50 rounded-xl px-2.5 py-2 text-xs outline-none transition-all"
            title="To date"
          />
          {(joinedFrom || joinedTo) && (
            <button
              onClick={() => { setJoinedFrom(''); setJoinedTo(''); }}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear date filter"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">User details</th>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Joined at</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Loader2 className="animate-spin text-primary mx-auto mb-2" size={24} />
                    <span className="text-muted-foreground">Loading users...</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-destructive">
                    {error}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    No users found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id ?? user._id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                          {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{user.email || 'Unknown User'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>ID: {(user.id ?? user._id)?.slice(-6) ?? 'N/A'}</span>
                            {user.username && (
                              <>
                                <span className="text-muted-foreground/40">|</span>
                                <span className="text-primary/70">@{user.username}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-foreground">{user.name || '—'}</p>
                    </td>
                    <td className="px-6 py-4">
                      {user.role === 'ADMIN' || (user.id ?? user._id) === (currentUser?.id ?? currentUser?._id) ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          user.role === 'ADMIN'
                            ? 'bg-[#FE812C]/10 border-[#FE812C]/20 text-[#FE812C]'
                            : user.role === 'MANAGER'
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-500'
                            : 'bg-muted border-border text-muted-foreground'
                        }`}>
                          {user.role}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          disabled={roleChangingId === (user.id ?? user._id)}
                          onChange={(e) => handleChangeRole(user, e.target.value as 'USER' | 'MANAGER')}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer outline-none bg-transparent ${
                            user.role === 'MANAGER'
                              ? 'bg-purple-500/10 border-purple-500/20 text-purple-500'
                              : 'bg-muted border-border text-muted-foreground'
                          }`}
                        >
                          <option value="USER">USER</option>
                          <option value="MANAGER">MANAGER</option>
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        user.status === 'BANNED'
                          ? 'bg-destructive/10 border-destructive/20 text-destructive'
                          : user.status === 'PENDING'
                          ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400'
                          : 'bg-primary/10 border-primary/20 text-primary'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          user.status === 'BANNED' ? 'bg-destructive'
                          : user.status === 'PENDING' ? 'bg-yellow-500'
                          : 'bg-primary'
                        }`} />
                        {user.status === 'BANNED' ? 'Suspended' : user.status === 'PENDING' ? 'Pending Invite' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {(user.id ?? user._id) !== (currentUser?.id ?? currentUser?._id) && user.role !== 'ADMIN' && (
                        user.status === 'PENDING' ? (
                          <button
                            onClick={() => handleResendInvite(user)}
                            disabled={resendingId === (user.id ?? user._id)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-amber-600 bg-amber-500/10 hover:bg-amber-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {resendingId === (user.id ?? user._id) ? (
                              <><Loader2 size={14} className="animate-spin" /> Sending...</>
                            ) : (
                              <><Mail size={14} /> Resend Invite</>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleClick(user)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              user.status === 'ACTIVE'
                                ? 'text-destructive bg-destructive/10 hover:bg-destructive hover:text-white'
                                : 'text-primary bg-primary/10 hover:bg-primary hover:text-white'
                            }`}
                          >
                            {user.status === 'ACTIVE' ? (
                              <><ShieldAlert size={14} /> Ban</>
                            ) : (
                              <><ShieldCheck size={14} /> Restore</>
                            )}
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Page <span className="font-medium text-foreground">{currentPage}</span> of <span className="font-medium text-foreground">{totalPages}</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-foreground">Invite New User</h3>
                <p className="text-xs text-muted-foreground mt-0.5">An activation email will be sent to their inbox.</p>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              {inviteError && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl px-4 py-2.5 text-sm">
                  {inviteError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Full Name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Username</label>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="johndoe"
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                />
                <p className="text-[11px] text-muted-foreground">Letters, numbers and underscores only.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-muted/50 border border-border focus:border-primary/50 focus:bg-background rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <UserPlus size={14} />
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Ban/Unban Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">
              {confirmAction.action === 'ban' ? 'Ban User' : 'Restore User'}
            </h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to {confirmAction.action === 'ban' ? 'ban' : 'restore'}{' '}
              <span className="font-medium text-foreground">{confirmAction.user.email}</span>?
              {confirmAction.action === 'ban' && ' They will lose access to the platform.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggleStatus}
                disabled={actionLoading}
                className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-60 ${
                  confirmAction.action === 'ban'
                    ? 'bg-destructive hover:bg-destructive/90'
                    : 'bg-primary hover:bg-primary/90'
                }`}
              >
                {actionLoading ? 'Processing...' : confirmAction.action === 'ban' ? 'Ban User' : 'Restore User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
