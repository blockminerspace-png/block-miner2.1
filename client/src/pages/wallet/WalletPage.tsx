import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { AxiosError } from 'axios';
import type { Address, EIP1193Provider, Hex } from 'viem';
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
    Send,
    Loader2,
    Banknote,
    LogOut,
    AlertTriangle
} from 'lucide-react';
import { api } from '../../store/auth';
import { walletApi } from './wallet.api';
import type { PendingDepositRow, WalletTransactionRow, WithdrawFeeInfo } from './wallet.types';
import { WALLET_MIN_WITHDRAW_POL, isValidPolygonWithdrawAddress } from './wallet.validation';
import { parseEther, isAddress, getAddress, Interface } from 'ethers';
import { BLOCK_MINER_DEPOSIT_ABI } from '../../web3/blockMinerDepositAbi';
import { useSendTransaction } from 'wagmi';
import { QRCodeSVG } from 'qrcode.react';
import { useWallet } from '../../shared/hooks/useWallet';
import { useWalletLink } from './useWalletLink';
import { useGameStore } from '../../store/game';
import { canUseInjectedDepositChannel } from '../../shared/utils/depositChannel';
import { getInjectedWalletProviders } from '../../shared/wallet/injectedWallet';
import {
    classifyWalletHttpError,
    nextWalletBalanceBackoffMs,
    WALLET_BALANCE_POLL_MS,
} from './walletBalancePolling';
import { ShibPanel } from './ShibPanel';

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

function isUserRejectedTx(err: unknown): boolean {
    if (!isRecord(err)) return false;
    const code = err.code;
    const msg = typeof err.message === 'string' ? err.message : '';
    return (
        code === 4001 ||
        code === 'ACTION_REJECTED' ||
        msg.toLowerCase().includes('user rejected')
    );
}

function looksLikeGasOrProviderIssue(err: unknown): boolean {
    if (isUserRejectedTx(err)) return false;
    const r = isRecord(err) ? err : {};
    const m = String(
        (typeof r.message === 'string' ? r.message : '') ||
            (typeof r.shortMessage === 'string' ? r.shortMessage : '') ||
            err,
    ).toLowerCase();
    return /gas|estimate|execution reverted|intrinsic|unknown method|failed to submit|invalid request/i.test(m);
}

const depositContractIface = new Interface(BLOCK_MINER_DEPOSIT_ABI);

/** JSON-RPC subset used for POL deposits (tx objects are assembled at runtime). */
type Eip1193LooseRequest = {
  request: (args: { method: string; params?: readonly unknown[] }) => Promise<unknown>;
};

function asEip1193Loose(provider: EIP1193Provider): Eip1193LooseRequest {
  return provider as Eip1193LooseRequest;
}

const WALLETCONNECT_WORDMARK_SRC = '/walletconnect-logo.svg';

function WalletConnectWordmark({ className, alt }: { className?: string; alt: string }) {
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
}: {
    getActiveEip1193: () => EIP1193Provider | null | undefined;
    to: string;
    valueWei: bigint;
    dataHex?: string;
    t: TFunction;
    looksLikeGasOrProviderIssue: (err: unknown) => boolean;
    isUserRejectedTx: (err: unknown) => boolean;
}) {
    const eip1193 = getActiveEip1193();
    if (!eip1193) {
        throw Object.assign(new Error(t('wallet.web3_deposit.no_wallet_for_send')), {
            code: 'NO_EIP1193',
        });
    }
    const rpc = asEip1193Loose(eip1193);
    const accounts = (await rpc.request({ method: 'eth_accounts' })) as string[];
    const from = accounts[0];
    if (!from) {
        throw Object.assign(new Error(t('wallet.web3_deposit.no_wallet_for_send')), {
            code: 'NO_EIP1193',
        });
    }
    const valueHex = `0x${valueWei.toString(16)}`;
    const txPayload: { from: string; to: string; value: string; data?: string } = { from, to, value: valueHex };
    if (dataHex && typeof dataHex === 'string' && dataHex.length > 2) {
        txPayload.data = dataHex;
    }
    try {
        return await rpc.request({
            method: 'eth_sendTransaction',
            params: [txPayload],
        });
    } catch (rawErr: unknown) {
        if (isUserRejectedTx(rawErr)) throw rawErr;
        if (!looksLikeGasOrProviderIssue(rawErr)) throw rawErr;
        let gasLimit = '0x5208';
        try {
            const estBody: { from: string; to: string; valueHex: string; data?: string } = {
                from,
                to,
                valueHex,
                ...(txPayload.data ? { data: txPayload.data } : {}),
            };
            const estRes = await walletApi.postDepositEstimateGas(estBody as Record<string, unknown>);
            if (estRes.data?.ok && estRes.data.gasLimit) {
                gasLimit = estRes.data.gasLimit;
            }
        } catch {
            /* use default */
        }
        return await rpc.request({
            method: 'eth_sendTransaction',
            params: [{ ...txPayload, gas: gasLimit as Hex }],
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

    const {
        savedWallet,
        connectedWallet,
        isLoadingSaved: isLoadingLinkedWallet,
        isConnecting: isLinkConnecting,
        isLinking,
        connectWallet: connectLinkedWallet,
        linkWallet,
        unlinkWallet,
        clearConnectedSession,
        loadSavedWallet,
    } = useWalletLink();

    const { mutateAsync: sendOnchainTx } = useSendTransaction();

    const showWalletSessionCancel =
        Boolean(kitConnected || isConnecting);

    const [balance, setBalance] = useState({
        amount: 0,
        blkBalance: 0,
        blkLocked: 0,
        shibBalance: 0,
        lifetimeMined: 0,
        totalWithdrawn: 0
    });
    const [transactions, setTransactions] = useState<WalletTransactionRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('deposit');
    const [systemDepositAddress, setSystemDepositAddress] = useState<string | null>(null);
    const [systemContractAddress, setSystemContractAddress] = useState<string | null>(null);
    const [profileWalletAddress, setProfileWalletAddress] = useState<string | null>(null);
    const walletConnectedRef = useRef(false);

    const [withdrawForm, setWithdrawForm] = useState({
        address: '',
        amount: ''
    });
    const [withdrawalChallenge, setWithdrawalChallenge] = useState<{
        challengeToken: string;
        ttlMinutes: number;
        pendingAmount: number;
        pendingAddress: string;
    } | null>(null);
    const [withdrawalCode, setWithdrawalCode] = useState('');
    const [depositForm, setDepositForm] = useState({ amount: '' });
    const [depositChannel, setDepositChannel] = useState('smart_contract');
    const [injectedDiscovery, setInjectedDiscovery] = useState<'scanning' | 'none' | 'found'>('scanning');
    const [detectedWalletName, setDetectedWalletName] = useState<string | null>(null);
    const [polygonHdDepositEnabled, setPolygonHdDepositEnabled] = useState(false);
    const [polygonHdFeatureVisible, setPolygonHdFeatureVisible] = useState(false);
    const [polygonHdMissingEnvKeys, setPolygonHdMissingEnvKeys] = useState<string[]>([]);
    const [polygonHdMinPol, setPolygonHdMinPol] = useState(1);
    const [polygonHdAddress, setPolygonHdAddress] = useState('');
    const [polygonHdLoadError, setPolygonHdLoadError] = useState('');
    const [polPrice, setPolPrice] = useState(0);
    const [minDepositPol, setMinDepositPol] = useState(0.01);
    const [blockConfirmations, setBlockConfirmations] = useState(3);
    const [depositVerifyMaxAttempts, setDepositVerifyMaxAttempts] = useState(96);
    const [withdrawFeeInfo, setWithdrawFeeInfo] = useState<WithdrawFeeInfo | null>(null);

    // Depósitos assíncronos pendentes
    const [pendingDeposits, setPendingDeposits] = useState<PendingDepositRow[]>([]);
    const pendingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const balancePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const balanceBackoffMsRef = useRef(WALLET_BALANCE_POLL_MS);
    const balancePollPausedRef = useRef(false);
    const balanceUnavailableToastRef = useRef(false);

    const socket = useGameStore(s => s.socket);
    const initSocket = useGameStore(s => s.initSocket);

    const evmAccount = account as string | null | undefined;
    const linkedWalletAddress = savedWallet.walletAddress;
    const headerWalletShort = (addr: string) =>
        addr.length >= 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

    useEffect(() => {
        initSocket();
    }, [initSocket]);

    useEffect(() => {
        if (linkedWalletAddress) {
            setProfileWalletAddress(linkedWalletAddress);
            setWithdrawForm((prev) => {
                if (prev.address) return prev;
                return { ...prev, address: linkedWalletAddress };
            });
        }
    }, [linkedWalletAddress]);

    useEffect(() => {
        walletConnectedRef.current = isConnected;
    }, [isConnected]);

    const waitForWalletConnected = async (timeoutMs: number = 45000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (walletConnectedRef.current) {
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        return false;
    };

    const fetchPrice = async () => {
        try {
            const res = await walletApi.getPolUsd();
            if (res.data?.ok && typeof res.data.priceUsd === 'number') {
                setPolPrice(res.data.priceUsd);
            }
        } catch (err: unknown) {
            console.error("Error fetching price", err);
        }
    };

    const fetchFeeInfo = useCallback(async () => {
        try {
            const res = await walletApi.getWithdrawFeeInfo();
            if (res.data?.ok) setWithdrawFeeInfo(res.data);
        } catch {}
    }, []);

    const clearBalancePollTimer = useCallback(() => {
        if (balancePollTimerRef.current) {
            clearTimeout(balancePollTimerRef.current);
            balancePollTimerRef.current = null;
        }
    }, []);

    const fetchWalletData = useCallback(async (): Promise<boolean> => {
        try {
            const [balanceRes, historyRes] = await Promise.all([
                walletApi.getBalance(),
                walletApi.getTransactions()
            ]);

            balanceBackoffMsRef.current = WALLET_BALANCE_POLL_MS;
            balanceUnavailableToastRef.current = false;

            if (balanceRes.data.ok) {
                setBalance({
                    amount: Number(balanceRes.data.balance || 0),
                    blkBalance: Number(balanceRes.data.blkBalance ?? 0),
                    blkLocked: Number(balanceRes.data.blkLocked ?? 0),
                    shibBalance: Number(balanceRes.data.shibBalance ?? 0),
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
                const savedWalletAddr = balanceRes.data.walletAddress;
                setWithdrawForm((prev) => {
                    if (prev.address) return prev;
                    if (typeof savedWalletAddr === 'string' && savedWalletAddr.length > 0) {
                        return { ...prev, address: savedWalletAddr };
                    }
                    return prev;
                });
            }

            if (historyRes.data.ok) {
                setTransactions(historyRes.data.transactions || []);
            }
            return true;
        } catch (err: unknown) {
            const kind = classifyWalletHttpError(err);
            if (kind === 'auth') {
                balancePollPausedRef.current = true;
                clearBalancePollTimer();
                return false;
            }
            if (kind === 'unavailable') {
                balanceBackoffMsRef.current = nextWalletBalanceBackoffMs(balanceBackoffMsRef.current);
                if (!balanceUnavailableToastRef.current) {
                    balanceUnavailableToastRef.current = true;
                    toast.error(t('wallet.balance_unavailable'), { id: 'wallet-balance-unavailable' });
                }
                return false;
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [clearBalancePollTimer, t]);

    const scheduleBalancePoll = useCallback(() => {
        if (balancePollPausedRef.current) return;
        clearBalancePollTimer();
        balancePollTimerRef.current = setTimeout(() => {
            void fetchWalletData().finally(() => {
                scheduleBalancePoll();
            });
        }, balanceBackoffMsRef.current);
    }, [clearBalancePollTimer, fetchWalletData]);

    const fetchPendingDeposits = useCallback(async () => {
        try {
            const res = await walletApi.getDepositPending();
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
        balancePollPausedRef.current = false;
        balanceBackoffMsRef.current = WALLET_BALANCE_POLL_MS;
        void fetchWalletData();
        fetchPrice();
        void fetchFeeInfo();
        fetchPendingDeposits();
        scheduleBalancePoll();
        const priceInterval = setInterval(fetchPrice, 60000);
        return () => {
            clearBalancePollTimer();
            clearInterval(priceInterval);
            stopPendingPoll();
        };
    }, [
        fetchWalletData,
        fetchPendingDeposits,
        fetchFeeInfo,
        stopPendingPoll,
        scheduleBalancePoll,
        clearBalancePollTimer,
    ]);

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
                const res = await walletApi.getHdAddress();
                if (cancelled) return;
                if (res.data?.ok && res.data.address) {
                    setPolygonHdAddress(res.data.address);
                } else {
                    setPolygonHdLoadError(res.data?.message || t('wallet.polygon_hd.load_error'));
                }
            } catch (err: unknown) {
                if (cancelled) return;
                const ax = err as AxiosError<{ message?: string; details?: { retryAfterSec?: number } }>;
                const status = ax.response?.status;
                const data = ax.response?.data;
                const details =
                    isRecord(data) && isRecord(data.details) ? (data.details as { retryAfterSec?: number }) : undefined;
                const retryRaw = details?.retryAfterSec ?? ax.response?.headers?.['retry-after'];
                const retryAfter = parseInt(String(retryRaw ?? ''), 10);
                if (status === 429) {
                    const sec = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 15;
                    setPolygonHdLoadError(t('wallet.polygon_hd.rate_limit_error', { seconds: sec }));
                } else {
                    const apiMsg = isRecord(data) && typeof data.message === 'string' ? data.message : '';
                    setPolygonHdLoadError(apiMsg || t('wallet.polygon_hd.load_error'));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [depositChannel, polygonHdDepositEnabled, polygonHdMissingEnvKeys, polygonHdFeatureVisible, t]);

    useEffect(() => {
        if (depositChannel !== 'smart_contract' || isConnected) {
            return undefined;
        }
        let cancelled = false;
        setInjectedDiscovery('scanning');
        void getInjectedWalletProviders().then((list) => {
            if (cancelled) return;
            if (list.length === 0) {
                setInjectedDiscovery('none');
                setDetectedWalletName(null);
                return;
            }
            setInjectedDiscovery('found');
            setDetectedWalletName(list[0]?.name ?? null);
        });
        return () => {
            cancelled = true;
        };
    }, [depositChannel, isConnected]);

    // Para de fazer poll quando não há mais pendentes
    useEffect(() => {
        const hasPending = pendingDeposits.some(
            d => d.status === 'pending_verification'
        );
        if (hasPending) {
            startPendingPoll();
        } else {
            stopPendingPoll();
        }
    }, [pendingDeposits, startPendingPoll, stopPendingPoll]);

    // Socket: ouve confirmação de depósito em tempo real
    useEffect(() => {
        if (!socket) return undefined;
        const handler = (payload: { amount?: string | number }) => {
            toast.success(t('wallet.web3_deposit.toast_credited', { amount: Number(payload.amount).toFixed(4) }));
            fetchWalletData();
            fetchPendingDeposits();
        };
        socket.on('wallet:deposit_confirmed', handler);
        return () => {
            socket.off('wallet:deposit_confirmed', handler);
        };
    }, [socket, fetchWalletData, fetchPendingDeposits, t]);

    // Auto-fill withdrawal address when wallet connects
    useEffect(() => {
        if (isConnected && evmAccount && !withdrawForm.address) {
            setWithdrawForm(prev => ({ ...prev, address: evmAccount }));
        }
    }, [isConnected, evmAccount]);

    const handleAutoDeposit = async () => {
        setIsActionLoading(true);
        try {
            if (depositChannel === 'smart_contract') {
                const hasContract = systemContractAddress && isAddress(String(systemContractAddress).trim());
                const hasTreasury = systemDepositAddress && isAddress(String(systemDepositAddress).trim());
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
                    let connected = false;
                    if (depositChannel === 'walletconnect') {
                        await connectWalletConnect();
                        connected = await waitForWalletConnected(45000);
                    } else {
                        connected = await connect({ useBrowserExtension: true });
                        if (!connected) {
                            return;
                        }
                        connected = await waitForWalletConnected(15000);
                    }
                    if (!connected) {
                        toast.error(t('wallet.web3_deposit.connect_wallet_failed'), {
                            id: 'wallet-connect-wallet-failed',
                        });
                        return;
                    }
                } catch (e: unknown) {
                    if (isRecord(e) && e.code === 'CANCELLED') {
                        toast.info(t('wallet.web3_deposit.connection_cancelled'));
                        return;
                    }
                    throw e;
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
                systemContractAddress && isAddress(String(systemContractAddress).trim());
            const useTreasury =
                !useContract && systemDepositAddress && isAddress(String(systemDepositAddress).trim());

            if (!useContract && !useTreasury) {
                toast.error(t('wallet.web3_deposit.no_deposit_config'));
                return;
            }

            let to: Address;
            let dataHex: Hex | undefined;
            if (useContract) {
                to = getAddress(systemContractAddress) as Address;
                if (!evmAccount || !isAddress(evmAccount)) {
                    toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                    return;
                }
                const linkedOk =
                    profileWalletAddress &&
                    isAddress(profileWalletAddress) &&
                    getAddress(evmAccount) === getAddress(profileWalletAddress);
                if (!linkedOk) {
                    toast.error(t('wallet.web3_deposit.link_wallet_required_contract'));
                    return;
                }
                dataHex = depositContractIface.encodeFunctionData('deposit', [getAddress(evmAccount)]) as Hex;
            } else {
                if (!systemDepositAddress) {
                    toast.error(t('wallet.web3_deposit.no_deposit_config'));
                    return;
                }
                to = getAddress(systemDepositAddress) as Address;
            }

            const valueWei = parseEther(amount.toString());

            toast.info(t('wallet.web3_deposit.tx_requesting'));

            let txHash: string;
            const sendPayload = useContract
                ? { to, value: valueWei, data: dataHex as Hex }
                : { to, value: valueWei };

            if (kitConnected) {
                txHash = (await sendPolDepositEip1193({
                    getActiveEip1193,
                    to,
                    valueWei,
                    dataHex,
                    t,
                    looksLikeGasOrProviderIssue,
                    isUserRejectedTx,
                })) as string;
            } else {
                try {
                    txHash = (await sendOnchainTx(sendPayload)) as string;
                } catch (wagmiErr: unknown) {
                    if (isUserRejectedTx(wagmiErr)) throw wagmiErr;
                    console.warn('Deposit: wagmi send failed, trying EIP-1193', wagmiErr);
                    try {
                        txHash = (await sendPolDepositEip1193({
                            getActiveEip1193,
                            to,
                            valueWei,
                            dataHex,
                            t,
                            looksLikeGasOrProviderIssue,
                            isUserRejectedTx,
                        })) as string;
                    } catch (e2: unknown) {
                        if (isRecord(e2) && e2.code === 'NO_EIP1193') {
                            toast.error(t('wallet.web3_deposit.no_wallet_for_send'));
                        }
                        throw e2;
                    }
                }
            }

            toast.info(t('wallet.web3_deposit.tx_submitted'));

            const res = await walletApi.postDepositSubmit({
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
        } catch (error: unknown) {
            console.error("Deposit error", error);
            const er = isRecord(error) ? error : {};
            const code = er.code;
            const message = typeof er.message === 'string' ? er.message : '';
            const reason = typeof er.reason === 'string' ? er.reason : '';
            if (code === 4001) {
                toast.error(t('wallet.web3_deposit.tx_rejected'));
            } else if (code === 'INSUFFICIENT_FUNDS' || message.includes('insufficient funds')) {
                toast.error(t('wallet.web3_deposit.insufficient_funds'));
            } else {
                toast.error(reason || message || t('wallet.web3_deposit.tx_failed'));
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWithdraw = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isActionLoading) return;
        const amount = parseFloat(withdrawForm.amount);

        if (!withdrawForm.address) {
            toast.error(t('wallet.dest_address'));
            return;
        }
        if (!isValidPolygonWithdrawAddress(withdrawForm.address)) {
            toast.error(t('wallet.dest_address'));
            return;
        }
        if (isNaN(amount) || amount < WALLET_MIN_WITHDRAW_POL) {
            toast.error(t('wallet.min_withdraw_error', { min: WALLET_MIN_WITHDRAW_POL }));
            return;
        }
        if (amount > balance.amount) {
            toast.error(t('wallet.insufficient_balance'));
            return;
        }

        try {
            setIsActionLoading(true);
            const res = await walletApi.postWithdraw({
                amount,
                address: withdrawForm.address
            });

            if (res.data.require2FA && res.data.withdrawalChallengeToken) {
                setWithdrawalChallenge({
                    challengeToken: res.data.withdrawalChallengeToken,
                    ttlMinutes: res.data.ttlMinutes ?? 10,
                    pendingAmount: amount,
                    pendingAddress: withdrawForm.address,
                });
                setWithdrawalCode('');
                toast.info('Código de verificação enviado para seu e-mail.');
                return;
            }

            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                setWithdrawForm(prev => ({ ...prev, amount: '' }));
                fetchWalletData();
            } else {
                toast.error(res.data.message || t('common.error'));
            }
        } catch (err: unknown) {
            const ax = err as AxiosError<{ message?: string }>;
            toast.error(ax.response?.data?.message || t('common.error'));
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWithdrawalCodeSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!withdrawalChallenge || isActionLoading) return;
        if (!/^\d{6}$/.test(withdrawalCode.trim())) {
            toast.error('Código deve ter 6 dígitos.');
            return;
        }

        try {
            setIsActionLoading(true);
            const res = await walletApi.postWithdraw({
                amount: withdrawalChallenge.pendingAmount,
                address: withdrawalChallenge.pendingAddress,
                withdrawalCode: withdrawalCode.trim(),
                withdrawalChallengeToken: withdrawalChallenge.challengeToken,
            });

            if (res.data.ok) {
                toast.success(res.data.message || t('common.success'));
                setWithdrawForm(prev => ({ ...prev, amount: '' }));
                setWithdrawalChallenge(null);
                setWithdrawalCode('');
                fetchWalletData();
            } else if (res.data.reason === 'EXPIRED') {
                toast.error('Código expirado. Tente novamente.');
                setWithdrawalChallenge(null);
                setWithdrawalCode('');
            } else {
                toast.error(res.data.message || 'Código inválido.');
            }
        } catch (err: unknown) {
            const ax = err as AxiosError<{ message?: string; reason?: string }>;
            const reason = ax.response?.data?.reason;
            if (reason === 'EXPIRED') {
                toast.error('Código expirado. Tente novamente.');
                setWithdrawalChallenge(null);
                setWithdrawalCode('');
            } else {
                toast.error(ax.response?.data?.message || 'Código inválido.');
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success(t('common.copied'));
    };

    const StatusBadge = ({ status }: { status: string }) => {
        const config: Record<
            string,
            { color: string; label: string }
        > = {
            completed: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.ledger_badge_success') },
            pending: { color: 'text-amber-400 bg-amber-400/10', label: t('wallet.ledger_badge_pending') },
            approved: { color: 'text-sky-400 bg-sky-400/10', label: t('wallet.ledger_badge_approved') },
            failed: { color: 'text-red-400 bg-red-400/10', label: t('wallet.ledger_badge_failed') }
        };
        const s = config[status] ?? config.pending;
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
                    {isLoadingLinkedWallet ? (
                        <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl">
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" aria-hidden />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {t('wallet.web3_deposit.loading_wallet', { defaultValue: 'Loading wallet…' })}
                            </span>
                        </div>
                    ) : linkedWalletAddress ? (
                        <>
                            <div className="flex items-center gap-3 p-1.5 bg-emerald-950/40 border border-emerald-800/50 rounded-2xl backdrop-blur-xl">
                                <div className="flex items-center gap-2 pl-3 pr-2">
                                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                                    <span className="text-[9px] font-black text-emerald-400/90 uppercase tracking-widest hidden sm:inline">
                                        {t('wallet.web3_deposit.wallet_linked', { defaultValue: 'Linked' })}
                                    </span>
                                    <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                        {headerWalletShort(linkedWalletAddress)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(linkedWalletAddress)}
                                    className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    clearConnectedSession();
                                    void connectLinkedWallet();
                                }}
                                disabled={isLinkConnecting || isLinking}
                                className="px-4 py-3 bg-slate-900/80 border border-slate-600 text-slate-200 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                                {t('wallet.web3_deposit.change_wallet', { defaultValue: 'Change wallet' })}
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await unlinkWallet();
                                    if (ok) void fetchWalletData();
                                }}
                                disabled={isLinking}
                                className="px-4 py-3 bg-transparent border border-slate-600 text-slate-300 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800/80 transition-all disabled:opacity-50"
                            >
                                {t('wallet.web3_deposit.unlink_wallet', { defaultValue: 'Unlink' })}
                            </button>
                        </>
                    ) : connectedWallet ? (
                        <>
                            <div className="flex items-center gap-3 p-1.5 bg-slate-900/50 border border-amber-800/40 rounded-2xl backdrop-blur-xl">
                                <div className="flex items-center gap-2 pl-3 pr-4">
                                    <div className="w-2 h-2 rounded-full animate-pulse bg-amber-400" />
                                    <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                        {headerWalletShort(connectedWallet.address)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(connectedWallet.address)}
                                    className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={async () => {
                                    const ok = await linkWallet();
                                    if (ok) {
                                        await loadSavedWallet();
                                        void fetchWalletData();
                                    }
                                }}
                                disabled={isLinking}
                                className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 border border-emerald-400/30 disabled:opacity-50"
                            >
                                {isLinking ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                        {t('wallet.web3_deposit.linking_wallet', { defaultValue: 'Linking…' })}
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" aria-hidden />
                                        {t('wallet.web3_deposit.save_link_wallet', { defaultValue: 'Save / link wallet' })}
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={clearConnectedSession}
                                disabled={isLinking}
                                className="px-4 py-3 bg-transparent border border-slate-600 text-slate-300 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:bg-slate-800/80 transition-all disabled:opacity-50"
                            >
                                {t('wallet.web3_deposit.cancel_connection')}
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void connectLinkedWallet()}
                            disabled={isLinkConnecting}
                            className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-2xl hover:opacity-95 active:scale-95 transition-all flex items-center justify-center gap-2 border border-indigo-400/30 shadow-lg shadow-indigo-900/20 disabled:opacity-50"
                        >
                            {isLinkConnecting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                                    {t('wallet.web3_deposit.connecting')}
                                </>
                            ) : (
                                <>
                                    <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
                                    {t('wallet.web3_deposit.connect_browser_wallet', {
                                        defaultValue: 'Connect wallet',
                                    })}
                                </>
                            )}
                        </button>
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
                                {/* SHIB balance */}
                                <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-3">
                                    <img src="/shib.svg" alt="SHIB" className="w-7 h-7 rounded-full shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                                    <div>
                                        <p className="text-orange-200/50 font-black uppercase tracking-[0.25em] text-[8px] mb-0.5">SHIBA INU</p>
                                        <p className="text-xl font-black tabular-nums tracking-tight text-orange-100">
                                            {balance.shibBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                            <span className="text-sm text-orange-300/70 ml-1.5">SHIB</span>
                                        </p>
                                    </div>
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
                                onClick={() => setActiveTab('shib')}
                                className={`flex-1 py-2.5 sm:py-4 text-[8px] sm:text-xs font-black uppercase tracking-tight sm:tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent flex items-center justify-center gap-1.5 ${activeTab === 'shib' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <img src="/shib.svg" alt="" className="w-3.5 h-3.5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                                SHIB
                            </button>
                        </div>

                        <div className="p-3 sm:p-8">
                            {activeTab === 'withdraw' && withdrawalChallenge && (
                                <form onSubmit={handleWithdrawalCodeSubmit} className="space-y-6">
                                    <div className="text-center space-y-2">
                                        <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
                                            <ShieldCheck className="w-7 h-7 text-amber-400" />
                                        </div>
                                        <h3 className="text-white font-black text-sm uppercase tracking-widest">Verificação de Saque</h3>
                                        <p className="text-slate-400 text-[11px] font-medium">
                                            Código enviado para seu e-mail. Expira em {withdrawalChallenge.ttlMinutes} minutos.
                                        </p>
                                        <p className="text-slate-500 text-[10px]">
                                            Saque de <span className="text-white font-black">{withdrawalChallenge.pendingAmount.toFixed(4)} POL</span> para <span className="text-slate-300 font-mono text-[9px]">{withdrawalChallenge.pendingAddress.slice(0, 8)}...{withdrawalChallenge.pendingAddress.slice(-6)}</span>
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Código de 6 dígitos</label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            value={withdrawalCode}
                                            onChange={(e) => setWithdrawalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-2xl py-5 px-6 text-slate-200 text-2xl font-black text-center tracking-[0.4em] transition-all outline-none"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isActionLoading || withdrawalCode.length !== 6}
                                        className="w-full py-4 sm:py-5 bg-gradient-to-r from-amber-500 to-orange-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-xs sm:text-sm uppercase tracking-tight sm:tracking-[0.2em] transition-all shadow-2xl shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isActionLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                                        {isActionLoading ? 'Verificando...' : 'Confirmar Saque'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setWithdrawalChallenge(null); setWithdrawalCode(''); }}
                                        className="w-full py-3 text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </form>
                            )}

                        {activeTab === 'withdraw' && !withdrawalChallenge && (
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
                                                        onClick={() => setWithdrawForm(prev => ({ ...prev, address: evmAccount ?? '' }))}
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
                                            <p className="text-[9px] text-slate-600 font-bold ml-2">{t('wallet.min_withdraw_hint', { min: WALLET_MIN_WITHDRAW_POL })}</p>
                                        </div>
                                    </div>

                                    {/* Fee info banner */}
                                    {withdrawFeeInfo && (
                                        <div className={`rounded-2xl p-4 border ${withdrawFeeInfo.feeWaived ? 'border-emerald-500/30 bg-emerald-950/30' : 'border-amber-500/30 bg-amber-950/20'}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Taxa de Saque</p>
                                                    {withdrawFeeInfo.feeWaived ? (
                                                        <p className="text-emerald-400 text-xs font-black uppercase">Isenta ✓</p>
                                                    ) : (
                                                        <p className="text-amber-400 text-xs font-black">{withdrawFeeInfo.feePercent}% aplicada</p>
                                                    )}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">
                                                        Ofertas externas hoje
                                                    </p>
                                                    <p className={`text-xs font-black ${withdrawFeeInfo.feeWaived ? 'text-emerald-400' : 'text-slate-300'}`}>
                                                        {withdrawFeeInfo.completionsToday}/{withdrawFeeInfo.requiredForWaiver}
                                                    </p>
                                                    {!withdrawFeeInfo.feeWaived && (
                                                        <p className="text-[9px] text-slate-600 mt-0.5">
                                                            +{withdrawFeeInfo.requiredForWaiver - withdrawFeeInfo.completionsToday} ofertas externas p/ isenção
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {!withdrawFeeInfo.feeWaived && (
                                                <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
                                                    <div
                                                        className="bg-amber-500 h-1 rounded-full transition-all"
                                                        style={{ width: `${Math.min(100, (withdrawFeeInfo.completionsToday / withdrawFeeInfo.requiredForWaiver) * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="bg-slate-900/50 rounded-3xl p-3 sm:p-6 border border-slate-800/50 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Network protocol fee</p>
                                            <p className="text-emerald-400 text-xs font-black uppercase">Gas Covered by Pool</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Você recebe</p>
                                            {(() => {
                                                const gross = parseFloat(withdrawForm.amount) || 0;
                                                const feeRate = withdrawFeeInfo && !withdrawFeeInfo.feeWaived ? withdrawFeeInfo.feePercent / 100 : 0;
                                                const net = gross * (1 - feeRate);
                                                return (
                                                    <p className="text-xl font-black text-white italic">
                                                        {net.toFixed(4)} POL
                                                        {polPrice > 0 && (
                                                            <span className="block text-[10px] text-slate-500 not-italic font-bold">
                                                                ≈ ${(net * polPrice).toFixed(2)} USD
                                                            </span>
                                                        )}
                                                    </p>
                                                );
                                            })()}
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
                                    {depositChannel !== 'polygon_hd' ? (
                                        <p className="text-[9px] text-slate-600 font-bold text-center leading-relaxed">
                                            {t('wallet.deposit_options.hint')}
                                        </p>
                                    ) : null}
                                    {depositChannel !== 'polygon_hd' &&
                                    depositChannel === 'smart_contract' &&
                                    kitConnected ? (
                                        <p className="text-[9px] text-amber-300/90 font-bold text-center leading-relaxed">
                                            {t('wallet.web3_deposit.hint_disconnect_for_contract')}
                                        </p>
                                    ) : null}
                                    {depositChannel !== 'polygon_hd' &&
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
                                                <div
                                                    role="alert"
                                                    className="rounded-xl border border-amber-500/45 bg-amber-950/40 px-3 py-2 sm:px-3.5 sm:py-2.5 flex gap-2 sm:gap-2.5 items-start shadow-md shadow-amber-950/20"
                                                >
                                                    <AlertTriangle
                                                        className="w-4 h-4 sm:w-4 sm:h-4 text-amber-400 shrink-0 mt-0.5"
                                                        aria-hidden
                                                    />
                                                    <div className="space-y-1 min-w-0">
                                                        <p className="text-[11px] sm:text-xs font-black uppercase tracking-wide text-amber-100 leading-snug">
                                                            {t('wallet.polygon_hd.min_deposit_banner_title', {
                                                                min: polygonHdMinPol
                                                            })}
                                                        </p>
                                                        <p className="text-[10px] sm:text-[11px] font-bold text-amber-100/90 leading-relaxed">
                                                            {t('wallet.polygon_hd.min_deposit_banner_warning')}
                                                        </p>
                                                    </div>
                                                </div>
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
                                            </div>
                                        )
                                    ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
                                        <div className="p-5 sm:p-6 rounded-3xl border border-indigo-500/25 bg-indigo-950/20 flex flex-col gap-4 min-h-[280px]">
                                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300">
                                                {t('wallet.web3_deposit.title')}
                                            </h4>
                                            <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                {depositChannel === 'smart_contract'
                                                    ? systemContractAddress &&
                                                      isAddress(String(systemContractAddress).trim())
                                                        ? t('wallet.web3_deposit.smart_contract_hint')
                                                        : systemDepositAddress &&
                                                            isAddress(String(systemDepositAddress).trim())
                                                          ? t('wallet.web3_deposit.treasury_browser_hint')
                                                          : t('wallet.web3_deposit.no_deposit_config')
                                                    : t('wallet.deposit_options.walletconnect_hint')}
                                            </p>
                                            {depositChannel === 'smart_contract' && !isConnected ? (
                                                <p className="text-[10px] text-center font-bold leading-relaxed text-slate-400">
                                                    {injectedDiscovery === 'scanning'
                                                        ? t('wallet.web3_deposit.injected_scanning')
                                                        : injectedDiscovery === 'none'
                                                          ? t('wallet.web3_deposit.no_browser_wallet')
                                                          : detectedWalletName?.toLowerCase().includes('rabby')
                                                            ? t('wallet.web3_deposit.injected_detected_rabby')
                                                            : t('wallet.web3_deposit.injected_detected_name', {
                                                                  name: detectedWalletName ?? 'Web3',
                                                              })}
                                                </p>
                                            ) : null}
                                            {depositChannel === 'walletconnect' && !walletConnectConfigured ? (
                                                <p className="text-[9px] text-amber-300/90 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_missing_build')}
                                                </p>
                                            ) : null}
                                            {depositChannel === 'walletconnect' && walletConnectConfigured ? (
                                                <p className="text-[9px] text-slate-500 font-bold leading-relaxed">
                                                    {t('wallet.web3_deposit.wc_explorer_domains_hint')}
                                                </p>
                                            ) : null}
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
                                            {isConnected && evmAccount ? (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] text-emerald-300/90 font-mono font-bold break-all">
                                                        {t('wallet.web3_deposit.linked_label')}: {evmAccount}
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
                                                    const isPending =
                                                        dep.status === 'pending_verification';
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
                                                                        {dep.txHash
                                                                              ? `${dep.txHash.slice(0, 10)}...${dep.txHash.slice(-6)}`
                                                                              : 'N/A'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-600">
                                                                        {isPending ? (
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
                                                                        ) : isOk ? (
                                                                            `+${Number(dep.amount).toFixed(4)} POL`
                                                                        ) : (
                                                                            dep.failReason || t('wallet.status_failed')
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {dep.txHash ? (
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

                            {activeTab === 'shib' && (
                                <ShibPanel balance={balance.shibBalance} onRefresh={fetchWalletData} />
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
                                    const txKey =
                                        (typeof tx.txHash === 'string' && tx.txHash.trim() !== ''
                                            ? tx.txHash
                                            : null) ??
                                        (typeof tx.createdAt === 'string' && tx.createdAt
                                            ? tx.createdAt
                                            : typeof tx.created_at === 'string' && tx.created_at
                                              ? tx.created_at
                                              : null) ??
                                        `${tx.type}-${tx.amount}-${i}`;
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
                                        <div key={txKey} className="group relative flex items-center gap-4 p-4 hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-slate-800/50">
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
                                                        {new Date(tx.createdAt ?? tx.created_at ?? 0).toLocaleDateString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
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
