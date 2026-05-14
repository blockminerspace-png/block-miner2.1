/**
 * Landing-only analytics helpers: UTM persistence, scroll depth, custom GA4 / Meta Pixel events.
 * All identifiers read from Vite env; no PII in event params.
 */

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const UTM_STORAGE_KEY = 'blockminer_utm';

export function persistUtmParams(search?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(search || window.location.search || '');
    const stored: Record<string, string> = {};
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

export function readStoredUtm(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function trackLandingEvent(
  name: string,
  params: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === 'undefined') return;
  const gaId = import.meta.env.VITE_GA_ID;
  const utm = readStoredUtm();
  const merged: Record<string, string | number | boolean> = { ...utm, ...params };
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

type MetaPixelStub = {
  (...args: unknown[]): void;
  queue: unknown[][];
  push: MetaPixelStub;
  loaded: boolean;
  version: string;
  callMethod?: (...args: unknown[]) => void;
};

/** Load Meta Pixel once when VITE_META_PIXEL_ID is set (standard fbevents bootstrap). */
export function initMetaPixel(): void {
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
  const n = function queueFbq(this: unknown, ...args: unknown[]) {
    const self = n as MetaPixelStub;
    if (typeof self.callMethod === 'function') {
      self.callMethod(...args);
    } else {
      self.queue.push(args);
    }
  } as unknown as MetaPixelStub;
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

export const LANDING_SCROLL_MILESTONES = [25, 50, 75, 100] as const;
