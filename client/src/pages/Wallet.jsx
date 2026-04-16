import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    Wallet as WalletIcon,
    ArrowUpCircle,
    ArrowDownCircle,
    Clock,
    ShieldCheck,
    Copy,
    ExternalLink,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Smartphone,
    TrendingUp,
    ChevronRight,
    QrCode,
    Ticket,
    Send,
    HelpCircle,
    Loader2,
    Banknote,
    LogOut
} from 'lucide-react';
import { api } from '../store/auth';
import { parseEther, isAddress, getAddress, Interface } from 'ethers';
import { BLOCK_MINER_DEPOSIT_ABI } from '../web3/blockMinerDepositAbi.js';
import { useSendTransaction } from 'wagmi';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../hooks/useWallet';
import { useGameStore } from '../store/game';
import { canUseInjectedDepositChannel } from '../utils/depositChannel.js';

function isUserRejectedTx(err) {
    return (
        err?.code === 4001 ||
        err?.code === 'ACTION_REJECTED' ||
        String(err?.message || '').toLowerCase().includes('user rejected')
    );
}

function looksLikeGasOrProviderIssue(err) {
    if (isUserRejectedTx(err)) return false;
    const m = String(err?.message || err?.shortMessage || err || '').toLowerCase();
    return /gas|estimate|execution reverted|intrinsic|unknown method|failed to submit|invalid request/i.test(m);
}

const depositContractIface = new Interface(BLOCK_MINER_DEPOSIT_ABI);

const WALLETCONNECT_WORDMARK_SRC = '/walletconnect-logo.svg';

function WalletConnectWordmark({ className, alt }) {
    return (
        <img
            src={WALLETCONNECT_WORDMARK_SRC}
            alt={alt}
            className={className}
            width={111}
            height={12}
            loading="lazy"
            decoding="async"
        />
    );
}

/**
 * Native POL transfer or contract call via EIP-1193 (minimal RPC for WalletConnect).
 */
async function sendPolDepositEip1193({
    getActiveEip1193,
    to,
    valueWei,
    dataHex,
    t,
    looksLikeGasOrProviderIssue,
    isUserRejectedTx,
}) {
    const eip1193 = getActiveEip1193();
    if (!eip1193) {
        throw Object.assign(new Error(t('wallet.web3_deposit.no_wallet_for_send')), {
            code: 'NO_EIP1193',
        });
    }
    const accounts = await eip1193.request({ method: 'eth_accounts' });
    const from = accounts[0];
    if (!from) {
        throw Object.assign(new Error(t('wallet.web3_deposit.no_wallet_for_send')), {
            code: 'NO_EIP1193',
        });
    }
    const valueHex = `0x${valueWei.toString(16)}`;
    const txPayload = { from, to, value: valueHex };
    if (dataHex && typeof dataHex === 'string' && dataHex.length > 2) {
        txPayload.data = dataHex;
    }
    try {
        return await eip1193.request({
            method: 'eth_sendTransaction',
            params: [txPayload],
        });
    } catch (rawErr) {
        if (isUserRejectedTx(rawErr)) throw rawErr;
        if (!looksLikeGasOrProviderIssue(rawErr)) throw rawErr;
        let gasLimit = '0x5208';
        try {
            const estBody = {
                from,
                to,
                valueHex,
                ...(txPayload.data ? { data: txPayload.data } : {}),
            };
            const estRes = await api.post('/wallet/deposit/estimate-gas', estBody);
            if (estRes.data?.ok && estRes.data.gasLimit) {
                gasLimit = estRes.data.gasLimit;
            }
        } catch {
            /* use default */
        }
        return await eip1193.request({
            method: 'eth_sendTransaction',
            params: [{ ...txPayload, gas: gasLimit }],
        });
    }
}

export default function Wallet() {
    const { t } = useTranslation();
    const {
        account,
        isConnected,
        isConnecting,
        isCorrectNetwork,
        connect,
        switchNetwork,
        getActiveEip1193,
        walletConnectConfigured,
        cancelWalletSession,
        kitConnected,
        connectWalletConnect,
    } = useWallet();

    const { mutateAsync: sendOnchainTx } = useSendTransaction();

    const showWalletSessionCancel =
        Boolean(kitConnected || isConnecting);

    const [balance, setBalance] = useState({
        amount: 0,
        blkBalance: 0,
        blkLocked: 0,
        lifetimeMined: 0,
        totalWithdrawn: 0
    });
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('deposit');
    const [systemDepositAddress, setSystemDepositAddress] = useState(null);
    const [systemContractAddress, setSystemContractAddress] = useState(null);
    const [profileWalletAddress, setProfileWalletAddress] = useState(null);
    const walletConnectedRef = useRef(false);

    const [withdrawForm, setWithdrawForm] = useState({
        address: '',
        amount: ''
    });
    const [depositForm, setDepositForm] = useState({ amount: '' });
    const [depositChannel, setDepositChannel] = useState('smart_contract');
    const [btcpayDepositEnabled, setBtcpayDepositEnabled] = useState(false);
    const [btcpayDepositComingSoon, setBtcpayDepositComingSoon] = useState(false);
    const [btcpayMissingEnvKeys, setBtcpayMissingEnvKeys] = useState([]);
    const [btcpayCheckoutLink, setBtcpayCheckoutLink] = useState('');
    const [btcpayInvoiceId, setBtcpayInvoiceId] = useState('');
    const [btcpayBtcAddr, setBtcpayBtcAddr] = useState(null);
    const [btcpayLightningInvoice, setBtcpayLightningInvoice] = useState(null);
    const [btcpayInvoiceStatus, setBtcpayInvoiceStatus] = useState(null);
    const [polygonHdDepositEnabled, setPolygonHdDepositEnabled] = useState(false);
    const [polygonHdFeatureVisible, setPolygonHdFeatureVisible] = useState(false);
    const [polygonHdMissingEnvKeys, setPolygonHdMissingEnvKeys] = useState([]);
    const [polygonHdMinPol, setPolygonHdMinPol] = useState(1);
    const [polygonHdAddress, setPolygonHdAddress] = useState('');
    const [polygonHdLoadError, setPolygonHdLoadError] = useState('');
    const [polPrice, setPolPrice] = useState(0);
    const [minDepositPol, setMinDepositPol] = useState(0.01);
    const [blockConfirmations, setBlockConfirmations] = useState(3);
    const [depositVerifyMaxAttempts, setDepositVerifyMaxAttempts] = useState(96);

    // Depósitos assíncronos pendentes
    const [pendingDeposits, setPendingDeposits] = useState([]);
    const pendingPollRef = useRef(null);

    const socket = useGameStore(s => s.socket);

    useEffect(() => {
        walletConnectedRef.current = isConnected;
    }, [isConnected]);

    const waitForWalletConnected = async (timeoutMs = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (walletConnectedRef.current) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
    };

    // Deposit Ticket state
    const [myTickets, setMyTickets] = useState([]);
    const [ticketForm, setTicketForm] = useState({ walletAddress: '', txHash: '', amountClaimed: '', description: '' });
    const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
    const [ticketsLoaded, setTicketsLoaded] = useState(false);

    const fetchPrice = async () => {
        try {
            const res = await api.get('/wallet/pol-usd');
            if (res.data?.ok && typeof res.data.priceUsd === 'number') {
                setPolPrice(res.data.priceUsd);
            }
        } catch (err) {
            console.error("Error fetching price", err);
        }
    };

    const fetchWalletData = useCallback(async () => {
        try {
            const [balanceRes, historyRes] = await Promise.all([
                api.get('/wallet/balance'),
                api.get('/wallet/transactions')
            ]);

            if (balanceRes.data.ok) {
                setBalance({
                    amount: Number(balanceRes.data.balance || 0),
                    blkBalance: Number(balanceRes.data.blkBalance ?? 0),
                    blkLocked: Number(balanceRes.data.blkLocked ?? 0),
                    lifetimeMined: Number(balanceRes.data.lifetimeMined || 0),
                    totalWithdrawn: Number(balanceRes.data.totalWithdrawn || 0)
                });
                setSystemDepositAddress(balanceRes.data.depositAddress || null);
                setSystemContractAddress(balanceRes.data.depositContractAddress || null);
                setProfileWalletAddress(balanceRes.data.walletAddress || null);
                if (typeof balanceRes.data.minDepositPol === 'number' && Number.isFinite(balanceRes.data.minDepositPol)) {
                    setMinDepositPol(balanceRes.data.minDepositPol);
                }
                if (typeof balanceRes.data.blockConfirmations === 'number' && balanceRes.data.blockConfirmations >= 1) {
                    setBlockConfirmations(balanceRes.data.blockConfirmations);
                }
                if (typeof balanceRes.data.depositVerifyMaxAttempts === 'number' && balanceRes.data.depositVerifyMaxAttempts >= 1) {
                    setDepositVerifyMaxAttempts(balanceRes.data.depositVerifyMaxAttempts);
                }
                setBtcpayDepositEnabled(Boolean(balanceRes.data.btcpayDepositEnabled));
                setBtcpayDepositComingSoon(Boolean(balanceRes.data.btcpayDepositComingSoon));
                setBtcpayMissingEnvKeys(
                    Array.isArray(balanceRes.data.btcpayDepositMissingEnvKeys)
                        ? balanceRes.data.btcpayDepositMissingEnvKeys
                        : []
                );
                setPolygonHdDepositEnabled(Boolean(balanceRes.data.polygonHdDepositEnabled));
                setPolygonHdFeatureVisible(Boolean(balanceRes.data.polygonHdDepositFeatureVisible));
                setPolygonHdMissingEnvKeys(
                    Array.isArray(balanceRes.data.polygonHdDepositMissingEnvKeys)
                        ? balanceRes.data.polygonHdDepositMissingEnvKeys
                        : []
                );
                if (
                    typeof balanceRes.data.polygonHdMinDepositPol === 'number' &&
                    Number.isFinite(balanceRes.data.polygonHdMinDepositPol) &&
                    balanceRes.data.polygonHdMinDepositPol > 0
                ) {
                    setPolygonHdMinPol(balanceRes.data.polygonHdMinDepositPol);
                }

                // If user has a saved address but not connected, pre-fill it for convenience
                if (!withdrawForm.address && balanceRes.data.walletAddress) {
                    setWithdrawForm(prev => ({ ...prev, address: balanceRes.data.walletAddress }));
                }
            }

            if (historyRes.data.ok) {
                setTransactions(historyRes.data.transactions || []);
            }
        } catch (err) {
            console.error("Error fetching wallet data", err);
        } finally {
            setIsLoading(false);
        }
    }, [withdrawForm.address]);

    const fetchPendingDeposits = useCallback(async () => {
        try {
            const res = await api.get('/wallet/deposit/pending');
            if (res.data.ok) {
                setPendingDeposits(res.data.deposits || []);
            }
        } catch {}
    }, []);

    const startPendingPoll = useCallback(() => {
        if (pendingPollRef.current) return;
        fetchPendingDeposits();
        pendingPollRef.current = setInterval(fetchPendingDeposits, 10_000);
    }, [fetchPendingDeposits]);

    const stopPendingPoll = useCallback(() => {
        if (pendingPollRef.current) {
            clearInterval(pendingPollRef.current);
            pendingPollRef.current = null;
        }
    }, []);

    useEffect(() => {
        fetchWalletData();
        fetchPrice();
        fetchPendingDeposits();
        const dataInterval = setInterval(fetchWalletData, 30000);
        const priceInterval = setInterval(fetchPrice, 60000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(priceInterval);
            stopPendingPoll();
        };
    }, [fetchWalletData, fetchPendingDeposits, stopPendingPoll]);

    useEffect(() => {
        const canInjected = canUseInjectedDepositChannel(systemContractAddress, systemDepositAddress);
        if (!canInjected && walletConnectConfigured) {
            setDepositChannel('walletconnect');
        } else if (!canInjected && !walletConnectConfigured && polygonHdFeatureVisible) {
            setDepositChannel('polygon_hd');
        }
    }, [systemContractAddress, systemDepositAddress, walletConnectConfigured, polygonHdFeatureVisible]);

    useEffect(() => {
        if (depositChannel !== 'polygon_hd') {
            setPolygonHdLoadError('');
            return undefined;
        }
        if (!polygonHdFeatureVisible) {
            setPolygonHdAddress('');
            setPolygonHdLoadError('');
            return undefined;
        }
        if (!polygonHdDepositEnabled) {
            setPolygonHdAddress('');
            if (polygonHdMissingEnvKeys.length > 0) {
                setPolygonHdLoadError(
                    t('wallet.polygon_hd.disabled_hint_keys', {
                        keys: polygonHdMissingEnvKeys.join(', ')
                    })
                );
            } else {
                setPolygonHdLoadError(t('wallet.polygon_hd.setup_incomplete'));
            }
            return undefined;
        }
        let cancelled = false;
        setPolygonHdLoadError('');
        (async () => {
            try {
                const res = await api.get('/wallet/deposit/hd-address');
                if (cancelled) return;
                if (res.data?.ok && res.data.address) {
                    setPolygonHdAddress(res.data.address);
                } else {
                    setPolygonHdLoadError(res.data?.message || t('wallet.polygon_hd.load_error'));
                }
            } catch (err) {
                if (cancelled) return;
                const status = err?.response?.status;
                const retryRaw =
                    err?.response?.data?.details?.retryAfterSec ??
                    err?.response?.headers?.['retry-after'];
                const retryAfter = parseInt(String(retryRaw ?? ''), 10);
                if (status === 429) {
                    const sec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
                    setPolygonHdLoadError(t('wallet.polygon_hd.rate_limit_error', { seconds: sec }));
                } else {
                    const apiMsg =
                        typeof err?.response?.data?.message === 'string' ? err.response.data.message : '';
                    setPolygonHdLoadError(apiMsg || t('wallet.polygon_hd.load_error'));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [depositChannel, polygonHdDepositEnabled, polygonHdMissingEnvKeys, polygonHdFeatureVisible, t]);

    useEffect(() => {
        if (depositChannel === 'btcpay' && !btcpayDepositEnabled) {
            const canInjected = canUseInjectedDepositChannel(systemContractAddress, systemDepositAddress);
            setDepositChannel(
                !canInjected && walletConnectConfigured ? 'walletconnect' : 'smart_contract'
            );
        }
    }, [
        depositChannel,
        btcpayDepositEnabled,
        walletConnectConfigured,
        systemContractAddress,
        systemDepositAddress
    ]);

    useEffect(() => {
        if (depositChannel !== 'btcpay') {
            setBtcpayInvoiceId('');
            setBtcpayCheckoutLink('');
            setBtcpayBtcAddr(null);
            setBtcpayLightningInvoice(null);
            setBtcpayInvoiceStatus(null);
        }
    }, [depositChannel]);

    useEffect(() => {
        if (!btcpayInvoiceId || depositChannel !== 'btcpay') return undefined;
        const poll = async () => {
            try {
                const res = await api.get(
                    `/wallet/btcpay/invoice/${encodeURIComponent(btcpayInvoiceId)}`
                );
                if (res.data?.ok) {
                    setBtcpayInvoiceStatus(res.data.localStatus);
                    if (res.data.btcAddress != null) setBtcpayBtcAddr(res.data.btcAddress);
                    if (res.data.lightningInvoice != null) setBtcpayLightningInvoice(res.data.lightningInvoice);
                    if (res.data.localStatus === 'completed') {
                        setBtcpayInvoiceId('');
                        setBtcpayCheckoutLink('');
                        setBtcpayBtcAddr(null);
                        setBtcpayLightningInvoice(null);
                        void fetchWalletData();
                        void fetchPendingDeposits();
                    }
                }
            } catch {
                /* ignore */
            }
        };
        void poll();
        const id = setInterval(poll, 12_000);
        return () => clearInterval(id);
    }, [btcpayInvoiceId, depositChannel, fetchWalletData, fetchPendingDeposits]);

    // Para de fazer poll quando não há mais pendentes
    useEffect(() => {
        const hasPending = pendingDeposits.some(
            d => d.status === 'pending_verification' || d.status === 'btcpay_pending'
        );
        if (hasPending) {
            startPendingPoll();
        } else {
            stopPendingPoll();
        }
    }, [pendingDeposits, startPendingPoll, stopPendingPoll]);

    // Socket: ouve confirmação de depósito em tempo real
    useEffect(() => {
        if (!socket) return;
        const handler = ({ amount }) => {
            toast.success(t('wallet.web3_deposit.toast_credited', { amount: Number(amount).toFixed(4) }));
            fetchWalletData();
            fetchPendingDeposits();
        };
        socket.on('wallet:deposit_confirmed', handler);
        return () => socket.off('wallet:deposit_confirmed', handler);
    }, [socket, fetchWalletData, fetchPendingDeposits, t]);

    // Auto-fill withdrawal address when wallet connects
    useEffect(() => {
        if (isConnected && account && !withdrawForm.address) {
            setWithdrawForm(prev => ({ ...prev, address: account }));
        }
    }, [isConnected, account]);

    const handleAutoDeposit = async () => {
        setIsActionLoading(true);
        try {
            if (depositChannel === 'smart_contract') {
                const hasContract = systemContractAddress && isAddress(systemContractAddress);
                const hasTreasury = systemDepositAddress && isAddress(systemDepositAddress);
                if (!hasContract && !hasTreasury) {
                    toast.error(t('wallet.web3_deposit.no_deposit_config'));
                    return;
                }
            } else if (!walletConnectConfigured) {
                toast.error(t('wallet.web3_deposit.wc_missing_build'));
                return;
            }

            if (!isConnected) {
                try {
                    if (depositChannel === 'walletconnect') {
                        await connectWalletConnect();
                    } else {
                        await connect({ useBrowserExtension: true });
                    }
                } catch (e) {
                    if (e?.code === 'CANCELLED') {
                        toast.info(t('wallet.web3_deposit.connection_cancelled'));
                        return;
                    }
                    throw e;
                }

                const walletReady = await waitForWalletConnected(45000);
                if (!walletReady) {
                    toast.error(t('wallet.web3_deposit.connect_wallet_failed'));
                    return;
                }
            }

            if (!isCorrectNetwork) {
                await switchNetwork();
                return;
            }

            const amount = parseFloat(depositForm.amount);
            if (isNaN(amount) || amount < minDepositPol) {
                toast.error(t('wallet.min_deposit_error', { min: minDepositPol }));
                return;
            }

            const useContract =
                systemContractAddress && isAddress(systemContractAddress);
            const useTreasury =
                !useContract && systemDepositAddress && isAddress(systemDepositAddress);

            if (!useContract && !useTreasury) {
                toast.error(t('wallet.web3_deposit.no_deposit_config'));
                return;
            }

            let to;
            let dataHex;
            if (useContract) {
                to = getAddress(systemContractAddress);
                if (!account || !isAddress(account)) {
                    toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                    return;
                }
                const linkedOk =
                    profileWalletAddress &&
                    isAddress(profileWalletAddress) &&
                    getAddress(account) === getAddress(profileWalletAddress);
                if (!linkedOk) {
                    toast.error(t('wallet.web3_deposit.link_wallet_required_contract'));
                    return;
                }
                dataHex = depositContractIface.encodeFunctionData('deposit', [getAddress(account)]);
            } else {
                to = getAddress(systemDepositAddress);
            }

            const valueWei = parseEther(amount.toString());

            toast.info(t('wallet.web3_deposit.tx_requesting'));

            let txHash;
            const sendPayload = useContract
                ? { to, value: valueWei, data: dataHex }
                : { to, value: valueWei };

            if (kitConnected) {
                txHash = await sendPolDepositEip1193({
                    getActiveEip1193,
                    to,
                    valueWei,
                    dataHex,
                    t,
                    looksLikeGasOrProviderIssue,
                    isUserRejectedTx,
                });
            } else {
                try {
                    txHash = await sendOnchainTx(sendPayload);
                } catch (wagmiErr) {
                    if (isUserRejectedTx(wagmiErr)) throw wagmiErr;
                    console.warn('Deposit: wagmi send failed, trying EIP-1193', wagmiErr);
                    try {
                        txHash = await sendPolDepositEip1193({
                            getActiveEip1193,
                            to,
                            valueWei,
                            dataHex,
                            t,
                            looksLikeGasOrProviderIssue,
                            isUserRejectedTx,
                        });
                    } catch (e2) {
                        if (e2?.code === 'NO_EIP1193') {
                            toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                        }
                        throw e2;
                    }
                }
            }

            toast.info(t('wallet.web3_deposit.tx_submitted'));

            const res = await api.post('/wallet/deposit/submit', {
                txHash: txHash,
                claimedAmount: amount
            });

            if (res.data.ok) {
                toast.success(t('wallet.web3_deposit.deposit_success_registered'));
                setDepositForm({ amount: '' });
                fetchPendingDeposits();
                startPendingPoll();
            } else {
                toast.error(res.data.message || t('common.error'));
            }
        } catch (error) {
            console.error("Deposit error", error);
            // Handle common MetaMask errors
            if (error.code === 4001) {
                toast.error(t('wallet.web3_deposit.tx_rejected'));
            } else if (error.code === 'INSUFFICIENT_FUNDS' || (error.message && error.message.includes('insufficient funds'))) {
                toast.error(t('wallet.web3_deposit.insufficient_funds'));
            } else {
                toast.error(error.reason || error.message || t('wallet.web3_deposit.tx_failed'));
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleCreateBtcpayInvoice = async () => {
        const amount = parseFloat(depositForm.amount);
        if (isNaN(amount) || amount < minDepositPol) {
            toast.error(t('wallet.min_deposit_error', { min: minDepositPol }));
            return;
        }
        setIsActionLoading(true);
        try {
            const res = await api.post('/wallet/btcpay/invoice', { amountPol: amount });
            if (res.data?.ok) {
                setBtcpayInvoiceId(res.data.invoiceId);
                setBtcpayCheckoutLink(res.data.checkoutLink);
                setBtcpayBtcAddr(res.data.btcAddress || null);
                setBtcpayLightningInvoice(res.data.lightningInvoice || null);
                setBtcpayInvoiceStatus(res.data.status);
                toast.success(t('wallet.btcpay.invoice_created'));
                void fetchPendingDeposits();
                startPendingPoll();
            } else {
                const key = res.data?.i18nKey;
                toast.error(key ? t(key) : res.data?.message || t('common.error'));
            }
        } catch (err) {
            const key = err.response?.data?.i18nKey;
            toast.error(
                key ? t(key) : err.response?.data?.message || err.message || t('common.error')
            );
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWithdraw = async (e) => {
        e.preventDefault();
        const amount = parseFloat(withdrawForm.amount);

        if (!withdrawForm.address) {
            toast.error(t('wallet.dest_address'));
            return;
        }
        if (isNaN(amount) || amount < 10) {
            toast.error(t('wallet.min_withdraw_error', { min: 10 }));
            return;
        }
        if (amount > balance.amount) {
            toast.error(t('wallet.insufficient_balance'));
            return;
        }

        try {
            setIsActionLoading(true);
            const res = await api.post('/wallet/withdraw', {
                amount,
                address: withdrawForm.address
            });

            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                setWithdrawForm(prev => ({ ...prev, amount: '' }));
                fetchWalletData();
            } else {
                toast.error(res.data.message || t('common.error'));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('common.error'));
        } finally {
            setIsActionLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.copied'));
    };

    const fetchMyTickets = async () => {
        try {
            const res = await api.get('/deposit-tickets');
            if (res.data.ok) setMyTickets(res.data.tickets || []);
        } catch {}
        setTicketsLoaded(true);
    };

    const handleOpenTicket = async (e) => {
        e.preventDefault();
        if (!ticketForm.walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(ticketForm.walletAddress)) {
            toast.error(t('wallet.ticket_invalid_wallet'));
            return;
        }
        try {
            setIsSubmittingTicket(true);
            const res = await api.post('/deposit-tickets', ticketForm);
            if (res.data.ok) {
                toast.success(t('wallet.ticket_open_success'));
                setTicketForm({ walletAddress: '', txHash: '', amountClaimed: '', description: '' });
                fetchMyTickets();
            } else {
                toast.error(res.data.message || t('wallet.ticket_open_error'));
            }
        } catch (err) {
            toast.error(err.response?.data?.message || t('wallet.ticket_open_error'));
        } finally {
            setIsSubmittingTicket(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const config = {
            completed: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.ledger_badge_success') },
            pending: { color: 'text-amber-400 bg-amber-400/10', label: t('wallet.ledger_badge_pending') },
            approved: { color: 'text-sky-400 bg-sky-400/10', label: t('wallet.ledger_badge_approved') },
            failed: { color: 'text-red-400 bg-red-400/10', label: t('wallet.ledger_badge_failed') }
        };
        const s = config[status] || config.pending;
        return (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${s.color}`}>
                {s.label}
            </span>
        );
    };

    return (
        <div className="max-w-6xl mx-auto space-y-5 sm:space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tighter italic flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-2xl">
                            <WalletIcon className="w-8 h-8 text-primary" />
                        </div>
                        {t('wallet.hero_wallet').toUpperCase()}{' '}
                        <span className="text-primary">{t('wallet.hero_terminal').toUpperCase()}</span>
                    </h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] pl-1">
                        {t('wallet.hero_subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
                    {isConnected ? (
                        <>
                            <div className="flex items-center gap-3 p-1.5 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-xl">
                                <div className="flex items-center gap-2 pl-3 pr-4">
                                    <div className={`w-2 h-2 rounded-full animate-pulse ${isCorrectNetwork ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                    <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                        {account.slice(0, 6)}...{account.slice(-4)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(account)}
                                    className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => void cancelWalletSession()}
                                className="px-4 py-3 bg-slate-900/80 border border-slate-600 text-slate-200 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 hover:border-slate-500 transition-all flex items-center justify-center gap-2"
                            >
                                <LogOut className="w-4 h-4" />
                                {t('wallet.web3_deposit.disconnect')}
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    const useWcOnly =
                                        activeTab === 'deposit' &&
                                        depositChannel === 'walletconnect' &&
                                        walletConnectConfigured;
                                    void (useWcOnly ? connect() : connect({ useBrowserExtension: true }));
                                }}
                                disabled={isConnecting}
                                className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 border border-indigo-400/30 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                            >
                                {activeTab === 'deposit' &&
                                depositChannel === 'walletconnect' &&
                                walletConnectConfigured ? (
                                    <WalletConnectWordmark
                                        className="h-3 sm:h-3.5 w-auto max-w-[5.5rem] sm:max-w-[6.5rem] object-contain object-left brightness-0 invert shrink-0"
                                        alt={t('wallet.deposit_options.walletconnect_logo_alt')}
                                    />
                                ) : (
                                    <Smartphone className="w-4 h-4 shrink-0" />
                                )}
                                {isConnecting
                                    ? t('wallet.web3_deposit.connecting')
                                    : activeTab === 'deposit' &&
                                        depositChannel === 'walletconnect' &&
                                        walletConnectConfigured
                                      ? t('wallet.web3_deposit.connect_wc')
                                      : t('wallet.web3_deposit.connect_browser')}
                            </button>
                            {showWalletSessionCancel ? (
                                <button
                                    type="button"
                                    onClick={() => void cancelWalletSession()}
                                    className="px-4 py-3 bg-transparent border border-slate-600 text-slate-300 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800/80 transition-all"
                                >
                                    {t('wallet.web3_deposit.cancel_connection')}
                                </button>
                            ) : null}
                        </>
                    )}

                    <button
                        onClick={fetchWalletData}
                        className="p-3 bg-slate-900/50 hover:bg-slate-800 text-slate-500 hover:text-white rounded-2xl transition-all border border-slate-800/50 backdrop-blur-xl"
                    >
                        <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left Column: Balance & Stats */}
                <div className="lg:col-span-8 space-y-8">

                    {/* Premium Balance Card */}
                    <div className="relative group overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary via-blue-600 to-indigo-900 opacity-90 transition-opacity" />
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay" />

                        <div className="relative p-5 sm:p-10 text-white space-y-5 sm:space-y-12">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-blue-100/60 font-black uppercase tracking-[0.3em] text-[9px] mb-3">
                                        {t('wallet.web3_deposit.your_balance_label')}
                                    </p>
                                    <div className="flex items-baseline gap-4">
                                        <h2 className="text-3xl sm:text-6xl font-black tracking-tighter tabular-nums drop-shadow-2xl">
                                            {balance.amount.toLocaleString(undefined, { minimumFractionDigits: 6 })}
                                        </h2>
                                        <div className="flex flex-col">
                                            <span className="text-lg sm:text-2xl font-black text-blue-200/80 italic">POL</span>
                                            {polPrice > 0 && (
                                                <span className="text-xs font-bold text-white/50">
                                                    ≈ ${(balance.amount * polPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 bg-white/10 backdrop-blur-2xl rounded-[1.5rem] border border-white/20 hover:scale-110 transition-transform cursor-pointer">
                                    <TrendingUp className="w-8 h-8 text-blue-200" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8 pt-5 sm:pt-10 border-t border-white/10">
                                <div className="space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.lifetime_mined')}</p>
                                    <p className="text-lg font-black tracking-tight">{balance.lifetimeMined.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.total_withdrawn')}</p>
                                    <p className="text-lg font-black tracking-tight">{balance.totalWithdrawn.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="hidden md:block space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.network_status')}</p>
                                    <p className="text-lg font-black tracking-tight flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                                        {t('wallet.network_polygon')}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                                <div>
                                    <p className="text-blue-100/50 font-black uppercase tracking-[0.25em] text-[8px] mb-1 flex items-center gap-2">
                                        <Banknote className="w-3 h-3" /> {t('wallet.blk_equiv_note')}
                                    </p>
                                    <p className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight">
                                        {balance.blkBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
                                        <span className="text-sm sm:text-lg text-blue-200/70 ml-2">BLK</span>
                                    </p>
                                    {balance.blkLocked > 0 && (
                                        <p className="text-[10px] font-bold text-amber-200/90 mt-1">
                                            {t('wallet.blk_locked_line', { amount: balance.blkLocked.toFixed(8) })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Decorative Icons */}
                        <div className="absolute right-[-20px] bottom-[-20px] opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-1000 pointer-events-none">
                            <WalletIcon className="w-64 h-64" />
                        </div>
                    </div>

                    {/* Operations Card */}
                    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-1 shadow-2xl backdrop-blur-2xl">
                        <div className="flex bg-slate-900/50 p-2 rounded-[2.2rem] gap-2">
                            <button
                                onClick={() => setActiveTab('deposit')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'deposit' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_deposit')}
                            </button>
                            <button
                                onClick={() => setActiveTab('withdraw')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'withdraw' ? 'bg-primary text-white shadow-lg shadow-primary/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_withdraw')}
                            </button>
                            <button
                                onClick={() => { setActiveTab('ticket'); if (!ticketsLoaded) fetchMyTickets(); }}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest leading-tight rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'ticket' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_ticket')}
                            </button>
                        </div>

                        <div className="p-3 sm:p-8">
                            {activeTab === 'withdraw' && (
                                <form onSubmit={handleWithdraw} className="space-y-4 sm:space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.recipient_address')}</label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    value={withdrawForm.address}
                                                    onChange={(e) => setWithdrawForm(prev => ({ ...prev, address: e.target.value }))}
                                                    placeholder="0x..."
                                                    className="w-full bg-slate-900 border border-slate-800 group-hover:border-slate-700 focus:border-primary rounded-2xl py-5 pl-5 pr-12 text-slate-200 text-xs font-mono transition-all outline-none"
                                                />
                                                {isConnected && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setWithdrawForm(prev => ({ ...prev, address: account }))}
                                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-primary hover:text-white transition-colors"
                                                        title={t('wallet.use_connected_wallet_hint')}
                                                    >
                                                        <Smartphone className="w-5 h-5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.amount_pol')}</label>
                                            <div className="relative group">
                                                <input
                                                    type="number"
                                                    step="0.000001"
                                                    value={withdrawForm.amount}
                                                    onChange={(e) => setWithdrawForm(prev => ({ ...prev, amount: e.target.value }))}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-800 group-hover:border-slate-700 focus:border-primary rounded-2xl py-5 px-5 text-slate-200 text-sm font-black transition-all outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setWithdrawForm(prev => ({ ...prev, amount: balance.amount.toString() }))}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-primary hover:text-white uppercase tracking-widest transition-all"
                                                >
                                                    Max
                                                </button>
                                            </div>
                                            <p className="text-[9px] text-slate-600 font-bold ml-2">{t('wallet.min_withdraw_hint', { min: 10 })}</p>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/50 rounded-3xl p-3 sm:p-6 border border-slate-800/50 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Network protocol fee</p>
                                            <p className="text-emerald-400 text-xs font-black uppercase">Gas Covered by Pool</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Total Transfer</p>
                                            <p className="text-xl font-black text-white italic">
                                                {(parseFloat(withdrawForm.amount) || 0).toFixed(4)} POL
                                                {polPrice > 0 && (
                                                    <span className="block text-[10px] text-slate-500 not-italic font-bold">
                                                        ≈ ${((parseFloat(withdrawForm.amount) || 0) * polPrice).toFixed(2)} USD
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isActionLoading}
                                        className="w-full py-4 sm:py-5 bg-gradient-to-r from-primary to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-xs sm:text-sm uppercase tracking-tight sm:tracking-[0.2em] transition-all shadow-2xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isActionLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowUpCircle className="w-5 h-5" />}
                                        {isActionLoading ? t('wallet.processing') : t('wallet.confirm_withdraw')}
                                    </button>
                                    <p className="text-center text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                        {t('wallet.processing_time', { hours: 72 })}
                                    </p>
                                </form>
                            )}

                            {activeTab === 'deposit' && (
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-6 sm:space-y-8">
                                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('smart_contract')}
                                            disabled={
                                                !canUseInjectedDepositChannel(
                                                    systemContractAddress,
                                                    systemDepositAddress,
                                                )
                                            }
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                                                depositChannel === 'smart_contract'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            {t('wallet.deposit_options.smart_contract')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('walletconnect')}
                                            disabled={!walletConnectConfigured}
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all flex flex-col items-center justify-center gap-2 px-2 ${
                                                depositChannel === 'walletconnect'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <WalletConnectWordmark
                                                className={`h-3 sm:h-3.5 w-auto max-w-[min(100%,7.5rem)] object-contain shrink-0 ${
                                                    depositChannel === 'walletconnect'
                                                        ? 'brightness-0 invert opacity-95'
                                                        : 'brightness-0 invert opacity-45'
                                                }`}
                                                alt={t('wallet.deposit_options.walletconnect_logo_alt')}
                                            />
                                            <span className="text-center leading-tight">
                                                {t('wallet.deposit_options.walletconnect')}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('btcpay')}
                                            disabled={!btcpayDepositEnabled}
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                                                depositChannel === 'btcpay'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                                        >
                                            <span className="flex flex-col items-center justify-center gap-1.5">
                                                <span>{t('wallet.btcpay.option_label')}</span>
                                                {btcpayDepositComingSoon ? (
                                                    <span className="rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-100">
                                                        {t('wallet.btcpay.coming_soon')}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDepositChannel('polygon_hd')}
                                            className={`py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest border transition-all ${
                                                depositChannel === 'polygon_hd'
                                                    ? 'border-primary bg-primary/15 text-white shadow-lg shadow-primary/10'
                                                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {t('wallet.polygon_hd.option_label')}
                                        </button>
                                    </div>
                                    {!btcpayDepositEnabled ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed px-1">
                                            {btcpayDepositComingSoon
                                                ? t('wallet.btcpay.coming_soon_hint')
                                                : btcpayMissingEnvKeys.length
                                                  ? t('wallet.btcpay.disabled_hint_keys', {
                                                        keys: btcpayMissingEnvKeys.join(', ')
                                                    })
                                                  : t('wallet.btcpay.disabled_hint_generic')}
                                        </p>
                                    ) : null}
                                    <p className="text-[9px] text-slate-600 font-bold text-center leading-relaxed">
                                        {depositChannel === 'btcpay'
                                            ? t('wallet.btcpay.option_hint')
                                            : depositChannel === 'polygon_hd'
                                              ? t('wallet.polygon_hd.option_hint')
                                              : t('wallet.deposit_options.hint')}
                                    </p>
                                    {depositChannel !== 'btcpay' &&
                                    depositChannel !== 'polygon_hd' &&
                                    depositChannel === 'smart_contract' &&
                                    kitConnected ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed">
                                            {t('wallet.web3_deposit.hint_disconnect_for_contract')}
                                        </p>
                                    ) : null}
                                    {depositChannel !== 'btcpay' &&
                                    depositChannel !== 'polygon_hd' &&
                                    depositChannel === 'walletconnect' &&
                                    isConnected &&
                                    !kitConnected ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed">
                                            {t('wallet.web3_deposit.hint_disconnect_for_wc')}
                                        </p>
                                    ) : null}
                                    {!polygonHdFeatureVisible && depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed px-1">
                                            {t('wallet.polygon_hd.server_env_hint')}
                                        </p>
                                    ) : null}
                                    {polygonHdFeatureVisible &&
                                    !polygonHdDepositEnabled &&
                                    polygonHdMissingEnvKeys.length > 0 &&
                                    depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed px-1">
                                            {t('wallet.polygon_hd.disabled_hint_keys', {
                                                keys: polygonHdMissingEnvKeys.join(', ')
                                            })}
                                        </p>
                                    ) : null}
                                    {depositChannel === 'polygon_hd' ? (
                                        !polygonHdFeatureVisible ? (
                                            <div className="p-5 sm:p-6 rounded-3xl border border-amber-500/30 bg-amber-950/20 space-y-3">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-amber-200">
                                                    {t('wallet.polygon_hd.title')}
                                                </h4>
                                                <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
                                                    {t('wallet.polygon_hd.server_flag_off_panel')}
                                                </p>
                                            </div>
                                        ) : (
                                        <div className="p-5 sm:p-6 rounded-3xl border border-teal-500/25 bg-teal-950/20 flex flex-col gap-4 min-h-[280px] max-w-xl mx-auto w-full">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-teal-300">
                                                    {t('wallet.polygon_hd.title')}
                                                </h4>
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.polygon_hd.body')}
                                                </p>
                                                <p className="text-[9px] text-slate-500 font-bold">
                                                    {t('wallet.polygon_hd.network_hint')}
                                                </p>
                                                {polygonHdLoadError ? (
                                                    <p className="text-[9px] text-rose-300 font-bold whitespace-pre-wrap">
                                                        {polygonHdLoadError}
                                                    </p>
                                                ) : polygonHdAddress ? (
                                                    <>
                                                        <div className="flex justify-center p-3 bg-white rounded-2xl self-center">
                                                            <QRCodeSVG
                                                                value={polygonHdAddress}
                                                                size={168}
                                                                level="M"
                                                                title={t('wallet.polygon_hd.qr_alt')}
                                                            />
                                                        </div>
                                                        <p className="text-[10px] font-mono text-teal-100/90 font-bold break-all text-center">
                                                            {polygonHdAddress}
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 justify-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(polygonHdAddress)}
                                                                className="py-2.5 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border border-teal-500/40 text-teal-200 hover:bg-teal-950/50"
                                                            >
                                                                {t('wallet.polygon_hd.copy')}
                                                            </button>
                                                            <a
                                                                href={`https://polygonscan.com/address/${polygonHdAddress}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="py-2.5 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 inline-flex items-center gap-1"
                                                            >
                                                                <ExternalLink className="w-3.5 h-3.5" />
                                                                {t('wallet.polygon_hd.open_explorer')}
                                                            </a>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="text-[9px] text-slate-500 font-bold flex items-center gap-2">
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        {t('wallet.processing')}
                                                    </p>
                                                )}
                                                <p className="text-[9px] text-slate-600 font-bold mt-auto">
                                                    {t('wallet.web3_deposit.min_deposit', { min: polygonHdMinPol })}
                                                </p>
                                            </div>
                                        )
                                    ) : depositChannel !== 'btcpay' ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
                                        <div className="p-5 sm:p-6 rounded-3xl border border-indigo-500/25 bg-indigo-950/20 flex flex-col gap-4 min-h-[280px]">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300">
                                                {t('wallet.web3_deposit.title')}
                                            </h4>
                                            <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                {depositChannel === 'smart_contract'
                                                    ? systemContractAddress &&
                                                      isAddress(systemContractAddress)
                                                        ? t('wallet.web3_deposit.smart_contract_hint')
                                                        : systemDepositAddress &&
                                                            isAddress(systemDepositAddress)
                                                          ? t('wallet.web3_deposit.treasury_browser_hint')
                                                          : t('wallet.web3_deposit.no_deposit_config')
                                                    : t('wallet.deposit_options.walletconnect_hint')}
                                            </p>
                                            {!walletConnectConfigured ? (
                                                <p className="text-[9px] text-amber-300/90 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_missing_build')}
                                                </p>
                                            ) : (
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_explorer_domains_hint')}
                                                </p>
                                            )}
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void (depositChannel === 'walletconnect'
                                                                ? connectWalletConnect()
                                                                : connect({ useBrowserExtension: true }))
                                                        }
                                                        disabled={isConnecting}
                                                        className="flex-1 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-95 transition-opacity disabled:opacity-50 flex flex-col sm:flex-row items-center justify-center gap-2 px-3"
                                                    >
                                                        {depositChannel === 'walletconnect' &&
                                                        walletConnectConfigured &&
                                                        !isConnecting ? (
                                                            <WalletConnectWordmark
                                                                className="h-3 w-auto max-w-[6.5rem] object-contain brightness-0 invert shrink-0"
                                                                alt={t('wallet.deposit_options.walletconnect_logo_alt')}
                                                            />
                                                        ) : null}
                                                        <span>
                                                            {isConnecting
                                                                ? t('wallet.web3_deposit.connecting')
                                                                : depositChannel === 'smart_contract'
                                                                    ? t('wallet.web3_deposit.connect_browser')
                                                                    : walletConnectConfigured
                                                                        ? t('wallet.web3_deposit.connect_wc')
                                                                        : t('wallet.web3_deposit.connect_browser')}
                                                        </span>
                                                    </button>
                                                    {showWalletSessionCancel ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void cancelWalletSession()}
                                                            className="sm:min-w-[140px] py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-slate-600 text-slate-300 hover:bg-slate-800/80 transition-colors"
                                                        >
                                                            {t('wallet.web3_deposit.cancel_connection')}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {isConnected && account ? (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-emerald-300/90 font-mono font-bold break-all">
                                                        {t('wallet.web3_deposit.linked_label')}: {account}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={() => void cancelWalletSession()}
                                                        className="w-full py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-rose-500/40 text-rose-300/90 hover:bg-rose-950/40 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <LogOut className="w-3.5 h-3.5" />
                                                        {t('wallet.web3_deposit.disconnect')}
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-[9px] text-slate-600 font-bold">
                                                    {t('wallet.web3_deposit.link_prompt')}
                                                </p>
                                            )}
                                            <p className="text-[9px] text-slate-500 font-bold mt-auto">
                                                {t('wallet.web3_deposit.min_deposit', { min: minDepositPol })}
                                            </p>
                                        </div>

                                        <div className="p-5 sm:p-6 rounded-3xl border border-slate-800/80 bg-slate-950/50 flex flex-col gap-4 min-h-[280px]">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-200">
                                                {t('wallet.express_deposit')}
                                            </h4>
                                            <div className="flex gap-3">
                                                <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed font-bold">
                                                    {t('wallet.express_mode_note', { n: blockConfirmations })}
                                                </p>
                                            </div>
                                            <div className="flex gap-3">
                                                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                                <p className="text-[9px] text-slate-500 leading-relaxed font-bold">
                                                    {t('wallet.web3_deposit.express_safety')}
                                                </p>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                                    {t('wallet.amount_to_add')}
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={depositForm.amount}
                                                    onChange={(e) => setDepositForm({ amount: e.target.value })}
                                                    placeholder="0.00"
                                                    className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 rounded-2xl py-4 px-4 text-slate-200 text-sm font-black transition-all outline-none"
                                                />
                                                <p className="text-[9px] text-slate-600 font-bold ml-1">
                                                    {t('wallet.min_deposit_hint', { min: minDepositPol })}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAutoDeposit}
                                                disabled={
                                                    isActionLoading ||
                                                    (!systemDepositAddress && !systemContractAddress)
                                                }
                                                className="w-full mt-auto min-h-[44px] py-4 sm:py-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-tight sm:tracking-[0.1em] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                <Send className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                                                {systemContractAddress
                                                    ? t('wallet.web3_deposit.deposit_pol_button')
                                                    : t('wallet.express_deposit')}
                                            </button>
                                            {!systemDepositAddress && !systemContractAddress ? (
                                                <p className="text-[10px] text-amber-300 font-bold text-center">
                                                    {t('wallet.web3_deposit.no_deposit_config')}
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    ) : (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
                                            <div className="p-5 sm:p-6 rounded-3xl border border-amber-500/25 bg-amber-950/15 flex flex-col gap-4 min-h-[280px]">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-amber-200">
                                                    {t('wallet.btcpay.title')}
                                                </h4>
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.btcpay.body')}
                                                </p>
                                                <p className="text-[9px] text-slate-500 font-bold mt-auto">
                                                    {t('wallet.web3_deposit.min_deposit', { min: minDepositPol })}
                                                </p>
                                            </div>
                                            <div className="p-5 sm:p-6 rounded-3xl border border-slate-800/80 bg-slate-950/50 flex flex-col gap-4 min-h-[280px]">
                                                <h4 className="text-xs font-black uppercase tracking-widest text-slate-200">
                                                    {t('wallet.btcpay.pay_with_bitcoin')}
                                                </h4>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                                                        {t('wallet.amount_to_add')}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        value={depositForm.amount}
                                                        onChange={(e) => setDepositForm({ amount: e.target.value })}
                                                        placeholder="0.00"
                                                        className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-2xl py-4 px-4 text-slate-200 text-sm font-black transition-all outline-none"
                                                    />
                                                    <p className="text-[9px] text-slate-600 font-bold ml-1">
                                                        {t('wallet.min_deposit_hint', { min: minDepositPol })}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCreateBtcpayInvoice()}
                                                    disabled={isActionLoading}
                                                    className="w-full py-4 sm:py-5 bg-gradient-to-r from-amber-600 to-orange-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-2xl font-black text-[10px] sm:text-xs uppercase tracking-tight sm:tracking-[0.1em] transition-all shadow-xl shadow-amber-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
                                                >
                                                    {isActionLoading ? (
                                                        <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                                                    ) : (
                                                        <QrCode className="w-5 h-5 shrink-0" />
                                                    )}
                                                    {t('wallet.btcpay.create_invoice')}
                                                </button>
                                                {btcpayCheckoutLink ? (
                                                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                                                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                                            {t('wallet.btcpay.status_label')}:{' '}
                                                            <span className="text-slate-200">
                                                                {btcpayInvoiceStatus === 'completed'
                                                                    ? t('wallet.btcpay.payment_confirmed')
                                                                    : t('wallet.btcpay.waiting_confirmation')}
                                                            </span>
                                                        </p>
                                                        <div className="flex justify-center p-3 bg-white rounded-2xl">
                                                            <QRCodeSVG
                                                                value={btcpayCheckoutLink}
                                                                size={160}
                                                                level="M"
                                                                title={t('wallet.btcpay.qr_alt')}
                                                            />
                                                        </div>
                                                        {btcpayBtcAddr ? (
                                                            <div className="space-y-1">
                                                                <p className="text-[9px] font-black text-slate-500 uppercase">
                                                                    {t('wallet.btcpay.onchain_address')}
                                                                </p>
                                                                <p className="text-[10px] font-mono text-slate-300 break-all">
                                                                    {btcpayBtcAddr}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyToClipboard(btcpayBtcAddr)}
                                                                    className="text-[9px] font-black text-primary uppercase"
                                                                >
                                                                    {t('common.copy')}
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                        {btcpayLightningInvoice ? (
                                                            <div className="space-y-1">
                                                                <p className="text-[9px] font-black text-slate-500 uppercase">
                                                                    {t('wallet.btcpay.lightning_invoice')}
                                                                </p>
                                                                <p className="text-[10px] font-mono text-slate-300 break-all">
                                                                    {btcpayLightningInvoice}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyToClipboard(btcpayLightningInvoice)}
                                                                    className="text-[9px] font-black text-primary uppercase"
                                                                >
                                                                    {t('wallet.btcpay.copy_lightning')}
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <a
                                                                href={btcpayCheckoutLink}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="flex-1 text-center py-3 rounded-xl font-black text-[10px] uppercase tracking-widest bg-slate-800 text-white hover:bg-slate-700 border border-slate-600"
                                                            >
                                                                {t('wallet.btcpay.checkout_open')}
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(btcpayCheckoutLink)}
                                                                className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-600 text-slate-200 hover:bg-slate-800"
                                                            >
                                                                {t('wallet.btcpay.copy_link')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}

                                    {/* Painel de depósitos em verificação */}
                                    {pendingDeposits.length > 0 && (
                                        <div className="space-y-3 animate-in fade-in duration-500">
                                            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                                {t('wallet.pending_deposits_title')}
                                            </h4>
                                            <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-hide">
                                                {pendingDeposits.map(dep => {
                                                    const isBtcpayRow =
                                                        typeof dep.txHash === 'string' &&
                                                        dep.txHash.toLowerCase().startsWith('btcpay:');
                                                    const isPending =
                                                        dep.status === 'pending_verification' ||
                                                        dep.status === 'btcpay_pending';
                                                    const isOk = dep.status === 'completed';
                                                    return (
                                                        <div key={dep.id} className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                                                            isPending ? 'bg-indigo-500/5 border-indigo-500/20' :
                                                            isOk ? 'bg-emerald-500/5 border-emerald-500/20' :
                                                            'bg-red-500/5 border-red-500/20'
                                                        }`}>
                                                            <div className="flex items-center gap-3">
                                                                {isPending
                                                                    ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
                                                                    : isOk
                                                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                                        : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                                                                }
                                                                <div>
                                                                    <p className="text-[9px] font-mono text-slate-400">
                                                                        {isBtcpayRow
                                                                            ? t('wallet.btcpay.pending_short')
                                                                            : dep.txHash
                                                                              ? `${dep.txHash.slice(0, 10)}...${dep.txHash.slice(-6)}`
                                                                              : 'N/A'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-600">
                                                                        {isPending ? (
                                                                            <>
                                                                                {isBtcpayRow ? (
                                                                                    <span className="block text-indigo-300/90">
                                                                                        {t('wallet.btcpay.waiting_confirmation')}
                                                                                    </span>
                                                                                ) : (
                                                                                    <>
                                                                                        {t('wallet.verifying_attempt', {
                                                                                            current: dep.verifyAttempts,
                                                                                            max:
                                                                                                dep.verifyMaxAttempts ??
                                                                                                depositVerifyMaxAttempts
                                                                                        })}
                                                                                        {typeof dep.confirmationsCurrent ===
                                                                                            'number' && dep.confirmationsRequired ? (
                                                                                            <span className="block mt-0.5 text-indigo-300/90">
                                                                                                {dep.txReverted
                                                                                                    ? t('wallet.web3_deposit.tx_reverted_hint')
                                                                                                    : dep.txMined === false
                                                                                                      ? t('wallet.web3_deposit.tx_pending_mined')
                                                                                                      : t('wallet.web3_deposit.confirmations', {
                                                                                                            current: Math.min(
                                                                                                                dep.confirmationsCurrent,
                                                                                                                dep.confirmationsRequired
                                                                                                            ),
                                                                                                            required: dep.confirmationsRequired
                                                                                                        })}
                                                                                            </span>
                                                                                        ) : null}
                                                                                    </>
                                                                                )}
                                                                            </>
                                                                        ) : isOk ? (
                                                                            `+${Number(dep.amount).toFixed(4)} POL`
                                                                        ) : (
                                                                            dep.failReason || t('wallet.status_failed')
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {dep.txHash && !isBtcpayRow ? (
                                                                    <a
                                                                        href={`https://polygonscan.com/tx/${dep.txHash}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-slate-600 hover:text-primary transition-colors"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                ) : null}
                                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                                    isPending ? 'text-indigo-300 bg-indigo-400/10' :
                                                                    isOk ? 'text-emerald-300 bg-emerald-400/10' :
                                                                    'text-red-300 bg-red-400/10'
                                                                }`}>
                                                                    {isPending ? t('wallet.status_verifying') : isOk ? t('wallet.status_credited') : t('wallet.status_failed')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </form>
                            )}

                            {activeTab === 'ticket' && (
                                <div className="space-y-8">
                                    <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                                        <HelpCircle className="w-5 h-5 text-amber-400 shrink-0" />
                                        <p className="text-[10px] text-slate-400 leading-relaxed font-bold">
                                            {t('wallet.ticket_hint')}
                                        </p>
                                    </div>

                                    <form onSubmit={handleOpenTicket} className="space-y-6">
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.ticket_wallet_origin')}</label>
                                            <input
                                                type="text"
                                                value={ticketForm.walletAddress}
                                                onChange={(e) => setTicketForm(p => ({ ...p, walletAddress: e.target.value.trim() }))}
                                                placeholder={t('wallet.ticket_wallet_placeholder')}
                                                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl py-4 px-5 text-slate-200 text-xs font-mono transition-all outline-none"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.ticket_tx_hash_opt')}</label>
                                            <input
                                                type="text"
                                                value={ticketForm.txHash}
                                                onChange={(e) => setTicketForm(p => ({ ...p, txHash: e.target.value.trim() }))}
                                                placeholder="0x..."
                                                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl py-4 px-5 text-slate-200 text-xs font-mono transition-all outline-none"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.ticket_amount_sent')}</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    value={ticketForm.amountClaimed}
                                                    onChange={(e) => setTicketForm(p => ({ ...p, amountClaimed: e.target.value }))}
                                                    placeholder="Ex: 0.5"
                                                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl py-4 px-5 text-slate-200 text-xs font-mono transition-all outline-none"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.ticket_note')}</label>
                                                <input
                                                    type="text"
                                                    value={ticketForm.description}
                                                    onChange={(e) => setTicketForm(p => ({ ...p, description: e.target.value }))}
                                                    placeholder="Detalhes adicionais..."
                                                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-2xl py-4 px-5 text-slate-200 text-xs transition-all outline-none"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isSubmittingTicket}
                                            className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isSubmittingTicket ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
                                            {isSubmittingTicket ? t('wallet.ticket_submitting') : t('wallet.ticket_submit')}
                                        </button>
                                    </form>

                                    {/* Meus tickets */}
                                    {myTickets.length > 0 && (
                                        <div className="space-y-4">
                                            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('wallet.ticket_my_tickets')}</h4>
                                            <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-hide">
                                                {myTickets.map(ticket => {
                                                    const statusCfg = {
                                                        open: { color: 'text-blue-400 bg-blue-400/10', label: t('wallet.ticket_status_open') },
                                                        analyzing: { color: 'text-amber-400 bg-amber-400/10', label: t('wallet.ticket_status_analyzing') },
                                                        credited: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.ticket_status_credited') },
                                                        rejected: { color: 'text-red-400 bg-red-400/10', label: t('wallet.ticket_status_rejected') },
                                                        approved: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.ticket_status_approved') }
                                                    }[ticket.status] || { color: 'text-slate-400 bg-slate-400/10', label: ticket.status };
                                                    return (
                                                        <div key={ticket.id} className="flex items-center justify-between p-4 bg-slate-900/50 border border-slate-800/50 rounded-2xl">
                                                            <div className="space-y-1">
                                                                <p className="text-[10px] font-black text-white">Ticket #{ticket.id}</p>
                                                                <p className="text-[9px] text-slate-500 font-mono">{ticket.txHash ? `${ticket.txHash.slice(0,12)}...` : t('wallet.ticket_no_hash')}</p>
                                                                <p className="text-[9px] text-slate-600">{new Date(ticket.createdAt).toLocaleDateString()}</p>
                                                            </div>
                                                            <div className="text-right space-y-1">
                                                                <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${statusCfg.color}`}>{statusCfg.label}</span>
                                                                {ticket.creditedAmount && <p className="text-[9px] text-emerald-400 font-bold">+{Number(ticket.creditedAmount).toFixed(4)} POL</p>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Sidebar Stats */}
                <div className="lg:col-span-4 space-y-8">

                    {/* Activity Feed */}
                    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-4 sm:p-8 shadow-2xl flex flex-col max-h-[700px]">
                        <div className="flex items-center justify-between mb-4 sm:mb-8">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                {t('wallet.ledger_title')}
                            </h3>
                            <ChevronRight className="w-4 h-4 text-slate-700" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
                            {transactions.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                                    <QrCode className="w-12 h-12" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{t('wallet.ledger_empty')}</p>
                                </div>
                            ) : (
                                transactions.map((tx, i) => {
                                    const isBlkConvert = tx.type === 'blk_convert';
                                    const isBlkWithdraw = tx.type === 'blk_withdrawal';
                                    const isWithdrawal = tx.type === 'withdrawal' || isBlkWithdraw;
                                    const unit = isBlkConvert || isBlkWithdraw ? 'BLK' : 'POL';
                                    const usdSub =
                                        isBlkConvert || isBlkWithdraw
                                            ? `≈ $${Number(tx.amount).toFixed(2)}`
                                            : polPrice > 0
                                              ? `$${(Number(tx.amount) * polPrice).toFixed(2)}`
                                              : null;
                                    const label = isBlkConvert
                                        ? t('wallet.tx_pol_to_blk')
                                        : isBlkWithdraw
                                          ? t('wallet.tx_blk_legacy')
                                          : isWithdrawal
                                            ? t('wallet.tx_outflow')
                                            : t('wallet.tx_inflow');
                                    return (
                                        <div key={i} className="group relative flex items-center gap-4 p-4 hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-slate-800/50">
                                            <div
                                                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                                                    isWithdrawal ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                                }`}
                                            >
                                                {isBlkConvert ? (
                                                    <Banknote className="w-6 h-6" />
                                                ) : isWithdrawal ? (
                                                    <ArrowUpCircle className="w-6 h-6" />
                                                ) : (
                                                    <ArrowDownCircle className="w-6 h-6" />
                                                )}
                                            </div>

                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-black text-white italic uppercase tracking-tighter">
                                                        {label}
                                                    </span>
                                                    <StatusBadge status={tx.status} />
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <p className="text-[10px] font-bold text-slate-500 font-mono">
                                                        {new Date(tx.createdAt || tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <p className={`text-sm font-black italic tracking-tighter ${isWithdrawal ? 'text-red-400' : 'text-emerald-400'}`}>
                                                        {isWithdrawal ? '-' : '+'}
                                                        {Number(tx.amount).toFixed(4)} {unit}
                                                        {usdSub && (
                                                            <span className="block text-[8px] opacity-50 not-italic text-right">{usdSub}</span>
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            {tx.txHash && (
                                                <a
                                                    href={`https://polygonscan.com/tx/${tx.txHash}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="absolute right-0 top-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-primary"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="mt-4 pt-4 sm:mt-8 sm:pt-8 border-t border-slate-900">
                            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center gap-3">
                                <ShieldCheck className="w-5 h-5 text-primary" />
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-relaxed">
                                    All transactions are secured by Polygon Smart Contracts and verified on-chain.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
