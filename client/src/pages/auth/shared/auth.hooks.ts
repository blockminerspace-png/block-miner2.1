import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../../../store/auth';

/** Single façade for auth state + actions (Zustand store). */
export function useAuthSession() {
  return useAuthStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      authHydrated: s.authHydrated,
      error: s.error,
      token: s.token,
      checkSession: s.checkSession,
      login: s.login,
      register: s.register,
      logout: s.logout,
      setUser: s.setUser,
    })),
  );
}
