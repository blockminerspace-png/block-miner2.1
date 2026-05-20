export type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
  isCoinbaseWallet?: boolean;
};

export type InjectedWalletProviderSource = 'eip6963' | 'window.ethereum' | 'window.ethereum.providers';

export type InjectedWalletProviderInfo = {
  id: string;
  name: string;
  rdns?: string;
  provider: Eip1193Provider;
  source: InjectedWalletProviderSource;
};

export type InjectedWalletConnection = {
  address: `0x${string}`;
  chainId: number;
  providerName: string;
  provider: Eip1193Provider;
};
