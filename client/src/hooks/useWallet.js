import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../store/auth';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';
import { getWalletConnectEthereumProvider, isWalletConnectConfigured } from '../utils/walletConnect.js';

const POLYGON_CHAIN_ID = '0x89'; // 137

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

async function signOwnershipMessage(provider, userAccount) {
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
    const [account, setAccount] = useState(null);
    const [chainId, setChainId] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const wcProviderRef = useRef(null);

    const getActiveEip1193 = useCallback(() => wcProviderRef.current || getInjectedProvider(), []);

    const disconnectWalletConnectSession = useCallback(async () => {
        const p = wcProviderRef.current;
        wcProviderRef.current = null;
        if (p) {
            try {
                await p.disconnect();
            } catch {
                /* ignore */
            }
        }
    }, []);

    const checkConnection = useCallback(async () => {
        const provider = getInjectedProvider();
        if (!provider) return;

        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                const currentChainId = await provider.request({ method: 'eth_chainId' });
                setChainId(currentChainId);

                const res = await api.get('/wallet/balance');
                if (res.data.ok && res.data.walletAddress && res.data.walletAddress.toLowerCase() === accounts[0].toLowerCase()) {
                    setAccount(accounts[0]);
                    setIsConnected(true);
                }
            }
        } catch (error) {
            console.error('Error checking connection:', error);
        }
    }, []);

    const switchNetwork = useCallback(async () => {
        await switchNetworkFor(getInjectedProvider());
    }, []);

    const connect = useCallback(async () => {
        await disconnectWalletConnectSession();
        const provider = getInjectedProvider();
        if (!provider) {
            toast.error('Web3 Wallet not detected. Install a browser wallet or use WalletConnect.');
            return;
        }

        setIsConnecting(true);
        try {
            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            const userAccount = accounts[0];

            const currentChainId = await provider.request({ method: 'eth_chainId' });
            setChainId(currentChainId);

            if (currentChainId !== POLYGON_CHAIN_ID) {
                await switchNetworkFor(provider);
            }

            const signature = await signOwnershipMessage(provider, userAccount);

            const res = await api.post('/wallet/update-address', {
                walletAddress: userAccount,
                signature
            });

            if (res.data.ok) {
                setAccount(userAccount);
                setIsConnected(true);
                toast.success('Wallet verified and connected!');
            } else {
                throw new Error(res.data.message || 'Verification failed');
            }
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
    }, [disconnectWalletConnectSession]);

    const connectWalletConnect = useCallback(async () => {
        if (!isWalletConnectConfigured()) {
            toast.error('WalletConnect is not configured (missing VITE_WALLETCONNECT_PROJECT_ID).');
            return;
        }

        setIsConnecting(true);
        try {
            await disconnectWalletConnectSession();

            const wc = await getWalletConnectEthereumProvider();
            if (!wc) {
                throw new Error('Could not initialize WalletConnect.');
            }
            wcProviderRef.current = wc;

            const accounts = await wc.request({ method: 'eth_requestAccounts' });
            const userAccount = accounts[0];
            if (!userAccount) throw new Error('No account from WalletConnect.');

            const currentChainId = await wc.request({ method: 'eth_chainId' });
            setChainId(currentChainId);
            if (currentChainId !== POLYGON_CHAIN_ID) {
                await switchNetworkFor(wc);
                const after = await wc.request({ method: 'eth_chainId' });
                setChainId(after);
            }

            const signature = await signOwnershipMessage(wc, userAccount);

            const res = await api.post('/wallet/update-address', {
                walletAddress: userAccount,
                signature
            });

            if (res.data.ok) {
                setAccount(userAccount);
                setIsConnected(true);
                toast.success('Wallet verified and connected!');
            } else {
                throw new Error(res.data.message || 'Verification failed');
            }
        } catch (error) {
            console.error('WalletConnect error:', error);
            wcProviderRef.current = null;
            if (error.code === 4001) {
                toast.error('Connection cancelled by user.');
            } else {
                toast.error(error.message || 'WalletConnect failed.');
            }
        } finally {
            setIsConnecting(false);
        }
    }, [disconnectWalletConnectSession]);

    useEffect(() => {
        checkConnection();

        const provider = getInjectedProvider();
        if (provider) {
            const handleAccountsChanged = (accounts) => {
                if (wcProviderRef.current) return;
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
    }, [checkConnection]);

    return {
        account,
        chainId,
        isConnected,
        isConnecting,
        isCorrectNetwork: chainId === POLYGON_CHAIN_ID,
        connect,
        connectWalletConnect,
        switchNetwork,
        getActiveEip1193,
        walletConnectConfigured: isWalletConnectConfigured(),
        disconnectWalletConnectSession
    };
}
