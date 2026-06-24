import React, { useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AdProvider = 'zerads' | 'aads' | 'mondiad';
export type AdSize = '728x90' | '468x60' | '300x250';

export interface AdConfig {
  provider: AdProvider;
  size: AdSize;
  src?: string;
  dataAa?: string;
  bannerId?: string;
}

interface AdRotatorProps {
  ads: AdConfig[];
  size?: AdSize;
  slotId?: string;
  className?: string;
}

// ─── Mondiad script loader ───────────────────────────────────────────────

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
    return new Promise((resolve) => {
      if (window.__bmMndScriptLoaded) { resolve(); return; }
      existing.addEventListener('load', () => { window.__bmMndScriptLoaded = true; resolve(); }, { once: true });
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = MND_SCRIPT_SRC;
    script.onload = () => { window.__bmMndScriptLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

// ─── Size mapping ─────────────────────────────────────────────────────────

const SIZE_MAP: Record<AdSize, { width: number; height: number }> = {
  '728x90': { width: 728, height: 90 },
  '468x60': { width: 468, height: 60 },
  '300x250': { width: 300, height: 250 },
};

// ─── Ad renderers ─────────────────────────────────────────────────────────

function IframeAd({ ad, size }: { ad: AdConfig; size: AdSize }) {
  const { width, height } = SIZE_MAP[size];
  const dataAa = ad.dataAa;
  const html = useMemo(() => {
    const attrs = [
      `src="${ad.src}"`,
      `width="${width}"`,
      `height="${height}"`,
      'marginwidth="0"',
      'marginheight="0"',
      'scrolling="no"',
      'frameborder="0"',
      'style="border:none;max-width:100%;display:block"',
      `title="Ad ${ad.provider} ${size}"`,
    ];
    if (dataAa) attrs.push(`data-aa="${dataAa}"`);
    return `<iframe ${attrs.join(' ')}></iframe>`;
  }, [ad.src, ad.provider, size, width, height, dataAa]);

  return (
    <div
      className="flex justify-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function MondiadAd({ ad }: { ad: AdConfig }) {
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
      .catch(() => { /* script failed */ });
    return () => { cancelled = true; };
  }, [ad.bannerId]);

  return (
    <div
      ref={ref}
      data-mndbanid={ad.bannerId}
      className="flex justify-center"
    />
  );
}

// ─── Rotation interval ─────────────────────────────────────────────────────

const ROTATION_INTERVAL_MS = 60_000;

// ─── Main component (memoized to prevent parent re-renders from blinking) ─

const AdRotator = React.memo(function AdRotator({ ads, size, slotId, className }: AdRotatorProps) {
  const [selected, setSelected] = useState<AdConfig | null>(() => {
    if (ads.length === 0) return null;
    const idx = Math.floor(Math.random() * ads.length);
    return ads[idx];
  });

  useEffect(() => {
    if (ads.length <= 1) return;
    const id = setInterval(() => {
      const idx = Math.floor(Math.random() * ads.length);
      setSelected(ads[idx]);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ads]);

  if (!selected) return null;

  const adSize = size ?? selected.size;

  return (
    <div className={`flex flex-col items-center justify-center gap-1 my-8 w-full overflow-hidden ${className ?? ''}`}>
      {selected.provider === 'mondiad' ? (
        <MondiadAd ad={selected} />
      ) : (
        <IframeAd ad={selected} size={adSize} />
      )}
      <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
        Sponsored
      </span>
    </div>
  );
});

export default AdRotator;

// ─── Presets ──────────────────────────────────────────────────────────────

export const POWER_STATS_ADS: AdConfig[] = [
  { provider: 'zerads', size: '468x60', src: 'https://zerads.com/ad/ad.php?width=468&ref=10776' },
  { provider: 'aads', size: '468x60', src: '//ad.a-ads.com/2436936/?size=468x60', dataAa: '2436936' },
];

export const POWER_STATS_ADS_300: AdConfig[] = [
  { provider: 'zerads', size: '300x250', src: 'https://zerads.com/ad/ad.php?width=300&ref=10776' },
  { provider: 'aads', size: '300x250', src: '//ad.a-ads.com/2436936/?size=300x250', dataAa: '2436936' },
];

export const LEADERBOARD_ADS: AdConfig[] = [
  { provider: 'zerads', size: '728x90', src: 'https://zerads.com/ad/ad.php?width=728&ref=10776' },
  { provider: 'aads', size: '728x90', src: '//ad.a-ads.com/2436936/?size=728x90', dataAa: '2436936' },
];
