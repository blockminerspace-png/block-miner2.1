import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { wagmiAdapter, queryClient } from '../web3/appKitConfig.js';
import '@reown/appkit-scaffold-ui/w3m-modal';

/**
 * Wallet stack (Reown AppKit + wagmi + TanStack Query) — loaded only for authenticated routes.
 * Keeping this out of the entry chunk speeds first paint on `/` (landing is guest-only).
 */
export default function Web3Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>{children}</WagmiProvider>
    </QueryClientProvider>
  );
}
