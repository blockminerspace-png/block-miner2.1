import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore, api } from './auth';

function mockAxiosError(data: unknown, status = 500): AxiosError {
  const err = new AxiosError('mock failure');
  err.response = {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
  return err;
}

function mockRegisterAxiosError(data: unknown, status = 400): AxiosError {
  const err = new AxiosError('mock register failure');
  err.response = {
    data,
    status,
    statusText: 'Error',
    headers: {},
    config: {} as InternalAxiosRequestConfig,
  };
  return err;
}

describe('useAuthStore checkSession', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authHydrated: false,
      error: null,
      token: null,
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

  it('treats session 401 as logged out without surfacing a login error', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      mockAxiosError({ ok: false, code: 'UNAUTHENTICATED', message: 'Sessão expirada ou ausente.' }, 401),
    );
    vi.spyOn(api, 'post').mockRejectedValue(mockAxiosError({ ok: false, code: 'REFRESH_INVALID' }, 401));
    await useAuthStore.getState().checkSession({ silent: true });
    const s = useAuthStore.getState();
    expect(s.authHydrated).toBe(true);
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBe(null);
    expect(s.error).toBe(null);
  });

  it('recovers session via refresh when access cookie expired', async () => {
    vi.spyOn(api, 'get')
      .mockRejectedValueOnce(
        mockAxiosError({ ok: false, code: 'ACCESS_INVALID', message: 'Sessão expirada ou ausente.' }, 401),
      )
      .mockResolvedValueOnce({
        data: { user: { id: 2, name: 'Refreshed', username: 'r', email: 'r@e.com' } },
      });
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: { ok: true, user: { id: 2, name: 'Refreshed', username: 'r', email: 'r@e.com' } },
    });
    await useAuthStore.getState().checkSession({ silent: true });
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user?.id).toBe(2);
    expect(api.post).toHaveBeenCalledWith('/auth/refresh', {}, expect.any(Object));
  });

  it('surfaces a clean message for session 500 without authenticating', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      mockAxiosError({ ok: false, code: 'INTERNAL_ERROR', message: 'Não foi possível processar a autenticação agora.' }, 500),
    );
    await useAuthStore.getState().checkSession({ silent: true });
    const s = useAuthStore.getState();
    expect(s.authHydrated).toBe(true);
    expect(s.isAuthenticated).toBe(false);
    expect(s.error).toBe('Não foi possível processar a autenticação agora.');
  });
});

describe('useAuthStore register', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authHydrated: false,
      error: null,
      token: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets user and isAuthenticated on success', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({
      data: { user: { id: 7, name: 'U', username: 'u', email: 'u@gmail.com' } },
    });
    const payload = {
      username: 'validuser',
      email: 'u@gmail.com',
      password: 'password1',
      refCode: '',
      acceptTerms: true,
    };
    const out = await useAuthStore.getState().register(payload);
    expect(out).toEqual({ success: true });
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.user).toEqual({ id: 7, name: 'U', username: 'u', email: 'u@gmail.com' });
    expect(s.isLoading).toBe(false);
    expect(s.error).toBe(null);
    expect(api.post).toHaveBeenCalledWith('/auth/register', payload, expect.any(Object));
  });

  it('returns field metadata from validation errors array', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      mockRegisterAxiosError({
        code: 'VALIDATION_ERROR',
        errors: [{ path: 'email', message: 'Email already registered' }],
      }),
    );
    const out = await useAuthStore.getState().register({ username: 'a', email: 'b', password: 'c', acceptTerms: true });
    expect(out).toMatchObject({
      success: false,
      fieldPath: 'email',
      fieldMessage: 'Email already registered',
    });
    expect(useAuthStore.getState().error).toBe('Email already registered');
  });

  it('replaces Prisma-style messages with safe registration_failed key', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(
      mockRegisterAxiosError({
        message: 'Invalid `prisma.user.create()` invocation in engine',
      }),
    );
    const out = await useAuthStore.getState().register({ username: 'a', email: 'b', password: 'c', acceptTerms: true });
    expect(out).toMatchObject({
      success: false,
      message: 'auth.register.errors.registration_failed',
      code: 'REGISTRATION_FAILED',
    });
    expect(useAuthStore.getState().error).toBe('auth.register.errors.registration_failed');
  });
});
