import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowRightLeft, Loader2, Info, RefreshCw } from 'lucide-react';
import { api } from '../../store/auth';

const SHIB_WITHDRAW_FEE = 7800;

function fmtPOL(n: number): string {
    if (n <= 0) return '0';
    if (n >= 0.001) return parseFloat(n.toFixed(3)).toString();
    if (n >= 0.0001) return parseFloat(n.toFixed(4)).toString();
    return parseFloat(n.toFixed(6)).toString();
}

function fmtSHIB(n: number): string {
    return Math.floor(n).toString();
}

interface Props {
    balance: number;
    polBalance: number;
    onRefresh: () => void;
}

export function ShibPanel({ balance, polBalance, onRefresh }: Props) {
    const [mode, setMode] = useState<'withdraw' | 'swap'>('withdraw');
    const [swapDir, setSwapDir] = useState<'shib_to_pol' | 'pol_to_shib'>('shib_to_pol');
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');
    const [swapAmount, setSwapAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [minShib, setMinShib] = useState<number | null>(null);
    const [shibPrice, setShibPrice] = useState<number | null>(null);
    const [prices, setPrices] = useState<{ SHIB: number; POL: number } | null>(null);
    const [pricesLoading, setPricesLoading] = useState(false);

    useEffect(() => {
        function fetchMin() {
            api.get('/wallet/shib/withdraw-min').then((res) => {
                if (res.data.ok) {
                    setMinShib(res.data.minShib);
                    setShibPrice(res.data.shibPrice);
                }
            }).catch(() => {});
        }
        fetchMin();
        const interval = setInterval(fetchMin, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchPrices = useCallback(async () => {
        setPricesLoading(true);
        try {
            const res = await api.get('/swap/balances');
            const sp = res.data.prices?.SHIB;
            const pp = res.data.prices?.POL;
            if (sp && pp) setPrices({ SHIB: sp, POL: pp });
        } catch {
            // keep stale
        } finally {
            setPricesLoading(false);
        }
    }, []);

    useEffect(() => {
        if (mode === 'swap') {
            fetchPrices();
            const id = setInterval(fetchPrices, 2 * 60 * 1000);
            return () => clearInterval(id);
        }
    }, [mode, fetchPrices]);

    const net = Number(amount) - SHIB_WITHDRAW_FEE;
    const effectiveMin = minShib ?? 0;

    // Derived swap estimate — recomputes whenever swapAmount or prices change
    const swapAmountNum = Number(swapAmount);
    const swapOut: number | null = (() => {
        if (!prices || !swapAmountNum || swapAmountNum <= 0) return null;
        if (swapDir === 'shib_to_pol') return (swapAmountNum * prices.SHIB) / prices.POL;
        return Math.floor((swapAmountNum * prices.POL) / prices.SHIB);
    })();

    async function handleWithdraw(e: React.FormEvent) {
        e.preventDefault();
        if (effectiveMin > 0 && Number(amount) < effectiveMin) {
            toast.error(`Mínimo: ${Math.ceil(effectiveMin).toLocaleString()} SHIB ($0.10)`);
            return;
        }
        if (Number(amount) + SHIB_WITHDRAW_FEE > balance) {
            toast.error(`Insufficient balance (need ${Number(amount) + SHIB_WITHDRAW_FEE} SHIB including fee)`);
            return;
        }
        setLoading(true);
        try {
            const res = await api.post('/wallet/shib/withdraw', { amount: Number(amount), address });
            if (res.data.ok) {
                toast.success(res.data.message ?? 'Withdrawal submitted');
                setAmount('');
                setAddress('');
                onRefresh();
            } else {
                toast.error(res.data.message ?? 'Error');
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Error processing withdrawal');
        } finally {
            setLoading(false);
        }
    }

    async function handleSwap(e: React.FormEvent) {
        e.preventDefault();
        const n = Number(swapAmount);
        if (!n || n <= 0) { toast.error('Informe a quantidade'); return; }
        const fromAsset = swapDir === 'shib_to_pol' ? 'SHIB' : 'POL';
        const toAsset = swapDir === 'shib_to_pol' ? 'POL' : 'SHIB';
        if (swapDir === 'shib_to_pol' && n > balance) { toast.error('Saldo SHIB insuficiente'); return; }
        if (swapDir === 'pol_to_shib' && n > polBalance) { toast.error('Saldo POL insuficiente'); return; }
        setLoading(true);
        try {
            const res = await api.post('/swap/execute', { fromAsset, toAsset, amount: n });
            if (res.data.ok) {
                const outLabel = swapDir === 'shib_to_pol'
                    ? `${Number(res.data.output).toFixed(6)} POL`
                    : `${Math.floor(Number(res.data.output)).toLocaleString()} SHIB`;
                toast.success(`Swap realizado! Você recebeu ${outLabel}`);
                setSwapAmount('');
                onRefresh();
            } else {
                toast.error(res.data.message ?? 'Swap falhou');
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro no swap');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Balance Card */}
            <div className="flex items-center gap-4 p-5 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                <img src="/shib.png" alt="SHIB" className="w-12 h-12 rounded-full shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                <div>
                    <p className="text-orange-200/50 font-black uppercase tracking-widest text-[9px] mb-0.5">Saldo SHIBA INU</p>
                    <p className="text-3xl font-black tabular-nums text-orange-100">
                        {parseFloat(balance.toFixed(2)).toString()}
                        <span className="text-lg text-orange-300/70 ml-2">SHIB</span>
                    </p>
                </div>
            </div>

            {/* Mode Tabs */}
            <div className="flex bg-slate-900/50 p-1.5 rounded-2xl gap-2">
                <button
                    onClick={() => setMode('withdraw')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${mode === 'withdraw' ? 'bg-orange-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <ArrowDownToLine className="w-3.5 h-3.5" /> Sacar SHIB
                </button>
                <button
                    onClick={() => setMode('swap')}
                    className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${mode === 'swap' ? 'bg-violet-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> SHIB → POL
                </button>
            </div>

            {mode === 'withdraw' && (
                <form onSubmit={handleWithdraw} className="space-y-5">
                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex gap-3">
                        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-[10px] text-slate-400 font-medium space-y-1">
                            <p>Rede: <span className="text-white font-black">ERC20 (Ethereum)</span></p>
                            <p>Taxa padrão: <span className="text-orange-300 font-black">{SHIB_WITHDRAW_FEE.toLocaleString()} SHIB</span></p>
                            <p>Mínimo:{' '}
                                {minShib !== null
                                    ? <><span className="text-orange-300 font-black">{Math.ceil(minShib).toLocaleString()} SHIB</span><span className="text-gray-500 ml-1">($0.10)</span></>
                                    : <span className="text-gray-500">carregando...</span>
                                }
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                            Quantidade (SHIB)
                        </label>
                        <input
                            type="number"
                            step="0.1"
                            min={effectiveMin > 0 ? effectiveMin : undefined}
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder={minShib !== null ? `Mínimo ${Math.ceil(minShib).toLocaleString()} SHIB` : 'Quantidade'}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors"
                            required
                        />
                        {Number(amount) > 0 && (
                            <p className="text-[9px] text-slate-500 mt-1.5 font-medium">
                                Você receberá: <span className="text-orange-300 font-black">{Math.max(0, net).toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB</span>
                                {' '}(taxa {SHIB_WITHDRAW_FEE.toLocaleString()} SHIB deduzida)
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                            Endereço ERC20 (Ethereum)
                        </label>
                        <input
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="0x..."
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-xs focus:outline-none focus:border-orange-500 transition-colors"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || (effectiveMin > 0 && Number(amount) < effectiveMin)}
                        className="w-full py-4 bg-orange-500 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowDownToLine className="w-5 h-5" />}
                        Solicitar Saque
                    </button>
                </form>
            )}

            {mode === 'swap' && (
                <form onSubmit={handleSwap} className="space-y-5">
                    {/* Direction toggle */}
                    <div className="flex bg-slate-900/50 p-1 rounded-2xl gap-1">
                        <button type="button"
                            onClick={() => { setSwapDir('shib_to_pol'); setSwapAmount(''); }}
                            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${swapDir === 'shib_to_pol' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            <ArrowRightLeft className="w-3 h-3" /> SHIB → POL
                        </button>
                        <button type="button"
                            onClick={() => { setSwapDir('pol_to_shib'); setSwapAmount(''); }}
                            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${swapDir === 'pol_to_shib' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            <ArrowRightLeft className="w-3 h-3 rotate-180" /> POL → SHIB
                        </button>
                    </div>

                    {/* Live rate card */}
                    <div className="p-4 bg-slate-900/60 border border-slate-700/50 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taxa de conversão</span>
                            <button type="button" onClick={fetchPrices} disabled={pricesLoading}
                                className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40">
                                <RefreshCw className={`w-3.5 h-3.5 ${pricesLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        {prices ? (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">1 POL =</span>
                                    <span className="text-sm font-black text-orange-300 tabular-nums">
                                        {Math.floor(prices.POL / prices.SHIB).toString()} SHIB
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-slate-400">10.000 SHIB =</span>
                                    <span className="text-sm font-black text-primary tabular-nums">
                                        {fmtPOL((10000 * prices.SHIB) / prices.POL)} POL
                                    </span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-700/50">
                                    <span className="text-[10px] text-slate-500">POL ≈ ${prices.POL.toFixed(4)}</span>
                                    <span className="text-[10px] text-slate-500">SHIB ≈ ${prices.SHIB.toFixed(8)}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 text-slate-500 text-xs">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando preços...
                            </div>
                        )}
                    </div>

                    {/* Amount input */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {swapDir === 'shib_to_pol' ? 'Quantidade SHIB' : 'Quantidade POL'}
                            </label>
                            <button type="button"
                                onClick={() => setSwapAmount(swapDir === 'shib_to_pol' ? String(Math.floor(balance)) : String(polBalance))}
                                className="text-[10px] font-black text-violet-400 hover:text-violet-300 uppercase tracking-widest transition-colors">
                                MAX
                            </button>
                        </div>
                        <input
                            type="number"
                            step={swapDir === 'shib_to_pol' ? '1' : '0.000001'}
                            min="0"
                            value={swapAmount}
                            onChange={(e) => setSwapAmount(e.target.value)}
                            placeholder="0"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                        <p className="text-xs text-slate-500 mt-1.5 font-medium">
                            Saldo disponível: {swapDir === 'shib_to_pol'
                                ? <span className="text-orange-300 font-black">{fmtSHIB(balance)} SHIB</span>
                                : <span className="text-primary font-black">{fmtPOL(polBalance)} POL</span>}
                        </p>
                    </div>

                    {/* Output estimate — large and readable */}
                    {swapOut !== null && (
                        <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-2xl">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Você receberá (estimativa)</p>
                            {swapDir === 'shib_to_pol' ? (
                                <p className="text-2xl font-black tabular-nums text-primary">
                                    ≈ {fmtPOL(swapOut)} <span className="text-base text-primary/70 ml-1">POL</span>
                                </p>
                            ) : (
                                <p className="text-2xl font-black tabular-nums text-orange-300">
                                    ≈ {fmtSHIB(swapOut)} <span className="text-base text-orange-300/70 ml-1">SHIB</span>
                                </p>
                            )}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !swapAmount || Number(swapAmount) <= 0}
                        className="w-full py-4 bg-violet-600 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRightLeft className="w-5 h-5" />}
                        {swapDir === 'shib_to_pol' ? 'Trocar SHIB por POL' : 'Trocar POL por SHIB'}
                    </button>
                </form>
            )}
        </div>
    );
}
