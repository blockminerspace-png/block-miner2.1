import { useState, useMemo } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, Lock, Mail, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { api } from '../store/auth';

export default function AdminLogin() {
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const sessionBanner = useMemo(
        () => searchParams.get('reason') === 'admin_session',
        [searchParams]
    );
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        // Autofill do browser preenche o DOM mas muitas vezes não atualiza o state React —
        // ler FormData no submit garante o valor real dos inputs.
        const form = e.currentTarget;
        const fd = new FormData(form);
        const emailVal = String(fd.get('email') ?? '').trim() || email.trim();
        const codeVal = String(fd.get('password') ?? '').trim() || password.trim();

        try {
            if (!emailVal || !codeVal) {
                setError(t('adminAuth.login_fields_required'));
                setIsLoading(false);
                return;
            }

            const res = await api.post(
                '/admin/auth/login',
                { email: emailVal, securityCode: codeVal, password: codeVal },
                { headers: { 'Content-Type': 'application/json' } }
            );
            if (res.data.ok) {
                navigate('/admin/dashboard');
            } else {
                setError(res.data.message || t('adminAuth.login_failed_generic'));
            }
        } catch (err) {
            const d = err.response?.data;
            const st = err.response?.status;
            if (d?.code === 'ADMIN_AUTH_NOT_CONFIGURED' || (st === 503 && String(d?.message || '').includes('Admin auth'))) {
                setError(t('adminAuth.auth_not_configured'));
            } else {
                setError(d?.message || t('adminAuth.login_failed_generic'));
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Dark administrative theme background */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/5 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-600/5 rounded-full blur-[120px]"></div>

            <div className="w-full max-w-[400px] relative z-10">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-xl shadow-amber-500/20">
                            <ShieldAlert className="text-white w-7 h-7" />
                        </div>
                        <span className="font-black text-2xl tracking-tighter text-white uppercase">Admin<span className="text-amber-500">Panel</span></span>
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-tight">{t('adminAuth.restricted_title')}</h1>
                    <p className="text-slate-500 text-sm font-medium mt-1">{t('adminAuth.restricted_subtitle')}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8 shadow-2xl">
                    {sessionBanner && (
                        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-amber-200/90 text-xs font-semibold leading-relaxed">
                                {t('adminAuth.session_banner')}
                            </p>
                        </div>
                    )}
                    {error && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-red-400 text-xs font-bold leading-relaxed">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                {t('adminAuth.email_label')}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-600 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="username"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-12 pr-4 py-4 border border-slate-800 rounded-2xl bg-slate-950 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all font-medium text-sm"
                                    placeholder="admin@blockminer.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                                {t('adminAuth.security_code_label')}
                            </label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-600 group-focus-within:text-amber-500 transition-colors" />
                                </div>
                                <input
                                    name="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-12 pr-4 py-4 border border-slate-800 rounded-2xl bg-slate-950 text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all font-medium text-sm"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-6 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    {t('adminAuth.submit')}
                                    <ChevronRight className="w-5 h-5" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center">
                    <Link to="/login" className="text-slate-600 hover:text-slate-400 text-xs font-bold uppercase tracking-[0.2em] transition-colors">
                        {t('adminAuth.back_to_user_area')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
