import {
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

type TurnstileFieldProps = {
  onToken: (token: string) => void;
  siteKey?: string;
};

export type TurnstileFieldHandle = {
  reset: () => void;
};

type TurnstileWidgetId = string | number | null;

declare global {
  interface Window {
    __BLOCKMINER_CSP_NONCE__?: string;
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: Record<string, unknown>
      ) => TurnstileWidgetId;
      remove?: (id: TurnstileWidgetId) => void;
      reset?: (id: TurnstileWidgetId) => void;
      ready?: (cb: () => void) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function isTurnstileRenderable(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.turnstile) &&
    typeof window.turnstile?.render === 'function'
  );
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (isTurnstileRenderable()) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  const p = new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (isTurnstileRenderable()) {
        resolve();
        return;
      }
      setTimeout(() => {
        if (isTurnstileRenderable()) resolve();
        else reject(new Error('Turnstile API not ready after script load'));
      }, 0);
    };
    const existing = document.querySelector('script[src*="turnstile/v0/api.js"]');
    if (existing) {
      if (isTurnstileRenderable()) {
        finish();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        finish();
      };
      const onError = () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        turnstileScriptPromise = null;
        reject(new Error('Turnstile script load failed'));
      };
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      if (isTurnstileRenderable()) {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
        finish();
      }
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.defer = true;
    const cspNonce =
      typeof window !== 'undefined' ? window.__BLOCKMINER_CSP_NONCE__ : '';
    if (cspNonce) s.setAttribute('nonce', cspNonce);
    s.onload = () => finish();
    s.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error('Turnstile script load failed'));
    };
    document.head.appendChild(s);
  });
  turnstileScriptPromise = p.catch((e) => {
    turnstileScriptPromise = null;
    throw e;
  });
  return turnstileScriptPromise;
}

/** Start loading Turnstile early (e.g. on /login mount) so the widget appears sooner. */
export function prefetchTurnstileScript(): Promise<void> {
  return loadTurnstileScript();
}

const TurnstileField = forwardRef<TurnstileFieldHandle, TurnstileFieldProps>(
  function TurnstileField({ onToken, siteKey }, ref) {
    const { t } = useTranslation();
    const hostRef = useRef<HTMLDivElement | null>(null);
    const widgetId = useRef<TurnstileWidgetId>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const resolvedSiteKey = String(siteKey || '').trim();
    const [bootState, setBootState] = useState<'loading' | 'ready' | 'error'>('loading');

    useImperativeHandle(ref, () => ({
      reset: () => {
        try {
          if (widgetId.current != null && window.turnstile?.reset) {
            window.turnstile.reset(widgetId.current);
          }
        } catch {
          /* ignore */
        }
        onTokenRef.current?.('');
      },
    }));

    useLayoutEffect(() => {
      if (!resolvedSiteKey) return undefined;

      let cancelled = false;
      setBootState('loading');

      const mountWidget = async () => {
        try {
          await loadTurnstileScript();
          if (cancelled) return;
          if (!hostRef.current || !window.turnstile) {
            setBootState('error');
            onTokenRef.current?.('');
            return;
          }
          if (widgetId.current != null && window.turnstile?.remove) {
            try {
              window.turnstile.remove(widgetId.current);
            } catch {
              /* ignore */
            }
            widgetId.current = null;
          }
          const baseOpts: Record<string, unknown> = {
            sitekey: resolvedSiteKey,
            appearance: 'always',
            theme: 'dark',
            'refresh-expired': 'auto',
            callback: (token: string) => onTokenRef.current?.(token),
            'expired-callback': () => onTokenRef.current?.(''),
            'error-callback': () => onTokenRef.current?.(''),
          };
          try {
            widgetId.current = window.turnstile.render(hostRef.current, {
              ...baseOpts,
              size: 'flexible',
            });
          } catch {
            try {
              widgetId.current = window.turnstile.render(hostRef.current, {
                ...baseOpts,
                size: 'normal',
              });
            } catch {
              widgetId.current = window.turnstile.render(hostRef.current, baseOpts);
            }
          }
          if (!cancelled) setBootState('ready');
        } catch {
          if (!cancelled) {
            setBootState('error');
            onTokenRef.current?.('');
          }
        }
      };

      void mountWidget();

      return () => {
        cancelled = true;
        try {
          if (widgetId.current != null && window.turnstile?.remove) {
            window.turnstile.remove(widgetId.current);
          }
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      };
    }, [resolvedSiteKey]);

    if (!resolvedSiteKey) return null;

    return (
      <div className="relative my-3 w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-700 bg-[#2f3136] shadow-sm">
        <p className="px-3 pt-2.5 text-center text-[11px] font-medium leading-snug text-slate-100">
          {t('auth.turnstile.human_prompt')}
        </p>
        <div className="w-full px-1 pb-2 pt-1 [zoom:0.9] min-[400px]:[zoom:0.95] sm:[zoom:1]">
          <div
            ref={hostRef}
            className="auth-turnstile-host min-h-[65px] w-full min-w-[300px] max-w-full"
          />
        </div>
        {bootState === 'loading' && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#2f3136]/80 backdrop-blur-[1px]"
            aria-busy="true"
            aria-live="polite"
          >
            <span className="animate-pulse text-[10px] font-bold uppercase tracking-widest text-slate-200">
              {t('auth.turnstile.loading')}
            </span>
          </div>
        )}
        {bootState === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[#2f3136]/95 px-3">
            <p className="text-center text-[10px] font-semibold leading-relaxed text-red-300">
              {t('auth.turnstile.load_failed')}
            </p>
          </div>
        )}
      </div>
    );
  }
);

TurnstileField.displayName = 'TurnstileField';

export default TurnstileField;
