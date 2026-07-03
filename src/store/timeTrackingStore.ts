import { create } from 'zustand';
import type { TimeTrackingSession } from '@/types';
import { timeTrackingService } from '@/services/timeTrackingService';

// Module-level interval – one active session at a time
let _tickId: ReturnType<typeof setInterval> | null = null;

function startTick(set: (fn: (s: { elapsedSeconds: number }) => { elapsedSeconds: number }) => void) {
  if (_tickId) clearInterval(_tickId);
  _tickId = setInterval(() => {
    set((s) => ({ elapsedSeconds: s.elapsedSeconds + 1 }));
  }, 1000);
}

function stopTick() {
  if (_tickId) { clearInterval(_tickId); _tickId = null; }
}

interface TimeTrackingState {
  activeSession: TimeTrackingSession | null;
  elapsedSeconds: number;
  loading: boolean;
  fetchActiveSession: () => Promise<void>;
  startTracking: (taskId: string) => Promise<void>;
  stopTracking: () => Promise<void>;
  hydrateActiveSession: (session: TimeTrackingSession | null) => void;
}

export const useTimeTrackingStore = create<TimeTrackingState>((set) => ({
  activeSession: null,
  elapsedSeconds: 0,
  loading: false,

  fetchActiveSession: async () => {
    try {
      const res = await timeTrackingService.getActiveSession();
      if (res.success && res.data) {
        const elapsed = Math.floor(
          (Date.now() - new Date(res.data.startedAt).getTime()) / 1000
        );
        set({ activeSession: res.data, elapsedSeconds: Math.max(0, elapsed) });
        startTick(set);
      }
    } catch {
      // silent fail
    }
  },

  startTracking: async (taskId: string) => {
    set({ loading: true });
    try {
      const res = await timeTrackingService.startSession(taskId);
      if (res.success) {
        set({ activeSession: res.data, elapsedSeconds: 0 });
        startTick(set);
      }
    } catch (err) {
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  stopTracking: async () => {
    set({ loading: true });
    try {
      const res = await timeTrackingService.stopSession();
      if (res.success) {
        stopTick();
        set({ activeSession: null, elapsedSeconds: 0 });
      }
    } catch (err) {
      throw err;
    } finally {
      set({ loading: false });
    }
  },

  // Same tick + elapsed setup as fetchActiveSession but takes preloaded data
  // from /me/bootstrap instead of a dedicated request.
  hydrateActiveSession: (session: TimeTrackingSession | null) => {
    if (!session) {
      stopTick();
      set({ activeSession: null, elapsedSeconds: 0 });
      return;
    }
    const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    set({ activeSession: session, elapsedSeconds: Math.max(0, elapsed) });
    startTick(set);
  },
}));
