/**
 * Back-compat re-exports — prefer `client/src/shared/wallet/injectedWallet.ts` for new code.
 */
import type { EIP1193Provider } from 'viem';
import {
  collectInjectedWalletProvidersSync,
  connectInjectedWallet,
  getInjectedWalletProviders,
  getPreferredInjectedWalletProvider,
  hasInjectedWalletProvidersSync,
  isLikelyPasswordManagerProvider,
  probeProviderSupportsChainRead,
  resolveConnectableInjectedProvider,
} from '../wallet/injectedWallet';

export { isLikelyPasswordManagerProvider, probeProviderSupportsChainRead };

/** Sync snapshot (window paths only). For full EIP-6963 list use getInjectedWalletProviders(). */
export function collectInjectedProviderCandidates(): EIP1193Provider[] {
  return collectInjectedWalletProvidersSync().map((p) => p.provider as EIP1193Provider);
}

export async function collectInjectedProviderCandidatesAsync(): Promise<EIP1193Provider[]> {
  const list = await getInjectedWalletProviders();
  return list.map((p) => p.provider as EIP1193Provider);
}

export function getBrowserEthereumProvider(): EIP1193Provider | null {
  const sync = collectInjectedWalletProvidersSync();
  if (sync[0]) return sync[0].provider as EIP1193Provider;
  return null;
}

export async function getVerifiedBrowserEthereumProvider(): Promise<EIP1193Provider | null> {
  const info = await resolveConnectableInjectedProvider();
  return (info?.provider as EIP1193Provider | undefined) ?? null;
}

export function hasBrowserEthereumProvider(): boolean {
  return hasInjectedWalletProvidersSync();
}

export {
  connectInjectedWallet,
  getInjectedWalletProviders,
  getPreferredInjectedWalletProvider,
};
