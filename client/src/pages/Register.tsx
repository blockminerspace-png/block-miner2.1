import { useState, useEffect, useLayoutEffect, useRef, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { Mail, User, AlertCircle, Loader2, ChevronRight, Eye, EyeOff, Gift } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import SocialLoginButtons from '../components/auth/SocialLoginButtons';
import TurnstileField, { prefetchTurnstileScript } from '../components/auth/TurnstileField';
import { resolveTurnstileSiteKeyRegister } from '../constants/turnstilePublic';
import SiteFooter from '../components/SiteFooter';
import {
  REGISTER_USERNAME_MIN,
  REGISTER_USERNAME_MAX,
  REGISTER_EMAIL_MAX_LEN,
  REGISTER_PASSWORD_MIN_LEN,
  REGISTER_PASSWORD_MAX_LEN,
  REGISTER_REF_CODE_MAX_LEN,
} from '../constants/registerFieldLimits';
import { isRegisterAllowedEmailDomain } from '../utils/registerAllowedEmailDomains';
import {
  clipRefCodeFromQuery,
  sanitizeRegisterUsername,
  sanitizeRegisterEmail,
  sanitizeRegisterPassword,
  sanitizeRegisterRefCode,
  validateUsernameShape,
  validateEmailShape,
  safeInlineMessage,
} from '../utils/registerInputGuards';

const FIELD_MAX_LEN: Record<string, number> = {
  username: REGISTER_USERNAME_MAX,
  email: REGISTER_EMAIL_MAX_LEN,
  password: REGISTER_PASSWORD_MAX_LEN,
  confirmPassword: REGISTER_PASSWORD_MAX_LEN,
  refCode: REGISTER_REF_CODE_MAX_LEN,
};

const TURNSTILE_REGISTER_SITE_KEY = resolveTurnstileSiteKeyRegister();

type TurnstileRef = { reset: () => void } | null;

type RegisterFormState = {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  refCode: string;
  acceptTerms: boolean;
};

export default function Register() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState<RegisterFormState>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    refCode: clipRefCodeFromQuery(searchParams.get('ref')),
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [cfTurnstileToken, setCfTurnstileToken] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const termsCheckboxRef = useRef<HTMLInputElement | null>(null);
  const turnstileRef = useRef<TurnstileRef>(null);
  const navigate = useNavigate();
  const { register, error, isLoading, isAuthenticated, checkSession } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  useLayoutEffect(() => {
    if (!TURNSTILE_REGISTER_SITE_KEY) return undefined;
    void prefetchTurnstileScript();
    return undefined;
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { id, value, type, checked } = e.target;
    let next: string | boolean = type === 'checkbox' ? checked : value;

    if (type !== 'checkbox' && typeof next === 'string' && FIELD_MAX_LEN[id]) {
      if (id === 'username') next = sanitizeRegisterUsername(next);
      else if (id === 'email') next = sanitizeRegisterEmail(next);
      else if (id === 'password' || id === 'confirmPassword') next = sanitizeRegisterPassword(next);
      else if (id === 'refCode') next = sanitizeRegisterRefCode(next);
      else next = String(next).slice(0, FIELD_MAX_LEN[id] ?? 512);
    }

    setFormData((prev) => ({ ...prev, [id]: next }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const focusTermsCheckbox = () => {
    window.requestAnimationFrame(() => {
      termsCheckboxRef.current?.focus();
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const pw = sanitizeRegisterPassword(formData.password);
    const cpw = sanitizeRegisterPassword(formData.confirmPassword);
    if (pw !== cpw) {
      toast.error(t('auth.register.errors.password_mismatch'));
      return;
    }

    const u = sanitizeRegisterUsername(formData.username);
    if (u.length < REGISTER_USERNAME_MIN) {
      toast.error(t('auth.register.errors.username_too_short'));
      return;
    }
    if (u.length > REGISTER_USERNAME_MAX) {
      toast.error(t('auth.register.errors.username_too_long'));
      return;
    }
    if (!validateUsernameShape(u)) {
      toast.error(t('auth.register.errors.username_invalid'));
      return;
    }

    const em = sanitizeRegisterEmail(formData.email);
    if (!em || em.length > REGISTER_EMAIL_MAX_LEN) {
      toast.error(t(em ? 'auth.register.errors.email_too_long' : 'auth.register.errors.email_invalid'));
      return;
    }
    if (!validateEmailShape(em)) {
      toast.error(t('auth.register.errors.email_invalid'));
      return;
    }
    if (!isRegisterAllowedEmailDomain(em)) {
      toast.error(t('auth.register.errors.email_provider_not_allowed'));
      return;
    }

    if (pw.length < REGISTER_PASSWORD_MIN_LEN) {
      toast.error(t('auth.register.errors.password_min'));
      return;
    }
    if (pw.length > REGISTER_PASSWORD_MAX_LEN) {
      toast.error(t('auth.register.errors.password_max'));
      return;
    }

    const ref = sanitizeRegisterRefCode(formData.refCode);
    if (ref && (ref.length > REGISTER_REF_CODE_MAX_LEN || !/^[a-zA-Z0-9]+$/.test(ref))) {
      toast.error(t('auth.register.errors.ref_code_invalid'));
      return;
    }

    if (!formData.acceptTerms) {
      setFieldErrors({ acceptTerms: t('validation.errors.termsRequired') });
      focusTermsCheckbox();
      return;
    }

    const result = await register({
      username: u,
      email: em,
      password: pw,
      refCode: ref,
      acceptTerms: formData.acceptTerms,
      cfTurnstileToken: cfTurnstileToken || undefined,
    });

    if (!result.success) {
      if (result.fieldPath === 'acceptTerms') {
        setFieldErrors({
          acceptTerms: t(String(result.fieldMessage || 'validation.errors.termsRequired')),
        });
        focusTermsCheckbox();
        return;
      }

      const codeKey = result.code ? `auth.register.errors.${String(result.code).toLowerCase()}` : '';
      const translated = codeKey && codeKey !== 'auth.register.errors.' ? t(codeKey) : '';
      const looksMissingI18n = translated === codeKey || translated.startsWith('auth.register.errors.');
      if (translated && !looksMissingI18n) {
        toast.error(translated);
      } else if (result.message) {
        const raw = String(result.message);
        toast.error(safeInlineMessage(t(raw, { defaultValue: raw })));
      }
      turnstileRef.current?.reset();
      return;
    }

    await checkSession({ silent: true });
    navigate('/dashboard');
  };

  const displayStoreError = error ? safeInlineMessage(t(error, { defaultValue: error })) : '';

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse delay-700" />

        <div className="w-full max-w-[480px] relative z-10">
          <div className="text-center mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex justify-center mb-6">
              <BrandLogo variant="auth" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.register.title')}</h1>
            <p className="text-gray-500 font-medium mt-1">{t('auth.register.subtitle')}</p>
          </div>

          <div className="bg-surface/95 border border-gray-800/70 rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-700 delay-200">
            {error && (
              <div
                className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3"
                role="alert"
              >
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-400 text-xs font-bold leading-relaxed">{displayStoreError}</p>
              </div>
            )}

            {formData.refCode && (
              <div className="mb-8 p-3 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-3">
                <Gift className="w-4 h-4 text-primary shrink-0" />
                <p className="text-primary text-[11px] font-bold uppercase tracking-wider">
                  {t('auth.register.referral_msg', { code: safeInlineMessage(formData.refCode, REGISTER_REF_CODE_MAX_LEN) })}
                </p>
              </div>
            )}

            <form data-testid="register-main-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                  htmlFor="username"
                >
                  {t('auth.register.username_label')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    required
                    minLength={REGISTER_USERNAME_MIN}
                    maxLength={REGISTER_USERNAME_MAX}
                    autoComplete="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                    placeholder={t('auth.register.username_placeholder')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                  htmlFor="email"
                >
                  {t('auth.register.email_label')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    maxLength={REGISTER_EMAIL_MAX_LEN}
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full pl-12 pr-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                    placeholder={t('auth.register.email_placeholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                    htmlFor="password"
                  >
                    {t('auth.register.password_label')}
                  </label>
                  <div className="relative group">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={REGISTER_PASSWORD_MIN_LEN}
                      maxLength={REGISTER_PASSWORD_MAX_LEN}
                      autoComplete="new-password"
                      value={formData.password}
                      onChange={handleChange}
                      className="block w-full px-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                      placeholder={t('auth.register.password_placeholder')}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label
                    className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                    htmlFor="confirmPassword"
                  >
                    {t('auth.register.confirm_password_label')}
                  </label>
                  <div className="relative group">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={REGISTER_PASSWORD_MIN_LEN}
                      maxLength={REGISTER_PASSWORD_MAX_LEN}
                      autoComplete="new-password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="block w-full px-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm"
                      placeholder={t('auth.register.password_placeholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="flex items-center gap-2 text-[10px] font-bold text-gray-500 hover:text-primary transition-colors uppercase tracking-widest"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {showPassword ? t('auth.register.hide_password') : t('auth.register.show_password')}
                </button>
              </div>

              <div className="space-y-2">
                <label
                  className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1"
                  htmlFor="refCode"
                >
                  {t('auth.register.referral_label')}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Gift className="h-5 w-5 text-gray-600 group-focus-within:text-primary transition-colors" />
                  </div>
                  <input
                    id="refCode"
                    name="refCode"
                    type="text"
                    maxLength={REGISTER_REF_CODE_MAX_LEN}
                    value={formData.refCode}
                    onChange={handleChange}
                    readOnly={Boolean(searchParams.get('ref'))}
                    className={`block w-full pl-12 pr-4 py-3.5 border border-gray-800 rounded-2xl bg-background/50 text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-4 focus:ring-primary/5 focus:border-primary/50 transition-all font-medium text-sm ${searchParams.get('ref') ? 'opacity-70 cursor-default' : ''}`}
                    placeholder={t('auth.register.referral_placeholder')}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-background/40 p-4">
                <div className="flex items-start gap-3">
                  <input
                    ref={termsCheckboxRef}
                    id="acceptTerms"
                    name="acceptTerms"
                    type="checkbox"
                    checked={formData.acceptTerms}
                    onChange={handleChange}
                    className="mt-1 h-4 w-4 rounded border-gray-700 bg-slate-950 text-primary focus:ring-2 focus:ring-primary/40"
                    aria-invalid={fieldErrors.acceptTerms ? 'true' : 'false'}
                    aria-describedby={fieldErrors.acceptTerms ? 'acceptTerms-error' : 'acceptTerms-hint'}
                  />
                  <div className="space-y-2">
                    <label htmlFor="acceptTerms" className="text-sm font-medium leading-6 text-slate-200">
                      {t('auth.register.termsConsent.prefix')}{' '}
                      <Link
                        className="font-bold text-sky-400 underline underline-offset-4 hover:text-sky-300"
                        to="/terms-of-use"
                      >
                        {t('auth.register.termsConsent.linkLabel')}
                      </Link>
                      .
                    </label>
                    <p id="acceptTerms-hint" className="text-xs leading-5 text-slate-400">
                      {t('auth.register.termsConsent.helpText')}
                    </p>
                    {fieldErrors.acceptTerms && (
                      <p id="acceptTerms-error" role="alert" className="text-xs font-semibold text-red-400">
                        {fieldErrors.acceptTerms}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {TURNSTILE_REGISTER_SITE_KEY ? (
                <TurnstileField ref={turnstileRef} siteKey={TURNSTILE_REGISTER_SITE_KEY} onToken={setCfTurnstileToken} />
              ) : null}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    {t('auth.register.submit')}
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <SocialLoginButtons />

            <div className="mt-4 text-center">
              <p className="text-gray-500 text-xs font-medium">
                {t('auth.register.already_have_account')}{' '}
                <Link
                  to="/login"
                  className="text-primary hover:text-white font-black transition-colors ml-1 uppercase tracking-widest"
                >
                  {t('auth.register.login_now')}
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-8 text-center animate-in fade-in duration-1000 delay-500">
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.1em] max-w-[300px] mx-auto leading-relaxed">
              {t('auth.register.privacyDisclosure')}
            </p>
          </div>
        </div>
      </div>
      <SiteFooter compact />
    </div>
  );
}
