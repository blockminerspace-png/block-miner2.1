import type {
  Eip1193Provider,
  InjectedWalletConnection,
  InjectedWalletProviderInfo,
} from './injectedWallet.types';
import { INJECTED_WALLET_ERROR_CODES, InjectedWalletError } from './injectedWallet.errors';

export type { Eip1193Provider, InjectedWalletConnection, InjectedWalletProviderInfo } from './injectedWallet.types';
export { InjectedWalletError, INJECTED_WALLET_ERROR_CODES } from './injectedWallet.errors';

const PASSWORD_MANAGER_RDNS_PARTS = [
  'bitwarden',
  'lastpass',
  '1password',
  'nordpass',
  'dashlane',
  'keeper',
  'protonpass',
];

type InjectedEthereum = Eip1193Provider & {
  providers?: unknown[];
  isTrust?: boolean;
  isTrustWallet?: boolean;
  _isTrust?: boolean;
};

function isEip1193(p: unknown): p is Eip1193Provider {
  return Boolean(p && typeof (p as { request?: unknown }).request === 'function');
}

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
    ctor.includes('nordpass') ||
    ctor.includes('dashlane')
  ) {
    return true;
  }
  return false;
}

function isPasswordManagerRdns(rdns: unknown): boolean {
  const r = String(rdns || '').toLowerCase();
  return PASSWORD_MANAGER_RDNS_PARTS.some((p) => r.includes(p));
}

function providerLabel(p: Eip1193Provider, fallback: string): string {
  const o = p as InjectedEthereum;
  if (o.isRabby) return 'Rabby';
  if (o.isMetaMask) return 'MetaMask';
  if (o.isBraveWallet) return 'Brave Wallet';
  if (o.isCoinbaseWallet) return 'Coinbase Wallet';
  return fallback;
}

export function rankInjectedProvider(provider: InjectedWalletProviderInfo): number {
  const name = provider.name.toLowerCase();
  const rdns = provider.rdns?.toLowerCase() ?? '';
  const p = provider.provider;

  if (p.isRabby === true || name.includes('rabby') || rdns.includes('rabby') || rdns === 'io.rabby') {
    return 100;
  }
  if (p.isMetaMask === true || name.includes('metamask') || rdns.includes('metamask')) return 90;
  if (p.isBraveWallet === true || name.includes('brave') || rdns.includes('brave')) return 80;
  if (p.isCoinbaseWallet === true || name.includes('coinbase') || rdns.includes('coinbase')) return 70;
  if (name.includes('trust') || rdns.includes('trust')) return 60;
  return 10;
}

function dedupeProviders(list: InjectedWalletProviderInfo[]): InjectedWalletProviderInfo[] {
  const out: InjectedWalletProviderInfo[] = [];
  const seen = new Set<Eip1193Provider>();
  for (const item of list) {
    if (seen.has(item.provider)) continue;
    seen.add(item.provider);
    out.push(item);
  }
  return out.sort((a, b) => rankInjectedProvider(b) - rankInjectedProvider(a));
}

export async function discoverEip6963Providers(timeoutMs = 500): Promise<InjectedWalletProviderInfo[]> {
  if (typeof window === 'undefined') return [];

  const providers: InjectedWalletProviderInfo[] = [];

  const onAnnounce = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (typeof detail !== 'object' || detail === null) return;

    const info = 'info' in detail ? (detail as { info?: unknown }).info : undefined;
    const provider = 'provider' in detail ? (detail as { provider?: unknown }).provider : undefined;
    if (!isEip1193(provider) || isLikelyPasswordManagerProvider(provider)) return;

    const infoObj = typeof info === 'object' && info !== null ? (info as Record<string, unknown>) : {};
    const rdns = typeof infoObj.rdns === 'string' ? infoObj.rdns : undefined;
    if (rdns && isPasswordManagerRdns(rdns)) return;

    const uuid =
      typeof infoObj.uuid === 'string' && infoObj.uuid.trim()
        ? infoObj.uuid.trim()
        : crypto.randomUUID();
    const name =
      typeof infoObj.name === 'string' && infoObj.name.trim() ? infoObj.name.trim() : 'Carteira Web3';

    providers.push({
      id: uuid,
      name,
      rdns,
      provider,
      source: 'eip6963',
    });
  };

  window.addEventListener('eip6963:announceProvider', onAnnounce);
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, timeoutMs);
  });

  window.removeEventListener('eip6963:announceProvider', onAnnounce);
  return providers;
}

function collectWindowEthereumProviders(): InjectedWalletProviderInfo[] {
  if (typeof window === 'undefined') return [];

  const out: InjectedWalletProviderInfo[] = [];
  const w = window as Window & {
    ethereum?: InjectedEthereum;
    trustwallet?: Eip1193Provider;
    trustWallet?: Eip1193Provider;
  };

  const pushProvider = (p: unknown, source: InjectedWalletProviderInfo['source'], idSuffix: string) => {
    if (!isEip1193(p) || isLikelyPasswordManagerProvider(p)) return;
    out.push({
      id: `window-${idSuffix}`,
      name: providerLabel(p, 'Browser Wallet'),
      provider: p,
      source,
    });
  };

  if (w.trustwallet) pushProvider(w.trustwallet, 'window.ethereum', 'trust');
  if (w.trustWallet) pushProvider(w.trustWallet, 'window.ethereum', 'trust-alt');

  const eth = w.ethereum;
  const multi = eth?.providers;
  if (Array.isArray(multi) && multi.length > 0) {
    multi.forEach((p, index) => {
      if (!isEip1193(p) || isLikelyPasswordManagerProvider(p)) return;
      out.push({
        id: `providers-${index}`,
        name: providerLabel(p, `Wallet ${index + 1}`),
        provider: p,
        source: 'window.ethereum.providers',
      });
    });
  } else if (eth && isEip1193(eth) && !isLikelyPasswordManagerProvider(eth)) {
    pushProvider(eth, 'window.ethereum', 'ethereum');
  }

  return out;
}

export async function getInjectedWalletProviders(): Promise<InjectedWalletProviderInfo[]> {
  const eip6963 = await discoverEip6963Providers(500);
  const windowProviders = collectWindowEthereumProviders();
  return dedupeProviders([...eip6963, ...windowProviders]);
}

export async function getPreferredInjectedWalletProvider(): Promise<InjectedWalletProviderInfo | null> {
  const list = await getInjectedWalletProviders();
  return list[0] ?? null;
}

export async function probeProviderSupportsChainRead(provider: unknown): Promise<boolean> {
  if (!isEip1193(provider)) return false;
  try {
    const id = await provider.request({ method: 'eth_chainId', params: [] });
    return typeof id === 'string' && /^0x[0-9a-fA-F]+$/.test(id);
  } catch {
    return false;
  }
}

async function probeProviderUsable(provider: Eip1193Provider): Promise<boolean> {
  if (await probeProviderSupportsChainRead(provider)) return true;
  try {
    await provider.request({ method: 'eth_accounts', params: [] });
    return true;
  } catch {
    return false;
  }
}

/** Best provider for connect: ranked, prefers Rabby; probes chain/accounts on ranked list. */
export async function resolveConnectableInjectedProvider(): Promise<InjectedWalletProviderInfo | null> {
  const list = await getInjectedWalletProviders();
  if (list.length === 0) return null;

  for (const info of list) {
    if (await probeProviderUsable(info.provider)) return info;
  }

  return list[0];
}

function parseChainId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (/^0x[0-9a-fA-F]+$/i.test(s)) {
    const n = Number(BigInt(s));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function isUserRejected(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string };
  return (
    e?.code === 4001 ||
    e?.code === '4001' ||
    String(e?.message || '')
      .toLowerCase()
      .includes('user rejected')
  );
}

/** Rabby/MetaMask: wallet installed but no account unlocked yet (not a real failure). */
export function isNoInjectedAccountsError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || '');
  return (
    /wallet must has at least one account/i.test(msg) ||
    /must have at least one account/i.test(msg) ||
    /no accounts?(?:\s|$)/i.test(msg)
  );
}

/** RPC/probe noise that should not hit console.error on mount or user cancel. */
export function isBenignInjectedWalletRpcError(err: unknown): boolean {
  if (err instanceof InjectedWalletError && err.code === INJECTED_WALLET_ERROR_CODES.USER_REJECTED) {
    return true;
  }
  return isUserRejected(err) || isNoInjectedAccountsError(err);
}

export async function safeEthAccounts(provider: Eip1193Provider): Promise<string[]> {
  try {
    const accounts = (await provider.request({ method: 'eth_accounts', params: [] })) as unknown;
    if (!Array.isArray(accounts)) return [];
    return accounts.filter(
      (a): a is string => typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a.trim()),
    );
  } catch (err: unknown) {
    if (isBenignInjectedWalletRpcError(err)) return [];
    throw err;
  }
}

function assertAddress(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value.trim())) {
    throw new InjectedWalletError(
      INJECTED_WALLET_ERROR_CODES.INVALID_ADDRESS,
      'Wallet returned an invalid address.',
    );
  }
  return value.trim() as `0x${string}`;
}

export async function connectInjectedWallet(): Promise<InjectedWalletConnection> {
  const ranked = await getInjectedWalletProviders();
  if (ranked.length === 0) {
    throw new InjectedWalletError(
      INJECTED_WALLET_ERROR_CODES.NO_PROVIDER,
      'No injected wallet provider found.',
    );
  }

  let lastError: unknown = null;

  for (const info of ranked) {
    try {
      const accounts = (await info.provider.request({
        method: 'eth_requestAccounts',
        params: [],
      })) as unknown;

      const first =
        Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
      if (!first) {
        throw new InjectedWalletError(
          INJECTED_WALLET_ERROR_CODES.CONNECT_FAILED,
          'Wallet did not return an account.',
        );
      }

      const address = assertAddress(first);
      const chainRaw = await info.provider.request({ method: 'eth_chainId', params: [] });
      const chainId = parseChainId(chainRaw);
      if (!chainId) {
        throw new InjectedWalletError(
          INJECTED_WALLET_ERROR_CODES.INVALID_CHAIN,
          'Wallet returned an invalid chain id.',
        );
      }

      return {
        address,
        chainId,
        providerName: info.name,
        provider: info.provider,
      };
    } catch (err: unknown) {
      lastError = err;
      if (isNoInjectedAccountsError(err)) {
        continue;
      }
      if (err instanceof InjectedWalletError && err.code === INJECTED_WALLET_ERROR_CODES.USER_REJECTED) {
        throw err;
      }
      if (isUserRejected(err)) {
        throw new InjectedWalletError(
          INJECTED_WALLET_ERROR_CODES.USER_REJECTED,
          'Connection cancelled by user.',
        );
      }
    }
  }

  const msg =
    lastError instanceof Error ? lastError.message : 'Could not connect to any injected wallet.';
  throw new InjectedWalletError(INJECTED_WALLET_ERROR_CODES.CONNECT_FAILED, msg);
}

export function collectInjectedWalletProvidersSync(): InjectedWalletProviderInfo[] {
  return dedupeProviders(collectWindowEthereumProviders());
}

export function hasInjectedWalletProvidersSync(): boolean {
  return collectInjectedWalletProvidersSync().length > 0;
}
