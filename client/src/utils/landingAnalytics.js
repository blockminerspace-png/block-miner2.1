/**
 * Landing-only analytics helpers: UTM persistence, scroll depth, custom GA4 / Meta Pixel events.
 * All identifiers read from Vite env; no PII in event params.
 */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const UTM_STORAGE_KEY = 'blockminer_utm';

/** @param {string} [search] */
export function persistUtmParams(search) {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(search || window.location.search || '');
    const stored = {};
    let any = false;
    UTM_KEYS.forEach((k) => {
      const v = params.get(k);
      if (v) {
        stored[k] = v;
        any = true;
      }
    });
    if (any) {
      sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    /* ignore */
  }
}

/** @returns {Record<string, string>} */
export function readStoredUtm() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} name
 * @param {Record<string, string | number | boolean>} [params]
 */
export function trackLandingEvent(name, params = {}) {
  if (typeof window === 'undefined') return;
  const gaId = import.meta.env.VITE_GA_ID;
  const utm = readStoredUtm();
  const merged = { ...utm, ...params };
  if (gaId && typeof window.gtag === 'function') {
    window.gtag('event', name, merged);
  }
  if (typeof window.fbq === 'function') {
    try {
      window.fbq('trackCustom', name, merged);
    } catch {
      /* ignore */
    }
  }
}

/** Load Meta Pixel once when VITE_META_PIXEL_ID is set (standard fbevents bootstrap). */
export function initMetaPixel() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const id = String(import.meta.env.VITE_META_PIXEL_ID || '').trim();
  if (!id || window.__blockminerMetaPixelLoaded) return;

  const f = window;
  const b = document;
  const e = 'script';
  if (f.fbq) {
    f.fbq('init', id);
    f.fbq('track', 'PageView');
    window.__blockminerMetaPixelLoaded = true;
    return;
  }
  const n = function queueFbq() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  f.fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const t = b.createElement(e);
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = b.getElementsByTagName(e)[0];
  if (!s?.parentNode) return;
  s.parentNode.insertBefore(t, s);
  f.fbq('init', id);
  f.fbq('track', 'PageView');
  window.__blockminerMetaPixelLoaded = true;
}

export const LANDING_SCROLL_MILESTONES = [25, 50, 75, 100];
