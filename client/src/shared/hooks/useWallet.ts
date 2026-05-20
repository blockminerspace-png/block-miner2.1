import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDisconnect, useSignMessage } from 'wagmi';
import type { EIP1193Provider } from 'viem';
import { api } from '../../store/auth';
import { getBrowserEthereumProvider } from '../utils/walletProvider';
import {
  connectInjectedWallet,
  getInjectedWalletProviders,
  InjectedWalletError,
  INJECTED_WALLET_ERROR_CODES,
  isBenignInjectedWalletRpcError,
  safeEthAccounts,
} from '../wallet/injectedWallet';
import { isWalletConnectConfigured } from '../utils/walletConnect';
import { prefetchAppKitWalletCatalog } from '../../web3/appKitConfig';
import { useWalletAppKitBridge } from '../web3/walletAppKitBridge';
import { subscribeInjectedEthereumEvents } from '../utils/eip1193ProviderEvents';
import {
  clearWalletSessionClearedByUserFlag,
  isWalletSessionClearedByUser,
  markWalletSessionClearedByUser,
} from '../utils/walletSessionPreference';

const POLYGON_CHAIN_ID = '0x89';
const POLYGON_NUM = 137;

function getInjectedProvider(): EIP1193Provider | undefined {
  return getBrowserEthereumProvider() ?? undefined;
}

function isUnknownMethodError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const o = err as { code?: unknown; message?: unknown };
  const code = o.code;
  const msg = String(o.message || '').toLowerCase();
  return (
    code === -32601 ||
    code === 4200 ||
    msg.includes('unknown method') ||
    msg.includes('does not exist') ||
    msg.includes('not supported')
  );
}

function readWalletErrorMeta(e: unknown): { code?: string | number; causeCode?: number; message: string } {
  if (typeof e !== 'object' || e === null) return { message: '' };
  const o = e as { code?: unknown; cause?: unknown; message?: unknown };
  let causeCode: number | undefined;
  if (typeof o.cause === 'object' && o.cause !== null && 'code' in o.cause) {
    const c = (o.cause as { code?: unknown }).code;
    if (typeof c === 'number') causeCode = c;
  }
  const code = typeof o.code === 'string' || typeof o.code === 'number' ? o.code : undefined;
  const message = typeof o.message === 'string' ? o.message : '';
  return { code, causeCode, message };
}

interface SwitchNetworkOptions {
  onUnknownMethod?: () => void;
}

async function switchNetworkFor(
  provider: EIP1193Provider | null | undefined,
  options: SwitchNetworkOptions = {},
): Promise<void> {
  if (!provider) return;
  const { onUnknownMethod } = options;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
  } catch (switchError: unknown) {
    if (isUnknownMethodError(switchError)) {
      onUnknownMethod?.();
      return;
    }
    const meta = readWalletErrorMeta(switchError);
    if (meta.code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: POLYGON_CHAIN_ID,
              chainName: 'Polygon Mainnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: ['https://polygon-rpc.com'],
              blockExplorerUrls: ['https://polygonscan.com/'],
            },
          ],
        });
      } catch (addError: unknown) {
        if (isUnknownMethodError(addError) && onUnknownMethod) {
          onUnknownMethod();
          return;
        }
        console.error('Error adding network:', addError);
      }
    } else {
      console.error('Error switching network:', switchError);
    }
  }
}

function normalizeChainNum(chainId: unknown): number | null {
  if (chainId == null) return null;
  if (typeof chainId === 'number' && Number.isFinite(chainId)) return chainId;
  const s = String(chainId);
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s, 16);
    return Number.isNaN(n) ? null : n;
  }
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

async function signOwnershipMessageWithProvider(
  provider: EIP1193Provider,
  userAccount: string,
): Promise<unknown> {
  const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
  const req = provider.request as (args: { method: string; params: readonly unknown[] }) => Promise<unknown>;
  try {
    return await req({
      method: 'personal_sign',
      params: [message, userAccount],
    });
  } catch (signError: unknown) {
    const sig = await req({
      method: 'personal_sign',
      params: [userAccount, message],
    });
    if (!sig) throw signError;
    return sig;
  }
}

interface SyncKitOptions {
  forceRetry?: boolean;
}

interface ConnectOptions {
  useBrowserExtension?: boolean;
}

export function useWallet() {
  const { t } = useTranslation();
  const {
    openConnectModal: open,
    kitAddress,
    kitConnected,
    kitChainId,
    switchToPolygon: appKitSwitchNetwork,
    walletProvider,
  } = useWalletAppKitBridge();
  const { disconnectAsync } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const walletConnectConfigured = isWalletConnectConfigured();
  const linkingRef = useRef<string | null>(null);
  /** Same-address link in flight — deposit + effect share one Promise (no early return while busy). */
  const walletLinkInflightRef = useRef<Record<string, Promise<void>>>({});
  /** reject fn per address — cancel can unblock await syncKitWalletWithServer */
  const walletLinkRejectRef = useRef<Record<string, ((reason: unknown) => void) | undefined>>({});
  /** Bumped on user cancel so in-flight sync exits after awaits without toasting errors. */
  const linkOpIdRef = useRef(0);
  const openModalRef = useRef(false);
  const verifiedInjectedRef = useRef<EIP1193Provider | null>(null);

  const kitChainNum = normalizeChainNum(kitChainId);

  useEffect(() => {
    if (kitChainNum != null) {
      setChainId(`0x${kitChainNum.toString(16)}`);
    } else if (kitConnected && kitAddress) {
      /* keep previous or null until chain is known */
    } else {
      const injected = getInjectedProvider();
      if (injected) {
        injected
          .request({ method: 'eth_chainId' })
          .then((hex: unknown) => {
            setChainId(typeof hex === 'string' ? hex : String(hex));
          })
          .catch(() => {});
      } else if (!isConnected) {
        setChainId(null);
      }
    }
  }, [kitChainNum, kitConnected, kitAddress, isConnected]);

  const getActiveEip1193 = useCallback((): EIP1193Provider | undefined => {
    const w = walletProvider as EIP1193Provider | undefined;
    if (w) return w;
    if (verifiedInjectedRef.current) return verifiedInjectedRef.current;
    return getInjectedProvider();
  }, [walletProvider]);

  const cancelWalletSession = useCallback(async () => {
    markWalletSessionClearedByUser();
    verifiedInjectedRef.current = null;
    linkOpIdRef.current += 1;
    openModalRef.current = false;
    Object.entries(walletLinkRejectRef.current).forEach(([, rej]) => {
      try {
        rej?.(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
      } catch {
        /* ignore */
      }
    });
    walletLinkRejectRef.current = {};
    walletLinkInflightRef.current = {};
    linkingRef.current = null;
    setIsConnecting(false);
    try {
      await disconnectAsync();
    } catch {
      /* ignore */
    }
    setAccount(null);
    setIsConnected(false);
  }, [disconnectAsync]);

  const disconnectWalletConnectSession = useCallback(async () => {
    await cancelWalletSession();
  }, [cancelWalletSession]);

  const verifyWithServer = useCallback(
    async (userAccount: string, eip1193Provider: EIP1193Provider | undefined) => {
      const provider = eip1193Provider || (walletProvider as EIP1193Provider | undefined);
      let signature: unknown;
      if (provider) {
        signature = await signOwnershipMessageWithProvider(provider, userAccount);
      } else {
        const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
        signature = await signMessageAsync({ message, account: userAccount as `0x${string}` });
      }

      const res = await api.post('/wallet/update-address', {
        walletAddress: userAccount,
        signature,
      });

      if (res.data.ok) {
        setAccount(userAccount);
        setIsConnected(true);
        toast.success('Wallet verified and connected!');
        return true;
      }
      throw new Error(
        typeof res.data.message === 'string' ? res.data.message : 'Verification failed',
      );
    },
    [signMessageAsync, walletProvider],
  );

  const syncKitWalletWithServer = useCallback(
    async (addr: string, options: SyncKitOptions = {}) => {
      const { forceRetry = false } = options;
      if (!addr || !walletConnectConfigured) return;

      const key = addr.toLowerCase();
      if (linkingRef.current === `done:${addr}`) return;

      if (!forceRetry && linkingRef.current === `rejected:${addr}`) return;
      if (forceRetry && linkingRef.current === `rejected:${addr}`) {
        linkingRef.current = null;
      }

      const inflight = walletLinkInflightRef.current[key];
      if (inflight) return inflight;

      let resolveLink: (() => void) | undefined;
      let rejectLink: ((reason: unknown) => void) | undefined;
      const promise = new Promise<void>((resolve, reject) => {
        resolveLink = resolve;
        rejectLink = reject;
      });
      walletLinkInflightRef.current[key] = promise;
      walletLinkRejectRef.current[key] = rejectLink;

      linkOpIdRef.current += 1;
      const myOpId = linkOpIdRef.current;

      void (async () => {
        clearWalletSessionClearedByUserFlag();
        linkingRef.current = `busy:${addr}`;
        setIsConnecting(true);
        try {
          const bal = await api.get('/wallet/balance');
          if (myOpId !== linkOpIdRef.current) {
            delete walletLinkInflightRef.current[key];
            delete walletLinkRejectRef.current[key];
            setIsConnecting(false);
            return;
          }
          if (
            bal.data?.ok &&
            bal.data.walletAddress &&
            bal.data.walletAddress.toLowerCase() === key
          ) {
            setAccount(addr);
            setIsConnected(true);
            linkingRef.current = `done:${addr}`;
            delete walletLinkRejectRef.current[key];
            resolveLink?.();
            return;
          }
          await verifyWithServer(addr, getActiveEip1193());
          if (myOpId !== linkOpIdRef.current) {
            delete walletLinkInflightRef.current[key];
            delete walletLinkRejectRef.current[key];
            setIsConnecting(false);
            return;
          }
          linkingRef.current = `done:${addr}`;
          delete walletLinkRejectRef.current[key];
          resolveLink?.();
        } catch (e: unknown) {
          delete walletLinkRejectRef.current[key];
          const meta = readWalletErrorMeta(e);
          if (meta.code === 'CANCELLED') {
            linkingRef.current = null;
            rejectLink?.(e);
            return;
          }
          const rejected =
            meta.code === 4001 ||
            meta.causeCode === 4001 ||
            meta.message.toLowerCase().includes('user rejected');
          if (rejected) {
            linkingRef.current = `rejected:${addr}`;
            toast.error('Signature cancelled. Tap Connect again when you are ready to sign.');
          } else {
            linkingRef.current = null;
            toast.error(meta.message || 'Failed to verify wallet.');
          }
          rejectLink?.(e);
        } finally {
          delete walletLinkInflightRef.current[key];
          setIsConnecting(false);
        }
      })();

      return promise;
    },
    [walletConnectConfigured, verifyWithServer, getActiveEip1193],
  );

  const connectInjectedAndVerify = useCallback(async (): Promise<boolean> => {
    clearWalletSessionClearedByUserFlag();
    const discovered = await getInjectedWalletProviders();
    if (discovered.length === 0) {
      toast.error(t('wallet.web3_deposit.no_browser_wallet'), {
        id: 'wallet-injected-provider-error',
        duration: 8000,
      });
      return false;
    }

    setIsConnecting(true);
    try {
      if (kitConnected) {
        await disconnectAsync().catch(() => {});
      }

      const connection = await connectInjectedWallet();
      const injected = connection.provider as EIP1193Provider;
      verifiedInjectedRef.current = injected;

      const chainHex = `0x${connection.chainId.toString(16)}`;
      setChainId(chainHex);

      if (chainHex !== POLYGON_CHAIN_ID) {
        await switchNetworkFor(injected, {
          onUnknownMethod: () => toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
        });
      }

      await verifyWithServer(connection.address, injected);
      return true;
    } catch (error: unknown) {
      if (!isBenignInjectedWalletRpcError(error)) {
        console.error('Connection error:', error);
      }
      if (error instanceof InjectedWalletError) {
        if (error.code === INJECTED_WALLET_ERROR_CODES.USER_REJECTED) {
          toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-connect-user-rejected' });
        } else if (error.code === INJECTED_WALLET_ERROR_CODES.NO_PROVIDER) {
          toast.error(t('wallet.web3_deposit.no_browser_wallet'), { id: 'wallet-injected-provider-error' });
        } else {
          toast.error(t('wallet.web3_deposit.injected_connect_failed'), {
            id: 'wallet-connect-verify-failed',
          });
        }
        return false;
      }
      const meta = readWalletErrorMeta(error);
      if (meta.code === 4001) {
        toast.error(t('wallet.web3_deposit.connection_cancelled'), { id: 'wallet-connect-user-rejected' });
      } else {
        toast.error(meta.message || t('wallet.web3_deposit.injected_connect_failed'), {
          id: 'wallet-connect-verify-failed',
        });
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [kitConnected, disconnectAsync, verifyWithServer, t]);

  const openConnectModal = useCallback(async () => {
    if (openModalRef.current) {
      return;
    }

    clearWalletSessionClearedByUserFlag();
    openModalRef.current = true;
    setIsConnecting(true);
    try {
      prefetchAppKitWalletCatalog();
      await open();
    } catch (e: unknown) {
      const meta = readWalletErrorMeta(e);
      console.error(e);
      if (/connector already connected/i.test(meta.message)) {
        toast.info(t('wallet.web3_deposit.disconnect_to_switch'));
        return;
      }
      toast.error(meta.message || 'Could not open wallet modal.');
    } finally {
      openModalRef.current = false;
      setIsConnecting(false);
    }
  }, [open, t]);

  const connect = useCallback(
    async (options: ConnectOptions = {}): Promise<boolean> => {
      const useBrowserExtension = options.useBrowserExtension === true;

      if (useBrowserExtension) {
        const discovered = await getInjectedWalletProviders();
        if (discovered.length === 0 && walletConnectConfigured) {
          await openConnectModal();
          return false;
        }
        return connectInjectedAndVerify();
      }

      if (!walletConnectConfigured) {
        return connectInjectedAndVerify();
      }

      if (kitConnected && isConnected) {
        toast.info(t('wallet.web3_deposit.disconnect_to_switch'));
        return true;
      }
      if (kitConnected && kitAddress && !isConnected) {
        try {
          await syncKitWalletWithServer(kitAddress, { forceRetry: true });
          return true;
        } catch (e: unknown) {
          const meta = readWalletErrorMeta(e);
          if (meta.code === 'CANCELLED') throw e;
          /* other errors: toasts inside sync */
        }
        return false;
      }
      await openConnectModal();
      return false;
    },
    [
      walletConnectConfigured,
      kitConnected,
      isConnected,
      kitAddress,
      openConnectModal,
      connectInjectedAndVerify,
      syncKitWalletWithServer,
      t,
    ],
  );

  const connectWalletConnect = useCallback(async () => {
    if (!walletConnectConfigured) {
      toast.error(t('wallet.web3_deposit.wc_missing_build'));
      return;
    }
    await connect();
  }, [walletConnectConfigured, connect, t]);

  const switchNetwork = useCallback(async () => {
    if (walletConnectConfigured && kitConnected) {
      try {
        await appKitSwitchNetwork();
      } catch (e: unknown) {
        console.error(e);
        const meta = readWalletErrorMeta(e);
        toast.error(meta.message || 'Failed to switch network.');
      }
      return;
    }
    const discovered = await getInjectedWalletProviders();
    const p = discovered[0]?.provider as EIP1193Provider | undefined;
    await switchNetworkFor(p, {
      onUnknownMethod: () => toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
    });
  }, [walletConnectConfigured, kitConnected, appKitSwitchNetwork, t]);

  useEffect(() => {
    if (!isWalletSessionClearedByUser()) return;
    if (!walletConnectConfigured || !kitConnected) return;
    disconnectAsync().catch(() => {});
  }, [walletConnectConfigured, kitConnected, disconnectAsync]);

  useEffect(() => {
    if (!walletConnectConfigured || !kitConnected || !kitAddress) {
      if (!kitAddress) linkingRef.current = null;
      return;
    }

    if (isWalletSessionClearedByUser()) {
      return;
    }

    const n = normalizeChainNum(kitChainId);
    if (n != null && n !== POLYGON_NUM) {
      appKitSwitchNetwork().catch((e: unknown) => console.error('AppKit switch network', e));
      return;
    }

    const addr = kitAddress;
    if (linkingRef.current === `done:${addr}`) return;
    if (linkingRef.current === `rejected:${addr}`) return;

    syncKitWalletWithServer(addr).catch(() => {});
  }, [
    walletConnectConfigured,
    kitConnected,
    kitAddress,
    kitChainId,
    appKitSwitchNetwork,
    syncKitWalletWithServer,
  ]);

  const checkConnection = useCallback(async () => {
    if (isWalletSessionClearedByUser()) {
      return;
    }
    const discovered = await getInjectedWalletProviders();
    const provider = discovered[0]?.provider;
    if (!provider) return;

    try {
      const accounts = await safeEthAccounts(provider);
      if (accounts.length === 0) return;

      const currentChainId = await provider.request({ method: 'eth_chainId' });
      setChainId(typeof currentChainId === 'string' ? currentChainId : String(currentChainId));

      const res = await api.get('/wallet/balance');
      if (
        res.data.ok &&
        res.data.walletAddress &&
        res.data.walletAddress.toLowerCase() === accounts[0].toLowerCase()
      ) {
        setAccount(accounts[0]);
        setIsConnected(true);
      }
    } catch (error: unknown) {
      if (!isBenignInjectedWalletRpcError(error)) {
        console.error('Error checking connection:', error);
      }
    }
  }, []);

  useEffect(() => {
    void checkConnection();

    const provider = getInjectedProvider();
    if (!provider) return undefined;

    const handleAccountsChanged = (accounts: unknown) => {
      if (kitConnected) return;
      if (isWalletSessionClearedByUser()) {
        setAccount(null);
        setIsConnected(false);
        return;
      }
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (list.length > 0) {
        setAccount(list[0]);
        setIsConnected(true);
      } else {
        setAccount(null);
        setIsConnected(false);
      }
    };

    const handleChainChanged = (newChainId: unknown) => {
      setChainId(typeof newChainId === 'string' ? newChainId : String(newChainId));
    };

    return subscribeInjectedEthereumEvents(provider, {
      onAccountsChanged: handleAccountsChanged,
      onChainChanged: handleChainChanged,
    });
  }, [checkConnection, kitConnected]);

  const isCorrectNetwork = chainId === POLYGON_CHAIN_ID || kitChainNum === POLYGON_NUM;

  return {
    account,
    chainId,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    connect,
    connectWalletConnect,
    switchNetwork,
    getActiveEip1193,
    walletConnectConfigured,
    disconnectWalletConnectSession,
    cancelWalletSession,
    kitConnected,
    kitAddress,
  };
}
