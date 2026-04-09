import { useState, useEffect, useCallback, useRef } from 'react';
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
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';
import { isWalletConnectConfigured } from '../utils/walletConnect.js';

const POLYGON_CHAIN_ID = '0x89';
const POLYGON_NUM = 137;

function getInjectedProvider() {
    return getBrowserEthereumProvider();
}

async function switchNetworkFor(provider) {
    if (!provider) return;
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: POLYGON_CHAIN_ID }],
        });
    } catch (switchError) {
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
                console.error('Error adding network:', addError);
            }
        }
        console.error('Error switching network:', switchError);
    }
}

function isLikelyTouchMobile() {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
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

    const disconnectWalletConnectSession = useCallback(async () => {
        linkingRef.current = null;
        try {
            await disconnectAsync();
        } catch {
            /* ignore */
        }
        setAccount(null);
        setIsConnected(false);
    }, [disconnectAsync]);

    const verifyWithServer = useCallback(
        async (userAccount, eip1193Provider) => {
            let signature;
            if (eip1193Provider) {
                signature = await signOwnershipMessageWithProvider(eip1193Provider, userAccount);
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

    const connectInjectedAndVerify = useCallback(
        async () => {
            const injected = getInjectedProvider();
            if (!injected) {
                toast.error(
                    'No browser wallet found. On your phone use WalletConnect, or open this site inside MetaMask / Trust in-app browser.'
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
                    await switchNetworkFor(injected);
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
        [kitConnected, disconnectAsync, verifyWithServer]
    );

    const connect = useCallback(async () => {
        if (walletConnectConfigured) {
            const injected = getInjectedProvider();
            if (injected && !isLikelyTouchMobile()) {
                await connectInjectedAndVerify();
                return;
            }
            setIsConnecting(true);
            try {
                await open();
            } catch (e) {
                console.error(e);
                toast.error(e?.message || 'Could not open wallet modal.');
            } finally {
                setIsConnecting(false);
            }
            return;
        }

        await connectInjectedAndVerify();
    }, [walletConnectConfigured, open, connectInjectedAndVerify]);

    const connectWalletConnect = useCallback(async () => {
        if (!walletConnectConfigured) {
            toast.error('WalletConnect is not configured (missing VITE_WALLETCONNECT_PROJECT_ID).');
            return;
        }
        setIsConnecting(true);
        try {
            await open();
        } catch (e) {
            console.error(e);
            toast.error(e?.message || 'Could not open wallet modal.');
        } finally {
            setIsConnecting(false);
        }
    }, [walletConnectConfigured, open]);

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
        await switchNetworkFor(getInjectedProvider());
    }, [walletConnectConfigured, kitConnected, appKitSwitchNetwork]);

    useEffect(() => {
        if (!walletConnectConfigured || !kitConnected || !kitAddress) {
            if (!kitAddress) linkingRef.current = null;
            return;
        }

        const n = normalizeChainNum(kitChainId);
        if (n !== POLYGON_NUM) {
            appKitSwitchNetwork(polygon).catch((e) => console.error('AppKit switch network', e));
            return;
        }

        let cancelled = false;
        const addr = kitAddress;

        (async () => {
            if (linkingRef.current === `done:${addr}`) return;
            if (linkingRef.current === `busy:${addr}`) return;
            if (linkingRef.current === `rejected:${addr}`) return;

            linkingRef.current = `busy:${addr}`;
            try {
                const bal = await api.get('/wallet/balance');
                if (cancelled) return;
                if (
                    bal.data?.ok &&
                    bal.data.walletAddress &&
                    bal.data.walletAddress.toLowerCase() === addr.toLowerCase()
                ) {
                    setAccount(addr);
                    setIsConnected(true);
                    linkingRef.current = `done:${addr}`;
                    return;
                }

                await verifyWithServer(addr, null);
                if (cancelled) return;
                linkingRef.current = `done:${addr}`;
            } catch (e) {
                const rejected =
                    e?.code === 4001 ||
                    e?.cause?.code === 4001 ||
                    String(e?.message || '').toLowerCase().includes('user rejected');
                if (rejected) {
                    linkingRef.current = `rejected:${addr}`;
                    toast.error('Signature cancelled. Connect again when you are ready to sign.');
                } else {
                    linkingRef.current = null;
                    console.error('Wallet link error:', e);
                    toast.error(e?.message || 'Failed to verify wallet.');
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        walletConnectConfigured,
        kitConnected,
        kitAddress,
        kitChainId,
        appKitSwitchNetwork,
        verifyWithServer,
    ]);

    const checkConnection = useCallback(async () => {
        const provider = getInjectedProvider();
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
        if (provider) {
            const handleAccountsChanged = (accounts) => {
                if (kitConnected) return;
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

            provider.on('accountsChanged', handleAccountsChanged);
            provider.on('chainChanged', handleChainChanged);

            return () => {
                provider.removeListener('accountsChanged', handleAccountsChanged);
                provider.removeListener('chainChanged', handleChainChanged);
            };
        }
        return undefined;
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
    };
}
