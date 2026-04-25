import { useEffect } from 'react';

/**
 * Updates page title and common SEO metadata for public pages.
 */
export function useSeoMeta({ title, description, canonicalPath }) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.title = title;

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://blockminer.space';
    const canonicalUrl = `${origin}${canonicalPath}`;

    const setMetaByName = (name, content) => {
      let element = document.querySelector(`meta[name="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    const setMetaByProperty = (property, content) => {
      let element = document.querySelector(`meta[property="${property}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    setMetaByName('description', description);
    setMetaByName('twitter:card', 'summary');
    setMetaByName('twitter:title', title);
    setMetaByName('twitter:description', description);
    setMetaByProperty('og:title', title);
    setMetaByProperty('og:description', description);
    setMetaByProperty('og:type', 'website');
    setMetaByProperty('og:url', canonicalUrl);
  }, [canonicalPath, description, title]);
}
