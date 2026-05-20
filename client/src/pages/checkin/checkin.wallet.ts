import { getAddress, isAddress, type Hex } from 'viem';
import type { EIP1193Provider } from 'viem';
import {
  connectInjectedWallet as connectSharedInjectedWallet,
  getInjectedWalletProviders,
  hasInjectedWalletProvidersSync,
  resolveConnectableInjectedProvider,
} from '../../shared/wallet/injectedWallet';

export type InjectedWalletAccount = {
  address: `0x${string}`;
  chainId: number;
};

export class CheckinWalletError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CheckinWalletError';
    this.code = code;
  }
}

export function getExpectedCheckinChainId(): number {
  const raw = import.meta.env.VITE_CHECKIN_CHAIN_ID;
  const n = Number(String(raw ?? '137').trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 137;
}

export function hasInjectedWallet(): boolean {
  return hasInjectedWalletProvidersSync();
}

function isUserRejected(err: unknown): boolean {
  const e = err as { code?: number | string };
  return e?.code === 4001 || e?.code === '4001';
}

export function isWalletUserRejection(err: unknown): boolean {
  return isUserRejected(err);
}

export async function connectInjectedWallet(): Promise<InjectedWalletAccount> {
  try {
    const list = await getInjectedWalletProviders();
    if (list.length === 0) {
      throw new CheckinWalletError(
        'NO_INJECTED_WALLET',
        'Open this page in a browser with a Web3 wallet or install MetaMask, Rabby, or Brave Wallet.',
      );
    }
    const conn = await connectSharedInjectedWallet();
    return { address: conn.address, chainId: conn.chainId };
  } catch (err: unknown) {
    if (err instanceof CheckinWalletError) throw err;
    const code = (err as { code?: string }).code;
    if (code === 'USER_REJECTED' || isUserRejected(err)) {
      throw new CheckinWalletError('USER_REJECTED', 'Transaction cancelled by user.');
    }
    throw new CheckinWalletError(
      'NO_INJECTED_WALLET',
      err instanceof Error ? err.message : 'Wallet connection failed.',
    );
  }
}

export async function switchOrAddExpectedChain(expectedChainId: number): Promise<void> {
  const info = await resolveConnectableInjectedProvider();
  const provider = info?.provider as EIP1193Provider | undefined;
  if (!provider) {
    throw new CheckinWalletError(
      'NO_INJECTED_WALLET',
      'Open this page in a browser with a Web3 wallet or install MetaMask, Rabby, or Brave Wallet.',
    );
  }

  const hex = `0x${expectedChainId.toString(16)}` as Hex;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e?.code === 4902 && expectedChainId === 137) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hex,
            chainName: 'Polygon Mainnet',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com/'],
          },
        ],
      });
      return;
    }
    if (isUserRejected(err)) {
      throw new CheckinWalletError('USER_REJECTED', 'Transaction cancelled by user.');
    }
    throw new CheckinWalletError(
      'WRONG_NETWORK',
      `Switch your wallet to chain ${expectedChainId} (Polygon) and try again.`,
    );
  }
}

export async function ensureInjectedOnExpectedChain(
  expectedChainId: number,
): Promise<InjectedWalletAccount> {
  const account = await connectInjectedWallet();
  if (account.chainId !== expectedChainId) {
    await switchOrAddExpectedChain(expectedChainId);
    const info = await resolveConnectableInjectedProvider();
    const provider = info?.provider;
    if (!provider) {
      throw new CheckinWalletError('NO_INJECTED_WALLET', 'Wallet provider unavailable after network switch.');
    }
    const chainHex = await provider.request({ method: 'eth_chainId', params: [] });
    const chainId =
      typeof chainHex === 'string' && /^0x[0-9a-fA-F]+$/i.test(chainHex)
        ? Number(BigInt(chainHex))
        : null;
    if (!chainId || chainId !== expectedChainId) {
      throw new CheckinWalletError(
        'WRONG_NETWORK',
        `Switch your wallet to chain ${expectedChainId} (Polygon) and try again.`,
      );
    }
    return { ...account, chainId };
  }
  return account;
}
