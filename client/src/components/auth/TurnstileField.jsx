import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

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
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Turnstile script load failed"));
    document.head.appendChild(s);
  });
  return turnstileScriptPromise;
}

/**
 * Renders Cloudflare Turnstile when VITE_TURNSTILE_SITE_KEY is set.
 * @param {{ onToken: (token: string) => void }} props
 */
export default function TurnstileField({ onToken }) {
  const hostRef = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !hostRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => onToken?.(token),
          "expired-callback": () => onToken?.(""),
          "error-callback": () => onToken?.(""),
        });
      } catch {
        onToken?.("");
      }
    })();

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
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={hostRef} className="my-3 flex justify-center" />;
}
