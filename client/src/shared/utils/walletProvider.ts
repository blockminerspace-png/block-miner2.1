/**
 * Resolve EIP-1193 provider when multiple wallets / extensions inject `window.ethereum`.
 * - Prefers real wallets over password-manager shims (Bitwarden, etc.) via EIP-6963 + heuristics.
 * - Trust often uses window.trustwallet or appears inside ethereum.providers.
 */

import type { EIP1193Provider } from 'viem';

type Eip6963AnnounceEvent = CustomEvent<{
  info: { rdns: string };
  provider: EIP1193Provider;
}>;

const eip6963ByRdns = new Map<string, { provider: EIP1193Provider; info: { rdns: string } }>();

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

function isPasswordManagerRdns(rdns: unknown): boolean {
  const r = String(rdns || '').toLowerCase();
  return PASSWORD_MANAGER_RDNS_PARTS.some((p) => r.includes(p));
}

/**
 * Heuristic: extensions that expose a limited `ethereum` proxy (unknown method errors).
 */
export function isLikelyPasswordManagerProvider(p: unknown): boolean {
  if (!p || typeof p !== 'object') return true;
  const o = p as Record<string, unknown>;
  if (typeof o.request !== 'function') return true;
  if (o.isBitwarden === true || o.isBitwardenWallet === true) return true;
  if (o.isLastPass === true || o.is1Password === true) return true;
  const ctor = String((o.constructor as { name?: string } | undefined)?.name || '').toLowerCase();
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
  window.addEventListener('eip6963:announceProvider', (event: Event) => {
    const ce = event as Eip6963AnnounceEvent;
    const detail = ce.detail;
    if (!detail?.provider || !detail.info?.rdns) return;
    if (isPasswordManagerRdns(detail.info.rdns)) return;
    if (isLikelyPasswordManagerProvider(detail.provider)) return;
    eip6963ByRdns.set(detail.info.rdns, { provider: detail.provider, info: detail.info });
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

initEip6963Listener();

function isEip1193(p: unknown): p is EIP1193Provider {
  return Boolean(p && typeof (p as { request?: unknown }).request === 'function');
}

type InjectedEthereum = EIP1193Provider & {
  providers?: unknown[];
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  _isTrust?: boolean;
};

/**
 * Ordered candidates (deduped). Sync-only; does not probe RPC.
 */
export function collectInjectedProviderCandidates(): EIP1193Provider[] {
  if (typeof window === 'undefined') return [];

  const w = window;
  const out: EIP1193Provider[] = [];
  const seen = new Set<EIP1193Provider>();

  const push = (p: unknown) => {
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

  const eth = w.ethereum as InjectedEthereum | undefined;
  const providers = eth?.providers;
  if (Array.isArray(providers) && providers.length > 0) {
    const filtered = providers.filter((p) => isEip1193(p) && !isLikelyPasswordManagerProvider(p)) as EIP1193Provider[];
    const trust = filtered.find(
      (p) =>
        (p as InjectedEthereum).isTrust === true ||
        (p as InjectedEthereum).isTrustWallet === true ||
        (p as InjectedEthereum)._isTrust === true ||
        String((p as { constructor?: { name?: string } }).constructor?.name || '')
          .toLowerCase()
          .includes('trust'),
    );
    if (trust) push(trust);
    const mm = filtered.find((p) => (p as InjectedEthereum).isMetaMask === true);
    if (mm) push(mm);
    const cb = filtered.find((p) => (p as InjectedEthereum).isCoinbaseWallet === true);
    if (cb) push(cb);
    const rabby = filtered.find((p) => (p as InjectedEthereum).isRabby === true);
    if (rabby) push(rabby);
    const brave = filtered.find((p) => (p as InjectedEthereum).isBraveWallet === true);
    if (brave) push(brave);
    for (const p of filtered) push(p);
  } else if (eth && isEip1193(eth)) {
    push(eth);
  }

  return out;
}

/**
 * Best-effort injected provider (first candidate). May still fail `eth_chainId` on broken shims — use {@link getVerifiedBrowserEthereumProvider} before connect.
 */
export function getBrowserEthereumProvider(): EIP1193Provider | null {
  const list = collectInjectedProviderCandidates();
  return list[0] ?? null;
}

export async function probeProviderSupportsChainRead(provider: unknown): Promise<boolean> {
  if (!isEip1193(provider)) return false;
  try {
    const req = provider.request as (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
    const id = await req({ method: 'eth_chainId', params: [] });
    return typeof id === 'string' && /^0x[0-9a-fA-F]+$/.test(id);
  } catch {
    return false;
  }
}

/**
 * First injected provider that answers `eth_chainId` (filters broken shims).
 */
export async function getVerifiedBrowserEthereumProvider(): Promise<EIP1193Provider | null> {
  for (const p of collectInjectedProviderCandidates()) {
    if (await probeProviderSupportsChainRead(p)) return p;
  }
  return null;
}

export function hasBrowserEthereumProvider(): boolean {
  return collectInjectedProviderCandidates().length > 0;
}
