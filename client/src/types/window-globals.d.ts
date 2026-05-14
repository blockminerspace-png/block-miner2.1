/**
 * Browser globals injected by analytics / wallet / build tooling.
 * Keep shapes minimal — only what the client reads/writes.
 */

type GtagCommand = 'config' | 'event' | 'js' | 'set' | 'consent' | string;

interface Window {
  gtag?: (...args: [GtagCommand, ...unknown[]]) => void;
  dataLayer?: unknown[];
  fbq?: ((...args: unknown[]) => void) & {
    push?: (...args: unknown[]) => void;
    loaded?: boolean;
    version?: string;
    queue?: unknown[];
    callMethod?: (...args: unknown[]) => void;
  };
  _fbq?: Window['fbq'];
  __blockminerMetaPixelLoaded?: boolean;
  __BLOCKMINER_ENV__?: Record<string, string | undefined>;
  ethereum?: import('viem').EIP1193Provider;
  trustwallet?: import('viem').EIP1193Provider;
  trustWallet?: import('viem').EIP1193Provider;
}

interface Navigator {
  userAgentData?: { platform?: string; brands?: readonly { brand: string; version: string }[] };
  deviceMemory?: number;
}
