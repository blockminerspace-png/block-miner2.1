import { useEffect } from 'react';
import type { TFunction } from 'i18next';

export type LandingFaqItemDef = {
  id: string;
  qKey: string;
  aKey: string;
};

/**
 * Title, meta tags, canonical, FAQ + org JSON-LD for the marketing landing.
 */
export function useLandingSeo(
  t: TFunction,
  i18nLanguage: string,
  faqItems: readonly LandingFaqItemDef[],
): void {
  useEffect(() => {
    document.title = t('landing.meta.title');
    const setMeta = (name: string, content: string) => {
      let m = document.querySelector(`meta[name="${name}"]`);
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', name);
        document.head.appendChild(m);
      }
      m.setAttribute('content', content);
    };
    const setOg = (prop: string, content: string) => {
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
    let script = document.querySelector<HTMLScriptElement>('script[data-landing-jsonld]');
    if (!script) {
      const el = document.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-landing-jsonld', '1');
      document.head.appendChild(el);
      script = el;
    }
    script.textContent = JSON.stringify(payload);
    return () => {
      document.querySelector('script[data-landing-jsonld]')?.remove();
    };
  }, [t, i18nLanguage, faqItems]);
}
