import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../store/auth';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';

const POLYGON_CHAIN_ID = '0x89'; // 137

function getEthereumProvider() {
    return getBrowserEthereumProvider();
}

export function useWallet() {
    const [account, setAccount] = useState(null);
    const [chainId, setChainId] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const checkConnection = useCallback(async () => {
        const provider = getEthereumProvider();
        if (!provider) return;

        try {
            // Check if we have an account already but don't force login here
            // Just sync the local address if the user is already authenticated in the app
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                const currentChainId = await provider.request({ method: 'eth_chainId' });
                setChainId(currentChainId);

                // We don't automatically set as connected/account here to follow the 
                // user's rule of "connect ONLY by signature/verification"
                // But we can check if the session already has a wallet address linked
                const res = await api.get('/wallet/balance');
                if (res.data.ok && res.data.walletAddress && res.data.walletAddress.toLowerCase() === accounts[0].toLowerCase()) {
                    setAccount(accounts[0]);
                    setIsConnected(true);
                }
            }
        } catch (error) {
            console.error("Error checking connection:", error);
        }
    }, []);

    const switchNetwork = useCallback(async () => {
        const provider = getEthereumProvider();
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
                    console.error("Error adding network:", addError);
                }
            }
            console.error("Error switching network:", switchError);
        }
    }, []);

    const connect = useCallback(async () => {
        const provider = getEthereumProvider();
        if (!provider) {
            toast.error('Web3 Wallet not detected. Please install a compatible browser wallet.');
            return;
        }

        setIsConnecting(true);
        try {
            // 1. Request accounts (Permission to talk to wallet)
            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            const userAccount = accounts[0];

            // 2. Ensure correct network
            const currentChainId = await provider.request({ method: 'eth_chainId' });
            setChainId(currentChainId);

            if (currentChainId !== POLYGON_CHAIN_ID) {
                await switchNetwork();
                // Wait for network switch to complete/retry if needed
            }

            // 3. Request Signature (Proof of ownership)
            const message = `Verify wallet ownership for Block Miner: ${userAccount}`;
            let signature;
            try {
                signature = await provider.request({
                    method: 'personal_sign',
                    params: [message, userAccount],
                });
            } catch (signError) {
                signature = await provider.request({
                    method: 'personal_sign',
                    params: [userAccount, message],
                });
                if (!signature) throw signError;
            }

            // 4. Verify on Backend
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
            console.error("Connection error:", error);
            if (error.code === 4001) {
                toast.error('Connection cancelled by user.');
            } else {
                toast.error(error.message || 'Failed to connect/verify wallet.');
            }
        } finally {
            setIsConnecting(false);
        }
    }, [switchNetwork]);

    useEffect(() => {
        checkConnection();

        const provider = getEthereumProvider();
        if (provider) {
            const handleAccountsChanged = (accounts) => {
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
                // Recommended to reload the page on chain change
                // window.location.reload(); 
            };

            provider.on('accountsChanged', handleAccountsChanged);
            provider.on('chainChanged', handleChainChanged);

            return () => {
                provider.removeListener('accountsChanged', handleAccountsChanged);
                provider.removeListener('chainChanged', handleChainChanged);
            };
        }
    }, [checkConnection]);

    return {
        account,
        chainId,
        isConnected,
        isConnecting,
        isCorrectNetwork: chainId === POLYGON_CHAIN_ID,
        connect,
        switchNetwork
    };
}
