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
    Info,
    Smartphone,
    TrendingUp,
    ChevronRight,
    QrCode,
    Ticket,
    Send,
    HelpCircle,
    Loader2,
    Banknote
} from 'lucide-react';
import { api } from '../store/auth';
import { parseEther, formatEther, isAddress } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';
import { QRCodeSVG } from 'qrcode.react';
import { useGameStore } from '../store/game';

export default function Wallet() {
    const { t } = useTranslation();
    const { account, isConnected, isConnecting, isCorrectNetwork, connect, switchNetwork } = useWallet();

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

    const [withdrawForm, setWithdrawForm] = useState({
        address: '',
        amount: ''
    });
    const [depositForm, setDepositForm] = useState({
        amount: '',
        txHash: ''
    });
    const [showManualForm, setShowManualForm] = useState(false);
    const [polPrice, setPolPrice] = useState(0);

    // Depósitos assíncronos pendentes
    const [pendingDeposits, setPendingDeposits] = useState([]);
    const pendingPollRef = useRef(null);

    const socket = useGameStore(s => s.socket);

    // Deposit Ticket state
    const [myTickets, setMyTickets] = useState([]);
    const [ticketForm, setTicketForm] = useState({ walletAddress: '', txHash: '', amountClaimed: '', description: '' });
    const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
    const [ticketsLoaded, setTicketsLoaded] = useState(false);

    const fetchPrice = async () => {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd');
            const data = await res.json();
            if (data['matic-network']) {
                setPolPrice(data['matic-network'].usd);
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

    // Para de fazer poll quando não há mais pendentes
    useEffect(() => {
        const hasPending = pendingDeposits.some(d => d.status === 'pending_verification');
        if (hasPending) {
            startPendingPoll();
        } else {
            stopPendingPoll();
        }
    }, [pendingDeposits, startPendingPoll, stopPendingPoll]);

    // Socket: ouve confirmação de depósito em tempo real
    useEffect(() => {
        if (!socket) return;
        const handler = ({ amount, txHash }) => {
            toast.success(`Depósito de ${Number(amount).toFixed(4)} POL confirmado!`);
            fetchWalletData();
            fetchPendingDeposits();
        };
        socket.on('wallet:deposit_confirmed', handler);
        return () => socket.off('wallet:deposit_confirmed', handler);
    }, [socket, fetchWalletData, fetchPendingDeposits]);

    // Auto-fill withdrawal address when wallet connects
    useEffect(() => {
        if (isConnected && account && !withdrawForm.address) {
            setWithdrawForm(prev => ({ ...prev, address: account }));
        }
    }, [isConnected, account]);

    const handleAutoDeposit = async () => {
        setIsActionLoading(true);
        try {
            if (!isConnected) {
                await connect();
                // We add a small delay or check isConnected again to allow state to sync if possible,
                // but usually the user will need to click again. Let's at least explain it.
                toast.info('Wallet connected. Please click "Express Deposit" again to authorize the transaction.');
                return;
            }

            if (!isCorrectNetwork) {
                await switchNetwork();
                return;
            }

            const amount = parseFloat(depositForm.amount);
            if (isNaN(amount) || amount < 1) {
                toast.error(t('wallet.min_deposit_error', { min: 1 }));
                return;
            }

            if (!systemDepositAddress) {
                toast.error('System deposit address not loaded');
                return;
            }

            if (!isAddress(systemDepositAddress)) {
                toast.error('Invalid deposit address configuration');
                return;
            }

            const eip1193 = getBrowserEthereumProvider();
            if (!eip1193) {
                toast.error(
                    'Web3 wallet not detected. Open Trust Wallet (or your browser wallet) for this site, or disable extensions that block injection.'
                );
                return;
            }
            const accounts = await eip1193.request({ method: 'eth_accounts' });
            const from = accounts[0];
            const valueHex = '0x' + parseEther(amount.toString()).toString(16);

            /** JSON-RPC quantity must be 0x + hex digits only (wallets reject prose e.g. API deprecation notices). */
            const normalizeQuantity = (val, label) => {
                if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && Number.isInteger(val)) {
                    return '0x' + BigInt(val).toString(16);
                }
                if (typeof val === 'string' && /^0x[0-9a-fA-F]+$/.test(val)) {
                    return val;
                }
                throw new Error(
                    `${label} inválido da rede. Troque de RPC na carteira ou tente “Transferência manual”.`
                );
            };

            // Usa o mesmo RPC da carteira (Polygon). fetch() a um RPC público pode devolver HTML/erro de proxy
            // e quebrar eth_sendTransaction com "gasPrice is not a valid hexadecimal string".
            const [nonceRaw, gasPriceRaw] = await Promise.all([
                eip1193.request({ method: 'eth_getTransactionCount', params: [from, 'pending'] }),
                eip1193.request({ method: 'eth_gasPrice' }),
            ]);
            const nonce = normalizeQuantity(nonceRaw, 'Nonce');
            const gasPrice = normalizeQuantity(gasPriceRaw, 'Preço do gás');

            toast.info('Requesting transaction authorized...');

            // type: '0x0' = transação legada (Type 0). Impede o wallet de tentar
            // buscar base fee EIP-1559, garantindo compatibilidade com Trust Wallet.
            const txHash = await eip1193.request({
                method: 'eth_sendTransaction',
                params: [{ from, to: systemDepositAddress, value: valueHex, gas: '0x5208', gasPrice, nonce, type: '0x0' }]
            });

            toast.info('Transação enviada! Registrando para verificação...');

            const res = await api.post('/wallet/deposit/submit', {
                txHash: txHash,
                claimedAmount: amount
            });

            if (res.data.ok) {
                toast.success('Depósito registrado! O sistema verifica na blockchain em segundo plano — você pode fechar esta página com segurança.');
                setDepositForm({ amount: '', txHash: '' });
                fetchPendingDeposits();
                startPendingPoll();
            } else {
                toast.error(res.data.message || 'Erro ao registrar depósito');
            }
        } catch (error) {
            console.error("Deposit error", error);
            // Handle common MetaMask errors
            if (error.code === 4001) {
                toast.error('Transaction rejected by user');
            } else if (error.code === 'INSUFFICIENT_FUNDS' || (error.message && error.message.includes('insufficient funds'))) {
                toast.error('Insufficient funds: You need more POL to cover the amount + network gas fees.');
            } else {
                toast.error(error.reason || error.message || 'Transaction failed');
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleManualDeposit = async () => {
        setIsActionLoading(true);
        try {
            const txHash = depositForm.txHash.trim();

            if (!txHash) {
                toast.error('Informe o hash da transação.');
                return;
            }

            if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
                toast.error('Hash inválido. Formato: 0x seguido de 64 caracteres hexadecimais.');
                return;
            }

            const claimedAmount = parseFloat(depositForm.amount) || 0;

            if (claimedAmount > 0 && claimedAmount < 1) {
                toast.error(t('wallet.min_deposit_error', { min: 1 }));
                return;
            }

            const res = await api.post('/wallet/deposit/submit', {
                txHash,
                claimedAmount: claimedAmount > 0 ? claimedAmount : undefined
            });

            if (res.data.ok) {
                toast.success('Depósito registrado! Verificando na blockchain em segundo plano. Pode fechar esta página com segurança.');
                setDepositForm({ amount: '', txHash: '' });
                setShowManualForm(false);
                fetchPendingDeposits();
                startPendingPoll();
            } else {
                const code = res.data.code;
                if (code === 'ALREADY_CREDITED') {
                    toast.info('Esta transação já foi processada e creditada.');
                    fetchWalletData();
                } else if (code === 'ALREADY_PENDING') {
                    toast.info('Este depósito já está em verificação.');
                } else {
                    toast.error(res.data.message || 'Erro ao registrar depósito');
                }
            }
        } catch (error) {
            console.error("Manual deposit error", error);
            toast.error(error.response?.data?.message || error.message || 'Erro ao registrar depósito');
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
            toast.error('Insufficient balance.');
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
            toast.error('Informe um endereço de carteira válido (0x...).');
            return;
        }
        try {
            setIsSubmittingTicket(true);
            const res = await api.post('/deposit-tickets', ticketForm);
            if (res.data.ok) {
                toast.success('Ticket aberto com sucesso! Vamos analisar sua transação.');
                setTicketForm({ walletAddress: '', txHash: '', amountClaimed: '', description: '' });
                fetchMyTickets();
            } else {
                toast.error(res.data.message || 'Erro ao abrir ticket.');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao abrir ticket.');
        } finally {
            setIsSubmittingTicket(false);
        }
    };

    const StatusBadge = ({ status }) => {
        const config = {
            completed: { color: 'text-emerald-400 bg-emerald-400/10', label: 'Success' },
            pending: { color: 'text-amber-400 bg-amber-400/10', label: 'Pending' },
            approved: { color: 'text-sky-400 bg-sky-400/10', label: 'Approved' },
            failed: { color: 'text-red-400 bg-red-400/10', label: 'Failed' }
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
                        WALLET <span className="text-primary">TERMINAL</span>
                    </h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] pl-1">
                        Secure Web3 Financial Operations
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {isConnected ? (
                        <div className="flex items-center gap-3 p-1.5 bg-slate-900/50 border border-slate-800 rounded-2xl backdrop-blur-xl">
                            <div className="flex items-center gap-2 pl-3 pr-4">
                                <div className={`w-2 h-2 rounded-full animate-pulse ${isCorrectNetwork ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[100px] font-mono">
                                    {account.slice(0, 6)}...{account.slice(-4)}
                                </span>
                            </div>
                            <button
                                onClick={() => copyToClipboard(account)}
                                className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-500 hover:text-white"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={connect}
                            disabled={isConnecting}
                            className="px-6 py-3 bg-white text-slate-900 font-black text-xs uppercase tracking-widest rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5 flex items-center gap-2"
                        >
                            <Smartphone className="w-4 h-4" />
                            {isConnecting ? 'Authenticating...' : 'Connect Wallet'}
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
                                    <p className="text-blue-100/60 font-black uppercase tracking-[0.3em] text-[9px] mb-3">Total Liquid Assets</p>
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
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">Life Mined</p>
                                    <p className="text-lg font-black tracking-tight">{balance.lifetimeMined.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">Total Outflow</p>
                                    <p className="text-lg font-black tracking-tight">{balance.totalWithdrawn.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="hidden md:block space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">Network Status</p>
                                    <p className="text-lg font-black tracking-tight flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                                        Polygon
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                                <div>
                                    <p className="text-blue-100/50 font-black uppercase tracking-[0.25em] text-[8px] mb-1 flex items-center gap-2">
                                        <Banknote className="w-3 h-3" /> BLK (1 BLK ≈ 1 USD)
                                    </p>
                                    <p className="text-2xl sm:text-3xl font-black tabular-nums tracking-tight">
                                        {balance.blkBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 8 })}
                                        <span className="text-sm sm:text-lg text-blue-200/70 ml-2">BLK</span>
                                    </p>
                                    {balance.blkLocked > 0 && (
                                        <p className="text-[10px] font-bold text-amber-200/90 mt-1">
                                            Bloqueado (legado): {balance.blkLocked.toFixed(8)} BLK — contate suporte se necessário.
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
                                                        title="Use connected wallet"
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
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-4 sm:space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.deposit_address_label')}</label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={systemDepositAddress || 'Loading...'}
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-5 pl-5 pr-12 text-slate-400 text-xs font-mono transition-all outline-none"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => copyToClipboard(systemDepositAddress)}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-indigo-400 hover:text-white transition-colors"
                                                >
                                                    <Copy className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.amount_to_add')}</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={depositForm.amount}
                                                onChange={(e) => setDepositForm(prev => ({ ...prev, amount: e.target.value }))}
                                                placeholder="0.00"
                                                className="w-full bg-slate-900 border border-slate-800 group-hover:border-slate-700 focus:border-indigo-500 rounded-2xl py-5 px-5 text-slate-200 text-sm font-black transition-all outline-none"
                                            />
                                            <p className="text-[9px] text-slate-600 font-bold ml-2">{t('wallet.min_deposit_hint', { min: 1 })}</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-4">
                                        <button
                                            type="button"
                                            onClick={handleAutoDeposit}
                                            disabled={isActionLoading || !systemDepositAddress}
                                            className={`flex-[2] py-4 sm:py-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-[10px] sm:text-sm uppercase tracking-tight sm:tracking-[0.1em] transition-all shadow-2xl shadow-indigo-600/20 flex items-center justify-center gap-2 sm:gap-3 disabled:opacity-50 ${showManualForm ? 'opacity-50' : ''}`}
                                        >
                                            <Smartphone className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                                            {t('wallet.express_deposit')}
                                        </button>
                                        <button
                                            type="button"
                                            className={`flex-1 py-4 sm:py-5 rounded-3xl font-bold text-[9px] sm:text-xs uppercase tracking-tight sm:tracking-widest transition-all border flex items-center justify-center gap-2 ${showManualForm ? 'bg-primary text-white border-primary shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/50'}`}
                                            onClick={() => setShowManualForm(!showManualForm)}
                                        >
                                            {showManualForm ? <XCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                            {showManualForm ? t('wallet.cancel_manual') : t('wallet.manual_transfer')}
                                        </button>
                                    </div>

                                    {showManualForm && (
                                        <div className="p-6 bg-slate-900/80 border border-primary/20 rounded-3xl space-y-4 animate-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 italic">{t('wallet.tx_hash_label')}</label>
                                                <input
                                                    type="text"
                                                    value={depositForm.txHash}
                                                    onChange={(e) => setDepositForm(prev => ({ ...prev, txHash: e.target.value }))}
                                                    placeholder="0x..."
                                                    className="w-full bg-slate-950 border border-slate-800 focus:border-primary rounded-2xl py-4 px-5 text-slate-200 text-xs font-mono transition-all outline-none"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleManualDeposit}
                                                disabled={isActionLoading}
                                                className="w-full py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                                            >
                                                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                                                {isActionLoading ? t('wallet.registering') : t('wallet.register_deposit')}
                                            </button>
                                            <p className="text-[9px] text-slate-500 font-bold italic text-center">
                                                {t('wallet.deposit_verify_msg')}
                                            </p>
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
                                                    const isPending = dep.status === 'pending_verification';
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
                                                                        {dep.txHash ? `${dep.txHash.slice(0,10)}...${dep.txHash.slice(-6)}` : 'N/A'}
                                                                    </p>
                                                                    <p className="text-[9px] text-slate-600">
                                                                        {isPending ? t('wallet.verifying_attempt', { current: dep.verifyAttempts, max: 20 }) :
                                                                         isOk ? `+${Number(dep.amount).toFixed(4)} POL` :
                                                                         dep.failReason || t('wallet.status_failed')}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {dep.txHash && (
                                                                    <a
                                                                        href={`https://polygonscan.com/tx/${dep.txHash}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-slate-600 hover:text-primary transition-colors"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                )}
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

                                    <div className="flex flex-col lg:flex-row gap-4 sm:gap-8 items-center bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-4 sm:p-6">
                                        <div className="bg-white p-4 rounded-2xl shadow-2xl shadow-indigo-500/20">
                                            {systemDepositAddress ? (
                                                <QRCodeSVG
                                                    value={systemDepositAddress}
                                                    size={120}
                                                    includeMargin={false}
                                                    level="H"
                                                />
                                            ) : (
                                                <div className="w-[120px] h-[120px] bg-slate-100 animate-pulse rounded-lg" />
                                            )}
                                        </div>
                                        <div className="space-y-4">
                                            <div className="flex gap-4">
                                                <AlertCircle className="w-6 h-6 text-indigo-400 shrink-0" />
                                                <p className="text-[10px] text-slate-500 leading-relaxed font-bold">
                                                    EXPRESS MODE: Connect your wallet to automatically sign and verify transactions on the Polygon Network. Funds will be available after 1 block confirmation.
                                                </p>
                                            </div>
                                            <div className="flex gap-4">
                                                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                                                <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-tight">
                                                    Your funds are safe. Scan the QR code or manually send POL to the address above. Do not send other assets.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
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
                                Ledger Analytics
                            </h3>
                            <ChevronRight className="w-4 h-4 text-slate-700" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
                            {transactions.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                                    <QrCode className="w-12 h-12" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">No activity found</p>
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
                                        ? 'POL → BLK'
                                        : isBlkWithdraw
                                          ? 'BLK (saque legado)'
                                          : isWithdrawal
                                            ? 'Outflow'
                                            : 'Inflow';
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
