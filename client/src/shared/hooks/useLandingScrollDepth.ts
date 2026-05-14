import { useEffect } from 'react';
import { LANDING_SCROLL_MILESTONES, trackLandingEvent } from '../utils/landingAnalytics';

/** Fire GA4/Meta custom events at scroll depth milestones (landing page). */
export function useLandingScrollDepth() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const seen = new Set();
    let ticking = false;
    const measure = () => {
      ticking = false;
      const docEl = document.documentElement;
      const h = docEl.scrollHeight - docEl.clientHeight;
      if (h <= 0) return;
      const pct = Math.round((docEl.scrollTop / h) * 100);
      LANDING_SCROLL_MILESTONES.forEach((m) => {
        if (pct >= m && !seen.has(m)) {
          seen.add(m);
          trackLandingEvent('scroll_depth', { percent_scrolled: m });
        }
      });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
}
