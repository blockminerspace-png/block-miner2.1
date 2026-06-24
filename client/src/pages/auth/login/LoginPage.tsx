import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, api } from '../../../store/auth';
import { postAuthLogin } from './login.api';
import { responseRequiresTwoFactorStep } from './login.twoFactorUi';
import { isAxiosTimeoutError } from '../../../shared/utils/apiTimeout';
import { readAuthErrorMessage } from '../shared/auth.errors';
import {
  Mail,
  Lock,
  AlertCircle,
  Loader2,
  ChevronRight,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import AuthShell from '../../../shared/components/auth/AuthShell';
import SocialLoginButtons from '../../../shared/components/auth/SocialLoginButtons';
import TurnstileField, { prefetchTurnstileScript } from '../../../shared/components/auth/TurnstileField';
import { resolveTurnstileSiteKeyLogin } from '../../../constants/turnstilePublic';
import {
  clampLoginIdentifier,
  clampLoginPassword,
  normalizeTwoFactorInput,
  validateLoginIdentifierForSubmit,
  validateLoginPasswordForSubmit,
  validateTwoFactorForSubmit,
  validateLegacyNewPassword,
  safeInlineMessage,
  LOGIN_IDENTIFIER_MAX_LEN,
  LOGIN_PASSWORD_MAX_LEN,
  TWO_FACTOR_CODE_LEN,
} from '../../../shared/utils/authInputGuards';

const TURNSTILE_LOGIN_SITE_KEY = resolveTurnstileSiteKeyLogin();

type TurnstileRef = { reset: () => void } | null;

function isAxiosLikeError(err: unknown): err is { response?: { data?: Record<string, unknown> } } {
  return typeof err === 'object' && err !== null && 'response' in err;
}

export default function Login() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [localError, setLocalError] = useState('');
  const [cfTurnstileToken, setCfTurnstileToken] = useState('');
  const turnstileRef = useRef<TurnstileRef>(null);

  const [showLegacyReset, setShowLegacyReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [twoFactorChallengeToken, setTwoFactorChallengeToken] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'email' | 'other'>('email');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loginSubmitLockRef = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { error, isLoading, isAuthenticated, checkSession } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useLayoutEffect(() => {
    if (!TURNSTILE_LOGIN_SITE_KEY) return undefined;
    void prefetchTurnstileScript();
    return undefined;
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (requires2FA) {
      const tf = normalizeTwoFactorInput(twoFactorToken);
      const tfErr = validateTwoFactorForSubmit(tf);
      if (tfErr === 'incomplete') {
        setLocalError(t('auth.login.validation.two_factor_incomplete'));
        return;
      }
      if (tfErr === 'invalid') {
        setLocalError(t('auth.login.validation.two_factor_invalid'));
        return;
      }
    } else {
      const id = clampLoginIdentifier(identifier);
      const pw = clampLoginPassword(password);
      const idErr = validateLoginIdentifierForSubmit(id);
      if (idErr === 'empty') {
        setLocalError(t('auth.login.validation.identifier_empty'));
        return;
      }
      if (idErr === 'too_long') {
        setLocalError(t('auth.login.validation.identifier_too_long'));
        return;
      }
      if (idErr === 'invalid_chars') {
        setLocalError(t('auth.login.validation.identifier_invalid_chars'));
        return;
      }
      if (idErr === 'invalid_email') {
        setLocalError(t('auth.login.validation.identifier_invalid_email'));
        return;
      }
      const pwErr = validateLoginPasswordForSubmit(pw);
      if (pwErr === 'empty') {
        setLocalError(t('auth.login.validation.password_empty'));
        return;
      }
      if (pwErr === 'too_long') {
        setLocalError(t('auth.login.validation.password_too_long', { max: LOGIN_PASSWORD_MAX_LEN }));
        return;
      }
    }

    if (loginSubmitLockRef.current) return;
    loginSubmitLockRef.current = true;
    setIsSubmitting(true);
    try {
      const idPayload = clampLoginIdentifier(identifier);
      const pwPayload = clampLoginPassword(password);
      const res = await postAuthLogin({
        identifier: idPayload,
        password: pwPayload,
        twoFactorToken: requires2FA ? normalizeTwoFactorInput(twoFactorToken) : undefined,
        twoFactorChallengeToken: requires2FA && twoFactorChallengeToken ? twoFactorChallengeToken : undefined,
        cfTurnstileToken: cfTurnstileToken || undefined,
      });

      const data = res.data as {
        require2FA?: boolean;
        code?: string;
        twoFactorChallengeToken?: string;
        twoFactorMethod?: string;
        needsLegacyReset?: boolean;
        ok?: boolean;
      };

      if (responseRequiresTwoFactorStep(data)) {
        turnstileRef.current?.reset();
        const ch = typeof data.twoFactorChallengeToken === 'string' ? data.twoFactorChallengeToken : '';
        setTwoFactorChallengeToken(ch);
        setTwoFactorMethod(data.twoFactorMethod === 'email' ? 'email' : 'other');
        setRequires2FA(true);
        setLocalError('');
        if (data.twoFactorMethod === 'email') {
          toast.message(t('auth.login.two_factor_email_hint'));
        }
        return;
      }

      if (data.needsLegacyReset) {
        setShowLegacyReset(true);
        return;
      }

      if (data.ok) {
        setTwoFactorChallengeToken('');
        setRequires2FA(false);
        setTwoFactorMethod('email');
        await checkSession({ silent: true });
        const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
        navigate(from && from !== '/login' ? from : '/dashboard');
      }
    } catch (err: unknown) {
      if (isAxiosTimeoutError(err)) {
        setLocalError(t('auth.login.errors.request_timeout'));
        turnstileRef.current?.reset();
        return;
      }
      if (isAxiosLikeError(err)) {
        const body = err.response?.data as Record<string, unknown> | undefined;
        if (body && responseRequiresTwoFactorStep(body as { require2FA?: boolean; code?: string })) {
          turnstileRef.current?.reset();
          const ch = typeof body.twoFactorChallengeToken === 'string' ? body.twoFactorChallengeToken : '';
          setTwoFactorChallengeToken(ch);
          setTwoFactorMethod(body.twoFactorMethod === 'email' ? 'email' : 'other');
          setRequires2FA(true);
          setLocalError('');
          if (body.twoFactorMethod === 'email') {
            toast.message(t('auth.login.two_factor_email_hint'));
          }
          return;
        }
        if (body?.needsLegacyReset) {
          setShowLegacyReset(true);
          return;
        }
        const fieldErrorRaw = Array.isArray(body?.errors)
          ? (body?.errors as { message?: string }[])[0]?.message
          : undefined;
        const fieldError = typeof fieldErrorRaw === 'string' ? safeInlineMessage(fieldErrorRaw) : '';
        const code = typeof body?.code === 'string' ? body.code : '';
        const messageKey = typeof body?.messageKey === 'string' ? body.messageKey : '';
        const i18nSecurity =
          messageKey && messageKey.startsWith('errors.security.') ? t(messageKey) : null;

        const errorByCode: Record<string, string> = {
          IDENTIFIER_NOT_FOUND: t('auth.login.errors.invalid_credentials'),
          INVALID_CREDENTIALS: t('auth.login.errors.invalid_credentials'),
          INVALID_2FA: t('auth.login.errors.invalid_2fa'),
          INVALID_TWO_FACTOR_CODE: t('auth.login.errors.invalid_2fa'),
          INTERNAL_ERROR: t('auth.login.errors.internal_error'),
          SERVICE_UNAVAILABLE: t('auth.login.errors.service_unavailable'),
          INVALID_CSRF_TOKEN: t('errors.security.INVALID_CSRF_TOKEN'),
          EMAIL_2FA_UNAVAILABLE: t('auth.login.errors.email_2fa_unavailable'),
          TWO_FACTOR_CHALLENGE_REQUIRED: t('auth.login.errors.two_factor_challenge_required'),
          TWO_FACTOR_CODE_REQUIRED: t('auth.login.errors.two_factor_code_required'),
          ACCOUNT_DISABLED: t('auth.login.errors.account_disabled'),
          LOGIN_FAILED: t('auth.login.errors.generic_fallback'),
          ACCOUNT_LOCKED: t('errors.security.ACCOUNT_LOCKED'),
          RATE_LIMIT_EXCEEDED: t('errors.security.RATE_LIMIT_EXCEEDED'),
          CAPTCHA_REQUIRED: t('errors.security.CAPTCHA_REQUIRED'),
          CAPTCHA_FAILED: t('errors.security.CAPTCHA_FAILED'),
          USERNAME_NOT_SUPPORTED: t('auth.login.errors.username_not_supported'),
        };

        const fromApi = safeInlineMessage(readAuthErrorMessage(err, ''));
        setLocalError(
          fieldError ||
            i18nSecurity ||
            errorByCode[code] ||
            (fromApi.length > 0 ? fromApi : '') ||
            t('auth.login.errors.generic_fallback'),
        );
        turnstileRef.current?.reset();
      } else {
        setLocalError(readAuthErrorMessage(err, t('auth.login.errors.generic_fallback')));
        turnstileRef.current?.reset();
      }
    } finally {
      setIsSubmitting(false);
      loginSubmitLockRef.current = false;
    }
  };

  const handleLegacyReset = async (e: FormEvent) => {
    e.preventDefault();
    const np = clampLoginPassword(newPassword);
    const cp = clampLoginPassword(confirmPassword);
    if (np !== cp) {
      toast.error(t('auth.register.errors.password_mismatch'));
      return;
    }
    const v = validateLegacyNewPassword(np);
    if (v === 'empty' || v === 'too_short') {
      toast.error(t('auth.register.errors.password_min'));
      return;
    }
    if (v === 'too_long') {
      toast.error(t('auth.register.errors.password_max'));
      return;
    }

    try {
      setIsResetting(true);
      const res = await api.post('/auth/legacy-password-reset', {
        identifier: clampLoginIdentifier(identifier),
        newPassword: np,
      });
      const data = res.data as { ok?: boolean; message?: string };
      if (data.ok) {
        toast.success(data.message || t('common.success'));
        setShowLegacyReset(false);
        setPassword(np);
      }
    } catch (err: unknown) {
      const msg = isAxiosLikeError(err)
        ? String((err.response?.data as { message?: string })?.message || '')
        : '';
      toast.error(msg ? safeInlineMessage(msg) : t('auth.login.errors.generic_fallback'));
    } finally {
      setIsResetting(false);
    }
  };

  const displayError = safeInlineMessage(localError || error || '', 500);

  return (
    <AuthShell hideAuthCta="login">
      {showLegacyReset && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-surface border border-primary/30 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl shadow-primary/10">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto">
                <KeyRound className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                  Migração de Conta
                </h2>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                  Identificamos que sua conta é veterana. Para concluir sua migração com segurança, defina uma{' '}
                  <span className="text-white font-bold">nova senha</span> de acesso.
                </p>
              </div>

              <form onSubmit={handleLegacyReset} className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                    Nova Senha
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={LOGIN_PASSWORD_MAX_LEN}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(clampLoginPassword(e.target.value))}
                    className="w-full bg-background border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all"
                    placeholder={t('auth.register.errors.password_min')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
                    Confirmar Senha
                  </label>
                  <input
                    type="password"
                    required
                    maxLength={LOGIN_PASSWORD_MAX_LEN}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(clampLoginPassword(e.target.value))}
                    className="w-full bg-background border border-gray-800 rounded-2xl py-4 px-6 text-sm font-bold text-white focus:outline-none focus:border-primary/50 transition-all"
                    placeholder={t('auth.register.errors.password_mismatch')}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="w-full py-4 bg-primary text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {isResetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Atualizar e Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setShowLegacyReset(false)}
                  className="w-full text-center text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-2"
                >
                  Cancelar
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-[440px] relative z-10">
        <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <h1 className="font-black leading-[1.06] text-[clamp(1.75rem,3vw+0.6rem,2.75rem)]">
            <span className="block text-white">{t('auth.login.title')}</span>
            <span className="block bg-gradient-to-r from-sky-300 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              {t('auth.login.subtitle')}
            </span>
          </h1>
        </div>

        <div className="bg-slate-900/70 border border-white/10 backdrop-blur-xl rounded-[2.5rem] p-10 shadow-2xl shadow-black/40 animate-in fade-in zoom-in-95 duration-700 delay-200">
          {(error || localError) && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 animate-in shake duration-500">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs font-bold leading-relaxed">{displayError}</p>
            </div>
          )}

          <form data-testid="login-main-form" noValidate onSubmit={handleSubmit} className="space-y-6">
            {!requires2FA ? (
              <>
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                    htmlFor="identifier"
                  >
                    {t('auth.login.identifier_label')}
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="identifier"
                      type="email"
                      name="identifier"
                      required
                      maxLength={LOGIN_IDENTIFIER_MAX_LEN}
                      autoComplete="email"
                      value={identifier}
                      onChange={(e) => setIdentifier(clampLoginIdentifier(e.target.value))}
                      className="block w-full pl-12 pr-4 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                      placeholder={t('auth.login.identifier_placeholder')}
                    />
                  </div>
                  <p className="text-[10px] text-gray-600 px-1">
                    {t('auth.login.validation.hint_identifier_max', { max: LOGIN_IDENTIFIER_MAX_LEN })}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label
                      className="text-[10px] font-bold text-gray-500 uppercase tracking-widest"
                      htmlFor="password"
                    >
                      {t('auth.login.password_label')}
                    </label>
                    <Link
                      to="/forgot-password"
                      className="text-[10px] font-bold text-primary hover:text-white transition-colors uppercase tracking-widest"
                    >
                      {t('auth.login.forgot_password')}
                    </Link>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      maxLength={LOGIN_PASSWORD_MAX_LEN}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(clampLoginPassword(e.target.value))}
                      className="block w-full pl-12 pr-12 py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-600 hover:text-gray-400 transition-colors"
                      aria-label={showPassword ? t('auth.register.hide_password') : t('auth.register.show_password')}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600 px-1">
                    {t('auth.login.validation.hint_password_max', { max: LOGIN_PASSWORD_MAX_LEN })}
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="flex justify-center mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                    <ShieldCheck className="w-8 h-8 text-primary" />
                  </div>
                </div>
                <div className="text-center mb-6">
                  <h3 className="text-white font-bold text-lg">{t('auth.login.two_factor_title')}</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {twoFactorMethod === 'email'
                      ? t('auth.login.two_factor_subtitle_email')
                      : t('auth.login.two_factor_subtitle_other')}
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  name="twoFactorToken"
                  required
                  maxLength={TWO_FACTOR_CODE_LEN}
                  autoComplete="one-time-code"
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(normalizeTwoFactorInput(e.target.value))}
                  className="block w-full text-center tracking-[0.5em] font-mono text-2xl py-4 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium"
                  placeholder="000000"
                />
                <button
                  type="button"
                  onClick={() => {
                    setRequires2FA(false);
                    setTwoFactorChallengeToken('');
                    setTwoFactorMethod('email');
                    setLocalError('');
                    turnstileRef.current?.reset();
                  }}
                  className="w-full text-center text-xs text-gray-500 hover:text-white transition-colors"
                >
                  Voltar
                </button>
              </div>
            )}

            {TURNSTILE_LOGIN_SITE_KEY ? (
              <TurnstileField ref={turnstileRef} siteKey={TURNSTILE_LOGIN_SITE_KEY} onToken={setCfTurnstileToken} />
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isSubmitting || isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {t('auth.login.submit')}
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {!requires2FA && (
            <>
              <SocialLoginButtons />
              <div className="mt-4 text-center">
                <p className="text-gray-500 text-xs font-medium">
                  {t('auth.login.no_account')}{' '}
                  <Link
                    to="/register"
                    className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest"
                  >
                    {t('auth.login.register_now')}
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>

        <div className="mt-8 text-center animate-in fade-in duration-1000 delay-500">
          <Link
            to="/"
            className="text-gray-600 hover:text-gray-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
          >
            {t('common.back')}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
