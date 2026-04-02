import '@rainbow-me/rainbowkit/styles.css';
import {
  getDefaultConfig,
  RainbowKitProvider as RainbowProvider,
  darkTheme
} from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { polygon } from 'wagmi/chains';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '53ccad4ea1032941f7db3631c2bafcec';

const config = getDefaultConfig({
  appName: 'Block Miner',
  projectId: projectId,
  chains: [polygon],
  ssr: false, // Set to true if using Next.js
});

export function RainbowKitProvider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowProvider theme={darkTheme({
          accentColor: '#00bb7f',
          accentColorForeground: 'white',
          borderRadius: 'large',
          fontStack: 'system',
          overlayBlur: 'small',
        })}>
          {children}
        </RainbowProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
