import { create } from 'zustand';
import type { User } from '@/types';
import { userService } from '@/services/userService';
import { supabase } from '@/lib/supabase';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  fetchProfile: () => Promise<void>;
  updateUser: (user: User) => void;
  hydrateProfile: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('microdo_token'),
  user: JSON.parse(localStorage.getItem('microdo_user') || 'null'),
  isAuthenticated: !!localStorage.getItem('microdo_token'),

  login: (token: string, user: User) => {
    localStorage.setItem('microdo_token', token);
    localStorage.setItem('microdo_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    supabase.auth.signOut().catch(() => {});
    localStorage.removeItem('microdo_token');
    localStorage.removeItem('microdo_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  fetchProfile: async () => {
    try {
      const res = await userService.getProfile();
      if (res.success) {
        localStorage.setItem('microdo_user', JSON.stringify(res.data));
        set({ user: res.data });
      }
    } catch {
      // 401 interceptor handles logout
    }
  },

  updateUser: (user: User) => {
    localStorage.setItem('microdo_user', JSON.stringify(user));
    set({ user });
  },

  // Hydrate from an aggregated payload (e.g. /me/bootstrap). Same effect as
  // fetchProfile but without spending a dedicated request.
  hydrateProfile: (user: User) => {
    localStorage.setItem('microdo_user', JSON.stringify(user));
    set({ user });
  },
}));
