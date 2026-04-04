import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Zap, TrendingUp, RefreshCw, Info, Cpu, Wifi } from 'lucide-react';
import { api } from '../store/auth';
import { useGameStore } from '../store/game';
import { formatHashrate } from '../utils/machine';
import {
    BLOCK_REWARD_POL,
    BLOCK_INTERVAL_MIN,
    BLOCKS_PER_DAY,
    calcRewards,
    calcSelectedHashRate,
} from '../utils/calculatorEngine';

export default function CalculatorPage() {
    const { t } = useTranslation();
    const { stats, initSocket } = useGameStore();

    const [miners, setMiners] = useState([]);
    const [loadingMiners, setLoadingMiners] = useState(true);

    const [myHashRateInput, setMyHashRateInput] = useState('');
    const [networkHashRateInput, setNetworkHashRateInput] = useState('');
    const [tokenPriceInput, setTokenPriceInput] = useState('0.35');
    const [networkManual, setNetworkManual] = useState(false);
    const [myHashManual, setMyHashManual] = useState(false);
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

    // Sync hash rate do usuário ao vivo (enquanto não está em modo manual)
    useEffect(() => {
        if (!myHashManual && stats?.miner?.estimatedHashRate) {
            setMyHashRateInput(String(Math.round(stats.miner.estimatedHashRate)));
            setSelectedMiners({});
        }
    }, [stats?.miner?.estimatedHashRate, myHashManual]);

    // Sync preço do token ao vivo
    useEffect(() => {
        if (stats?.tokenPrice) setTokenPriceInput(String(stats.tokenPrice));
    }, [stats?.tokenPrice]);

    // Quando adiciona/remove máquinas, atualiza o campo de hash rate
    useEffect(() => {
        const h = calcSelectedHashRate(miners, selectedMiners);
        if (h > 0) {
            setMyHashRateInput(String(h));
            setMyHashManual(true);
        }
    }, [selectedMiners, miners]);

    const myHash = parseFloat(myHashRateInput) || 0;
    const netHash = parseFloat(networkHashRateInput) || 0;
    const price = parseFloat(tokenPriceInput) || 0;

    const hashFromMiners = calcSelectedHashRate(miners, selectedMiners);
    const { share, perBlock, perHour, perDay, perWeek, perMonth, toUSD } =
        calcRewards(myHash, netHash, price);
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

    const handleResetMyHash = () => {
        setMyHashManual(false);
        setSelectedMiners({});
        if (stats?.miner?.estimatedHashRate) {
            setMyHashRateInput(String(Math.round(stats.miner.estimatedHashRate)));
        }
    };

    const clearMiners = () => {
        setSelectedMiners({});
        setMyHashRateInput('');
    };

    const resultRows = [
        { key: 'per_block', pol: perBlock, sub: t('calculator.every_n_min', { n: BLOCK_INTERVAL_MIN }) },
        { key: 'per_hour',  pol: perHour,  sub: '1h' },
        { key: 'per_day',   pol: perDay,   sub: '24h' },
        { key: 'per_week',  pol: perWeek,  sub: '7d' },
        { key: 'per_month', pol: perMonth, sub: '30d' },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="space-y-2">
                <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
                    <Calculator className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">{t('calculator.title')}</h1>
                <p className="text-gray-500 font-medium">{t('calculator.subtitle')}</p>
            </div>

            {/* Banner dados automáticos */}
            {stats?.miner?.estimatedHashRate > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-primary/5 border border-primary/20 rounded-2xl px-6 py-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl">
                            <Wifi className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <p className="text-xs font-black text-white">{t('calculator.auto_banner_title')}</p>
                            <p className="text-[10px] text-gray-400 font-medium">
                                {t('calculator.auto_banner_desc', {
                                    hashRate: formatHashrate(stats.miner.estimatedHashRate),
                                    networkRate: stats?.networkHashRate ? formatHashrate(stats.networkHashRate) : '—',
                                })}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setMyHashManual(false); setNetworkManual(false); setSelectedMiners({}); }}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-primary/20 whitespace-nowrap"
                    >
                        {t('calculator.auto_fill_btn')}
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Coluna esquerda — Parâmetros + Simulação de máquinas */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Parâmetros */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                        <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">{t('calculator.section_params')}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Meu Hash Rate */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                        {t('calculator.my_hashrate_label')}
                                    </label>
                                    {stats?.miner?.estimatedHashRate > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleResetMyHash}
                                            className="flex items-center gap-1 text-[9px] font-bold text-primary hover:text-primary-hover uppercase tracking-widest transition-colors"
                                        >
                                            <Cpu className="w-3 h-3" /> {t('calculator.my_inventory_btn')}
                                        </button>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min="0"
                                    value={myHashRateInput}
                                    onChange={e => { setMyHashRateInput(e.target.value); setMyHashManual(true); setSelectedMiners({}); }}
                                    placeholder="Ex: 150"
                                    className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all"
                                />
                                {!myHashManual && stats?.miner?.estimatedHashRate > 0 ? (
                                    <p className="text-[10px] text-green-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                                        {t('calculator.synced_inventory', { value: formatHashrate(stats.miner.estimatedHashRate) })}
                                    </p>
                                ) : hashFromMiners > 0 ? (
                                    <p className="text-[10px] text-primary font-bold flex items-center gap-1">
                                        <Zap className="w-3 h-3" />
                                        {t('calculator.simulated_machines', { value: formatHashrate(hashFromMiners) })}
                                    </p>
                                ) : myHashManual && stats?.miner?.estimatedHashRate > 0 ? (
                                    <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                        {t('calculator.manual_my_hash')}
                                    </p>
                                ) : null}
                            </div>

                            {/* Hash Rate da Rede */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                        {t('calculator.network_hashrate_label')}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleResetNetwork}
                                        className="flex items-center gap-1 text-[9px] font-bold text-primary hover:text-primary-hover uppercase tracking-widest transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3" /> {t('calculator.live_btn')}
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
                                        {t('calculator.synced_network', { value: formatHashrate(stats.networkHashRate) })}
                                    </p>
                                ) : networkManual ? (
                                    <p className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                        {t('calculator.manual_network')}
                                    </p>
                                ) : null}
                            </div>

                            {/* Preço do POL */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                    {t('calculator.token_price_label')}
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
                                    {t('calculator.share_label')}
                                </label>
                                <div className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-4 px-6 text-sm">
                                    {share > 0
                                        ? <span className="text-primary font-black">{(share * 100).toFixed(6)}%</span>
                                        : <span className="text-gray-600">{t('calculator.share_placeholder')}</span>
                                    }
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Simulador de máquinas */}
                    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-black text-white uppercase tracking-[0.2em]">{t('calculator.section_simulate')}</h2>
                            {Object.keys(selectedMiners).length > 0 && (
                                <button
                                    onClick={clearMiners}
                                    className="text-[10px] font-bold text-gray-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                                >
                                    {t('calculator.clear_selection')}
                                </button>
                            )}
                        </div>

                        {loadingMiners ? (
                            <div className="flex justify-center py-8">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : miners.length === 0 ? (
                            <p className="text-gray-600 text-sm text-center py-8">{t('calculator.no_miners')}</p>
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
                                                        {t('calculator.miner_total', { value: formatHashrate(m.baseHashRate * qty) })}
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
                            {t('calculator.section_results')}
                        </h2>

                        {share > 0 ? (
                            <div className="space-y-3">
                                {resultRows.map(({ key, pol, sub }) => (
                                    <div key={key} className="bg-gray-900/50 rounded-2xl p-4 border border-gray-800/50 space-y-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t(`calculator.${key}`)}</span>
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
                                        <p>{t('calculator.notes_reward', { reward: BLOCK_REWARD_POL, interval: BLOCK_INTERVAL_MIN })}</p>
                                        <p>{t('calculator.notes_blocks', { blocks: BLOCKS_PER_DAY })}</p>
                                        <p>{t('calculator.notes_estimate')}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-600 py-10 space-y-3">
                                <Calculator className="w-14 h-14 opacity-10 mx-auto" />
                                <p className="text-xs font-bold uppercase tracking-widest">
                                    {t('calculator.results_placeholder')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
