import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";

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
 * Ref exposes `reset()` to clear the token and ask for a new challenge (e.g. after a failed login).
 * @param {{ onToken: (token: string) => void, siteKey?: string }} props
 */
const TurnstileField = forwardRef(function TurnstileField({ onToken, siteKey }, ref) {
  const hostRef = useRef(null);
  const widgetId = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const resolvedSiteKey = String(siteKey || "").trim();

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

  useEffect(() => {
    if (!resolvedSiteKey || !hostRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !hostRef.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(hostRef.current, {
          sitekey: resolvedSiteKey,
          appearance: "always",
          "refresh-expired": "auto",
          callback: (token) => onTokenRef.current?.(token),
          "expired-callback": () => onTokenRef.current?.(""),
          "error-callback": () => onTokenRef.current?.(""),
        });
      } catch {
        onTokenRef.current?.("");
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
  }, [resolvedSiteKey]);

  if (!resolvedSiteKey) return null;
  return <div ref={hostRef} className="my-3 flex justify-center" />;
});

TurnstileField.displayName = "TurnstileField";

export default TurnstileField;
