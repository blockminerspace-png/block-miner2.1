import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

const navigateMock = vi.fn();
const checkSessionMock = vi.fn().mockResolvedValue(undefined);
const registerMock = vi.fn();

const authState = {
  register: (...args: unknown[]) => registerMock(...args),
  error: null as string | null,
  isLoading: false,
  isAuthenticated: false,
  checkSession: checkSessionMock,
};

vi.mock('../constants/turnstilePublic', () => ({
  resolveTurnstileSiteKeyRegister: () => '',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../store/auth', () => ({
  useAuthStore: () => authState,
}));

vi.mock('../components/BrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}));

vi.mock('../components/auth/SocialLoginButtons', () => ({
  default: () => <div data-testid="social-login" />,
}));

vi.mock('../components/SiteFooter', () => ({
  default: () => <footer data-testid="site-footer" />,
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
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

import Register from './Register';

function getRegisterForm() {
  return screen.getByTestId('register-main-form') as HTMLFormElement;
}

function renderRegister(initialPath = '/register') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Register />
    </MemoryRouter>,
  );
}

async function fillValidBasics() {
  fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'minerplayer' } });
  fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'miner@gmail.com' } });
  fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
  fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
}

describe('Register page', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    checkSessionMock.mockClear();
    registerMock.mockReset();
    toastError.mockClear();
    toastSuccess.mockClear();
    authState.error = null;
    authState.isLoading = false;
    authState.isAuthenticated = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders main fields and submit', () => {
    renderRegister();
    expect(screen.getByLabelText('auth.register.username_label')).toBeInTheDocument();
    expect(screen.getByLabelText('auth.register.email_label')).toBeInTheDocument();
    const form = getRegisterForm();
    expect(within(form).getByRole('button', { name: /auth\.register\.submit/i })).toBeInTheDocument();
  });

  it('shows referral banner when ref is in URL', () => {
    renderRegister('/register?ref=ABC12');
    expect(screen.getByText(/auth\.register\.referral_msg/i)).toBeInTheDocument();
  });

  it('rejects password mismatch via toast', async () => {
    renderRegister();
    await fillValidBasics();
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'otherpass1' } });
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.password_mismatch');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects username shorter than minimum', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'a@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.username_too_short');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects invalid username characters', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'bad name' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'a@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.username_invalid');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects empty email', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'validuser' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.email_invalid');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects invalid email shape', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'validuser' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.email_invalid');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects disallowed email provider', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'validuser' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.email_provider_not_allowed');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('rejects password shorter than minimum', async () => {
    renderRegister();
    fireEvent.change(screen.getByLabelText('auth.register.username_label'), { target: { value: 'validuser' } });
    fireEvent.change(screen.getByLabelText('auth.register.email_label'), { target: { value: 'u@gmail.com' } });
    fireEvent.change(screen.getByLabelText('auth.register.password_label'), { target: { value: 'short1' } });
    fireEvent.change(screen.getByLabelText('auth.register.confirm_password_label'), { target: { value: 'short1' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('auth.register.errors.password_min');
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('sets field error when terms not accepted', async () => {
    renderRegister();
    await fillValidBasics();
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(screen.getByText('validation.errors.termsRequired')).toBeInTheDocument();
    });
    expect(registerMock).not.toHaveBeenCalled();
  });

  it('calls register, checkSession, and navigates on success', async () => {
    registerMock.mockResolvedValue({ success: true });
    renderRegister();
    await fillValidBasics();
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'minerplayer',
          email: 'miner@gmail.com',
          password: 'password1',
          acceptTerms: true,
        }),
      );
    });
    expect(checkSessionMock).toHaveBeenCalledWith({ silent: true });
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows toast with message when register fails without usable i18n code', async () => {
    registerMock.mockResolvedValue({ success: false, message: 'Server said no' });
    renderRegister();
    await fillValidBasics();
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    const arg = toastError.mock.calls[0][0];
    expect(String(arg)).toContain('Server said no');
  });

  it('sets acceptTerms field error when API targets acceptTerms', async () => {
    registerMock.mockResolvedValue({
      success: false,
      fieldPath: 'acceptTerms',
      fieldMessage: 'validation.errors.termsRequired',
    });
    renderRegister();
    await fillValidBasics();
    fireEvent.click(screen.getByRole('checkbox', { name: /auth\.register\.termsConsent/i }));
    fireEvent.submit(getRegisterForm());
    await waitFor(() => {
      expect(screen.getByText('validation.errors.termsRequired')).toBeInTheDocument();
    });
  });

  it('redirects when already authenticated', () => {
    authState.isAuthenticated = true;
    renderRegister();
    expect(navigateMock).toHaveBeenCalledWith('/dashboard');
  });

  it('displays store error in alert when error is set', () => {
    authState.error = 'auth.register.errors.registration_failed';
    renderRegister();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('auth.register.errors.registration_failed');
  });
});
