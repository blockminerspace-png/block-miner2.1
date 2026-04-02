import { useState, useEffect, useCallback } from 'react';
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
    QrCode
} from 'lucide-react';
import { api } from '../store/auth';
import { BrowserProvider, parseEther, formatEther, isAddress } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { getBrowserEthereumProvider } from '../utils/walletProvider.js';
import { QRCodeSVG } from 'qrcode.react';

export default function Wallet() {
    const { t } = useTranslation();
    const { account, isConnected, isConnecting, isCorrectNetwork, connect, switchNetwork } = useWallet();

    const [balance, setBalance] = useState({
        amount: 0,
        lifetimeMined: 0,
        totalWithdrawn: 0
    });
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('withdraw');
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

    useEffect(() => {
        fetchWalletData();
        fetchPrice();
        const dataInterval = setInterval(fetchWalletData, 30000);
        const priceInterval = setInterval(fetchPrice, 60000);
        return () => {
            clearInterval(dataInterval);
            clearInterval(priceInterval);
        };
    }, [fetchWalletData]);

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
                toast.info(t('wallet.connect_then_express_deposit'));
                return;
            }

            if (!isCorrectNetwork) {
                await switchNetwork();
                return;
            }

            const amount = parseFloat(depositForm.amount);
            if (isNaN(amount) || amount <= 0) {
                toast.error(t('wallet.invalid_amount'));
                return;
            }

            if (!systemDepositAddress) {
                toast.error(t('wallet.deposit_address_not_loaded'));
                return;
            }

            if (!isAddress(systemDepositAddress)) {
                toast.error(t('wallet.deposit_address_invalid'));
                return;
            }

            const eip1193 = getBrowserEthereumProvider();
            if (!eip1193) {
                toast.error(t('wallet.web3_not_detected_deposit'));
                return;
            }
            const provider = new BrowserProvider(eip1193);
            const signer = await provider.getSigner();

            toast.info(t('wallet.deposit_requesting_tx'));

            // We use a manual gasLimit to force MetaMask to open even if 
            // the user has 0 funds. This allows the user to see the 
            // "Insufficient Funds" warning INSIDE MetaMask.
            const tx = await signer.sendTransaction({
                to: systemDepositAddress,
                value: parseEther(amount.toString()),
                gasLimit: 21000 // Standard transfer gas
            });

            toast.info(t('wallet.deposit_tx_sent'));

            const res = await api.post('/wallet/deposit', {
                amount: amount,
                txHash: tx.hash
            });

            if (res.data.ok) {
                toast.success(t('wallet.deposit_confirmed_balance'));
                setDepositForm({ amount: '', txHash: '' });
                fetchWalletData();
            } else {
                toast.error(res.data.message || t('wallet.deposit_verify_failed'));
            }
        } catch (error) {
            console.error("Deposit error", error);
            // Handle common MetaMask errors
            if (error.code === 4001) {
                toast.error(t('wallet.tx_rejected_user'));
            } else if (error.code === 'INSUFFICIENT_FUNDS' || (error.message && error.message.includes('insufficient funds'))) {
                toast.error(t('wallet.insufficient_funds_gas'));
            } else {
                toast.error(error.reason || error.message || t('wallet.tx_failed'));
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleManualDeposit = async () => {
        setIsActionLoading(true);
        try {
            const amount = parseFloat(depositForm.amount);
            const txHash = depositForm.txHash.trim();

            if (isNaN(amount) || amount <= 0) {
                toast.error(t('wallet.invalid_amount'));
                return;
            }

            if (!txHash) {
                toast.error(t('wallet.manual_tx_hash_required'));
                return;
            }

            toast.info(t('wallet.manual_verifying_onchain'));

            const res = await api.post('/wallet/deposit', {
                amount: amount,
                txHash: txHash
            });

            if (res.data.ok) {
                toast.success(t('wallet.deposit_confirmed_balance'));
                setDepositForm({ amount: '', txHash: '' });
                setShowManualForm(false);
                fetchWalletData();
            } else {
                toast.error(res.data.message || t('wallet.deposit_verify_failed'));
            }
        } catch (error) {
            console.error("Manual deposit error", error);
            toast.error(error.response?.data?.message || error.message || t('wallet.onchain_verification_failed'));
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
        if (isNaN(amount) || amount < 0.1) {
            toast.error(t('wallet.min_withdrawal'));
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

    const StatusBadge = ({ status }) => {
        const config = {
            completed: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.status.completed') },
            confirmed: { color: 'text-emerald-400 bg-emerald-400/10', label: t('wallet.status.confirmed') },
            pending: { color: 'text-amber-400 bg-amber-400/10', label: t('wallet.status.pending') },
            failed: { color: 'text-red-400 bg-red-400/10', label: t('wallet.status.failed') }
        };
        const s = config[status] || config.pending;
        return (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${s.color}`}>
                {s.label}
            </span>
        );
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <h1 className="text-4xl font-black text-white tracking-tighter italic flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-2xl">
                            <WalletIcon className="w-8 h-8 text-primary" />
                        </div>
                        {t('wallet.header_title_prefix')}{' '}
                        <span className="text-primary">{t('wallet.header_title_accent')}</span>
                    </h1>
                    <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[10px] pl-1">
                        {t('wallet.subtitle_secure_ops')}
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
                            {isConnecting ? t('wallet.authenticating') : t('wallet.connect_wallet')}
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

                        <div className="relative p-10 text-white space-y-12">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-blue-100/60 font-black uppercase tracking-[0.3em] text-[9px] mb-3">{t('wallet.total_liquid_assets')}</p>
                                    <div className="flex items-baseline gap-4">
                                        <h2 className="text-6xl font-black tracking-tighter tabular-nums drop-shadow-2xl">
                                            {balance.amount.toLocaleString(undefined, { minimumFractionDigits: 6 })}
                                        </h2>
                                        <div className="flex flex-col">
                                            <span className="text-2xl font-black text-blue-200/80 italic">POL</span>
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

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-8 pt-10 border-t border-white/10">
                                <div className="space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.life_mined_label')}</p>
                                    <p className="text-lg font-black tracking-tight">{balance.lifetimeMined.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.total_outflow_label')}</p>
                                    <p className="text-lg font-black tracking-tight">{balance.totalWithdrawn.toFixed(4)} <span className="text-[10px] opacity-40">POL</span></p>
                                </div>
                                <div className="hidden md:block space-y-1">
                                    <p className="text-blue-100/40 font-bold uppercase tracking-widest text-[8px]">{t('wallet.network_status_label')}</p>
                                    <p className="text-lg font-black tracking-tight flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                                        Polygon
                                    </p>
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
                                onClick={() => setActiveTab('withdraw')}
                                className={`flex-1 py-4 text-xs font-black uppercase tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'withdraw' ? 'bg-primary text-white shadow-lg shadow-primary/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_send_funds')}
                            </button>
                            <button
                                onClick={() => setActiveTab('deposit')}
                                className={`flex-1 py-4 text-xs font-black uppercase tracking-widest rounded-[1.8rem] transition-all duration-500 border border-transparent ${activeTab === 'deposit' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border-white/10' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {t('wallet.tab_add_funds')}
                            </button>
                        </div>

                        <div className="p-8">
                            {activeTab === 'withdraw' ? (
                                <form onSubmit={handleWithdraw} className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
                                                        title={t('wallet.use_connected_wallet')}
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
                                                    {t('wallet.max')}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/50 rounded-3xl p-6 border border-slate-800/50 flex items-center justify-between">
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">{t('wallet.network_protocol_fee')}</p>
                                            <p className="text-emerald-400 text-xs font-black uppercase">{t('wallet.gas_covered_by_pool')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">{t('wallet.total_transfer')}</p>
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
                                        className="w-full py-5 bg-gradient-to-r from-primary to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-sm uppercase tracking-[0.3em] transition-all shadow-2xl shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3"
                                    >
                                        {isActionLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ArrowUpCircle className="w-5 h-5" />}
                                        {isActionLoading ? t('wallet.processing') : t('wallet.authorize_transaction')}
                                    </button>
                                </form>
                            ) : (
                                <form onSubmit={(e) => e.preventDefault()} className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-3">
                                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">{t('wallet.deposit_address_label')}</label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={systemDepositAddress || t('wallet.loading_placeholder')}
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
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:flex-row gap-4">
                                        <button
                                            type="button"
                                            onClick={handleAutoDeposit}
                                            disabled={isActionLoading || !systemDepositAddress}
                                            className={`flex-[2] py-5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-[1.01] active:scale-[0.99] text-white rounded-3xl font-black text-sm uppercase tracking-[0.2em] transition-all shadow-2xl shadow-indigo-600/20 flex items-center justify-center gap-3 disabled:opacity-50 ${showManualForm ? 'opacity-50' : ''}`}
                                        >
                                            <Smartphone className="w-5 h-5" />
                                            {t('wallet.express_deposit_web3')}
                                        </button>
                                        <button
                                            type="button"
                                            className={`flex-1 py-5 rounded-3xl font-bold text-xs uppercase tracking-widest transition-all border flex items-center justify-center gap-2 ${showManualForm ? 'bg-primary text-white border-primary shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/50'}`}
                                            onClick={() => setShowManualForm(!showManualForm)}
                                        >
                                            {showManualForm ? <XCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                            {showManualForm ? t('wallet.cancel_manual') : t('wallet.manual_transfer')}
                                        </button>
                                    </div>

                                    {showManualForm && (
                                        <div className="p-6 bg-slate-900/80 border border-primary/20 rounded-3xl space-y-4 animate-in slide-in-from-top-4 duration-500">
                                            <div className="space-y-3">
                                                <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2 italic">{t('wallet.paste_tx_hash')}</label>
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
                                                {isActionLoading ? t('wallet.verifying') : t('wallet.verify_transfer_balance')}
                                            </button>
                                            <p className="text-[9px] text-slate-500 font-bold italic text-center">
                                                {t('wallet.manual_verify_hint')}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex flex-col lg:flex-row gap-8 items-center bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-6">
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
                                                    {t('wallet.express_mode_info')}
                                                </p>
                                            </div>
                                            <div className="flex gap-4">
                                                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                                                <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-tight">
                                                    {t('wallet.funds_safe_info')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Sidebar Stats */}
                <div className="lg:col-span-4 space-y-8">

                    {/* Activity Feed */}
                    <div className="bg-slate-950/80 border border-slate-800/50 rounded-[2.5rem] p-8 shadow-2xl flex flex-col h-full max-h-[700px]">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
                                <Clock className="w-4 h-4 text-primary" />
                                {t('wallet.ledger_analytics')}
                            </h3>
                            <ChevronRight className="w-4 h-4 text-slate-700" />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-hide">
                            {transactions.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                                    <QrCode className="w-12 h-12" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">{t('wallet.no_activity_found')}</p>
                                </div>
                            ) : (
                                transactions.map((tx, i) => {
                                    const isWithdrawal = tx.type === 'withdrawal';
                                    return (
                                        <div key={i} className="group relative flex items-center gap-4 p-4 hover:bg-slate-900/50 rounded-2xl transition-all border border-transparent hover:border-slate-800/50">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${isWithdrawal ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                {isWithdrawal ? <ArrowUpCircle className="w-6 h-6" /> : <ArrowDownCircle className="w-6 h-6" />}
                                            </div>

                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-black text-white italic uppercase tracking-tighter">
                                                        {isWithdrawal ? t('wallet.outflow') : t('wallet.inflow')}
                                                    </span>
                                                    <StatusBadge status={tx.status} />
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <p className="text-[10px] font-bold text-slate-500 font-mono">
                                                        {new Date(tx.createdAt || tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                    <p className={`text-sm font-black italic tracking-tighter ${isWithdrawal ? 'text-red-400' : 'text-emerald-400'}`}>
                                                        {isWithdrawal ? '-' : '+'}{Number(tx.amount).toFixed(4)}
                                                        {polPrice > 0 && (
                                                            <span className="block text-[8px] opacity-50 not-italic text-right">
                                                                ${(Number(tx.amount) * polPrice).toFixed(2)}
                                                            </span>
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

                        <div className="mt-8 pt-8 border-t border-slate-900">
                            <div className="bg-primary/5 rounded-2xl p-4 border border-primary/10 flex items-center gap-3">
                                <ShieldCheck className="w-5 h-5 text-primary" />
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight leading-relaxed">
                                    {t('wallet.tx_secured_polygon')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
