import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { getInjectedOnlyWagmiConfig } from './injectedOnlyWagmiConfig';
import { WALLET_APP_KIT_STUB, WalletAppKitContext } from './walletAppKitBridge';
import { web3QueryClient } from './web3QueryClient';

/** Fallback wallet stack when the heavy Web3 chunk fails to load after deploy. */
export default function Web3ProvidersLight({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={web3QueryClient}>
      <WagmiProvider config={getInjectedOnlyWagmiConfig()}>
        <WalletAppKitContext.Provider value={WALLET_APP_KIT_STUB}>{children}</WalletAppKitContext.Provider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
