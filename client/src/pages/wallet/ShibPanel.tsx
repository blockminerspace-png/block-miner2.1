import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowRightLeft, Loader2, Info, ArrowLeftRight } from 'lucide-react';
import { api } from '../../store/auth';

const SHIB_WITHDRAW_FEE = 7800;

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
    const [swapOut, setSwapOut] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [minShib, setMinShib] = useState<number | null>(null);
    const [shibPrice, setShibPrice] = useState<number | null>(null);

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

    const net = Number(amount) - SHIB_WITHDRAW_FEE;
    const effectiveMin = minShib ?? 0;

    async function estimateSwap(val: string, dir: 'shib_to_pol' | 'pol_to_shib') {
        const n = Number(val);
        if (!n || n <= 0) { setSwapOut(null); return; }
        try {
            const res = await api.get('/swap/balances');
            const sp = res.data.prices?.SHIB ?? 0.00001;
            const pp = res.data.prices?.POL ?? 1;
            if (dir === 'shib_to_pol') {
                setSwapOut((n * sp) / pp);
            } else {
                setSwapOut(Math.floor((n * pp) / sp));
            }
        } catch {
            setSwapOut(null);
        }
    }

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
                setSwapOut(null);
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
                        {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
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
                            onClick={() => { setSwapDir('shib_to_pol'); setSwapAmount(''); setSwapOut(null); }}
                            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${swapDir === 'shib_to_pol' ? 'bg-violet-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            <ArrowRightLeft className="w-3 h-3" /> SHIB → POL
                        </button>
                        <button type="button"
                            onClick={() => { setSwapDir('pol_to_shib'); setSwapAmount(''); setSwapOut(null); }}
                            className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 ${swapDir === 'pol_to_shib' ? 'bg-primary text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                            <ArrowLeftRight className="w-3 h-3" /> POL → SHIB
                        </button>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                            {swapDir === 'shib_to_pol' ? 'Quantidade SHIB' : 'Quantidade POL'}
                        </label>
                        <input
                            type="number"
                            step={swapDir === 'shib_to_pol' ? '1' : '0.000001'}
                            min="0"
                            value={swapAmount}
                            onChange={(e) => { setSwapAmount(e.target.value); estimateSwap(e.target.value, swapDir); }}
                            placeholder="0"
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-violet-500 transition-colors"
                            required
                        />
                        {swapOut !== null && (
                            <p className="text-[9px] text-slate-500 mt-1.5 font-medium">
                                {swapDir === 'shib_to_pol'
                                    ? <>Estimativa: <span className="text-primary font-black">≈ {swapOut.toFixed(6)} POL</span></>
                                    : <>Estimativa: <span className="text-orange-300 font-black">≈ {Math.floor(swapOut).toLocaleString()} SHIB</span></>
                                }
                            </p>
                        )}
                        <p className="text-[9px] text-slate-600 mt-1 font-medium">
                            Saldo: {swapDir === 'shib_to_pol'
                                ? `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB`
                                : `${polBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })} POL`}
                        </p>
                    </div>

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
