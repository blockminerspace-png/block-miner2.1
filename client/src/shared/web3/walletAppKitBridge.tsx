import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider } from '@reown/appkit/react';
import { polygon } from '@reown/appkit/networks';

type AppKitControls = ReturnType<typeof useAppKit>;

export type WalletAppKitBridgeValue = {
  openConnectModal: AppKitControls['open'];
  closeModal: AppKitControls['close'];
  kitAddress: string | undefined;
  kitConnected: boolean;
  kitChainId: unknown;
  switchToPolygon: () => Promise<void>;
  walletProvider: unknown;
};

export const WALLET_APP_KIT_STUB: WalletAppKitBridgeValue = {
  openConnectModal: async () => undefined,
  closeModal: async () => undefined,
  kitAddress: undefined,
  kitConnected: false,
  kitChainId: undefined,
  switchToPolygon: async () => undefined,
  walletProvider: undefined,
};

export const WalletAppKitContext = createContext<WalletAppKitBridgeValue>(WALLET_APP_KIT_STUB);

export function useWalletAppKitBridge(): WalletAppKitBridgeValue {
  return useContext(WalletAppKitContext);
}

/**
 * Subscribes Reown hooks and exposes a stable surface for `useWallet` without calling `useAppKit`
 * when WalletConnect is disabled (invalid / missing project id).
 */
export function WalletAppKitBridgeInner({ children }: { children: ReactNode }) {
  const { open, close } = useAppKit();
  const { address: kitAddress, isConnected: kitConnected } = useAppKitAccount();
  const { chainId: kitChainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider('eip155');

  const value = useMemo<WalletAppKitBridgeValue>(
    () => ({
      openConnectModal: open,
      closeModal: close,
      kitAddress,
      kitConnected,
      kitChainId,
      switchToPolygon: () => switchNetwork(polygon),
      walletProvider,
    }),
    [open, close, kitAddress, kitConnected, kitChainId, switchNetwork, walletProvider],
  );

  return <WalletAppKitContext.Provider value={value}>{children}</WalletAppKitContext.Provider>;
}
