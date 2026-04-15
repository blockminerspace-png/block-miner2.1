import {
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  forwardRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

let turnstileScriptPromise;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="turnstile/v0/api.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Turnstile script load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    const cspNonce = typeof window !== "undefined" ? window.__BLOCKMINER_CSP_NONCE__ : "";
    if (cspNonce) s.setAttribute("nonce", cspNonce);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile script load failed"));
    document.head.appendChild(s);
  });
  return turnstileScriptPromise;
}

/** Start loading Turnstile early (e.g. on /login mount) so the widget appears sooner. */
export function prefetchTurnstileScript() {
  return loadTurnstileScript();
}

function turnstileReadyPromise() {
  return new Promise((resolve, reject) => {
    if (!window.turnstile) {
      reject(new Error("Turnstile API missing"));
      return;
    }
    if (typeof window.turnstile.ready === "function") {
      try {
        window.turnstile.ready(() => resolve());
      } catch (e) {
        reject(e);
      }
    } else {
      resolve();
    }
  });
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
        await turnstileReadyPromise();
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
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: resolvedSiteKey,
          appearance: "always",
          "refresh-expired": "auto",
          callback: (token) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(""),
          "error-callback": () => onTokenRef.current?.(""),
        });
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
    <div className="relative my-3 w-full min-h-[72px] flex justify-center items-center rounded-2xl border border-gray-800/80 bg-background/40">
      <div ref={hostRef} className="flex min-h-[65px] w-full justify-center items-center py-1" />
      {bootState === "loading" && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/70 backdrop-blur-[1px]"
          aria-busy="true"
          aria-live="polite"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 animate-pulse">
            {t("auth.turnstile.loading")}
          </span>
        </div>
      )}
      {bootState === "error" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/85 px-3">
          <p className="text-center text-[10px] font-semibold leading-relaxed text-red-400">
            {t("auth.turnstile.load_failed")}
          </p>
        </div>
      )}
    </div>
  );
});

TurnstileField.displayName = "TurnstileField";

export default TurnstileField;
