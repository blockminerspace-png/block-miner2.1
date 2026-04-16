import {
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

let turnstileScriptPromise;

function isTurnstileRenderable() {
  return (
    typeof window !== "undefined" &&
    window.turnstile &&
    typeof window.turnstile.render === "function"
  );
}

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  // Do not trust `window.turnstile` alone — CF may expose a stub before api.js finishes (calling
  // turnstile.ready() then triggers: "ready() would break if called *before* api.js is loaded".
  if (isTurnstileRenderable()) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  const p = new Promise((resolve, reject) => {
    const finish = () => {
      if (isTurnstileRenderable()) {
        resolve();
        return;
      }
      // api.js sometimes attaches `render` on the next task after `load`.
      setTimeout(() => {
        if (isTurnstileRenderable()) resolve();
        else reject(new Error("Turnstile API not ready after script load"));
      }, 0);
    };
    const existing = document.querySelector('script[src*="turnstile/v0/api.js"]');
    if (existing) {
      if (isTurnstileRenderable()) {
        finish();
        return;
      }
      const onLoad = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        finish();
      };
      const onError = () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        turnstileScriptPromise = null;
        reject(new Error("Turnstile script load failed"));
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      // Load may have already completed (e.g. prefetch finished before this listener ran).
      if (isTurnstileRenderable()) {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
        finish();
      }
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    const cspNonce = typeof window !== "undefined" ? window.__BLOCKMINER_CSP_NONCE__ : "";
    if (cspNonce) s.setAttribute("nonce", cspNonce);
    s.onload = () => finish();
    s.onerror = () => {
      turnstileScriptPromise = null;
      reject(new Error("Turnstile script load failed"));
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
export function prefetchTurnstileScript() {
  return loadTurnstileScript();
}

/**
 * Renders Cloudflare Turnstile when a site key is provided.
 * Ref exposes `reset()` to clear the token and ask for a new challenge (e.g. after a failed login).
 * @param {{ onToken: (token: string) => void, siteKey?: string }} props
 */
const TurnstileField = forwardRef(function TurnstileField({ onToken, siteKey }, ref) {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const widgetId = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const resolvedSiteKey = String(siteKey || "").trim();
  const [bootState, setBootState] = useState("loading");

  useImperativeHandle(ref, () => ({
    reset: () => {
      try {
        if (widgetId.current != null && window.turnstile?.reset) {
          window.turnstile.reset(widgetId.current);
        }
      } catch {
        /* ignore */
      }
      onTokenRef.current?.("");
    },
  }));

  useLayoutEffect(() => {
    if (!resolvedSiteKey) return undefined;

    let cancelled = false;
    setBootState("loading");

    const mountWidget = async () => {
      try {
        await loadTurnstileScript();
        if (cancelled) return;
        if (!hostRef.current || !window.turnstile) {
          setBootState("error");
          onTokenRef.current?.("");
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
        const baseOpts = {
          sitekey: resolvedSiteKey,
          appearance: "always",
          theme: "auto",
          "refresh-expired": "auto",
          callback: (token) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(""),
          "error-callback": () => onTokenRef.current?.(""),
        };
        /** Standard horizontal bar: flexible (full width of host, min 300×65) or normal (300×65). Never compact (150×140). */
        try {
          widgetId.current = window.turnstile.render(hostRef.current, { ...baseOpts, size: "flexible" });
        } catch {
          try {
            widgetId.current = window.turnstile.render(hostRef.current, { ...baseOpts, size: "normal" });
          } catch {
            widgetId.current = window.turnstile.render(hostRef.current, baseOpts);
          }
        }
        if (!cancelled) setBootState("ready");
      } catch {
        if (!cancelled) {
          setBootState("error");
          onTokenRef.current?.("");
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
    <div className="relative my-3 w-full max-w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200/95 bg-white shadow-sm">
      <p className="px-3 pt-2.5 text-center text-[11px] font-medium leading-snug text-slate-600">
        {t("auth.turnstile.human_prompt")}
      </p>
      <div className="w-full px-1 pb-2 pt-1 [zoom:0.9] min-[400px]:[zoom:0.95] sm:[zoom:1]">
        {/*
          Host must be block-level full width so Turnstile `size: flexible` can span the form.
          A flex + justify-center wrapper keeps the iframe at ~300px and looks like a square tile on mobile/desktop.
        */}
        <div
          ref={hostRef}
          className="auth-turnstile-host min-h-[65px] w-full min-w-[300px] max-w-full"
        />
      </div>
      {bootState === "loading" && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/80 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="animate-pulse text-[10px] font-bold uppercase tracking-widest text-slate-500">
            {t("auth.turnstile.loading")}
          </span>
        </div>
      )}
      {bootState === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90 px-3">
          <p className="text-center text-[10px] font-semibold leading-relaxed text-red-600">
            {t("auth.turnstile.load_failed")}
          </p>
        </div>
      )}
    </div>
  );
});

TurnstileField.displayName = "TurnstileField";

export default TurnstileField;
