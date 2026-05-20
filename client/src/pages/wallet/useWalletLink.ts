import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { EIP1193Provider } from 'viem';
import {
  connectInjectedWallet,
  getInjectedWalletProviders,
  InjectedWalletError,
  INJECTED_WALLET_ERROR_CODES,
  isBenignInjectedWalletRpcError,
} from '../../shared/wallet/injectedWallet';
import { walletApi } from './wallet.api';
import type { SavedWalletState, ConnectedWalletState } from './wallet.types';

const POLYGON_CHAIN_ID = '0x89';
const POLYGON_NUM = 137;

function readWalletErrorMeta(e: unknown): { code?: string | number; message: string } {
  if (typeof e !== 'object' || e === null) return { message: '' };
  const o = e as { code?: unknown; message?: unknown };
  return {
    code: typeof o.code === 'string' || typeof o.code === 'number' ? o.code : undefined,
    message: typeof o.message === 'string' ? o.message : '',
  };
}

async function signLinkMessage(provider: EIP1193Provider, account: string, message: string): Promise<string> {
  const req = provider.request as (args: { method: string; params: readonly unknown[] }) => Promise<unknown>;
  try {
    const sig = await req({ method: 'personal_sign', params: [message, account] });
    return typeof sig === 'string' ? sig : '';
  } catch {
    const sig = await req({ method: 'personal_sign', params: [account, message] });
    return typeof sig === 'string' ? sig : '';
  }
}

export function useWalletLink() {
  const { t } = useTranslation();
  const [savedWallet, setSavedWallet] = useState<SavedWalletState>({
    walletAddress: null,
    chainId: null,
    verifiedAt: null,
  });
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletState>(null);
  const [discoveredProviders, setDiscoveredProviders] = useState(0);
  const [detectedWalletName, setDetectedWalletName] = useState<string | null>(null);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const pendingChallengeRef = useRef<{ message: string; address: string; chainId: number } | null>(null);
  const activeProviderRef = useRef<EIP1193Provider | null>(null);

  const loadSavedWallet = useCallback(async () => {
    setIsLoadingSaved(true);
    try {
      const res = await walletApi.getWalletMe();
      if (res.data?.ok && res.data.wallet?.address) {
        setSavedWallet({
          walletAddress: res.data.wallet.address as `0x${string}`,
          chainId: res.data.wallet.chainId ?? POLYGON_NUM,
          verifiedAt: res.data.wallet.verifiedAt ?? null,
        });
      } else {
        setSavedWallet({ walletAddress: null, chainId: null, verifiedAt: null });
      }
    } catch {
      setSavedWallet({ walletAddress: null, chainId: null, verifiedAt: null });
    } finally {
      setIsLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedWallet();
    let cancelled = false;
    void getInjectedWalletProviders().then((list) => {
      if (cancelled) return;
      setDiscoveredProviders(list.length);
      setDetectedWalletName(list[0]?.name ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [loadSavedWallet]);

  const connectWallet = useCallback(async (): Promise<boolean> => {
    const discovered = await getInjectedWalletProviders();
    if (discovered.length === 0) {
      toast.error(t('wallet.web3_deposit.no_browser_wallet'), { id: 'wallet-link-no-provider' });
      return false;
    }

    setIsConnecting(true);
    try {
      const connection = await connectInjectedWallet();
      activeProviderRef.current = connection.provider as EIP1193Provider;
      setConnectedWallet({
        address: connection.address as `0x${string}`,
        chainId: connection.chainId,
        providerName: connection.providerName,
      });
      pendingChallengeRef.current = null;
      return true;
    } catch (error: unknown) {
      if (!isBenignInjectedWalletRpcError(error)) {
        console.error('connectWallet error', error);
      }
      if (error instanceof InjectedWalletError) {
        if (error.code === INJECTED_WALLET_ERROR_CODES.USER_REJECTED) {
          toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-link-rejected' });
        } else {
          toast.error(t('wallet.web3_deposit.injected_connect_failed'), { id: 'wallet-link-connect-failed' });
        }
      } else {
        const meta = readWalletErrorMeta(error);
        toast.error(meta.message || t('wallet.web3_deposit.injected_connect_failed'));
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [t]);

  const linkWallet = useCallback(async (): Promise<boolean> => {
    if (!connectedWallet) {
      toast.error(t('wallet.web3_deposit.connect_wallet_failed'));
      return false;
    }

    const provider = activeProviderRef.current;
    if (!provider) {
      toast.error(t('wallet.web3_deposit.no_browser_wallet'));
      return false;
    }

    setIsLinking(true);
    try {
      const address = connectedWallet.address;
      const chainId = connectedWallet.chainId;

      const challengeRes = await walletApi.postWalletLinkChallenge({ address, chainId });
      if (!challengeRes.data?.ok || !challengeRes.data.message) {
        toast.error(challengeRes.data?.message || 'Unable to start wallet verification.');
        return false;
      }

      const message = challengeRes.data.message;
      pendingChallengeRef.current = { message, address, chainId };

      const signature = await signLinkMessage(provider, address, message);
      if (!signature) {
        toast.error('Signature rejected.');
        return false;
      }

      const verifyRes = await walletApi.postWalletLinkVerify({ address, chainId, signature });
      if (!verifyRes.data?.ok || !verifyRes.data.wallet?.address) {
        toast.error(verifyRes.data?.message || 'Unable to save wallet.');
        return false;
      }

      setSavedWallet({
        walletAddress: verifyRes.data.wallet.address as `0x${string}`,
        chainId: verifyRes.data.wallet.chainId ?? chainId,
        verifiedAt: verifyRes.data.wallet.verifiedAt ?? new Date().toISOString(),
      });
      pendingChallengeRef.current = null;
      toast.success(t('wallet.web3_deposit.wallet_linked_success', { defaultValue: 'Wallet linked successfully!' }));
      return true;
    } catch (error: unknown) {
      const meta = readWalletErrorMeta(error);
      if (meta.code === 4001 || meta.message.toLowerCase().includes('user rejected')) {
        toast.error(t('wallet.web3_deposit.connection_cancelled'));
      } else {
        toast.error(meta.message || 'Failed to link wallet.');
      }
      return false;
    } finally {
      setIsLinking(false);
    }
  }, [connectedWallet, t]);

  const unlinkWallet = useCallback(async (): Promise<boolean> => {
    try {
      await walletApi.deleteWalletLink();
      setSavedWallet({ walletAddress: null, chainId: null, verifiedAt: null });
      setConnectedWallet(null);
      activeProviderRef.current = null;
      pendingChallengeRef.current = null;
      toast.success(t('wallet.web3_deposit.wallet_unlinked', { defaultValue: 'Wallet unlinked.' }));
      return true;
    } catch (error: unknown) {
      toast.error(readWalletErrorMeta(error).message || 'Unable to unlink wallet.');
      return false;
    }
  }, [t]);

  const clearConnectedSession = useCallback(() => {
    setConnectedWallet(null);
    activeProviderRef.current = null;
    pendingChallengeRef.current = null;
  }, []);

  const isCorrectNetwork =
    connectedWallet?.chainId === POLYGON_NUM ||
    connectedWallet == null;

  return {
    savedWallet,
    connectedWallet,
    discoveredProviders,
    detectedWalletName,
    isLoadingSaved,
    isConnecting,
    isLinking,
    isCorrectNetwork,
    loadSavedWallet,
    connectWallet,
    linkWallet,
    unlinkWallet,
    clearConnectedSession,
    getActiveProvider: () => activeProviderRef.current,
  };
}
