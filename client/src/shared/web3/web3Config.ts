/**
 * WalletConnect / Reown AppKit — public project id validation (build + runtime injection).
 */

const WALLETCONNECT_PLACEHOLDER_IDS = new Set([
  '',
  '00000000000000000000000000000000',
  'your_project_id',
  'YOUR_PROJECT_ID',
  'changeme',
]);

function readRuntimeInjected(): Record<string, string | undefined> | null {
  if (typeof window === 'undefined') return null;
  return window.__BLOCKMINER_ENV__ && typeof window.__BLOCKMINER_ENV__ === 'object'
    ? window.__BLOCKMINER_ENV__
    : null;
}

/** Prefer build-time env; fallback to Express-injected runtime (Docker / mobile when image was built without VITE_*). */
export function getWalletConnectProjectId(): string {
  const bakedWc = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim();
  const bakedReown = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? '').trim();
  const baked = bakedWc || bakedReown;
  if (baked) return baked;
  const inj = readRuntimeInjected();
  if (!inj) return '';
  const fromServerWc = String(inj.VITE_WALLETCONNECT_PROJECT_ID ?? '').trim();
  const fromServerReown = String(inj.VITE_REOWN_PROJECT_ID ?? '').trim();
  return fromServerWc || fromServerReown || '';
}

export function isValidWalletConnectProjectId(projectId: string | undefined | null): projectId is string {
  const value = String(projectId ?? '').trim();

  if (WALLETCONNECT_PLACEHOLDER_IDS.has(value)) {
    return false;
  }

  return /^[a-f0-9]{32}$/i.test(value);
}

/** True when WalletConnect / AppKit remote APIs should be enabled. */
export function isWalletConnectConfigured(): boolean {
  return isValidWalletConnectProjectId(getWalletConnectProjectId());
}
