/**
 * WalletConnect / Reown AppKit — requires VITE_WALLETCONNECT_PROJECT_ID at build time for a working relay + mobile wallet list.
 */

export function isWalletConnectConfigured() {
  return Boolean(String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim());
}

/** Canonical app URL for WalletConnect metadata (no trailing slash). */
export function getWalletConnectMetadataUrl() {
  const fromEnv = String(import.meta.env.VITE_PUBLIC_WALLET_APP_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }
  return 'https://blockminer.space';
}

/** @deprecated No singleton; kept so tests that mock reset do not break imports. */
export function resetWalletConnectSingletonForTests() {}
