import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import { api } from '../../store/auth';

const DISMISS_KEY = 'bm_adblock_notice_dismiss_until';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/** Independent probes; majority must agree (reduces flaky layout / one-off false positives). */
const PROBE_TRIALS = 5;
const PROBE_MAJORITY = 4;
/** Wait for tab to be visible before probing (background tabs can report odd layout). */
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function readBoxSize(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const w = Math.max(r.width, el.offsetWidth, el.clientWidth);
  const h = Math.max(r.height, el.offsetHeight, el.clientHeight);
  return { w, h };
}

function elementLooksPresent(el: HTMLElement) {
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  if (cs.contentVisibility === 'hidden') return false;
  const { w, h } = readBoxSize(el);
  // Off-screen probes: some engines report offset* 0 until paint; trust layout box if any metric says visible.
  return w >= 1 && h >= 1;
}

function elementLooksBlocked(el: HTMLElement) {
  const cs = window.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
  if (cs.contentVisibility === 'hidden') return true;
  const { w, h } = readBoxSize(el);
  // Real adblock usually removes the box entirely; do not treat offset quirks as "blocked" if layout still has area.
  if (w >= 1 && h >= 1) return false;
  return (
    el.offsetHeight === 0 &&
    el.clientHeight === 0 &&
    el.offsetWidth === 0 &&
    el.clientWidth === 0
  );
}

/**
 * Compares an ad-looking honeypot to a neutral probe with the same off-screen geometry.
 * Brave Shields / filter lists often hide `.ads-google`-style classes only; a neutral sibling
 * staying visible while the bait is collapsed is a stronger signal than the bait alone.
 */
async function detectAdBlockOnce() {
  if (!isTabVisible()) return false;

  const baseStyle =
    'position:absolute;left:-9999px;top:-9999px;width:48px;height:48px;overflow:visible;pointer-events:none;';

  const control = document.createElement('div');
  control.className = `bm-ad-probe-${Math.random().toString(36).slice(2, 12)}`;
  control.style.cssText = baseStyle;
  control.textContent = '\u00a0';

  const neutral = document.createElement('div');
  neutral.className = `bm-probe-neutral-${Math.random().toString(36).slice(2, 12)}`;
  neutral.style.cssText = baseStyle;
  neutral.textContent = '\u00a0';

  const honeypot = document.createElement('div');
  honeypot.className = 'ad-banner adsbox ads-google ad-placement public_ads';
  honeypot.style.cssText = baseStyle;
  honeypot.innerHTML = '&nbsp;';

  document.body.appendChild(control);
  document.body.appendChild(neutral);
  document.body.appendChild(honeypot);

  await runDoubleRaf();
  await new Promise((r) => setTimeout(r, 520));

  const controlOk = elementLooksPresent(control);
  const neutralOk = elementLooksPresent(neutral);
  const honeypotLooksBlocked = elementLooksBlocked(honeypot);

  document.body.removeChild(control);
  document.body.removeChild(neutral);
  document.body.removeChild(honeypot);

  if (!controlOk || !neutralOk) {
    return false;
  }
  return honeypotLooksBlocked;
}

async function detectAdBlockConservative() {
  let hits = 0;
  for (let i = 0; i < PROBE_TRIALS; i += 1) {
    if (!isTabVisible()) return false;
    if (await detectAdBlockOnce()) hits += 1;
    if (i < PROBE_TRIALS - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return hits >= PROBE_MAJORITY;
}

const AdBlockDetector = () => {
  const [isDetected, setIsDetected] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => isDismissedInStorage());

  useEffect(() => {
    if (isDismissedInStorage()) {
      return undefined;
    }

    const disabled =
      String(import.meta.env.VITE_DISABLE_ADBLOCK_DETECTION || '').trim() === '1' ||
      String(import.meta.env.VITE_DISABLE_ADBLOCK_DETECTION || '').toLowerCase() === 'true';
    if (disabled) {
      return undefined;
    }

    const timer = setTimeout(async () => {
      if (document.readyState !== 'complete') {
        await new Promise<void>((r) => {
          if (document.readyState === 'complete') r();
          else window.addEventListener('load', () => r(), { once: true });
        });
      }
      const blocked = await detectAdBlockConservative();
      if (!blocked) return;
      setIsDetected(true);
    }, 5200);

    return () => clearTimeout(timer);
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
