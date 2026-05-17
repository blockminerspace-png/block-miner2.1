import { createAppKit } from '@reown/appkit/react';
import { ApiController } from '@reown/appkit-controllers';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { polygon } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';
import { getWalletConnectMetadataUrl } from '../shared/utils/walletConnect';
import { getWalletConnectProjectId, isValidWalletConnectProjectId } from '../shared/web3/web3Config';

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

/** Non-empty tuple required by AppKit / Wagmi adapter typings. */
export const networks: [typeof polygon, ...typeof polygon[]] = [polygon];

let appKitInit: { wagmiAdapter: WagmiAdapter } | null = null;

/**
 * Initializes Reown AppKit + WagmiAdapter once when `VITE_WALLETCONNECT_PROJECT_ID` (or alias) is a valid 32-char hex id.
 * Does not run on import — avoids remote calls with placeholder or missing project ids.
 */
export function ensureAppKitInitialized(): WagmiAdapter | null {
  const projectId = getWalletConnectProjectId();
  if (!isValidWalletConnectProjectId(projectId)) {
    return null;
  }

  if (!appKitInit) {
    void import('@reown/appkit-scaffold-ui/w3m-modal');

    const wagmiAdapter = new WagmiAdapter({
      networks,
      projectId,
      ssr: false,
    });

    const metaUrl = getWalletConnectMetadataUrl();

    void createAppKit({
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
      features: {
        analytics: false,
      },
    });

    scheduleAppKitWalletPrefetch();
    appKitInit = { wagmiAdapter };
  }

  return appKitInit.wagmiAdapter;
}

function scheduleAppKitWalletPrefetch() {
  const run = () => {
    void ApiController.prefetch({
      fetchNetworkImages: true,
      fetchConnectorImages: true,
      fetchWalletRanks: true,
      fetchFeaturedWallets: true,
      fetchRecommendedWallets: true,
    });
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 1500);
  }
}

/** Test helper: clears lazy init state (module stays loaded). */
export function resetAppKitInitForTests() {
  appKitInit = null;
}
