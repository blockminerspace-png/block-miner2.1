/**
 * Resolve EIP-1193 provider when multiple wallets / extensions inject `window.ethereum`.
 * - Prefers real wallets over password-manager shims (Bitwarden, etc.) via EIP-6963 + heuristics.
 * - Trust often uses window.trustwallet or appears inside ethereum.providers.
 */

/** @type {Map<string, { provider: import('ethers').Eip1193Provider, info: { rdns: string } }>} */
const eip6963ByRdns = new Map();

const PASSWORD_MANAGER_RDNS_PARTS = [
  'bitwarden',
  'lastpass',
  '1password',
  'nordpass',
  'dashlane',
  'keeper',
  'protonpass',
];

/** Wallets we prefer when several announce via EIP-6963 (order matters). */
const WALLET_RDNS_PRIORITY = [
  'io.metamask',
  'com.coinbase.wallet',
  'com.trustwallet.app',
  'app.zerion.wallet',
  'io.rabby',
  'com.brave.wallet',
  'me.rainbow',
  'com.okex.wallet',
  'app.phantom',
];

function isPasswordManagerRdns(rdns) {
  const r = String(rdns || '').toLowerCase();
  return PASSWORD_MANAGER_RDNS_PARTS.some((p) => r.includes(p));
}

/**
 * Heuristic: extensions that expose a limited `ethereum` proxy (unknown method errors).
 * @param {unknown} p
 */
export function isLikelyPasswordManagerProvider(p) {
  if (!p || typeof p.request !== 'function') return true;
  if (p.isBitwarden === true || p.isBitwardenWallet === true) return true;
  if (p.isLastPass === true || p.is1Password === true) return true;
  const ctor = String(p.constructor?.name || '').toLowerCase();
  if (
    ctor.includes('bitwarden') ||
    ctor.includes('lastpass') ||
    ctor.includes('1password') ||
    ctor.includes('nordpass')
  ) {
    return true;
  }
  return false;
}

function initEip6963Listener() {
  if (typeof window === 'undefined') return;
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail;
    if (!detail?.provider || !detail.info?.rdns) return;
    if (isPasswordManagerRdns(detail.info.rdns)) return;
    if (isLikelyPasswordManagerProvider(detail.provider)) return;
    eip6963ByRdns.set(detail.info.rdns, { provider: detail.provider, info: detail.info });
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

initEip6963Listener();

/**
 * @param {unknown} p
 * @returns {p is import('ethers').Eip1193Provider}
 */
function isEip1193(p) {
  return Boolean(p && typeof /** @type {{ request?: unknown }} */ (p).request === 'function');
}

/**
 * Ordered candidates (deduped). Sync-only; does not probe RPC.
 * @returns {import('ethers').Eip1193Provider[]}
 */
export function collectInjectedProviderCandidates() {
  if (typeof window === 'undefined') return [];

  const w = window;
  /** @type {import('ethers').Eip1193Provider[]} */
  const out = [];
  const seen = new Set();

  const push = (p) => {
    if (!isEip1193(p) || isLikelyPasswordManagerProvider(p)) return;
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  if (w.trustwallet && isEip1193(w.trustwallet)) push(w.trustwallet);
  if (w.trustWallet && isEip1193(w.trustWallet)) push(w.trustWallet);

  try {
    w.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch {
    /* ignore */
  }

  for (const rdns of WALLET_RDNS_PRIORITY) {
    const entry = eip6963ByRdns.get(rdns);
    if (entry?.provider) push(entry.provider);
  }
  const restRdns = [...eip6963ByRdns.keys()].sort();
  for (const rdns of restRdns) {
    if (WALLET_RDNS_PRIORITY.includes(rdns)) continue;
    const entry = eip6963ByRdns.get(rdns);
    if (entry?.provider) push(entry.provider);
  }

  const eth = w.ethereum;
  const providers = eth?.providers;
  if (Array.isArray(providers) && providers.length > 0) {
    const filtered = providers.filter(
      (p) => isEip1193(p) && !isLikelyPasswordManagerProvider(p)
    );
    const trust = filtered.find(
      (p) =>
        p.isTrust === true ||
        p.isTrustWallet === true ||
        p._isTrust === true ||
        String(p.constructor?.name || '').toLowerCase().includes('trust')
    );
    if (trust) push(trust);
    const mm = filtered.find((p) => p.isMetaMask === true);
    if (mm) push(mm);
    const cb = filtered.find((p) => p.isCoinbaseWallet === true);
    if (cb) push(cb);
    const rabby = filtered.find((p) => p.isRabby === true);
    if (rabby) push(rabby);
    const brave = filtered.find((p) => p.isBraveWallet === true);
    if (brave) push(brave);
    for (const p of filtered) push(p);
  } else if (eth && isEip1193(eth)) {
    push(eth);
  }

  return out;
}

/**
 * Best-effort injected provider (first candidate). May still fail `eth_chainId` on broken shims — use {@link getVerifiedBrowserEthereumProvider} before connect.
 * @returns {import('ethers').Eip1193Provider | null}
 */
export function getBrowserEthereumProvider() {
  const list = collectInjectedProviderCandidates();
  return list[0] ?? null;
}

/**
 * @param {unknown} provider
 * @returns {Promise<boolean>}
 */
export async function probeProviderSupportsChainRead(provider) {
  if (!isEip1193(provider)) return false;
  try {
    const id = await provider.request({ method: 'eth_chainId', params: [] });
    return typeof id === 'string' && /^0x[0-9a-fA-F]+$/.test(id);
  } catch {
    return false;
  }
}

/**
 * First injected provider that answers `eth_chainId` (filters broken shims).
 * @returns {Promise<import('ethers').Eip1193Provider | null>}
 */
export async function getVerifiedBrowserEthereumProvider() {
  for (const p of collectInjectedProviderCandidates()) {
    if (await probeProviderSupportsChainRead(p)) return p;
  }
  return null;
}

export function hasBrowserEthereumProvider() {
  return collectInjectedProviderCandidates().length > 0;
}
