/**
 * WalletConnect / Reown AppKit — metadata URL and re-exports for project id helpers.
 */

export {
  getWalletConnectProjectId,
  isValidWalletConnectProjectId,
  isWalletConnectConfigured,
} from '../web3/web3Config';

/** Canonical app URL for WalletConnect metadata (no trailing slash). */
export function getWalletConnectMetadataUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }
  let fromEnv = String(import.meta.env.VITE_PUBLIC_WALLET_APP_URL || '').trim().replace(/\/+$/, '');
  if (!fromEnv) {
    const inj =
      typeof window !== 'undefined' && window.__BLOCKMINER_ENV__ && typeof window.__BLOCKMINER_ENV__ === 'object'
        ? window.__BLOCKMINER_ENV__
        : null;
    const raw =
      inj && typeof inj.VITE_PUBLIC_WALLET_APP_URL === 'string' ? inj.VITE_PUBLIC_WALLET_APP_URL : '';
    fromEnv = String(raw || '').trim().replace(/\/+$/, '');
  }
  if (fromEnv) return fromEnv;
  return 'https://blockminer.space';
}
