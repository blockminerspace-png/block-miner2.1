import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    useAppKit,
    useAppKitAccount,
    useAppKitNetwork,
    useAppKitProvider,
} from '@reown/appkit/react';
import { polygon } from '@reown/appkit/networks';
import { useDisconnect, useSignMessage } from 'wagmi';
import { api } from '../store/auth';
import {
    getBrowserEthereumProvider,
    getVerifiedBrowserEthereumProvider,
} from '../utils/walletProvider.js';
import { isWalletConnectConfigured } from '../utils/walletConnect.js';
import { subscribeInjectedEthereumEvents } from '../utils/eip1193ProviderEvents.js';
import {
    clearWalletSessionClearedByUserFlag,
    isWalletSessionClearedByUser,
    markWalletSessionClearedByUser,
} from '../utils/walletSessionPreference.js';

const POLYGON_CHAIN_ID = '0x89';
const POLYGON_NUM = 137;

function getInjectedProvider() {
    return getBrowserEthereumProvider();
}

function isUnknownMethodError(err) {
    const code = err?.code;
    const msg = String(err?.message || '').toLowerCase();
    return (
        code === -32601 ||
        code === 4200 ||
        msg.includes('unknown method') ||
        msg.includes('does not exist') ||
        msg.includes('not supported')
    );
}

async function switchNetworkFor(provider, { onUnknownMethod } = {}) {
    if (!provider) return;
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: POLYGON_CHAIN_ID }],
        });
    } catch (switchError) {
        if (isUnknownMethodError(switchError)) {
            if (onUnknownMethod) onUnknownMethod();
            return;
        }
        if (switchError.code === 4902) {
            try {
                await provider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: POLYGON_CHAIN_ID,
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
                        rpcUrls: ['https://polygon-rpc.com'],
                        blockExplorerUrls: ['https://polygonscan.com/'],
                    }],
                });
            } catch (addError) {
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

function normalizeChainNum(chainId) {
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

async function signOwnershipMessageWithProvider(provider, userAccount) {
    const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
    try {
        return await provider.request({
            method: 'personal_sign',
            params: [message, userAccount],
        });
    } catch (signError) {
        const sig = await provider.request({
            method: 'personal_sign',
            params: [userAccount, message],
        });
        if (!sig) throw signError;
        return sig;
    }
}

export function useWallet() {
    const { t } = useTranslation();
    const { open } = useAppKit();
    const { address: kitAddress, isConnected: kitConnected } = useAppKitAccount();
    const { chainId: kitChainId, switchNetwork: appKitSwitchNetwork } = useAppKitNetwork();
    const { walletProvider } = useAppKitProvider('eip155');
    const { disconnectAsync } = useDisconnect();
    const { signMessageAsync } = useSignMessage();

    const [account, setAccount] = useState(null);
    const [chainId, setChainId] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const walletConnectConfigured = isWalletConnectConfigured();
    const linkingRef = useRef(null);
    /** Same-address link in flight — deposit + effect share one Promise (no early return while busy). */
    const walletLinkInflightRef = useRef({});
    /** reject fn per address — cancel can unblock await syncKitWalletWithServer */
    const walletLinkRejectRef = useRef({});
    /** Bumped on user cancel so in-flight sync exits after awaits without toasting errors. */
    const linkOpIdRef = useRef(0);
    const openModalRef = useRef(false);

    const kitChainNum = normalizeChainNum(kitChainId);

    useEffect(() => {
        if (kitChainNum != null) {
            setChainId(`0x${kitChainNum.toString(16)}`);
        } else if (kitConnected && kitAddress) {
            /* keep previous or null until chain is known */
        } else {
            const injected = getInjectedProvider();
            if (injected) {
                injected.request({ method: 'eth_chainId' }).then((hex) => {
                    setChainId(hex);
                }).catch(() => {});
            } else if (!isConnected) {
                setChainId(null);
            }
        }
    }, [kitChainNum, kitConnected, kitAddress, isConnected]);

    const getActiveEip1193 = useCallback(() => {
        return walletProvider || getInjectedProvider();
    }, [walletProvider]);

    const cancelWalletSession = useCallback(async () => {
        markWalletSessionClearedByUser();
        linkOpIdRef.current += 1;
        openModalRef.current = false;
        Object.entries(walletLinkRejectRef.current).forEach(([, rej]) => {
            try {
                rej(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
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
        async (userAccount, eip1193Provider) => {
            const provider = eip1193Provider || walletProvider;
            let signature;
            if (provider) {
                signature = await signOwnershipMessageWithProvider(provider, userAccount);
            } else {
                const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
                signature = await signMessageAsync({ message, account: userAccount });
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
            throw new Error(res.data.message || 'Verification failed');
        },
        [signMessageAsync]
    );

    const syncKitWalletWithServer = useCallback(
        async (addr, options = {}) => {
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

            let resolveLink;
            let rejectLink;
            const promise = new Promise((resolve, reject) => {
                resolveLink = resolve;
                rejectLink = reject;
            });
            walletLinkInflightRef.current[key] = promise;
            walletLinkRejectRef.current[key] = rejectLink;

            linkOpIdRef.current += 1;
            const myOpId = linkOpIdRef.current;

            (async () => {
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
                        resolveLink();
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
                    resolveLink();
                } catch (e) {
                    delete walletLinkRejectRef.current[key];
                    if (e?.code === 'CANCELLED') {
                        linkingRef.current = null;
                        rejectLink(e);
                        return;
                    }
                    const rejected =
                        e?.code === 4001 ||
                        e?.cause?.code === 4001 ||
                        String(e?.message || '').toLowerCase().includes('user rejected');
                    if (rejected) {
                        linkingRef.current = `rejected:${addr}`;
                        toast.error('Signature cancelled. Tap Connect again when you are ready to sign.');
                    } else {
                        linkingRef.current = null;
                        toast.error(e?.message || 'Failed to verify wallet.');
                    }
                    rejectLink(e);
                } finally {
                    delete walletLinkInflightRef.current[key];
                    setIsConnecting(false);
                }
            })();

            return promise;
        },
        [walletConnectConfigured, verifyWithServer, getActiveEip1193]
    );

    const connectInjectedAndVerify = useCallback(
        async () => {
            clearWalletSessionClearedByUserFlag();
            const injected = await getVerifiedBrowserEthereumProvider();
            if (!injected) {
                const hasSlot =
                    typeof window !== 'undefined' &&
                    (window.ethereum || window.trustwallet || window.trustWallet);
                toast.error(
                    hasSlot
                        ? t('wallet.web3_deposit.injected_unusable')
                        : t('wallet.web3_deposit.no_browser_wallet')
                );
                return;
            }

            setIsConnecting(true);
            try {
                if (kitConnected) {
                    await disconnectAsync().catch(() => {});
                }

                const accounts = await injected.request({ method: 'eth_requestAccounts' });
                const userAccount = accounts[0];

                const currentChainId = await injected.request({ method: 'eth_chainId' });
                setChainId(currentChainId);

                if (currentChainId !== POLYGON_CHAIN_ID) {
                    await switchNetworkFor(injected, {
                        onUnknownMethod: () =>
                            toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
                    });
                }

                await verifyWithServer(userAccount, injected);
            } catch (error) {
                console.error('Connection error:', error);
                if (error.code === 4001) {
                    toast.error('Connection cancelled by user.');
                } else {
                    toast.error(error.message || 'Failed to connect/verify wallet.');
                }
            } finally {
                setIsConnecting(false);
            }
        },
        [kitConnected, disconnectAsync, verifyWithServer, t]
    );

    const openConnectModal = useCallback(async () => {
        if (openModalRef.current) {
            return;
        }

        clearWalletSessionClearedByUserFlag();
        openModalRef.current = true;
        setIsConnecting(true);
        try {
            // Nunca desligar aqui só porque kitConnected — isso mata a sessão WC logo após o telemóvel
            // aprovar (kitConnected=true mas isConnected ainda false) ou se o utilizador toca "Conectar" outra vez.

            // AppKit prefetch also runs after init in web3/appKitConfig.js so "All wallets" is warmed early.
            await open();
        } catch (e) {
            const message = String(e?.message || '');
            console.error(e);
            if (/connector already connected/i.test(message)) {
                toast.info(t('wallet.web3_deposit.disconnect_to_switch'));
                return;
            }
            toast.error(message || 'Could not open wallet modal.');
        } finally {
            openModalRef.current = false;
            setIsConnecting(false);
        }
    }, [open, t]);

    const connect = useCallback(async (options = {}) => {
        const useBrowserExtension = options.useBrowserExtension === true;

        if (!walletConnectConfigured || useBrowserExtension) {
            await connectInjectedAndVerify();
            return;
        }

        if (kitConnected && isConnected) {
            toast.info(t('wallet.web3_deposit.disconnect_to_switch'));
            return;
        }
        // WC session active but not yet signed / synced — reuse same Promise as useEffect (e.g. deposit flow).
        if (kitConnected && kitAddress && !isConnected) {
            try {
                await syncKitWalletWithServer(kitAddress, { forceRetry: true });
            } catch (e) {
                if (e?.code === 'CANCELLED') throw e;
                /* other errors: toasts inside sync */
            }
            return;
        }
        await openConnectModal();
    }, [
        walletConnectConfigured,
        kitConnected,
        isConnected,
        kitAddress,
        openConnectModal,
        connectInjectedAndVerify,
        syncKitWalletWithServer,
        t,
    ]);

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
                await appKitSwitchNetwork(polygon);
            } catch (e) {
                console.error(e);
                toast.error(e?.message || 'Failed to switch network.');
            }
            return;
        }
        const p = await getVerifiedBrowserEthereumProvider();
        await switchNetworkFor(p, {
            onUnknownMethod: () =>
                toast.error(t('wallet.web3_deposit.switch_chain_unsupported')),
        });
    }, [walletConnectConfigured, kitConnected, appKitSwitchNetwork, t]);

    // WalletConnect can rehydrate a stored session on reload; honor explicit disconnect.
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
        // chainId por vezes vem tarde no mobile; null !== 137 pedia switch à toa e bloqueava a verificação
        if (n != null && n !== POLYGON_NUM) {
            appKitSwitchNetwork(polygon).catch((e) => console.error('AppKit switch network', e));
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
        const provider = await getVerifiedBrowserEthereumProvider();
        if (!provider) return;

        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                const currentChainId = await provider.request({ method: 'eth_chainId' });
                setChainId(currentChainId);

                const res = await api.get('/wallet/balance');
                if (
                    res.data.ok &&
                    res.data.walletAddress &&
                    res.data.walletAddress.toLowerCase() === accounts[0].toLowerCase()
                ) {
                    setAccount(accounts[0]);
                    setIsConnected(true);
                }
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }, []);

    useEffect(() => {
        checkConnection();

        const provider = getInjectedProvider();
        if (!provider) return undefined;

        const handleAccountsChanged = (accounts) => {
            if (kitConnected) return;
            if (isWalletSessionClearedByUser()) {
                setAccount(null);
                setIsConnected(false);
                return;
            }
            if (accounts.length > 0) {
                setAccount(accounts[0]);
                setIsConnected(true);
            } else {
                setAccount(null);
                setIsConnected(false);
            }
        };

        const handleChainChanged = (newChainId) => {
            setChainId(newChainId);
        };

        return subscribeInjectedEthereumEvents(provider, {
            onAccountsChanged: handleAccountsChanged,
            onChainChanged: handleChainChanged,
        });
    }, [checkConnection, kitConnected]);

    const isCorrectNetwork =
        chainId === POLYGON_CHAIN_ID || kitChainNum === POLYGON_NUM;

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
