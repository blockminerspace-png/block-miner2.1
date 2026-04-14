import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore, api } from './auth';

describe('useAuthStore checkSession', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authHydrated: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks authHydrated after silent session success without forcing isLoading true', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { user: { id: 1, name: 'Test', username: 't', email: 't@e.com' } },
    });
    await useAuthStore.getState().checkSession({ silent: true });
    const s = useAuthStore.getState();
    expect(s.authHydrated).toBe(true);
    expect(s.isAuthenticated).toBe(true);
    expect(s.isLoading).toBe(false);
  });

  it('sets isAuthenticated false when session returns no user', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { user: null } });
    await useAuthStore.getState().checkSession({ silent: true });
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBe(null);
    expect(s.authHydrated).toBe(true);
  });

  it('marks authHydrated after session error', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('network'));
    await useAuthStore.getState().checkSession({ silent: true });
    expect(useAuthStore.getState().authHydrated).toBe(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
