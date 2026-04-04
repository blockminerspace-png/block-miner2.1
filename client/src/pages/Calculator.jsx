import { useState, useEffect } from 'react';
import { Calculator, Zap, TrendingUp, RefreshCw, Info } from 'lucide-react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';
import { formatHashrate } from '../utils/machine';

// Constantes do engine (miningEngine.js)
const BLOCK_REWARD_POL = 0.15;
const BLOCK_INTERVAL_MIN = 10;
const BLOCKS_PER_HOUR = 60 / BLOCK_INTERVAL_MIN; // 6
const BLOCKS_PER_DAY = BLOCKS_PER_HOUR * 24;     // 144
const BLOCKS_PER_WEEK = BLOCKS_PER_DAY * 7;       // 1008
const BLOCKS_PER_MONTH = BLOCKS_PER_DAY * 30;     // 4320

export default function CalculatorPage() {
    const { stats, initSocket } = useGameStore();

    const [miners, setMiners] = useState([]);
    const [loadingMiners, setLoadingMiners] = useState(true);

    const [myHashRateInput, setMyHashRateInput] = useState('');
    const [networkHashRateInput, setNetworkHashRateInput] = useState('');
    const [tokenPriceInput, setTokenPriceInput] = useState('0.35');
    const [networkManual, setNetworkManual] = useState(false);
    const [selectedMiners, setSelectedMiners] = useState({}); // { minerId: qty }

    useEffect(() => { initSocket(); }, [initSocket]);

    // Carrega mineradoras da loja
    useEffect(() => {
        api.get('/shop/miners?pageSize=48')
            .then(res => { if (res.data.ok) setMiners(res.data.miners || []); })
            .catch(() => {})
            .finally(() => setLoadingMiners(false));
    }, []);

    // Sync hash rate da rede ao vivo
    useEffect(() => {
        if (!networkManual && stats?.networkHashRate) {
            setNetworkHashRateInput(String(Math.round(stats.networkHashRate)));
        }
    }, [stats?.networkHashRate, networkManual]);

    // Sync preço do token ao vivo
    useEffect(() => {
        if (stats?.tokenPrice) setTokenPriceInput(String(stats.tokenPrice));
    }, [stats?.tokenPrice]);

    // Calcula hash rate total das máquinas selecionadas
    const hashFromMiners = Object.entries(selectedMiners).reduce((sum, [id, qty]) => {
        const m = miners.find(m => m.id === Number(id));
        return sum + (m ? m.baseHashRate * qty : 0);
    }, 0);

    // Quando adiciona/remove máquinas, atualiza o campo de hash rate
    useEffect(() => {
        if (hashFromMiners > 0) setMyHashRateInput(String(hashFromMiners));
    }, [hashFromMiners]);

    const myHash = parseFloat(myHashRateInput) || 0;
    const netHash = parseFloat(networkHashRateInput) || 0;
    const price = parseFloat(tokenPriceInput) || 0;

    const share = netHash > 0 ? myHash / netHash : 0;
    const perBlock = BLOCK_REWARD_POL * share;
    const perHour = perBlock * BLOCKS_PER_HOUR;
    const perDay = perBlock * BLOCKS_PER_DAY;
    const perWeek = perBlock * BLOCKS_PER_WEEK;
    const perMonth = perBlock * BLOCKS_PER_MONTH;

    const toUSD = (pol) => (pol * price).toFixed(4);

    const handleMinerQty = (id, delta) => {
        setSelectedMiners(prev => {
            const curr = prev[id] || 0;
            const next = Math.max(0, curr + delta);
            if (next === 0) {
                const { [id]: _, ...rest } = prev;
                return rest;
            }
            return { ...prev, [id]: next };
        });
    };

    const handleResetNetwork = () => {
        setNetworkManual(false);
        if (stats?.networkHashRate) setNetworkHashRateInput(String(Math.round(stats.networkHashRate)));
    };

    const clearMiners = () => {
        setSelectedMiners({});
        setMyHashRateInput('');
    };

    const resultRows = [
        { label: 'Por Bloco', pol: perBlock, sub: `a cada ${BLOCK_INTERVAL_MIN} min` },
        { label: 'Por Hora', pol: perHour, sub: '1 hora' },
        { label: 'Por Dia', pol: perDay, sub: '24 horas' },
        { label: 'Por Semana', pol: perWeek, sub: '7 dias' },
        { label: 'Por Mês', pol: perMonth, sub: '30 dias' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="space-y-2">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
                    <Calculator className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">Calculadora de Ganhos</h1>
                <p className="text-gray-500 font-medium">Estime seus ganhos com base no hash rate e na rede atual</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Coluna esquerda — Parâmetros + Simulação de máquinas */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Parâmetros */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                        <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Parâmetros</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Meu Hash Rate */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    Meu Hash Rate (H/s)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={myHashRateInput}
                                    onChange={e => { setMyHashRateInput(e.target.value); setSelectedMiners({}); }}
                                    placeholder="Ex: 150"
                                    className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all"
                                />
                                {hashFromMiners > 0 && (
                                    <p className="text-[10px] text-primary font-bold flex items-center gap-1">
                                        <Zap className="w-3 h-3" />
                                        {formatHashrate(hashFromMiners)} — calculado das máquinas abaixo
                                    </p>
                                )}
                            </div>

                            {/* Hash Rate da Rede */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                        Hash Rate da Rede (H/s)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleResetNetwork}
                                        className="flex items-center gap-1 text-[9px] font-bold text-primary hover:text-primary-hover uppercase tracking-widest transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" /> Ao vivo
                                    </button>
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    value={networkHashRateInput}
                                    onChange={e => { setNetworkHashRateInput(e.target.value); setNetworkManual(true); }}
                                    placeholder={stats?.networkHashRate ? String(Math.round(stats.networkHashRate)) : 'Ex: 5000'}
                                    className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all"
                                />
                                {stats?.networkHashRate && !networkManual ? (
                                    <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                                        Sincronizado: {formatHashrate(stats.networkHashRate)}
                                    </p>
                                ) : networkManual ? (
                                    <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                        Valor manual — clique em "Ao vivo" para sincronizar
                                    </p>
                                ) : null}
                            </div>

                            {/* Preço do POL */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    Preço do POL (USD)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={tokenPriceInput}
                                    onChange={e => setTokenPriceInput(e.target.value)}
                                    placeholder="0.35"
                                    className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all"
                                />
                            </div>

                            {/* Sua % da rede */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    Sua % da Rede
                                </label>
                                <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-sm">
                                    {share > 0
                                        ? <span className="text-primary font-black">{(share * 100).toFixed(6)}%</span>
                                        : <span className="text-gray-600">Preencha os campos acima</span>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Simulador de máquinas */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">Simular com Máquinas da Loja</h2>
                            {Object.keys(selectedMiners).length > 0 && (
                                <button
                                    onClick={clearMiners}
                                    className="text-[10px] font-bold text-gray-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                                >
                                    Limpar seleção
                                </button>
                            )}
                        </div>

                        {loadingMiners ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : miners.length === 0 ? (
                            <p className="text-gray-600 text-sm text-center py-8">Nenhuma máquina disponível na loja.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {miners.map(m => {
                                    const qty = selectedMiners[m.id] || 0;
                                    return (
                                        <div
                                            key={m.id}
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                                                qty > 0 ? 'border-primary/40 bg-primary/5' : 'border-gray-800/50 bg-gray-900/20'
                                            }`}
                                        >
                                            <img
                                                src={m.imageUrl || '/machines/reward1.png'}
                                                alt={m.name}
                                                className="w-12 h-12 object-contain rounded-xl bg-gray-900 p-1 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-black text-white truncate">{m.name}</p>
                                                <p className="text-[10px] text-primary font-bold">{formatHashrate(m.baseHashRate)}</p>
                                                {qty > 0 && (
                                                    <p className="text-[9px] text-gray-500 font-bold">
                                                        Total: {formatHashrate(m.baseHashRate * qty)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMinerQty(m.id, -1)}
                                                    disabled={qty === 0}
                                                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 text-white font-black text-sm flex items-center justify-center disabled:opacity-30 transition-all"
                                                >−</button>
                                                <span className="w-5 text-center text-sm font-black text-white">{qty}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMinerQty(m.id, 1)}
                                                    className="w-7 h-7 rounded-lg bg-primary hover:bg-primary-hover text-white font-black text-sm flex items-center justify-center transition-all"
                                                >+</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Coluna direita — Resultados */}
                <div className="space-y-6">
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6 sticky top-6">
                        <h2 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-primary" />
                            Estimativa de Ganhos
                        </h2>

                        {share > 0 ? (
                            <div className="space-y-3">
                                {resultRows.map(({ label, pol, sub }) => (
                                    <div key={label} className="bg-gray-900/50 rounded-2xl p-4 border border-gray-800/50 space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
                                            <span className="text-[9px] text-gray-600 font-mono">{sub}</span>
                                        </div>
                                        <p className="text-base font-black text-white italic">
                                            {pol.toFixed(6)}{' '}
                                            <span className="text-xs text-primary not-italic font-bold">POL</span>
                                        </p>
                                        {price > 0 && (
                                            <p className="text-[11px] font-bold text-gray-400">≈ ${toUSD(pol)} USD</p>
                                        )}
                                    </div>
                                ))}

                                {/* Notas */}
                                <div className="flex gap-2 pt-2 border-t border-gray-800 text-[9px] text-gray-600">
                                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                                    <div className="space-y-0.5">
                                        <p>{BLOCK_REWARD_POL} POL por bloco · a cada {BLOCK_INTERVAL_MIN} min</p>
                                        <p>{BLOCKS_PER_DAY} blocos/dia · ganhos proporcionais ao hash</p>
                                        <p>Estimativa não considera variações de rede</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-600 py-10 space-y-3">
                                <Calculator className="w-14 h-14 opacity-10 mx-auto" />
                                <p className="text-xs font-bold uppercase tracking-widest">
                                    Preencha seu hash rate e o da rede para calcular
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
