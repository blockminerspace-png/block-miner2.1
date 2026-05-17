import { createConfig, http, injected } from 'wagmi';
import { polygon } from 'wagmi/chains';
import type { Config } from 'wagmi';

let cached: Config | undefined;

/** Minimal wagmi stack (browser extension only) when WalletConnect project id is missing or invalid. */
export function getInjectedOnlyWagmiConfig(): Config {
  if (!cached) {
    cached = createConfig({
      chains: [polygon],
      connectors: [injected({ shimDisconnect: true })],
      transports: {
        [polygon.id]: http(),
      },
    });
  }
  return cached;
}
