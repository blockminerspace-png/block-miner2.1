import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Coins,
  Gamepad2,
  Gift,
  Globe,
  Moon,
  Pickaxe,
  Play,
  Star,
  Sun,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Youtube,
  Zap,
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import BrandLogo from '../components/BrandLogo';
import SiteFooter from '../components/SiteFooter';
import { normalizeExternalUrl } from '../components/CommunityShortcuts';
import { formatHashrate } from '../utils/machine';
import { persistUtmParams, trackLandingEvent, initMetaPixel } from '../utils/landingAnalytics';
import { useLandingScrollDepth } from '../hooks/useLandingScrollDepth';

const LAUNCH_DATE = new Date('2026-03-05T00:00:00.000Z');
const EXAMPLE_POL_USD = 0.2;
const HS_PER_ACTIVE_RIG = 4000;
const MIN_NETWORK_HS = 800_000;
const STATS_POLL_MS = 30_000;
const THEME_KEY = 'blockminer-landing-theme';

function uptimeDays() {
  return Math.floor((Date.now() - LAUNCH_DATE.getTime()) / (1000 * 60 * 60 * 24));
}

function estimateNetworkHashRate(publicStats) {
  const rigs = publicStats?.activeMiners;
  if (typeof rigs === 'number' && rigs > 0) {
    return Math.max(rigs * HS_PER_ACTIVE_RIG, MIN_NETWORK_HS);
  }
  return MIN_NETWORK_HS;
}

function useInViewOnce() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return undefined;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);
  return [ref, visible];
}

function useCountUp(end, enabled, decimals = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!enabled || !Number.isFinite(end)) return undefined;
    let start = null;
    const from = 0;
    const dur = 1100;
    let raf = 0;
    const tick = (now) => {
      if (start == null) start = now;
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - (1 - t) ** 3;
      const next = from + (end - from) * eased;
      setV(decimals > 0 ? Number(next.toFixed(decimals)) : Math.floor(next));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, enabled, decimals]);
  return v;
}

const HERO_DIAMONDS = [
  { top: '4%', left: '2%', size: 52, rot: 14 },
  { top: '18%', left: '8%', size: 36, rot: -10 },
  { top: '8%', right: '6%', size: 44, rot: 22 },
  { top: '28%', right: '2%', size: 28, rot: -18 },
  { bottom: '22%', left: '4%', size: 40, rot: 8 },
  { bottom: '12%', left: '14%', size: 24, rot: -25 },
  { bottom: '18%', right: '8%', size: 48, rot: 16 },
  { bottom: '8%', right: '3%', size: 32, rot: -8 },
];

function HeroBackdrop({ light }) {
  const tileCls = light
    ? 'rounded-lg border border-slate-400/25 bg-slate-500/[0.06]'
    : 'rounded-lg border border-sky-400/20 bg-sky-500/[0.07]';
  const glowCls = light
    ? 'bg-[radial-gradient(ellipse_at_center,rgba(14,165,233,0.14),transparent_72%)]'
    : 'bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.32),transparent_70%)]';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className={`absolute left-1/2 top-[32%] h-[min(55vh,480px)] w-[min(95vw,760px)] -translate-x-1/2 -translate-y-1/2 ${glowCls}`}
      />
      {HERO_DIAMONDS.map((d, i) => (
        <div
          key={i}
          className={`absolute ${tileCls}`}
          style={{
            top: d.top,
            bottom: d.bottom,
            left: d.left,
            right: d.right,
            width: d.size,
            height: d.size,
            transform: `rotate(${d.rot}deg)`,
            opacity: light ? 0.45 : 0.85,
          }}
        />
      ))}
    </div>
  );
}

function FaqItem({ id, question, answer, light }) {
  const [open, setOpen] = useState(false);
  const card = light
    ? 'rounded-[1.75rem] border border-slate-200 bg-white shadow-sm overflow-hidden'
    : 'rounded-[1.75rem] border border-white/10 bg-slate-950/80 overflow-hidden';
  const btn = light
    ? 'text-slate-900 hover:bg-slate-50'
    : 'text-white hover:bg-white/5';
  const panel = light
    ? 'text-slate-600 border-slate-200'
    : 'text-slate-300 border-white/10';
  return (
    <div className={card}>
      <button
        type="button"
        id={`${id}-btn`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-4 px-6 py-5 text-left font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${btn}`}
      >
        <span>{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={`${id}-panel`}
          role="region"
          aria-labelledby={`${id}-btn`}
          className={`px-6 pb-6 text-sm leading-relaxed border-t ${panel}`}
        >
          {answer}
        </div>
      ) : null}
    </div>
  );
}

function LanguageSwitch({ shellClass = 'border-white/10 bg-slate-950/80', activeDark = true }) {
  const { t, i18n } = useTranslation();
  const raw = i18n.resolvedLanguage || i18n.language || 'en';
  const active = raw.startsWith('pt') ? 'pt-BR' : raw.startsWith('es') ? 'es' : 'en';
  const activeCls = activeDark
    ? 'bg-white/15 text-white'
    : 'bg-sky-600 text-white';
  const idleCls = activeDark ? 'text-slate-500 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800';
  const globeCls = activeDark ? 'text-slate-400' : 'text-slate-500';
  const btn = (code, label) => (
    <button
      key={code}
      type="button"
      onClick={() => {
        if (active !== code) {
          trackLandingEvent('language_switch', { from_language: active, to_language: code });
        }
        void i18n.changeLanguage(code);
      }}
      className={`min-h-[44px] min-w-[44px] rounded-full px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 motion-safe:active:scale-[0.98] ${
        active === code ? activeCls : idleCls
      }`}
    >
      {label}
    </button>
  );
  return null;
}

function LandingThemeSwitch({ light, onToggle, shellClass, activeDark }) {
  const { t } = useTranslation();
  const onCls = activeDark ? 'bg-white/15 text-white' : 'bg-sky-600 text-white';
  const offCls = activeDark ? 'text-slate-500 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800';
  return (
    <div className={`flex items-center gap-0.5 rounded-full border p-0.5 ${shellClass}`} role="group" aria-label={t('landing.footer.theme_aria')}>
      <button
        type="button"
        aria-pressed={!light}
        onClick={() => onToggle(false)}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          !light ? onCls : offCls
        }`}
      >
        <span className="inline-flex items-center gap-1">
          <Moon className="w-3.5 h-3.5" aria-hidden />
          {t('landing.footer.theme_dark')}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={light}
        onClick={() => onToggle(true)}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
          light ? onCls : offCls
        }`}
      >
        <span className="inline-flex items-center gap-1">
          <Sun className="w-3.5 h-3.5" aria-hidden />
          {t('landing.footer.theme_light')}
        </span>
      </button>
    </div>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const [publicStats, setPublicStats] = useState(null);
  const [light, setLight] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(THEME_KEY) === 'light';
    } catch {
      return false;
    }
  });

  const loadStats = useCallback(() => {
    fetch('/api/public-stats')
      .then((res) => res.json())
      .then((data) => (data.ok ? setPublicStats(data) : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    const id = window.setInterval(loadStats, STATS_POLL_MS);
    return () => window.clearInterval(id);
  }, [loadStats]);

  useLandingScrollDepth();

  useEffect(() => {
    persistUtmParams(location.search);
  }, [location.search]);

  useEffect(() => {
    initMetaPixel();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
    } catch {
      /* ignore */
    }
  }, [light]);

  const networkHs = useMemo(() => estimateNetworkHashRate(publicStats), [publicStats]);
  const faqItems = useMemo(
    () => [
      { id: 'faq1', qKey: 'landing.faq.q1', aKey: 'landing.faq.a1' },
      { id: 'faq2', qKey: 'landing.faq.q2', aKey: 'landing.faq.a2' },
      { id: 'faq3', qKey: 'landing.faq.q3', aKey: 'landing.faq.a3' },
      { id: 'faq4', qKey: 'landing.faq.q4', aKey: 'landing.faq.a4' },
      { id: 'faq5', qKey: 'landing.faq.q5', aKey: 'landing.faq.a5' },
    ],
    [],
  );

  useEffect(() => {
    document.title = t('landing.meta.title');
    const setMeta = (name, content) => {
      let m = document.querySelector(`meta[name="${name}"]`);
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', name);
        document.head.appendChild(m);
      }
      m.setAttribute('content', content);
    };
    const setOg = (prop, content) => {
      let m = document.querySelector(`meta[property="${prop}"]`);
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('property', prop);
        document.head.appendChild(m);
      }
      m.setAttribute('content', content);
    };
    const desc = t('landing.meta.description');
    setMeta('description', desc);
    setOg('og:title', t('landing.meta.title'));
    setOg('og:description', desc);
    setOg('og:type', 'website');
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://blockminer.space';
    setOg('og:url', `${origin}/`);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', t('landing.meta.title'));
    setMeta('twitter:description', desc);

    const canonical = `${origin}/`;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: t(item.qKey),
        acceptedAnswer: { '@type': 'Answer', text: t(item.aKey) },
      })),
    };
    const orgLd = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Block Miner',
      url: origin,
    };
    const siteLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Block Miner',
      url: origin,
    };
    const appLd = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Block Miner',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Web',
      description: desc,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      url: origin,
    };
    const payload = [orgLd, siteLd, appLd, faqLd];
    let script = document.querySelector('script[data-landing-jsonld]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-landing-jsonld', '1');
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(payload);
    return () => {
      document.querySelector('script[data-landing-jsonld]')?.remove();
    };
  }, [t, i18n.language, faqItems]);

  const [statsRef, statsVisible] = useInViewOnce();
  const days = uptimeDays();
  const usersEnd = typeof publicStats?.users === 'number' ? publicStats.users : 0;
  const minersEnd = typeof publicStats?.activeMiners === 'number' ? publicStats.activeMiners : 0;
  const withdrawnEnd = typeof publicStats?.totalWithdrawn === 'number' ? publicStats.totalWithdrawn : 0;
  const usersShown = useCountUp(usersEnd, statsVisible && usersEnd > 0, 0);
  const minersShown = useCountUp(minersEnd, statsVisible && minersEnd > 0, 0);
  const withdrawnShown = useCountUp(withdrawnEnd, statsVisible && withdrawnEnd > 0, 2);

  const discordUrl =
    normalizeExternalUrl(import.meta.env.VITE_DISCORD_URL) || 'https://discord.gg/7Ge9vd8E';
  const telegramUrl =
    normalizeExternalUrl(import.meta.env.VITE_TELEGRAM_URL) || 'https://t.me/+KPgyUFtKCZ00Y2Vh';
  const twitterUrl = normalizeExternalUrl(import.meta.env.VITE_TWITTER_URL);
  const youtubeUrl = normalizeExternalUrl(import.meta.env.VITE_YOUTUBE_URL);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const skin = light
    ? {
        page: 'relative min-h-screen overflow-x-hidden bg-slate-50 text-slate-900',
        header: 'border-slate-200 bg-white/95 text-slate-900',
        navLink: 'text-slate-600 hover:text-slate-900',
        badge: 'border-slate-200 bg-white text-slate-600 shadow-sm',
        dot: 'bg-emerald-500',
        h1: 'text-slate-900',
        body: 'text-slate-600',
        sectionMuted: 'border-slate-200 bg-slate-100',
        card: 'rounded-[1.75rem] border border-slate-200 bg-white shadow-md',
        cardSoft: 'rounded-[2rem] border border-slate-200 bg-slate-50 shadow-sm',
        iconBubble: 'bg-sky-500/15 text-sky-600',
        borderSubtle: 'border-slate-200',
        footer: 'border-slate-200 bg-slate-100 text-slate-600',
        socialChip: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
        decoGrid: 'opacity-[0.12]',
        langShell: 'border-slate-200 bg-white',
        footerBar: 'border-slate-200',
        trustCard: 'border-slate-200 bg-white',
        statValue: 'text-slate-900',
        statSub: 'text-slate-500',
      }
    : {
        page: 'relative min-h-screen overflow-x-hidden bg-[#020511] text-slate-100',
        header: 'border-white/10 bg-[#02070f]/95 text-slate-100',
        navLink: 'text-slate-300 hover:text-white',
        badge: 'border-white/10 bg-slate-900/70 text-slate-300',
        dot: 'bg-emerald-400',
        h1: 'text-white',
        body: 'text-slate-300',
        sectionMuted: 'border-white/10 bg-[#08101c]',
        card: 'rounded-[1.75rem] border border-white/10 bg-slate-950/80 shadow-xl shadow-slate-950/20',
        cardSoft: 'rounded-[2rem] border border-white/10 bg-[#0b1728] shadow-xl shadow-slate-950/20',
        iconBubble: 'bg-slate-900/90 text-sky-400',
        borderSubtle: 'border-white/10',
        footer: 'border-white/10 bg-[#02070f] text-slate-500',
        socialChip: 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10',
        decoGrid: 'opacity-20',
        langShell: 'border-white/10 bg-slate-950/80',
        footerBar: 'border-white/10',
        trustCard: 'border-white/10 bg-slate-950/70',
        statValue: 'text-white',
        statSub: 'text-slate-400',
      };

  const featureCards = [
    { icon: Zap, titleKey: 'landing.features.f1_title', bodyKey: 'landing.features.f1_body' },
    { icon: Coins, titleKey: 'landing.features.f2_title', bodyKey: 'landing.features.f2_body' },
    { icon: Gamepad2, titleKey: 'landing.features.f3_title', bodyKey: 'landing.features.f3_body' },
    { icon: Gift, titleKey: 'landing.features.f4_title', bodyKey: 'landing.features.f4_body' },
    { icon: Users, titleKey: 'landing.features.f5_title', bodyKey: 'landing.features.f5_body' },
    { icon: Wallet, titleKey: 'landing.features.f6_title', bodyKey: 'landing.features.f6_body' },
  ];

  const howSteps = [
    { icon: UserPlus, titleKey: 'landing.how.step1_title', bodyKey: 'landing.how.step1_body' },
    { icon: Pickaxe, titleKey: 'landing.how.step2_title', bodyKey: 'landing.how.step2_body' },
    { icon: TrendingUp, titleKey: 'landing.how.step3_title', bodyKey: 'landing.how.step3_body' },
  ];

  const gradientBtn =
    'motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02] inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-8 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-500/30 motion-safe:hover:shadow-[0_0_36px_rgba(59,130,246,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 motion-reduce:hover:scale-100';

  const outlineBtn =
    'inline-flex min-h-[44px] items-center justify-center rounded-full border px-8 py-3.5 text-sm font-semibold motion-safe:transition-transform motion-safe:duration-200 motion-safe:hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 motion-reduce:hover:scale-100';

  return (
    <div className={skin.page}>
      <a
        href="#main-content"
        className="absolute left-4 top-0 z-[100] -translate-y-full rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-transform focus:translate-y-4 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
      >
        {t('landing.skip')}
      </a>

      <div className="pointer-events-none fixed inset-0 opacity-90">
        <div
          className={`absolute inset-0 bg-gradient-to-b ${light ? 'from-slate-100 via-white to-slate-100' : 'from-slate-950 via-slate-950 to-[#060a12]'}`}
        />
        <div className="absolute inset-x-0 top-0 h-[38vh] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.16),transparent_50%)]" />
        {!light && (
          <div
            className={`absolute inset-x-0 bottom-0 top-[46vh] ${skin.decoGrid}`}
            style={{
              backgroundImage: `linear-gradient(rgba(56,189,248,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.14) 1px, transparent 1px)`,
              backgroundSize: '56px 56px',
            }}
          />
        )}
      </div>

      <header
        className={`relative z-10 border-b backdrop-blur-xl sticky top-0 ${skin.header} ${skin.borderSubtle}`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label={t('landing.nav.brand_aria')}>
            <BrandLogo variant="header" interactive />
          </Link>
        </div>
      </header>

      <main id="main-content" className="relative z-10">
        <section className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-12 pb-16 sm:pt-16 sm:pb-24">
          <HeroBackdrop light={light} />
          <div className="relative z-[1] flex flex-col items-center text-center">
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs uppercase tracking-[0.22em] ${skin.badge}`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${skin.dot} motion-safe:animate-pulse motion-reduce:animate-none`}
                aria-hidden
              />
              {t('landing.hero.badge')}
            </div>
            <h1 className="mt-8 max-w-[22ch] font-black leading-[1.08] sm:max-w-4xl text-[clamp(1.85rem,4.2vw+0.85rem,3.65rem)] lg:text-[clamp(2.35rem,3.8vw+1rem,4rem)]">
              <span className={`block ${skin.h1}`}>{t('landing.hero.headline_line1')}</span>
              <span className="block bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
                {t('landing.hero.headline_highlight')}
              </span>
              <span className={`block ${skin.h1}`}>{t('landing.hero.headline_line2')}</span>
            </h1>
            <p className={`mt-5 max-w-2xl text-base leading-relaxed sm:text-lg ${skin.body}`}>
              {t('landing.hero.subheadline_before')}
              <strong className={light ? 'font-semibold text-slate-900' : 'font-semibold text-white'}>
                {t('landing.hero.subheadline_emphasis')}
              </strong>
              {t('landing.hero.subheadline_after')}
            </p>
            <div className="mt-9 flex w-full max-w-lg flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Link
                to="/register"
                className={`${gradientBtn} w-full sm:w-auto`}
                aria-label={t('landing.hero.cta_primary')}
                onClick={() => trackLandingEvent('landing_cta_click', { cta_id: 'hero_primary', destination: '/register' })}
              >
                {t('landing.hero.cta_primary')}
                <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
              </Link>
              <Link
                to="/login"
                className={`${outlineBtn} w-full sm:w-auto ${light ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50' : 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'}`}
                aria-label={t('landing.hero.cta_secondary')}
                onClick={() => trackLandingEvent('landing_cta_click', { cta_id: 'hero_secondary', destination: '/login' })}
              >
                {t('landing.hero.cta_secondary')}
              </Link>
            </div>
            <div className="mt-12 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
              {[
                {
                  label: t('landing.hero.trust_miners'),
                  value: publicStats ? publicStats.activeMiners.toLocaleString() : '—',
                },
                {
                  label: t('landing.hero.trust_paid'),
                  value: publicStats
                    ? `${Number(publicStats.totalWithdrawn).toLocaleString(undefined, { maximumFractionDigits: 0 })} POL`
                    : '—',
                },
                {
                  label: t('landing.hero.trust_rating'),
                  value: (
                    <span className="inline-flex items-center gap-1 text-amber-400" aria-label={t('landing.hero.trust_stars_aria')}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" aria-hidden />
                      ))}
                    </span>
                  ),
                },
              ].map((row) => (
                <div key={row.label} className={`rounded-2xl border px-4 py-3 text-center sm:text-left ${skin.trustCard}`}>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">{row.label}</p>
                  <p className="mt-1 flex justify-center text-lg font-bold text-sky-500 sm:justify-start">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className={`border-y py-16 sm:py-24 ${skin.sectionMuted} ${skin.borderSubtle}`}>
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="text-center mb-12">
              <p className="text-sm uppercase tracking-[0.28em] text-sky-500">{t('landing.how.kicker')}</p>
              <h2 className={`mt-3 text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.how.title')}</h2>
              <p className={`mt-3 max-w-2xl mx-auto ${skin.body}`}>{t('landing.how.subtitle')}</p>
            </div>
            <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
              {howSteps.map(({ icon: StepIcon, titleKey, bodyKey }, idx) => (
                <div key={titleKey} className="contents md:contents">
                  <div className={`flex h-full flex-col p-8 ${skin.cardSoft}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-sm font-black text-white">
                        {idx + 1}
                      </span>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${skin.iconBubble}`}>
                        <StepIcon className="h-6 w-6" aria-hidden />
                      </div>
                    </div>
                    <h3 className={`mt-5 text-xl font-semibold ${skin.h1}`}>{t(titleKey)}</h3>
                    <p className={`mt-3 text-sm leading-relaxed ${skin.body}`}>{t(bodyKey)}</p>
                  </div>
                  {idx < howSteps.length - 1 ? (
                    <div className="hidden md:flex items-center justify-center text-sky-500/60" aria-hidden>
                      <ChevronRight className="h-8 w-8" />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-14">
            <p className="text-sm uppercase tracking-[0.28em] text-sky-500">{t('landing.features.kicker')}</p>
            <h2 className={`mt-3 text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.features.title')}</h2>
            <p className={`mt-3 max-w-2xl mx-auto ${skin.body}`}>{t('landing.features.subtitle')}</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featureCards.map((card) => (
              <div
                key={card.titleKey}
                className={`${skin.card} p-8 transition-transform duration-200 hover:-translate-y-1 hover:shadow-xl`}
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/30 to-violet-600/30 ${skin.iconBubble}`}
                >
                  <card.icon className="h-7 w-7" aria-hidden />
                </div>
                <h3 className={`mt-6 text-lg font-semibold ${skin.h1}`}>{t(card.titleKey)}</h3>
                <p className={`mt-3 text-sm leading-relaxed ${skin.body}`}>{t(card.bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="community"
          ref={statsRef}
          className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24"
        >
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.community.title')}</h2>
            <p className={`mt-3 ${skin.body}`}>{t('landing.community.subtitle')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Users,
                label: t('landing.stats.users_label'),
                value: publicStats ? usersShown.toLocaleString() : '—',
                sub: t('landing.stats.users_sub'),
                color: 'bg-sky-500/15 text-sky-300',
              },
              {
                icon: Wallet,
                label: t('landing.stats.withdrawn_label'),
                value: publicStats
                  ? `${withdrawnShown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} POL`
                  : '—',
                sub: t('landing.stats.withdrawn_sub'),
                color: 'bg-emerald-500/15 text-emerald-300',
              },
              {
                icon: Clock,
                label: t('landing.stats.uptime_label'),
                value: t('landing.stats.uptime_value', { count: days }),
                sub: t('landing.stats.uptime_sub'),
                color: 'bg-violet-500/15 text-violet-300',
              },
              {
                icon: Zap,
                label: t('landing.stats.miners_label'),
                value: publicStats ? minersShown.toLocaleString() : '—',
                sub: t('landing.stats.miners_sub'),
                color: 'bg-amber-500/15 text-amber-300',
              },
              {
                icon: Pickaxe,
                label: t('landing.stats.network_label'),
                value: formatHashrate(networkHs),
                sub: t('landing.stats.network_sub'),
                color: 'bg-cyan-500/15 text-cyan-300',
              },
              {
                icon: CalendarDays,
                label: t('landing.stats.activity_label'),
                value: t('landing.stats.activity_value'),
                sub: t('landing.stats.activity_sub'),
                color: 'bg-fuchsia-500/15 text-fuchsia-300',
              },
            ].map((row) => (
              <div key={row.label} className={`${skin.card} p-6`}>
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${row.color}`}>
                  <row.icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-4 text-[11px] uppercase tracking-[0.2em] text-slate-500">{row.label}</p>
                <p className={`mt-2 text-2xl font-black sm:text-3xl ${skin.statValue}`}>{row.value}</p>
                <p className={`mt-2 text-sm ${skin.statSub}`}>{row.sub}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={`border-y py-16 sm:py-24 ${skin.sectionMuted} ${skin.borderSubtle}`}>
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 className={`text-center text-3xl font-black sm:text-4xl ${skin.h1}`}>
              {t('landing.testimonials.title')}
            </h2>
            <p className="mt-2 text-center text-xs text-slate-500">{t('landing.testimonials.disclaimer')}</p>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {[
                {
                  name: t('landing.testimonials.t1_name'),
                  loc: t('landing.testimonials.t1_loc'),
                  text: t('landing.testimonials.t1_text'),
                },
                {
                  name: t('landing.testimonials.t2_name'),
                  loc: t('landing.testimonials.t2_loc'),
                  text: t('landing.testimonials.t2_text'),
                },
                {
                  name: t('landing.testimonials.t3_name'),
                  loc: t('landing.testimonials.t3_loc'),
                  text: t('landing.testimonials.t3_text'),
                },
              ].map((item) => (
                <figure key={item.name} className={`${skin.card} p-8`}>
                  <div className="flex items-center gap-1 text-amber-400" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <blockquote className={`mt-4 text-sm leading-relaxed ${skin.body}`}>“{item.text}”</blockquote>
                  <figcaption className={`mt-6 text-sm font-semibold ${skin.h1}`}>
                    {item.name}
                    <span className="block text-xs font-normal text-slate-500">{item.loc}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="games" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <h2 className={`text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.games.title')}</h2>
            <p className={`mt-3 max-w-2xl mx-auto ${skin.body}`}>{t('landing.games.subtitle')}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                title: t('landing.games.g1_name'),
                desc: t('landing.games.g1_desc'),
                gradient: 'from-cyan-500/40 to-sky-600/30',
              },
              {
                title: t('landing.games.g2_name'),
                desc: t('landing.games.g2_desc'),
                gradient: 'from-violet-500/40 to-fuchsia-600/30',
              },
              {
                title: t('landing.games.g3_name'),
                desc: t('landing.games.g3_desc'),
                gradient: 'from-amber-500/35 to-orange-600/30',
              },
            ].map((g) => (
              <div key={g.title} className={`${skin.card} overflow-hidden p-0`}>
                <div className={`h-36 bg-gradient-to-br ${g.gradient} flex items-center justify-center`}>
                  <Gamepad2 className="h-14 w-14 text-white/90" aria-hidden />
                </div>
                <div className="p-6">
                  <h3 className={`text-lg font-semibold ${skin.h1}`}>{g.title}</h3>
                  <p className={`mt-2 text-sm ${skin.body}`}>{g.desc}</p>
                  <p className="mt-2 text-xs text-slate-500">{t('landing.games.login_hint')}</p>
                  <Link
                    to="/games"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-400 hover:text-sky-300"
                  >
                    <Play className="h-4 w-4" aria-hidden />
                    {t('landing.games.cta')}
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/games"
              className="inline-flex items-center gap-2 text-sm font-bold text-sky-400 hover:underline"
            >
              {t('landing.games.view_all')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className={`py-16 sm:py-20 ${skin.sectionMuted} ${skin.borderSubtle} border-y`}>
          <div className="mx-auto max-w-6xl px-5 sm:px-8 text-center">
            <h2 className={`text-2xl font-black sm:text-3xl ${skin.h1}`}>{t('landing.crypto.title')}</h2>
            <p className={`mt-3 max-w-2xl mx-auto text-sm ${skin.body}`}>{t('landing.crypto.subtitle')}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              {['POL', 'BTC', 'ETH', 'USDC'].map((sym) => (
                <div
                  key={sym}
                  className={`rounded-2xl border px-6 py-3 text-sm font-bold tracking-wide ${skin.borderSubtle} ${sym === 'POL' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-500'}`}
                >
                  {sym}
                  {sym !== 'POL' ? (
                    <span className="ml-2 text-[10px] font-normal uppercase">{t('landing.crypto.soon')}</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-500">{t('landing.crypto.more')}</p>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-10">
            <p className="text-sm uppercase tracking-[0.28em] text-sky-500">{t('landing.faq.title')}</p>
            <h2 className={`mt-3 text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.faq.heading')}</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {faqItems.map((item) => (
              <FaqItem key={item.id} id={item.id} question={t(item.qKey)} answer={t(item.aKey)} light={light} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-16 sm:pb-24">
          <div
            className={`rounded-[2rem] border p-10 sm:p-14 text-center ${light ? 'border-slate-200 bg-gradient-to-br from-sky-500/15 to-violet-600/15' : 'border-white/10 bg-gradient-to-br from-sky-500/20 to-violet-900/30'}`}
          >
            <h2 className={`text-3xl font-black sm:text-4xl ${skin.h1}`}>{t('landing.final_cta.title')}</h2>
            <p className={`mt-4 max-w-xl mx-auto ${skin.body}`}>{t('landing.final_cta.subtitle')}</p>
            <ul className="mt-6 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-4 text-sm text-slate-400">
              <li>✓ {t('landing.final_cta.bullet1')}</li>
              <li>✓ {t('landing.final_cta.bullet2')}</li>
              <li>✓ {t('landing.final_cta.bullet3')}</li>
            </ul>
            <Link
              to="/register"
              className={`${gradientBtn} mt-8`}
              onClick={() => trackLandingEvent('landing_cta_click', { cta_id: 'final_cta_register', destination: '/register' })}
            >
              {t('landing.final_cta.primary')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className={`relative z-10 border-t py-14 px-5 sm:px-8 ${skin.footer} ${skin.borderSubtle}`}>
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <BrandLogo variant="header" interactive />
            <p className={`mt-4 text-sm ${skin.body}`}>{t('landing.footer.tagline')}</p>
            <p className="mt-3 text-xs text-slate-500">{t('landing.footer.disclaimer')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${skin.socialChip}`}
              >
                {t('landing.footer.social_discord')}
              </a>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${skin.socialChip}`}
              >
                {t('landing.footer.social_telegram')}
              </a>
              {twitterUrl ? (
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${skin.socialChip}`}
                >
                  {t('landing.footer.social_twitter')}
                </a>
              ) : null}
              {youtubeUrl ? (
                <a
                  href={youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold ${skin.socialChip}`}
                >
                  <Youtube className="h-3.5 w-3.5" aria-hidden />
                  {t('landing.footer.social_youtube')}
                </a>
              ) : null}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('landing.footer.col_product')}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <a href="#how-it-works" className="hover:text-sky-400">
                  {t('landing.footer.link_how')}
                </a>
              </li>
              <li>
                <Link to="/games" className="hover:text-sky-400">
                  {t('landing.footer.link_games')}
                </Link>
              </li>
              <li>
                <Link to="/calculator" className="hover:text-sky-400">
                  {t('landing.footer.link_calc')}
                </Link>
              </li>
              <li>
                <Link to="/transparency" className="hover:text-sky-400">
                  {t('landing.footer.link_transparency')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('landing.footer.col_company')}</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link to="/roadmap" className="hover:text-sky-400">
                  {t('landing.footer.link_roadmap')}
                </Link>
              </li>
              <li>
                <Link to="/manual" className="hover:text-sky-400">
                  {t('landing.footer.link_manual')}
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-sky-400">
                  {t('landing.nav.register')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('landing.footer.col_legal')}</p>
            <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <Link to="/terms-of-use" className="hover:text-sky-400">
                  {t('legal.footer.termsOfUse')}
                  </Link>
                </li>
                <li>
                  <Link to="/privacy-policy" className="hover:text-sky-400">
                  {t('legal.footer.privacyPolicy')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        <div className={`mx-auto mt-12 flex max-w-6xl flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between ${skin.footerBar}`}>
          <p className="text-sm">{t('landing.footer.copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
      <SiteFooter compact />
    </div>
  );
}
