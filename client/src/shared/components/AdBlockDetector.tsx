import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import { api } from '../../store/auth';

const DISMISS_KEY = 'bm_adblock_notice_dismiss_until';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** All 3 probes must agree \u2014 unanimous verdict eliminates flaky single-trial false positives. */
const PROBE_TRIALS = 3;
const PROBE_MAJORITY = 3;
/** Time between the two measurements inside a single probe (baseline vs ad-class). */
const PROBE_SETTLE_MS = 650;
/** Time between consecutive trials. */
const INTER_TRIAL_MS = 900;

function isTabVisible() {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function isDismissedInStorage() {
  try {
    const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function runDoubleRaf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function readBoxSize(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const w = Math.max(r.width, el.offsetWidth, el.clientWidth);
  const h = Math.max(r.height, el.offsetHeight, el.clientHeight);
  return { w, h };
}

function cssHidden(el: HTMLElement): boolean {
  const cs = window.getComputedStyle(el);
  return (
    cs.display === 'none' ||
    cs.visibility === 'hidden' ||
    cs.opacity === '0' ||
    cs.contentVisibility === 'hidden'
  );
}

/**
 * Class-switch probe: creates the element WITHOUT ad classes first (baseline),
 * confirms it has normal 48px dimensions, then ADDS the ad class names and checks
 * if it collapses.
 *
 * Why this eliminates loading-speed false positives:
 *   - If a transient layout issue causes 0-size, it affects the baseline step too,
 *     so we bail early before even adding ad classes.
 *   - Only adblock CSS that specifically targets the ad class names causes the
 *     asymmetric baseline\u21920 collapse that returns true.
 *   - Unlike the old approach (element born with ad classes), there is no window
 *     where a layout race could look identical to a real block.
 */
async function detectAdBlockOnce(): Promise<boolean> {
  if (!isTabVisible()) return false;

  const BASE_STYLE =
    'position:absolute;left:-9999px;top:-9999px;width:48px;height:48px;overflow:visible;pointer-events:none;';

  const probe = document.createElement('div');
  probe.style.cssText = BASE_STYLE;
  probe.textContent = '\u00a0';
  document.body.appendChild(probe);

  // \u2500\u2500 Step 1: baseline with no ad classes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  await runDoubleRaf();
  await new Promise((r) => setTimeout(r, PROBE_SETTLE_MS));

  if (cssHidden(probe)) {
    // Global CSS is hiding neutral divs \u2192 layout/framework issue; skip trial.
    document.body.removeChild(probe);
    return false;
  }
  const baseline = readBoxSize(probe);
  if (baseline.w < 1 || baseline.h < 1) {
    // Can't establish a clean baseline; bail to avoid false positive.
    document.body.removeChild(probe);
    return false;
  }

  // \u2500\u2500 Step 2: apply ad class names and re-measure \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  probe.className = 'ad-banner adsbox ads-google ad-placement public_ads';
  await runDoubleRaf();
  await new Promise((r) => setTimeout(r, PROBE_SETTLE_MS));

  const hiddenAfter = cssHidden(probe);
  const sizeAfter = readBoxSize(probe);
  document.body.removeChild(probe);

  if (hiddenAfter) return true;
  // Element had normal size before ad classes; collapsed after \u2192 adblock CSS hid it.
  if (sizeAfter.w < 1 && sizeAfter.h < 1) return true;
  return false;
}

async function detectAdBlockConservative(): Promise<boolean> {
  let hits = 0;
  for (let i = 0; i < PROBE_TRIALS; i += 1) {
    if (!isTabVisible()) return false;
    if (await detectAdBlockOnce()) hits += 1;
    if (i < PROBE_TRIALS - 1) {
      await new Promise((r) => setTimeout(r, INTER_TRIAL_MS));
    }
  }
  return hits >= PROBE_MAJORITY;
}

/** Resolves on the first real user interaction (pointer, touch, keyboard, scroll). */
function waitForFirstInteraction(): Promise<void> {
  return new Promise((resolve) => {
    const EVENTS = ['mousedown', 'touchstart', 'keydown', 'scroll'] as const;
    const done = () => {
      EVENTS.forEach((e) => window.removeEventListener(e, done));
      resolve();
    };
    EVENTS.forEach((e) => window.addEventListener(e, done, { passive: true, once: true }));
  });
}

const AdBlockDetector = () => {
  const [isDetected, setIsDetected] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => isDismissedInStorage());

  useEffect(() => {
    if (isDismissedInStorage()) return undefined;

    const disabled =
      String(import.meta.env.VITE_DISABLE_ADBLOCK_DETECTION || '').trim() === '1' ||
      String(import.meta.env.VITE_DISABLE_ADBLOCK_DETECTION || '').toLowerCase() === 'true';
    if (disabled) return undefined;

    let cancelled = false;

    const run = async () => {
      // Wait for the document to fully load.
      if (document.readyState !== 'complete') {
        await new Promise<void>((r) => {
          if (document.readyState === 'complete') { r(); return; }
          window.addEventListener('load', () => r(), { once: true });
        });
      }

      // Only start after real user interaction \u2014 page layout is stable by then
      // and we avoid false positives from rapid initial rendering.
      await waitForFirstInteraction();

      // Brief settle after the interaction burst starts.
      await new Promise((r) => setTimeout(r, 2000));

      if (cancelled) return;
      const blocked = await detectAdBlockConservative();
      if (!cancelled && blocked) setIsDetected(true);
    };

    void run();
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      /* ignore */
    }
    setIsDismissed(true);
  };

  const onReloadAfterDisabled = () => {
    api.post('/auth/mark-adblock').catch(() => {});
    window.location.reload();
  };

  if (!isDetected || isDismissed) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="relative w-full max-w-lg bg-slate-900/50 border border-white/10 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden group">
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary/20 blur-[100px] rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-orange-600/10 blur-[100px] rounded-full" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner animate-pulse">
            <ShieldAlert className="w-12 h-12 text-red-500" />
          </div>

          <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-4 leading-tight">
            Protocolo de <br />
            <span className="text-primary">Sustento Ativado</span>
          </h2>

          <p className="text-slate-400 text-lg leading-relaxed mb-10 max-w-sm">
            Detectamos que você está usando um <span className="text-white font-bold">Bloqueador de Anúncios</span>.
            Nossa infraestrutura de mineração depende da publicidade para continuar operando de forma gratuita.
          </p>

          <div className="grid grid-cols-1 gap-4 w-full">
            <button
              type="button"
              onClick={onReloadAfterDisabled}
              className="flex items-center justify-center gap-3 w-full py-5 bg-primary text-white font-black rounded-2xl hover:scale-[1.02] active:scale-95 transition-all uppercase italic tracking-widest shadow-glow"
            >
              Já desativei, recarregar <ExternalLink className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={dismiss}
              className="w-full py-4 text-slate-500 font-bold hover:text-slate-300 transition-colors uppercase text-xs tracking-[0.3em]"
            >
              Continuar mesmo assim (não mostrar por 7 dias)
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 w-full flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-[10px] font-bold text-red-500/50 uppercase tracking-[0.2em]">
              Conta pode ser marcada para análise
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default AdBlockDetector;
