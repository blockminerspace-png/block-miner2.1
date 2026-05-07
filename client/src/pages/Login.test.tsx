import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigateMock = vi.fn();
const checkSessionMock = vi.fn().mockResolvedValue(undefined);
const apiPostMock = vi.fn();

const authState = {
  error: null as string | null,
  isLoading: false,
  isAuthenticated: false,
  checkSession: checkSessionMock,
};

const locationRef: {
  state: { from?: { pathname?: string } } | null;
} = { state: null };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () =>
      ({
        pathname: '/login',
        state: locationRef.state,
        search: '',
        hash: '',
        key: 'default',
      }) as ReturnType<typeof actual.useLocation>,
  };
});

vi.mock('../store/auth', () => ({
  useAuthStore: () => authState,
  api: { post: (...args: unknown[]) => apiPostMock(...args), get: vi.fn() },
}));

vi.mock('../components/BrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

vi.mock('../components/auth/SocialLoginButtons', () => ({
  default: () => <div data-testid="social-login" />,
}));

vi.mock('../components/auth/TurnstileField', () => ({
  default: React.forwardRef((_props: unknown, ref: React.Ref<{ reset: () => void }>) => {
    React.useImperativeHandle(ref, () => ({ reset: vi.fn() }));
    return null;
  }),
  prefetchTurnstileScript: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { max?: number; defaultValue?: string }) => {
      if (opts && typeof opts.max === 'number') return `${key}__max_${opts.max}`;
      if (opts && typeof opts.defaultValue === 'string') return opts.defaultValue;
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

import Login from './Login';

function getLoginForm() {
  return screen.getByTestId('login-main-form') as HTMLFormElement;
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login page', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    checkSessionMock.mockClear();
    apiPostMock.mockReset();
    locationRef.state = null;
    authState.error = null;
    authState.isLoading = false;
    authState.isAuthenticated = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders identifier and password fields', () => {
    renderLogin();
    expect(screen.getByLabelText('auth.login.identifier_label')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.login.password_label')).toBeInTheDocument();
    const form = getLoginForm();
    expect(within(form).getByRole('button', { name: /auth\.login\.submit/i })).toBeInTheDocument();
  });

  it('blocks submit when identifier is empty after trim', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'secret12' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(screen.getByText('auth.login.validation.identifier_empty')).toBeInTheDocument();
    });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('blocks submit when password is empty', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'user@test.com' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(screen.getByText('auth.login.validation.password_empty')).toBeInTheDocument();
    });
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('submits clamped credentials and navigates on ok', async () => {
    apiPostMock.mockResolvedValue({ data: { ok: true } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), {
      target: { value: '  miner@GMAIL.com  ' },
    });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'correcthorse' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith(
        '/auth/login',
        expect.objectContaining({
          identifier: 'miner@GMAIL.com',
          password: 'correcthorse',
        }),
      );
    });
    expect(checkSessionMock).toHaveBeenCalledWith({ silent: true });
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('navigates to state.from when login ok', async () => {
    locationRef.state = { from: { pathname: '/wallet' } };
    apiPostMock.mockResolvedValue({ data: { ok: true } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'a@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'password12' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/wallet'));
  });

  it('enters 2FA step when API returns require2FA', async () => {
    apiPostMock.mockResolvedValue({ data: { require2FA: true } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'u@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'pass123456' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it('blocks 2FA submit until 6 digits', async () => {
    apiPostMock.mockResolvedValueOnce({ data: { require2FA: true } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'u@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'pass123456' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => expect(screen.getByPlaceholderText('000000')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '12' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(screen.getByText('auth.login.validation.two_factor_incomplete')).toBeInTheDocument();
    });
    expect(apiPostMock).toHaveBeenCalledTimes(1);
  });

  it('submits 2FA code and completes login', async () => {
    apiPostMock.mockResolvedValueOnce({ data: { require2FA: true } }).mockResolvedValueOnce({ data: { ok: true } });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'u@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'pass123456' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => expect(screen.getByPlaceholderText('000000')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(apiPostMock).toHaveBeenLastCalledWith(
        '/auth/login',
        expect.objectContaining({
          twoFactorToken: '123456',
        }),
      ),
    );
    expect(checkSessionMock).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('maps INVALID_CREDENTIALS to local error', async () => {
    apiPostMock.mockRejectedValue({
      response: { data: { code: 'INVALID_CREDENTIALS' } },
    });
    renderLogin();
    fireEvent.change(screen.getByLabelText('auth.login.identifier_label'), { target: { value: 'x@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.login.password_label'), { target: { value: 'wrongpass1' } });
    fireEvent.submit(getLoginForm());
    await waitFor(() => {
      expect(screen.getByText('auth.login.errors.invalid_credentials')).toBeInTheDocument();
    });
  });

  it('redirects when already authenticated', () => {
    authState.isAuthenticated = true;
    renderLogin();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });
});
