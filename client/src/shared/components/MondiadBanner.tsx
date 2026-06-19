import { useEffect, useRef } from 'react';

const MND_SCRIPT_SRC = 'https://ss.mrmnd.com/banner.js';

declare global {
  interface Window {
    __bmMndScriptLoaded?: boolean;
  }
}

function ensureMondiadScript(): Promise<void> {
  if (window.__bmMndScriptLoaded) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${MND_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.__bmMndScriptLoaded) { resolve(); return; }
      existing.addEventListener('load', () => { window.__bmMndScriptLoaded = true; resolve(); }, { once: true });
      existing.addEventListener('error', () => reject(new Error('mnd_script_failed')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = MND_SCRIPT_SRC;
    script.onload = () => { window.__bmMndScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error('mnd_script_failed'));
    document.head.appendChild(script);
  });
}

interface MondiadBannerProps {
  bannerId: string;
  className?: string;
}

export default function MondiadBanner({ bannerId, className }: MondiadBannerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    ensureMondiadScript()
      .then(() => {
        if (!cancelled && ref.current && window.__bmMndScriptLoaded) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mnd = (window as any).__mnd;
            if (typeof mnd === 'function') mnd(ref.current);
          } catch { /* noop */ }
        }
      })
      .catch(() => { /* script failed, banner simply won't render */ });
    return () => { cancelled = true; };
  }, [bannerId]);

  return (
    <div
      ref={ref}
      data-mndbanid={bannerId}
      className={className}
    />
  );
}
