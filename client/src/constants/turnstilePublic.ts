/**
 * Public Turnstile site keys (browser-safe only).
 * Dummy pair is documented by Cloudflare for testing; never use in production.
 * @see https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const CLOUDFLARE_TURNSTILE_DUMMY_SITEKEY_VISIBLE = "1x00000000000000000000AA";

function viteDummyFallbackEnabled() {
  const v = String(import.meta.env.VITE_TURNSTILE_DUMMY_FALLBACK ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function resolveTurnstileSiteKeyLogin() {
  const fromEnv = String(
    import.meta.env.VITE_TURNSTILE_SITE_KEY_LOGIN || import.meta.env.VITE_TURNSTILE_SITE_KEY || "",
  ).trim();
  if (fromEnv) return fromEnv;
  if (viteDummyFallbackEnabled()) return CLOUDFLARE_TURNSTILE_DUMMY_SITEKEY_VISIBLE;
  return "";
}

export function resolveTurnstileSiteKeyRegister() {
  const fromEnv = String(
    import.meta.env.VITE_TURNSTILE_SITE_KEY_REGISTER || import.meta.env.VITE_TURNSTILE_SITE_KEY || "",
  ).trim();
  if (fromEnv) return fromEnv;
  if (viteDummyFallbackEnabled()) return CLOUDFLARE_TURNSTILE_DUMMY_SITEKEY_VISIBLE;
  return "";
}
