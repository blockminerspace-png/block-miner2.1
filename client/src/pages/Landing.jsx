import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Clock,
  Gift,
  Globe,
  Pickaxe,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  UserPlus,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import BrandLogo from '../components/BrandLogo';

const LAUNCH_DATE = new Date('2026-03-05T00:00:00.000Z');
const STAGGER = ['[animation-delay:0ms]', '[animation-delay:90ms]', '[animation-delay:180ms]', '[animation-delay:270ms]'];

function uptimeDays() {
  return Math.floor((Date.now() - LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
}

function FadeUp({ children, className = '', delayClass = STAGGER[0] }) {
  return (
    <div
      className={`opacity-0 motion-reduce:opacity-100 motion-reduce:translate-y-0 animate-fadeUp ${delayClass} ${className}`}
    >
      {children}
    </div>
  );
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-white/10 rounded-2xl overflow-hidden bg-[#0f1623]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left text-white font-semibold hover:bg-white/[0.04] transition-colors"
        aria-expanded={open}
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-6 pb-5 text-sm text-gray-400 leading-relaxed border-t border-white/[0.06]">
          <p className="pt-4">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [publicStats, setPublicStats] = useState(null);

  useEffect(() => {
    document.title = 'Block Miner — Simulated POL Mining Farm | blockminer.space';
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content =
      'Build your simulated cryptocurrency mining farm on Polygon (POL). Buy rigs, earn block rewards every ~10 minutes proportional to your hashrate, withdraw on-chain. Free to play — no guaranteed returns.';

    fetch('/api/public-stats')
      .then((r) => r.json())
      .then((data) => { if (data.ok) setPublicStats(data); })
      .catch(() => {});
  }, []);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const days = uptimeDays();

  const statsCards = [
    {
      icon: Users,
      label: t('landing.stats.users_label'),
      value: publicStats ? publicStats.users.toLocaleString() : '—',
      sub: t('landing.stats.users_sub'),
      accent: 'border-blue-500/30 bg-blue-950/60',
      iconColor: 'text-blue-400',
    },
    {
      icon: Wallet,
      label: t('landing.stats.withdrawn_label'),
      value: publicStats ? `${Number(publicStats.totalWithdrawn).toLocaleString(undefined, { maximumFractionDigits: 2 })} POL` : '—',
      sub: t('landing.stats.withdrawn_sub'),
      accent: 'border-emerald-500/30 bg-emerald-950/60',
      iconColor: 'text-emerald-400',
    },
    {
      icon: Clock,
      label: t('landing.stats.uptime_label'),
      value: `${days} dias`,
      sub: t('landing.stats.uptime_sub'),
      accent: 'border-violet-500/30 bg-violet-950/60',
      iconColor: 'text-violet-400',
    },
    {
      icon: Zap,
      label: t('landing.stats.miners_label'),
      value: publicStats ? publicStats.activeMiners.toLocaleString() : '—',
      sub: t('landing.stats.miners_sub'),
      accent: 'border-amber-500/30 bg-amber-950/60',
      iconColor: 'text-amber-400',
    },
  ];

  const featureCards = [
    { icon: Zap, titleKey: 'landing.features.f1_title', bodyKey: 'landing.features.f1_body', accent: 'from-amber-500/20 to-orange-500/10' },
    { icon: Wallet, titleKey: 'landing.features.f2_title', bodyKey: 'landing.features.f2_body', accent: 'from-emerald-500/20 to-teal-500/10' },
    { icon: Gift, titleKey: 'landing.features.f3_title', bodyKey: 'landing.features.f3_body', accent: 'from-pink-500/20 to-rose-500/10' },
    { icon: TrendingUp, titleKey: 'landing.features.f4_title', bodyKey: 'landing.features.f4_body', accent: 'from-violet-500/20 to-purple-500/10' },
    { icon: Shield, titleKey: 'landing.features.f5_title', bodyKey: 'landing.features.f5_body', accent: 'from-blue-500/20 to-cyan-500/10' },
    { icon: Sparkles, titleKey: 'landing.features.f6_title', bodyKey: 'landing.features.f6_body', accent: 'from-sky-500/20 to-primary/20' },
  ];

  const howSteps = [
    { num: '01', icon: UserPlus, titleKey: 'landing.how.step1_title', bodyKey: 'landing.how.step1_body' },
    { num: '02', icon: Pickaxe, titleKey: 'landing.how.step2_title', bodyKey: 'landing.how.step2_body' },
    { num: '03', icon: TrendingUp, titleKey: 'landing.how.step3_title', bodyKey: 'landing.how.step3_body' },
  ];

  const faqItems = [
    { qKey: 'landing.faq.q1', aKey: 'landing.faq.a1' },
    { qKey: 'landing.faq.q2', aKey: 'landing.faq.a2' },
    { qKey: 'landing.faq.q3', aKey: 'landing.faq.a3' },
    { qKey: 'landing.faq.q4', aKey: 'landing.faq.a4' },
  ];

  return (
    <div className="min-h-screen bg-background text-gray-100 font-sans overflow-x-hidden">
      {/* Animated ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.22),transparent_55%)]" />
        <div className="absolute top-1/4 -left-32 h-[420px] w-[420px] rounded-full bg-primary/20 blur-[100px] animate-blob motion-reduce:animate-none" />
        <div className="absolute bottom-0 right-[-120px] h-[480px] w-[480px] rounded-full bg-accent/18 blur-[110px] animate-blob-delay motion-reduce:animate-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[120px] animate-blob-slow motion-reduce:animate-none" />
        <div
          className="absolute inset-0 opacity-[0.12] motion-reduce:opacity-[0.08] animate-gridPulse"
          style={{
            backgroundImage: `linear-gradient(rgba(59,130,246,0.35) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59,130,246,0.35) 1px, transparent 1px)`,
            backgroundSize: '56px 56px',
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-20 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl sticky top-0">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="group flex items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Block Miner"
          >
            <BrandLogo variant="header" interactive />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
            >
              {t('landing.nav.login')}
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 text-sm font-semibold rounded-xl bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {t('landing.nav.register')}
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-20 sm:pb-28">
          <FadeUp delayClass={STAGGER[0]}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-xs sm:text-sm font-semibold text-sky-200/95 tracking-wide">
              <Globe className="w-4 h-4 shrink-0" aria-hidden />
              {t('landing.hero.badge')}
            </div>
          </FadeUp>

          <FadeUp delayClass={STAGGER[1]} className="mt-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.08] max-w-4xl">
              {t('landing.hero.title')}{' '}
              <span className="relative inline-block">
                <span className="relative z-10 bg-gradient-to-r from-sky-300 via-primary to-violet-400 bg-clip-text text-transparent">
                  {t('landing.hero.title_highlight')}
                </span>
                <span
                  className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/20 via-accent/20 to-cyan-500/20 blur-xl opacity-70"
                  aria-hidden
                />
              </span>
            </h1>
          </FadeUp>

          <FadeUp delayClass={STAGGER[2]} className="mt-7 max-w-2xl">
            <p className="text-lg sm:text-xl text-gray-400 leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
          </FadeUp>

          <FadeUp delayClass={STAGGER[3]} className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-white bg-gradient-to-r from-primary to-blue-500 shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Pickaxe className="w-5 h-5" aria-hidden />
              {t('landing.hero.cta_start')}
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-semibold text-gray-200 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 backdrop-blur-sm transition-all"
            >
              {t('landing.hero.cta_login')}
            </Link>
          </FadeUp>

          {/* Quick stats */}
          <FadeUp delayClass="[animation-delay:360ms]" className="mt-16 sm:mt-20">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {statsCards.map(({ label, value, sub, icon: Icon, accent, iconColor }) => (
                <div
                  key={label}
                  className={`group p-4 sm:p-5 rounded-2xl border ${accent} hover:brightness-110 transition-all duration-300`}
                >
                  <Icon className={`w-5 h-5 mb-3 ${iconColor} group-hover:scale-110 transition-transform`} aria-hidden />
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
                  <p className="text-xl sm:text-2xl font-black text-white mt-1">{value}</p>
                  <p className="text-[11px] text-gray-500 mt-1 leading-snug">{sub}</p>
                </div>
              ))}
            </div>
          </FadeUp>
        </section>

        {/* How It Works */}
        <section className="border-y border-white/[0.06] bg-surface/40 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <FadeUp>
              <h2 className="text-3xl sm:text-4xl font-bold text-white text-center">{t('landing.how.title')}</h2>
              <p className="text-center text-gray-400 mt-3 max-w-2xl mx-auto">{t('landing.how.subtitle')}</p>
            </FadeUp>
            <div className="mt-14 grid sm:grid-cols-3 gap-6 sm:gap-8">
              {howSteps.map(({ num, icon: StepIcon, titleKey, bodyKey }, idx) => (
                <FadeUp key={num} delayClass={STAGGER[idx % STAGGER.length]}>
                  <div className="relative flex flex-col items-center text-center gap-5 p-6 rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent hover:border-primary/30 transition-all duration-300">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                        <StepIcon className="w-7 h-7 text-primary" aria-hidden />
                      </div>
                      <span className="absolute -top-2 -right-3 text-xs font-black text-primary/60 bg-background px-1">{num}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{t(titleKey)}</h3>
                      <p className="mt-2 text-sm text-gray-400 leading-relaxed">{t(bodyKey)}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
          <FadeUp>
            <h2 className="text-3xl sm:text-4xl font-bold text-white text-center">{t('landing.features.title')}</h2>
            <p className="text-center text-gray-400 mt-3 max-w-2xl mx-auto">{t('landing.features.subtitle')}</p>
          </FadeUp>
          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {featureCards.map((card, i) => {
              const CardIcon = card.icon;
              return (
                <FadeUp key={card.titleKey} delayClass={STAGGER[i % STAGGER.length]}>
                  <article
                    className={`h-full p-6 sm:p-7 rounded-3xl border border-white/[0.08] bg-gradient-to-br ${card.accent} to-background/80 hover:border-white/20 hover:-translate-y-1 transition-all duration-300 shadow-lg shadow-black/20`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-black/30 border border-white/10 flex items-center justify-center mb-5">
                      <CardIcon className="w-6 h-6 text-sky-300" aria-hidden />
                    </div>
                    <h3 className="text-lg font-bold text-white">{t(card.titleKey)}</h3>
                    <p className="mt-3 text-sm text-gray-400 leading-relaxed">{t(card.bodyKey)}</p>
                  </article>
                </FadeUp>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-white/[0.06] bg-surface/40 backdrop-blur-sm">
          <div className="max-w-3xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <FadeUp>
              <h2 className="text-3xl sm:text-4xl font-bold text-white text-center">{t('landing.faq.title')}</h2>
            </FadeUp>
            <div className="mt-10 flex flex-col gap-3">
              {faqItems.map(({ qKey, aKey }) => (
                <FadeUp key={qKey} delayClass={STAGGER[0]}>
                  <FaqItem question={t(qKey)} answer={t(aKey)} />
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* CTA strip */}
        <section className="max-w-6xl mx-auto px-5 sm:px-8 py-20">
          <FadeUp>
            <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-background to-accent/10 p-10 sm:p-14 text-center">
              <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[140%] h-48 bg-gradient-to-b from-primary/25 to-transparent blur-3xl pointer-events-none motion-reduce:opacity-50" aria-hidden />
              <h2 className="relative text-2xl sm:text-3xl font-bold text-white">{t('landing.cta.title')}</h2>
              <p className="relative mt-3 text-gray-400 max-w-xl mx-auto">{t('landing.cta.subtitle')}</p>
              <div className="relative mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-8 py-3.5 rounded-2xl font-bold text-background bg-white hover:bg-gray-100 transition-colors"
                >
                  {t('landing.cta.register')}
                </Link>
                <a
                  href="https://polygonscan.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors"
                >
                  {t('landing.cta.explore')}
                  <Globe className="w-4 h-4" aria-hidden />
                </a>
              </div>
            </div>
          </FadeUp>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] bg-background/90 py-10 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Pickaxe className="w-4 h-4 text-primary/70" aria-hidden />
            <span>
              © {new Date().getFullYear()} {t('landing.footer.rights')} ·{' '}
              <span className="text-gray-400">blockminer.space</span>
            </span>
          </div>
          <p className="text-center sm:text-right max-w-md">
            {t('landing.footer.disclaimer')}
          </p>
        </div>
      </footer>
    </div>
  );
}
