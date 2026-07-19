import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { adminService } from '@/services/adminService';
import type { AdminUser, AdminAnalyticsSummary, AnalyticsTrend, AdminAnalyticsDeptItem } from '@/types';
import UserStatsChart from '@/components/charts/UserStatsChart';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Users, UserX, CheckSquare, Loader2, AlertCircle, RefreshCw,
  UserCheck, Building2, AlertTriangle, TrendingUp, Clock, Timer, BarChart2,
} from 'lucide-react';

type Range = '7D' | '30D' | '90D';

function getRangeDates(range: Range): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (range === '7D' ? 7 : range === '30D' ? 30 : 90));
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

function formatSeconds(seconds: number): string {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function tickDate(value: string): string {
  const parts = value.split('-');
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}

const tooltipStyle = {
  backgroundColor: 'var(--card, #fff)',
  borderRadius: '12px',
  border: '1px solid var(--border, #E5E7EB)',
  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  color: 'var(--foreground, #1A1A1A)',
  fontSize: 13,
};

export default function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<AdminAnalyticsSummary | null>(null);
  const [recentUsers, setRecentUsers] = useState<AdminUser[] | null>(null);
  const [trends, setTrends] = useState<AnalyticsTrend[]>([]);
  const [timeData, setTimeData] = useState<{ totalDurationSeconds: number; sessionCount: number; averageSessionSeconds: number | null } | null>(null);
  const [depts, setDepts] = useState<AdminAnalyticsDeptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('30D');

  const fetchTrends = useCallback(async (r: Range) => {
    try {
      const res = await adminService.getAdminAnalyticsTrends(getRangeDates(r));
      if (res.success) setTrends(Array.isArray(res.data?.series) ? res.data.series : []);
    } catch {
      setTrends([]);
    }
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, usersRes, timeRes, deptsRes] = await Promise.allSettled([
        adminService.getAdminAnalyticsSummary(),
        adminService.getUsers({ limit: 50 }),
        adminService.getAdminAnalyticsTime(getRangeDates('90D')),
        adminService.getAdminAnalyticsDepartments({ limit: 20 }),
      ]);
      if (summaryRes.status === 'fulfilled' && summaryRes.value.success) setSummary(summaryRes.value.data);
      if (usersRes.status === 'fulfilled' && usersRes.value.success) setRecentUsers(usersRes.value.data.users);
      if (timeRes.status === 'fulfilled' && timeRes.value.success) setTimeData(timeRes.value.data?.summary ?? null);
      if (deptsRes.status === 'fulfilled' && deptsRes.value.success) setDepts(deptsRes.value.data?.departments ?? []);
    } catch (err) {
      console.error(err);
      setError('Failed to load admin dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  useEffect(() => {
    if (!loading) fetchTrends(range);
  }, [range, fetchTrends, loading]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview and analytics for {user?.name || user?.email}</p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="self-start sm:self-auto p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-2xl border border-border">
          <Loader2 className="animate-spin text-primary mb-4" size={40} />
          <p className="text-muted-foreground font-medium">Loading platform data...</p>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-6 flex items-start gap-4">
          <AlertCircle className="text-destructive shrink-0" size={24} />
          <div>
            <h3 className="text-lg font-semibold text-destructive">Error Loading Data</h3>
            <p className="text-sm text-destructive mt-1">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Row 1: Users & Departments */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Total Users</p>
                <p className="text-2xl font-bold text-primary">{summary?.users.total ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Users className="text-primary" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Active Users</p>
                <p className="text-2xl font-bold text-emerald-500">{summary?.users.active ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <UserCheck className="text-emerald-500" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Banned Users</p>
                <p className="text-2xl font-bold text-destructive">{summary?.users.banned ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center">
                <UserX className="text-destructive" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Departments</p>
                <p className="text-2xl font-bold text-blue-500">{summary?.departments.total ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Building2 className="text-blue-500" size={20} />
              </div>
            </div>
          </div>

          {/* Stats Row 2: Tasks */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Total Tasks</p>
                <p className="text-2xl font-bold text-[#FE812C]">{summary?.tasks.total ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-[#FE812C]/10 rounded-xl flex items-center justify-center">
                <CheckSquare className="text-[#FE812C]" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Completed</p>
                <p className="text-2xl font-bold text-emerald-500">{summary?.tasks.done ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="text-emerald-500" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Overdue Tasks</p>
                <p className="text-2xl font-bold text-destructive">{summary?.tasks.overdue ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-destructive/10 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-destructive" size={20} />
              </div>
            </div>
            <div className="bg-card rounded-2xl border border-border p-5 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Created Today</p>
                <p className="text-2xl font-bold text-foreground">{summary?.tasks.createdToday ?? 0}</p>
              </div>
              <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center">
                <Clock className="text-muted-foreground" size={20} />
              </div>
            </div>
          </div>

          {/* Range selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Time range:</span>
            {(['7D', '30D', '90D'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  range === r
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trends chart */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-foreground">Platform Activity Trends</h3>
                <p className="text-xs text-muted-foreground">Tasks created vs completed per day</p>
              </div>
              {trends.length === 0 ? (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  <BarChart2 size={28} className="opacity-30 mr-2" />
                  <span className="text-sm">No data for this period</span>
                </div>
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trends} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={tickDate} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Bar dataKey="created" fill="#FE812C" radius={[4, 4, 0, 0]} name="Created" />
                      <Bar dataKey="completed" fill="#10BA41" radius={[4, 4, 0, 0]} name="Completed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* User registration chart */}
            <UserStatsChart users={recentUsers} loading={false} />
          </div>

          {/* Bottom row: Time tracking + Department overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Time tracking summary */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Timer size={16} className="text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Platform Time Tracking</h3>
              </div>
              {!timeData || timeData.sessionCount === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No time tracking data yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:gap-4 py-4">
                  <div className="text-center">
                    <p className="text-xl sm:text-2xl font-bold text-primary">{formatSeconds(timeData.totalDurationSeconds)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-[#FE812C]">{timeData.sessionCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Sessions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-500">{formatSeconds(timeData.averageSessionSeconds ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Avg session</p>
                  </div>
                </div>
              )}
            </div>

            {/* Department overview */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={16} className="text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">Department Overview</h3>
              </div>
              {depts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No departments found.</p>
              ) : (
                <div className="overflow-auto max-h-[220px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-xs text-muted-foreground border-b border-border">
                        <th className="text-left pb-2 font-semibold">Department</th>
                        <th className="text-right pb-2 font-semibold">Members</th>
                        <th className="text-right pb-2 font-semibold">Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depts.map((dept) => (
                        <tr key={dept.id} className="border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors">
                          <td className="py-2 font-medium text-foreground truncate max-w-[160px]">{dept.name}</td>
                          <td className="py-2 text-right text-muted-foreground">{dept.members.active}</td>
                          <td className="py-2 text-right text-muted-foreground">{dept.tasks.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
