import { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp, Users, Zap, ArrowDownLeft, BarChart2,
    RefreshCw, Search, Calendar, Award, Loader2
} from 'lucide-react';
import { api } from '../store/auth';
import { toast } from 'sonner';

function StatCard({ label, value, sub, icon: Icon, color = 'amber' }) {
    const colors = {
        amber: 'text-amber-500 bg-amber-500/10',
        emerald: 'text-emerald-400 bg-emerald-500/10',
        blue: 'text-blue-400 bg-blue-500/10',
        violet: 'text-violet-400 bg-violet-500/10',
    };
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colors[color]}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                <p className="text-xl font-black text-white mt-0.5 truncate">{value}</p>
                {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function MiniBarChart({ data }) {
    if (!data || data.length === 0) return <div className="h-40 flex items-center justify-center text-slate-600 text-xs">Sem dados</div>;
    const max = Math.max(...data.map(d => d.value), 0.000001);
    return (
        <div className="flex items-end gap-0.5 h-40 w-full">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                        className="w-full bg-amber-500/80 hover:bg-amber-400 rounded-t transition-all"
                        style={{ height: `${Math.max(2, (d.value / max) * 140)}px` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                        <div className="bg-slate-800 text-white text-[9px] font-black px-2 py-1 rounded-lg whitespace-nowrap border border-slate-700 shadow-xl">
                            {d.value.toFixed(6)} POL
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function AdminAnalytics() {
    const [period, setPeriod] = useState('month');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [userSearch, setUserSearch] = useState('');
    const [userQuery, setUserQuery] = useState('');
    const [userResults, setUserResults] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isSearching, setIsSearching] = useState(false);

    const fetchAnalytics = useCallback(async () => {
        try {
            setIsLoading(true);
            const params = new URLSearchParams({ period });
            if (selectedUser) params.set('userId', selectedUser.id);
            const res = await api.get(`/admin/analytics?${params}`);
            if (res.data.ok) setData(res.data);
        } catch (err) {
            toast.error('Erro ao carregar analytics.');
        } finally {
            setIsLoading(false);
        }
    }, [period, selectedUser]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    const searchUsers = async (q) => {
        if (!q.trim()) { setUserResults([]); return; }
        setIsSearching(true);
        try {
            const res = await api.get(`/admin/users?pageSize=8&q=${encodeURIComponent(q)}`);
            if (res.data.ok) setUserResults(res.data.users || []);
        } catch { } finally { setIsSearching(false); }
    };

    useEffect(() => {
        const t = setTimeout(() => searchUsers(userQuery), 300);
        return () => clearTimeout(t);
    }, [userQuery]);

    const { summary, topEarners, chartData, userRecentBlocks } = data || {};

    const periodLabel = { week: '7 dias', month: '30 dias', year: '12 meses' }[period];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Analytics de Rendimentos</h2>
                    <p className="text-slate-500 text-sm font-medium">Distribuição de recompensas, saques e performance.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {['week', 'month', 'year'].map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${period === p ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                        >
                            {p === 'week' ? '7D' : p === 'month' ? '30D' : '12M'}
                        </button>
                    ))}
                    <button
                        onClick={fetchAnalytics}
                        disabled={isLoading}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* User filter */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Search className="w-3 h-3" /> Filtrar por Usuário
                </p>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={userSearch}
                            onChange={e => { setUserSearch(e.target.value); setUserQuery(e.target.value); }}
                            placeholder="Buscar usuário por nome, e-mail ou ID..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                        />
                        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
                        {userResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                                {userResults.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => { setSelectedUser(u); setUserSearch(u.username || u.email); setUserResults([]); }}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors flex items-center justify-between gap-3"
                                    >
                                        <div>
                                            <p className="text-white text-xs font-bold">{u.username || u.name}</p>
                                            <p className="text-slate-500 text-[10px]">{u.email}</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-600">#{u.id}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedUser && (
                        <button
                            onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-black uppercase transition-all"
                        >
                            Limpar
                        </button>
                    )}
                </div>
                {selectedUser && (
                    <p className="text-[10px] text-amber-500 font-black mt-2 uppercase tracking-widest">
                        Exibindo dados de: {selectedUser.username || selectedUser.email} (#{selectedUser.id})
                    </p>
                )}
            </div>

            {/* Summary cards */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-24 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        label="Total distribuído"
                        value={`${Number(summary?.totalDistributed || 0).toFixed(4)} POL`}
                        sub="Histórico completo"
                        icon={TrendingUp}
                        color="amber"
                    />
                    <StatCard
                        label={`Distribuído (${periodLabel})`}
                        value={`${Number(summary?.periodDistributed || 0).toFixed(4)} POL`}
                        sub={`Últimos ${periodLabel}`}
                        icon={BarChart2}
                        color="emerald"
                    />
                    <StatCard
                        label="Total saques"
                        value={`${Number(summary?.totalWithdrawals || 0).toFixed(4)} POL`}
                        sub="Saques completados"
                        icon={ArrowDownLeft}
                        color="violet"
                    />
                    {!selectedUser ? (
                        <StatCard
                            label={`Usuários ativos (${periodLabel})`}
                            value={summary?.activeUsers ?? '--'}
                            sub={`${summary?.blockCount ?? '--'} blocos`}
                            icon={Users}
                            color="blue"
                        />
                    ) : (
                        <StatCard
                            label={`Saques (${periodLabel})`}
                            value={`${Number(summary?.periodWithdrawals || 0).toFixed(4)} POL`}
                            sub="No período"
                            icon={ArrowDownLeft}
                            color="blue"
                        />
                    )}
                </div>
            )}

            {/* Chart */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-xs font-black text-white uppercase tracking-widest">Distribuição de Recompensas</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">POL distribuído por {period === 'year' ? 'mês' : 'dia'} — últimos {periodLabel}</p>
                    </div>
                    <Calendar className="w-4 h-4 text-slate-600" />
                </div>
                {isLoading ? (
                    <div className="h-40 bg-slate-800/50 rounded-xl animate-pulse" />
                ) : (
                    <>
                        <MiniBarChart data={chartData} />
                        {chartData && chartData.length > 0 && (
                            <div className="flex justify-between mt-2">
                                <span className="text-[9px] text-slate-600 font-mono">{chartData[0]?.label}</span>
                                <span className="text-[9px] text-slate-600 font-mono">{chartData[chartData.length - 1]?.label}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Earners */}
                {!selectedUser && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                        <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Award className="w-4 h-4 text-amber-500" /> Top 10 Ganhadores
                        </p>
                        {isLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="h-10 bg-slate-800 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : !topEarners || topEarners.length === 0 ? (
                            <p className="text-slate-600 text-xs text-center py-8">Sem dados de mineração</p>
                        ) : (
                            <div className="space-y-2">
                                {topEarners.map((e, i) => (
                                    <div key={e.userId} className="flex items-center justify-between p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-black w-5 text-center ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>
                                                #{i + 1}
                                            </span>
                                            <div>
                                                <p className="text-white text-xs font-bold">{e.username}</p>
                                                <p className="text-slate-500 text-[9px]">ID #{e.userId}</p>
                                            </div>
                                        </div>
                                        <span className="text-amber-400 font-black text-xs">{e.total.toFixed(6)} POL</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* User recent blocks OR general stats placeholder */}
                <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 ${!selectedUser ? '' : 'md:col-span-2'}`}>
                    <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        {selectedUser ? `Últimos 50 blocos — ${selectedUser.username || selectedUser.email}` : 'Resumo do Período'}
                    </p>
                    {isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="h-8 bg-slate-800 rounded-xl animate-pulse" />
                            ))}
                        </div>
                    ) : selectedUser ? (
                        userRecentBlocks && userRecentBlocks.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-[10px]">
                                    <thead className="text-slate-600 font-black uppercase tracking-tighter">
                                        <tr>
                                            <th className="pb-3 px-2">Bloco</th>
                                            <th className="pb-3 px-2">Recompensa</th>
                                            <th className="pb-3 px-2">%</th>
                                            <th className="pb-3 px-2 text-right">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {userRecentBlocks.map(r => (
                                            <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="py-2 px-2 font-mono text-slate-400">#{r.block?.blockNumber ?? r.blockId}</td>
                                                <td className="py-2 px-2 font-black text-amber-400">{Number(r.rewardAmount).toFixed(8)}</td>
                                                <td className="py-2 px-2 text-slate-400">{Number(r.percentage * 100).toFixed(2)}%</td>
                                                <td className="py-2 px-2 text-right text-slate-600">{new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-slate-600 text-xs text-center py-8">Nenhum bloco encontrado para este usuário</p>
                        )
                    ) : (
                        <div className="space-y-3">
                            {[
                                { label: 'Total distribuído no período', value: `${Number(summary?.periodDistributed || 0).toFixed(6)} POL`, color: 'text-amber-400' },
                                { label: 'Saques realizados no período', value: `${Number(summary?.periodWithdrawals || 0).toFixed(6)} POL`, color: 'text-violet-400' },
                                { label: 'Usuários que mineraram', value: `${summary?.activeUsers ?? '--'} usuários`, color: 'text-blue-400' },
                                { label: 'Blocos distribuídos', value: `${summary?.blockCount ?? '--'} blocos`, color: 'text-emerald-400' },
                                { label: 'Média por bloco', value: summary?.blockCount ? `${(Number(summary.periodDistributed) / summary.blockCount).toFixed(6)} POL` : '--', color: 'text-amber-400' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl">
                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
                                    <span className={`text-xs font-black ${item.color}`}>{item.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
