import { useEffect, useRef } from "react";

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
 * Renders Cloudflare Turnstile when a site key is provided.
 * @param {{ onToken: (token: string) => void, siteKey?: string }} props
 */
export default function TurnstileField({ onToken, siteKey }) {
  const hostRef = useRef(null);
  const widgetId = useRef(null);
  const resolvedSiteKey = String(siteKey || "").trim();

  useEffect(() => {
    if (!resolvedSiteKey || !hostRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: resolvedSiteKey,
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
  }, [onToken, resolvedSiteKey]);

  if (!resolvedSiteKey) return null;
  return <div ref={hostRef} className="my-3 flex justify-center" />;
}
