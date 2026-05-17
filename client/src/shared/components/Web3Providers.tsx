import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, ensureAppKitInitialized } from '../../web3/appKitConfig';
import { getInjectedOnlyWagmiConfig } from '../web3/injectedOnlyWagmiConfig';
import { isWalletConnectConfigured } from '../web3/web3Config';
import { WalletAppKitBridgeInner, WALLET_APP_KIT_STUB, WalletAppKitContext } from '../web3/walletAppKitBridge';

/**
 * Wallet stack (Reown AppKit + wagmi + TanStack Query) — loaded only inside the authenticated shell.
 * When WalletConnect project id is invalid or missing, wagmi runs in injected-only mode and Reown is not initialized (no remote WalletConnect/Reown calls).
 */
export default function Web3Providers({ children }: { children: ReactNode }) {
  const appKitEnabled = isWalletConnectConfigured();
  const wagmiAdapter = appKitEnabled ? ensureAppKitInitialized() : null;

  if (!appKitEnabled || !wagmiAdapter) {
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={getInjectedOnlyWagmiConfig()}>
          <WalletAppKitContext.Provider value={WALLET_APP_KIT_STUB}>{children}</WalletAppKitContext.Provider>
        </WagmiProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <WalletAppKitBridgeInner>{children}</WalletAppKitBridgeInner>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
