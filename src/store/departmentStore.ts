import { create } from 'zustand';
import { departmentService } from '@/services/departmentService';
import type { MyDepartmentMembership } from '@/types';

const RECENT_KEY = 'recentDeptIds';

const loadRecentDeptIds = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); }
  catch { return []; }
};

interface DepartmentStore {
  myDepartments: MyDepartmentMembership[];
  loading: boolean;
  hasFetched: boolean;
  fetchMyDepartments: () => Promise<void>;

  allMemberships: MyDepartmentMembership[];
  fetchAllMemberships: () => Promise<void>;

  recentDeptIds: string[];
  updateRecentDept: (deptId: string) => void;

  hydrateMemberships: (data: MyDepartmentMembership[]) => void;

  reset: () => void;
}

export const useDepartmentStore = create<DepartmentStore>((set, get) => ({
  myDepartments: [],
  loading: false,
  hasFetched: false,

  allMemberships: [],

  recentDeptIds: loadRecentDeptIds(),

  fetchMyDepartments: async () => {
    set({ loading: true });
    try {
      const res = await departmentService.getUserMemberships();
      if (res.success) {
        const normalize = (m: (typeof res.data)[number]) => {
          const dept = m.department as typeof m.department & { _id?: string };
          return { ...m, department: { ...dept, id: dept.id ?? dept._id ?? '' } };
        };
        const active = res.data
          .filter((m) => m.status === 'ACTIVE')
          .map(normalize);
        set({ myDepartments: active, allMemberships: active, hasFetched: true });
      }
    } catch {
      set({ hasFetched: true });
    } finally {
      set({ loading: false });
    }
  },

  // Backward-compat alias — same endpoint as fetchMyDepartments, sets same state
  fetchAllMemberships: async () => {
    await get().fetchMyDepartments();
  },

  // Preloaded from /me/bootstrap — same normalization as fetchMyDepartments
  hydrateMemberships: (data: MyDepartmentMembership[]) => {
    const normalized = data
      .filter((m) => m.status === 'ACTIVE')
      .map((m) => {
        const dept = m.department as typeof m.department & { _id?: string };
        return { ...m, department: { ...dept, id: dept.id ?? dept._id ?? '' } };
      });
    set({ myDepartments: normalized, allMemberships: normalized, hasFetched: true });
  },

  updateRecentDept: (deptId: string) => {
    const current = get().recentDeptIds;
    const updated = [deptId, ...current.filter((id) => id !== deptId)].slice(0, 10);
    set({ recentDeptIds: updated });
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  },

  reset: () => set({ myDepartments: [], loading: false, hasFetched: false, allMemberships: [], recentDeptIds: [] }),
}));
