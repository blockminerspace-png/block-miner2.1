import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { polygon } from '@reown/appkit/networks';
import { QueryClient } from '@tanstack/react-query';
import { getWalletConnectMetadataUrl } from '../utils/walletConnect.js';

export const queryClient = new QueryClient();

const envProjectId = String(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '').trim();

const projectId =
  envProjectId ||
  '00000000000000000000000000000000';

export const networks = [polygon];

const metaUrl = getWalletConnectMetadataUrl();

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: false,
});

createAppKit({
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
});
