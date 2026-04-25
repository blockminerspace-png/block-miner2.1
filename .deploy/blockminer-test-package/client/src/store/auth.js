import { create } from 'zustand';
import axios from 'axios';
import { toast } from 'sonner';
import i18n from '../i18n/config.js';
import { generateSecurityPayload } from '../utils/security';
import { clearWalletSessionClearedByUserFlag } from '../utils/walletSessionPreference.js';

// Configure default axios behavior for our API
export const api = axios.create({
    baseURL: '/api',
    withCredentials: true, // Need this to send cookies
    xsrfCookieName: 'blockminer_csrf',
    xsrfHeaderName: 'x-csrf-token',
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
    '/wallet/deposit',
    '/wallet/deposit/submit',
    '/wallet/withdraw',
    '/wallet/blk/convert',
    '/wallet/btcpay/invoice',
    '/internal-offerwall/',
];

api.interceptors.request.use((config) => {
    // We only attach this for state-changing or critical requests, 
    // but attaching it everywhere is safer and simpler.
    try {
        const security = generateSecurityPayload();
        config.headers['X-Anti-Bot-Payload'] = security.fingerprint;
        config.headers['X-Anti-Bot-Key'] = security.sk;
        config.headers['X-Anti-Bot'] = security.isBot ? '1' : '0';
    } catch (e) {
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
}, (error) => {
    return Promise.reject(error);
});

let adminSessionRedirectScheduled = false;

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const url = String(error.config?.url || '');
        const code = error.response?.data?.code;
        const msg = String(error.response?.data?.message || '').toLowerCase();
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
    }
);

/** Deduplicates overlapping checkSession calls (e.g. App + ProtectedLayout on first paint). */
let sessionCheckPromise = null;

export const useAuthStore = create((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    /** After first session resolution; App must not block the router on later checks. */
    authHydrated: false,
    error: null,

    /**
     * @param {{ silent?: boolean }} [opts] If silent, do not set global isLoading (avoids unmounting BrowserRouter).
     */
    checkSession: async (opts) => {
        const silent = Boolean(opts && opts.silent);
        if (typeof window !== 'undefined') {
            const path = window.location.pathname || '';
            if (path.startsWith('/admin')) {
                set({ user: null, isAuthenticated: false, isLoading: false, error: null, authHydrated: true });
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
                const response = await api.get('/auth/session', { timeout: 20000 });
                const u = response.data?.user ?? null;
                set({
                    user: u,
                    isAuthenticated: Boolean(u),
                    isLoading: false,
                });
            } catch {
                set({ user: null, isAuthenticated: false, isLoading: false });
            } finally {
                sessionCheckPromise = null;
                set({ authHydrated: true });
            }
        };
        sessionCheckPromise = run();
        return sessionCheckPromise;
    },

    login: async (identifier, password) => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.post('/auth/login', { identifier, password });
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (error) {
            set({
                error: error.response?.data?.message || 'Erro ao realizar login',
                isLoading: false
            });
            return { success: false, message: error.response?.data?.message };
        }
    },

    register: async (data) => {
        try {
            set({ isLoading: true, error: null });
            const response = await api.post('/auth/register', data);
            set({ user: response.data.user, isAuthenticated: true, isLoading: false });
            return { success: true };
        } catch (error) {
            const firstError = error.response?.data?.errors?.[0];
            const code = error.response?.data?.code;
            set({
                error: firstError?.message || error.response?.data?.message || 'Registration failed.',
                isLoading: false
            });
            return {
                success: false,
                message: firstError?.message || error.response?.data?.message,
                code,
                fieldPath: firstError?.path,
                fieldMessage: firstError?.message
            };
        }
    },

    logout: async () => {
        try {
            await api.post('/auth/logout');
        } finally {
            clearWalletSessionClearedByUserFlag();
            set({ user: null, isAuthenticated: false });
        }
    }
}));
