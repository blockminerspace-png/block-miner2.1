import { create } from 'zustand';
import axios, { isAxiosError, type AxiosResponse } from 'axios';
import { toast } from 'sonner';
import i18n from '../i18n/config';
import { generateSecurityPayload } from '../shared/utils/security';
import { clearWalletSessionClearedByUserFlag } from '../shared/utils/walletSessionPreference';
import { readAuthErrorMessage } from '../pages/auth/shared/auth.errors';
import {
  API_TIMEOUT_MS_AUTH,
  API_TIMEOUT_MS_SESSION,
  resolveApiTimeoutMs,
} from '../shared/utils/apiTimeout';

/** Public session user (matches server auth JSON; no secrets). */
export type AuthUser = {
  id: number;
  name: string;
  username: string | null;
  email: string;
  hasReferral?: boolean;
};

export interface RegisterPayload {
  username?: string;
  email?: string;
  password?: string;
  refCode?: string;
  acceptTerms?: boolean;
  cfTurnstileToken?: string;
}

export interface RegisterFailureResult {
  success: false;
  message: string;
  code?: string;
  fieldPath?: string;
  fieldMessage?: string;
}

export interface RegisterSuccessResult {
  success: true;
}

export type RegisterResult = RegisterSuccessResult | RegisterFailureResult;

export interface LoginResultSuccess {
  success: true;
}

export interface LoginResultFailure {
  success: false;
  message?: string;
}

export type LoginResult = LoginResultSuccess | LoginResultFailure;

export interface CheckSessionOptions {
  silent?: boolean;
}

function parseAuthUserPayload(raw: unknown): AuthUser | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  if (typeof o.name !== 'string') return null;
  if (typeof o.email !== 'string') return null;
  const un = o.username;
  if (un !== null && typeof un !== 'string') return null;
  const out: AuthUser = { id: o.id, name: o.name, email: o.email, username: un };
  if (typeof o.hasReferral === 'boolean') {
    out.hasReferral = o.hasReferral;
  }
  return out;
}

function readTokenFromPayload(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('token' in data)) return null;
  const t = (data as { token?: unknown }).token;
  return typeof t === 'string' ? t : null;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** After first session resolution; App must not block the router on later checks. */
  authHydrated: boolean;
  error: string | null;
  /** Optional socket auth token when returned by the API (otherwise null). */
  token: string | null;

  checkSession: (opts?: CheckSessionOptions) => Promise<void>;
  login: (identifier: string, password: string) => Promise<LoginResult>;
  register: (data: RegisterPayload) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  setUser: (patch: Partial<AuthUser>) => void;
}

function readAxiosResponseMessage(response: AxiosResponse<unknown> | undefined, fallback = ''): string {
  const data = response?.data;
  if (typeof data !== 'object' || data === null) return fallback;
  const d = data as Record<string, unknown>;
  if (typeof d.message === 'string' && d.message.trim()) return d.message.trim();
  if (typeof d.error === 'string' && d.error.trim()) return d.error.trim();
  return fallback;
}

function readRegisterFirstError(response: AxiosResponse<unknown> | undefined): {
  path?: string;
  message?: string;
  code?: string;
} | null {
  const data = response?.data;
  if (typeof data !== 'object' || data === null) return null;
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (typeof first !== 'object' || first === null) return null;
  const path = (first as { path?: unknown }).path;
  const message = (first as { message?: unknown }).message;
  const code = (data as { code?: unknown }).code;
  return {
    path: typeof path === 'string' ? path : undefined,
    message: typeof message === 'string' ? message : undefined,
    code: typeof code === 'string' ? code : undefined,
  };
}

// Configure default axios behavior for our API
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Need this to send cookies
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
  /** Avoid hung UI when the server or proxy is slow / wedged (checkSession also sets its own). */
  timeout: resolveApiTimeoutMs(import.meta.env.VITE_API_TIMEOUT_MS),
});

// Interceptor to attach Anti-Bot payload to every API request
const IDEMPOTENCY_PATH_MARKERS = [
  '/vault/',
  '/inventory/install',
  '/inventory/remove',
  '/machines/toggle',
  '/machines/remove',
  '/machines/move',
  '/shop/purchase',
  '/offer-events/purchase',
  '/rooms/rack/install',
  '/rooms/rack/uninstall',
  '/rooms/rack/uninstall-batch',
  '/wallet/deposit',
  '/wallet/deposit/submit',
  '/wallet/withdraw',
  '/wallet/blk/convert',
  '/internal-offerwall/',
];

api.interceptors.request.use(
  (config) => {
    // We only attach this for state-changing or critical requests,
    // but attaching it everywhere is safer and simpler.
    try {
      const security = generateSecurityPayload();
      config.headers['X-Anti-Bot-Payload'] = security.fingerprint;
      config.headers['X-Anti-Bot-Key'] = security.sk;
      config.headers['X-Anti-Bot'] = security.isBot ? '1' : '0';
    } catch {
      // Fallback if security module fails
      config.headers['X-Anti-Bot'] = '0';
    }
    const method = String(config.method || 'get').toLowerCase();
    if (method === 'post' || method === 'put' || method === 'patch') {
      const url = String(config.url || '');
      const needsKey = IDEMPOTENCY_PATH_MARKERS.some((m) => url.includes(m));
      if (needsKey && !config.headers['Idempotency-Key'] && !config.headers['idempotency-key']) {
        const k =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        config.headers['Idempotency-Key'] = k;
      }
    }
    return config;
  },
  (error: unknown) => Promise.reject(error),
);

let adminSessionRedirectScheduled = false;

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!isAxiosError(error)) return Promise.reject(error);
    const status = error.response?.status;
    const url = String(error.config?.url || '');
    const data = error.response?.data;
    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? (data as { code?: unknown }).code
        : undefined;
    const msg = readAxiosResponseMessage(error.response, '').toLowerCase();
    const isAdminApi =
      url.startsWith('/admin/') && !url.startsWith('/admin/auth/login') && !url.startsWith('/admin/auth/check');
    const sessionInvalid =
      status === 401 &&
      isAdminApi &&
      (code === 'ADMIN_SESSION_INVALID' ||
        msg.includes('admin session invalid') ||
        msg.includes('not authenticated'));
    if (sessionInvalid && typeof window !== 'undefined') {
      const path = window.location.pathname || '';
      if (path.startsWith('/admin') && !path.startsWith('/admin/login') && !adminSessionRedirectScheduled) {
        adminSessionRedirectScheduled = true;
        try {
          toast.error(i18n.t('adminAuth.session_invalid'));
        } catch {
          toast.error('Admin session expired. Please sign in again.');
        }
        window.location.assign('/admin/login?reason=admin_session');
      }
    }
    return Promise.reject(error);
  },
);

/** Deduplicates overlapping checkSession calls (e.g. App + ProtectedLayout on first paint). */
let sessionCheckPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authHydrated: false,
  error: null,
  token: null,

  setUser: (patch: Partial<AuthUser>) => {
    set((state) => {
      if (!state.user) return { user: { ...patch } as AuthUser };
      return { user: { ...state.user, ...patch } };
    });
  },

  /**
   * @param opts If silent, do not set global isLoading (avoids unmounting BrowserRouter).
   */
  checkSession: async (opts?: CheckSessionOptions) => {
    const silent = Boolean(opts?.silent);
    if (typeof window !== 'undefined') {
      const path = window.location.pathname || '';
      if (path.startsWith('/admin')) {
        set({ user: null, isAuthenticated: false, isLoading: false, error: null, authHydrated: true, token: null });
        return;
      }
    }
    if (sessionCheckPromise) {
      return sessionCheckPromise;
    }
    const run = async () => {
      try {
        if (!silent) {
          set({ isLoading: true, error: null });
        }
        const response = await api.get('/auth/session', { timeout: API_TIMEOUT_MS_SESSION });
        const rawUser = response.data && typeof response.data === 'object' ? (response.data as { user?: unknown }).user : null;
        const u = parseAuthUserPayload(rawUser);
        set((state) => {
          const tokenNew = readTokenFromPayload(response.data);
          return {
            user: u,
            isAuthenticated: Boolean(u),
            isLoading: false,
            token: !u ? null : tokenNew !== null ? tokenNew : state.token,
          };
        });
      } catch (error: unknown) {
        const axiosError = isAxiosError(error) ? error : null;
        const status = axiosError?.response?.status;
        // 401 without cookie = guest; must not surface as a critical UI error.
        if (status === 401) {
          set({ user: null, isAuthenticated: false, isLoading: false, token: null, error: null });
        } else {
          const message =
            status && status >= 500
              ? readAxiosResponseMessage(
                  axiosError?.response,
                  'Não foi possível verificar sua sessão agora. Tente novamente.',
                )
              : null;
          set({ user: null, isAuthenticated: false, isLoading: false, token: null, error: message });
        }
      } finally {
        sessionCheckPromise = null;
        set({ authHydrated: true });
      }
    };
    sessionCheckPromise = run();
    return sessionCheckPromise;
  },

  login: async (identifier: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/auth/login', { identifier, password }, { timeout: API_TIMEOUT_MS_AUTH });
      const rawUser =
        response.data && typeof response.data === 'object'
          ? (response.data as { user?: unknown }).user
          : null;
      const user = parseAuthUserPayload(rawUser);
      const token = readTokenFromPayload(response.data);
      set({ user, isAuthenticated: Boolean(user), isLoading: false, token: token ?? null });
      return { success: true as const };
    } catch (error: unknown) {
      let fallback = 'Não foi possível entrar. Verifique os dados e tente novamente.';
      try {
        fallback = i18n.t('auth.login.errors.generic_fallback');
      } catch {
        /* keep default */
      }
      const message = isAxiosError(error) ? readAuthErrorMessage(error, fallback) : fallback;
      set({
        error: message,
        isLoading: false,
      });
      return {
        success: false as const,
        message: isAxiosError(error) ? readAuthErrorMessage(error) || undefined : undefined,
      };
    }
  },

  register: async (data: RegisterPayload) => {
    try {
      set({ isLoading: true, error: null });
      const response = await api.post('/auth/register', data, { timeout: API_TIMEOUT_MS_AUTH });
      const rawUser =
        response.data && typeof response.data === 'object'
          ? (response.data as { user?: unknown }).user
          : null;
      const user = parseAuthUserPayload(rawUser);
      const token = readTokenFromPayload(response.data);
      set({ user, isAuthenticated: Boolean(user), isLoading: false, token: token ?? null });
      return { success: true as const };
    } catch (error: unknown) {
      const firstError = isAxiosError(error) ? readRegisterFirstError(error.response) : null;
      const responseData = isAxiosError(error) ? error.response?.data : undefined;
      const rawMsg =
        firstError?.message ||
        (typeof responseData === 'object' && responseData !== null && 'message' in responseData
          ? String((responseData as { message?: unknown }).message || '')
          : '');
      const msgStr = typeof rawMsg === 'string' ? rawMsg : '';
      /** Never surface Prisma/engine stack text in the UI store. */
      const looksTechnical =
        /Invalid `prisma\.|PrismaClient|prisma\.|PANIC|Expected .* got .*invocation/i.test(msgStr);
      const safeMessage = looksTechnical
        ? 'auth.register.errors.registration_failed'
        : msgStr || 'auth.register.errors.registration_failed';
      let code: string | undefined =
        typeof responseData === 'object' && responseData !== null && 'code' in responseData
          ? String((responseData as { code?: unknown }).code || '')
          : undefined;
      if (!code) code = undefined;
      if (looksTechnical && !code) code = 'REGISTRATION_FAILED';
      set({
        error: safeMessage,
        isLoading: false,
      });
      return {
        success: false as const,
        message: safeMessage,
        code,
        fieldPath: firstError?.path,
        fieldMessage: firstError?.message,
      };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearWalletSessionClearedByUserFlag();
      set({ user: null, isAuthenticated: false, token: null });
    }
  },
}));
