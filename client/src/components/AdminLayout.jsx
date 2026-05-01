import { useState, useEffect, Suspense } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, X } from 'lucide-react';
import AdminSidebar from '../components/AdminSidebar';
import { api } from '../store/auth';

export default function AdminLayout() {
    const { t } = useTranslation();
    const location = useLocation();
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(null);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        const checkAdminAuth = async () => {
            try {
                // Validates admin_session cookie with the server
                const res = await api.get('/admin/auth/check');
                setIsAdminAuthenticated(res.data.ok);
            } catch (err) {
                setIsAdminAuthenticated(false);
            }
        };
        checkAdminAuth();
    }, []);

    useEffect(() => {
        setMobileNavOpen(false);
    }, [location.pathname]);

    if (isAdminAuthenticated === null) {
        return (
            <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center px-4">
                <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (isAdminAuthenticated === false) {
        return <Navigate to="/admin/login" replace />;
    }

    return (
        <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] bg-slate-950 overflow-hidden text-slate-100 font-sans">
            {mobileNavOpen ? (
                <button
                    type="button"
                    className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] lg:hidden"
                    aria-label={t('adminLayout.close_menu')}
                    onClick={() => setMobileNavOpen(false)}
                />
            ) : null}
            <AdminSidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
            <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden w-full">
                <header className="h-16 sm:h-20 shrink-0 bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 sticky top-0 z-10 supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))]">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <button
                            type="button"
                            className="lg:hidden shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/80 p-2.5 text-slate-100 hover:bg-slate-700/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
                            aria-expanded={mobileNavOpen}
                            aria-controls="admin-main-nav"
                            aria-label={mobileNavOpen ? t('adminLayout.close_menu') : t('adminLayout.open_menu')}
                            onClick={() => setMobileNavOpen((open) => !open)}
                        >
                            {mobileNavOpen ? (
                                <X className="h-5 w-5" aria-hidden />
                            ) : (
                                <Menu className="h-5 w-5" aria-hidden />
                            )}
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-base sm:text-lg lg:text-xl font-black text-white tracking-tight uppercase truncate">
                                {t('adminLayout.title')}
                            </h1>
                            <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest truncate">
                                {t('adminLayout.subtitle')}
                            </p>
                        </div>
                    </div>
                </header>
                <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 flex flex-col supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 min-w-0">
                        <Suspense
                            fallback={
                                <div className="flex min-h-[40vh] items-center justify-center py-12" aria-busy="true">
                                    <div className="h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
                                </div>
                            }
                        >
                            <Outlet />
                        </Suspense>
                    </div>
                </main>
            </div>
        </div>
    );
}
