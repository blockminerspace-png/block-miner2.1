import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SiteFooter from './SiteFooter';
import { useSeoMeta } from '../hooks/useSeoMeta';

function SectionBody({ paragraphs, bullets }) {
  return (
    <div className="space-y-4 text-[15px] leading-[1.75] text-slate-300 md:text-base md:leading-8">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-pretty">
          {paragraph}
        </p>
      ))}
      {bullets && bullets.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 marker:text-sky-400/90">
          {bullets.map((item, index) => (
            <li key={index} className="text-pretty pl-1">
              {item}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Long-form legal page: sticky TOC, reading progress, print-friendly body.
 */
export default function LegalDocumentPage({
  canonicalPath,
  metaTitleKey,
  metaDescriptionKey,
  eyebrowKey,
  titleKey,
  introKey,
  sectionIds,
  sectionsTranslationPrefix,
}) {
  const { t } = useTranslation();
  const mainRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useSeoMeta({
    title: t(metaTitleKey),
    description: t(metaDescriptionKey),
    canonicalPath,
  });

  const onScroll = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(100, Math.round((scrollTop / max) * 100)) : 0;
    setProgress(p);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    const t = window.setTimeout(() => onScroll(), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const resolveSectionContent = (sectionKey) => {
    const base = `${sectionsTranslationPrefix}.${sectionKey}`;
    const paragraphs = t(`${base}.paragraphs`, { returnObjects: true });
    const bulletsRaw = t(`${base}.bullets`, { returnObjects: true });
    const safeParagraphs = Array.isArray(paragraphs) ? paragraphs : [];
    const bullets = Array.isArray(bulletsRaw) ? bulletsRaw : [];
    return { paragraphs: safeParagraphs, bullets };
  };

  return (
    <div className="min-h-screen bg-[#02070f] text-white print:bg-white print:text-black">
      <div
        className="print:hidden pointer-events-none fixed left-0 right-0 top-0 z-50 h-0.5 bg-white/10"
        aria-hidden
      >
        <div
          className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <a
        href="#legal-main"
        className="print:hidden sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-sky-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        {t('legal.common.skipToContent')}
      </a>

      <main
        ref={mainRef}
        id="legal-main"
        className="px-5 py-12 sm:px-8 sm:py-16 lg:py-20"
      >
        <article className="mx-auto max-w-6xl">
          <header className="mb-12 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-8 shadow-lg shadow-black/20 backdrop-blur-md print:border-slate-300 print:bg-white print:shadow-none md:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-400 print:text-sky-700">
              {t(eyebrowKey)}
            </p>
            <h1 className="mt-4 text-balance text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl print:text-slate-900">
              {t(titleKey)}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 print:text-slate-700 md:text-lg md:leading-8">
              {t(introKey)}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6 print:border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 print:text-slate-600">
                {t('legal.common.lastUpdated', { date: t('legal.common.lastUpdatedDate') })}
              </p>
              <span className="hidden text-slate-600 sm:inline print:hidden" aria-hidden>
                ·
              </span>
              <Link
                className="print:hidden text-xs font-semibold uppercase tracking-wide text-sky-400 transition hover:text-sky-300"
                to="/"
              >
                {t('legal.common.backToHome')}
              </Link>
            </div>
          </header>

          <div className="lg:grid lg:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] lg:gap-12 xl:gap-16">
            <nav
              aria-label={t('legal.common.sectionNavigationAriaLabel')}
              className="print:hidden mb-10 lg:mb-0"
            >
              <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-white/10 lg:bg-white/[0.04] lg:p-5 lg:backdrop-blur">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  {t('legal.common.onThisPage')}
                </p>
                <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 lg:border-t-0 lg:pt-0">
                  {sectionIds.map((sectionKey) => (
                    <li key={sectionKey}>
                      <a
                        className="block rounded-lg px-2 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-sky-300"
                        href={`#${sectionKey}`}
                      >
                        {t(`${sectionsTranslationPrefix}.${sectionKey}.title`)}
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 hidden border-t border-white/10 pt-4 lg:block">
                  <button
                    type="button"
                    onClick={scrollToTop}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-300 transition hover:border-sky-400/40 hover:text-white"
                  >
                    {t('legal.common.scrollToTop')}
                  </button>
                </div>
              </div>
            </nav>

            <div className="min-w-0 space-y-10 md:space-y-12">
              {sectionIds.map((sectionKey) => {
                const { paragraphs, bullets } = resolveSectionContent(sectionKey);
                return (
                  <section
                    key={sectionKey}
                    id={sectionKey}
                    className="scroll-mt-24 rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-md shadow-black/10 backdrop-blur-sm print:rounded-none print:border-slate-300 print:bg-white print:shadow-none md:p-9"
                    aria-labelledby={`${sectionKey}-title`}
                  >
                    <h2
                      id={`${sectionKey}-title`}
                      className="text-balance text-xl font-bold tracking-tight text-white print:text-slate-900 md:text-2xl"
                    >
                      {t(`${sectionsTranslationPrefix}.${sectionKey}.title`)}
                    </h2>
                    <div className="mt-6">
                      <SectionBody paragraphs={paragraphs} bullets={bullets} />
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="mt-14 flex flex-wrap gap-3 print:hidden">
            <Link
              className="rounded-full border border-sky-400/40 bg-sky-500/10 px-6 py-3 text-sm font-bold text-sky-200 transition hover:border-sky-300 hover:bg-sky-500/20 hover:text-white"
              to="/register"
            >
              {t('legal.common.backToRegistration')}
            </Link>
            <Link
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-slate-300 transition hover:border-white/30 hover:text-white"
              to={canonicalPath === '/privacy-policy' ? '/terms-of-use' : '/privacy-policy'}
            >
              {canonicalPath === '/privacy-policy'
                ? t('legal.common.readTermsOfUse')
                : t('legal.common.readPrivacyPolicy')}
            </Link>
            <Link
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-bold text-slate-300 transition hover:border-white/30 hover:text-white"
              to="/"
            >
              {t('legal.common.backToHome')}
            </Link>
          </div>
        </article>
      </main>

      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
