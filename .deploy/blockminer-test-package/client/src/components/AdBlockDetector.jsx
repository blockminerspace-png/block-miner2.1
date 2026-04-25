import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, ExternalLink } from 'lucide-react';
import { api } from '../store/auth';

const DISMISS_KEY = 'bm_adblock_notice_dismiss_until';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isDismissedInStorage() {
  try {
    const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function runDoubleRaf() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

/**
 * Compara um honeypot com classes de anúncio a um controlo com classe aleatória.
 * Só marca adblock se o controlo estiver visível e o honeypot claramente colapsado/oculto —
 * evita falso positivo quando o browser ainda não fez layout ou com elementos 1x1.
 */
async function detectAdBlockOnce() {
  const baseStyle =
    'position:absolute;left:-9999px;top:-9999px;width:48px;height:48px;overflow:visible;pointer-events:none;';

  const control = document.createElement('div');
  control.className = `bm-ad-probe-${Math.random().toString(36).slice(2, 12)}`;
  control.style.cssText = baseStyle;
  control.textContent = '\u00a0';

  const honeypot = document.createElement('div');
  honeypot.className = 'ad-banner adsbox ads-google ad-placement public_ads';
  honeypot.style.cssText = baseStyle;
  honeypot.innerHTML = '&nbsp;';

  document.body.appendChild(control);
  document.body.appendChild(honeypot);

  await runDoubleRaf();
  await new Promise((r) => setTimeout(r, 150));

  const csCtrl = window.getComputedStyle(control);
  const csHp = window.getComputedStyle(honeypot);

  const controlOk =
    control.offsetHeight > 0 &&
    control.offsetWidth > 0 &&
    csCtrl.display !== 'none' &&
    csCtrl.visibility !== 'hidden';

  const honeypotLooksBlocked =
    csHp.display === 'none' ||
    (honeypot.offsetHeight === 0 &&
      honeypot.clientHeight === 0 &&
      honeypot.offsetWidth === 0 &&
      honeypot.clientWidth === 0);

  document.body.removeChild(control);
  document.body.removeChild(honeypot);

  if (!controlOk) {
    return false;
  }
  return honeypotLooksBlocked;
}

const AdBlockDetector = () => {
  const [isDetected, setIsDetected] = useState(false);
  const [isDismissed, setIsDismissed] = useState(() => isDismissedInStorage());

  useEffect(() => {
    if (isDismissedInStorage()) {
      return undefined;
    }

    const timer = setTimeout(async () => {
      const first = await detectAdBlockOnce();
      if (!first) return;

      await new Promise((r) => setTimeout(r, 800));
      const second = await detectAdBlockOnce();
      if (!second) return;

      setIsDetected(true);
      api.post('/auth/mark-adblock').catch(() => {});
    }, 2800);

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
              onClick={() => window.location.reload()}
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
