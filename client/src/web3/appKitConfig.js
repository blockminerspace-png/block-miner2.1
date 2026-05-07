import { createAppKit } from '@reown/appkit/react';
import { ApiController } from '@reown/appkit-controllers';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { polygon } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';
import { getWalletConnectMetadataUrl, getWalletConnectProjectId } from '../utils/walletConnect.js';

/**
 * Wagmi / AppKit use TanStack Query internally (e.g. balance reads). Defaults that refetch
 * aggressively can saturate the browser connection limit to the same origin and leave
 * XHRs like `/inventory` + `/rooms` stuck in "pending" behind dozens of wallet RPC calls.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 15 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const projectId = getWalletConnectProjectId() || '00000000000000000000000000000000';

export const networks = [polygon];

const metaUrl = getWalletConnectMetadataUrl();

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});

const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  defaultNetwork: polygon,
  metadata: {
    name: 'BlockMiner',
    description: 'POL on Polygon — BlockMiner',
    url: metaUrl,
    icons: [`${metaUrl}/favicon.ico`],
  },
  // Fewer optional Reown analytics calls. Persistent 403s need a real VITE_WALLETCONNECT_PROJECT_ID and allowed domains in the Reown dashboard.
  features: {
    analytics: false,
  },
});

// AppKit only auto-prefetches the explorer in headless mode without injected wallets; with MetaMask
// etc. the "All wallets" grid could stay on skeletons until this runs.
void appKit.readyPromise?.then(() =>
  ApiController.prefetch({
    fetchNetworkImages: true,
    fetchConnectorImages: true,
    fetchWalletRanks: true,
    fetchFeaturedWallets: true,
    fetchRecommendedWallets: true,
  })
);
