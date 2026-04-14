/**
 * WalletConnect / Reown AppKit — project id from Vite build and/or server-injected window.__BLOCKMINER_ENV__ (Docker runtime .env).
 */

function readRuntimeInjected() {
  if (typeof window === 'undefined') return null;
  return window.__BLOCKMINER_ENV__ && typeof window.__BLOCKMINER_ENV__ === 'object'
    ? window.__BLOCKMINER_ENV__
    : null;
}

/** Prefer build-time env; fallback to Express-injected runtime (fixes mobile when image was built without VITE_*). */
export function getWalletConnectProjectId() {
  const baked = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim();
  if (baked) return baked;
  const inj = readRuntimeInjected();
  const fromServer = inj && String(inj.VITE_WALLETCONNECT_PROJECT_ID || '').trim();
  return fromServer || '';
}

export function isWalletConnectConfigured() {
  return Boolean(getWalletConnectProjectId());
}

/** Canonical app URL for WalletConnect metadata (no trailing slash). */
export function getWalletConnectMetadataUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }
  let fromEnv = String(import.meta.env.VITE_PUBLIC_WALLET_APP_URL || '').trim().replace(/\/+$/, '');
  if (!fromEnv) {
    const inj = readRuntimeInjected();
    fromEnv = inj && String(inj.VITE_PUBLIC_WALLET_APP_URL || '').trim().replace(/\/+$/, '');
  }
  if (fromEnv) return fromEnv;
  return 'https://blockminer.space';
}

/** @deprecated No singleton; kept so tests that mock reset do not break imports. */
export function resetWalletConnectSingletonForTests() {}
