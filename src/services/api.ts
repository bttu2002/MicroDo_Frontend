import axios from 'axios';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Access-token cache ──────────────────────────────────────────────
// `supabase.auth.getSession()` reads localStorage + runs an expiration check on
// every call. When a page mounts and fires 5-6 requests in parallel, we ended
// up doing that work 5-6 times. Cache the token for a short window and refresh
// only on session events or a 401 response.
const TOKEN_TTL_MS = 30_000;
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  cachedToken = token ? { token, expiresAt: Date.now() + TOKEN_TTL_MS } : null;
  return token;
}

// Keep the cache in sync when Supabase silently rotates the token so we never
// send a stale one after a background refresh.
supabase.auth.onAuthStateChange((_event, session) => {
  cachedToken = session?.access_token
    ? { token: session.access_token, expiresAt: Date.now() + TOKEN_TTL_MS }
    : null;
});

// Request interceptor: attach the cached access token
api.interceptors.request.use(
  async (config) => {
    const token = await getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      cachedToken = null;
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

type ApiErrorShape = {
  response?: {
    data?: {
      message?: string;
      errors?: Array<{ field?: string; message: string }>;
    };
  };
};

export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as ApiErrorShape;
  const fieldErrors = e?.response?.data?.errors;
  if (Array.isArray(fieldErrors) && fieldErrors.length > 0) {
    return fieldErrors.map(fe => fe.message).join(' · ');
  }
  return e?.response?.data?.message ?? (err instanceof Error ? err.message : null) ?? fallback;
}

export default api;
