import api from './api';
import type { User, MyDepartmentMembership, Project, TimeTrackingSession } from '@/types';

export interface BootstrapData {
  profile:       User;
  activeSession: TimeTrackingSession | null;
  memberships:   MyDepartmentMembership[];
  unreadCount:   number;
  projects:      Project[];
}

export const meService = {
  // Aggregate dashboard cold-start — replaces 5 parallel requests with 1
  getBootstrap: async (): Promise<{ success: boolean; data: BootstrapData }> => {
    const res = await api.get('/me/bootstrap');
    return res.data;
  },
};
