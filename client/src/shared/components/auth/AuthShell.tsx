import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import SiteFooter from '../SiteFooter';
import FloatingPublicSupport from '../../../components/FloatingPublicSupport/FloatingPublicSupport';

type AuthShellProps = {
  children: ReactNode;
  /** Visually hide the matching auth CTA in the header (e.g. hide "Login" on /login). */
  hideAuthCta?: 'login' | 'register';
};

/**
 * Shared chrome for /login and /register so they inherit the landing page's
 * background, header, footer and atmosphere. The page content (form card,
 * h1, etc.) is passed via children.
 */
export default function AuthShell({ children, hideAuthCta }: AuthShellProps) {
  const { t } = useTranslation();
  const location = useLocation();

  // Anchors on landing — if user is already on /, useHashLink behaviour is enough.
  // Otherwise, navigate to landing and let the browser jump to the anchor.
  const anchor = (hash: string) => (location.pathname === '/' ? `#${hash}` : `/#${hash}`);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020511] text-slate-100 flex flex-col">
      {/* Animated background — mirrors LandingPage */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-[#020511] to-[#060a14]" />
        <div className="absolute -top-64 -left-64 h-[500px] w-[500px] rounded-full bg-blue-600/8 blur-3xl animate-blob" />
        <div className="absolute top-1/3 -right-48 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl animate-blob-slow" />
        <div className="absolute -bottom-48 left-1/4 h-80 w-80 rounded-full bg-cyan-500/6 blur-3xl animate-blob-delay" />
        <div className="absolute inset-x-0 top-0 h-[55vh] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.10),transparent_60%)]" />
        <div
          className="absolute inset-0 animate-gridPulse"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.07) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#020511] to-transparent" />
      </div>

      {/* Header — mirrors LandingPage */}
      <header className="relative z-20 border-b border-white/[0.07] bg-[#02070f]/90 backdrop-blur-xl sticky top-0">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3 group" aria-label={t('landing.nav.brand_aria')}>
            <BrandLogo variant="header" interactive />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm" aria-label="Navegação principal">
            <Link to={anchor('how-it-works')} className="text-slate-400 hover:text-white transition-colors duration-150">
              {t('landing.footer.link_how')}
            </Link>
            <Link to={anchor('features')} className="text-slate-400 hover:text-white transition-colors duration-150">
              Features
            </Link>
            <Link to={anchor('faq')} className="text-slate-400 hover:text-white transition-colors duration-150">
              FAQ
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {hideAuthCta !== 'login' && (
              <Link
                to="/login"
                className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition-colors duration-150 px-4 py-2 rounded-full hover:bg-white/5"
              >
                {t('landing.nav.login')}
              </Link>
            )}
            {hideAuthCta !== 'register' && (
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 hover:bg-sky-400 px-4 py-2 text-sm font-bold text-white transition-all duration-150 shadow-lg shadow-sky-500/30 hover:shadow-sky-400/40 hover:scale-[1.02]"
              >
                {t('landing.nav.register')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        {children}
      </main>

      <div className="relative z-10">
        <SiteFooter compact />
      </div>

      <FloatingPublicSupport />
    </div>
  );
}
