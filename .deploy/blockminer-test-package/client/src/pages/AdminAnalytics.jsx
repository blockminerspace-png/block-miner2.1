import { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp, Users, Zap, ArrowDownLeft, BarChart2,
    RefreshCw, Search, Calendar, Award, Loader2, Clock
} from 'lucide-react';
import { api } from '../store/auth';
import { toast } from 'sonner';

// helpers
function fmtPol(v, dec = 4) { return `${Number(v || 0).toFixed(dec)} POL`; }
function fmtUsd(v, price) { return price > 0 ? `~$${(Number(v || 0) * price).toFixed(2)}` : null; }
function fmtUsdLong(v, price) { return price > 0 ? `~$${(Number(v || 0) * price).toFixed(4)}` : null; }

function StatCard({ label, polValue, usdValue, sub, icon: Icon, color = 'amber' }) {
    const icnMap = { amber: 'text-amber-500', emerald: 'text-emerald-400', blue: 'text-blue-400', violet: 'text-violet-400', rose: 'text-rose-400' };
    const bgMap = { amber: 'bg-amber-500/10', emerald: 'bg-emerald-500/10', blue: 'bg-blue-500/10', violet: 'bg-violet-500/10', rose: 'bg-rose-500/10' };
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${bgMap[color]}`}>
                    <Icon className={`w-4 h-4 ${icnMap[color]}`} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            </div>
            <div>
                <p className={`text-base font-black ${icnMap[color]}`}>{polValue}</p>
                {usdValue && <p className="text-slate-500 text-xs font-bold mt-0.5">{usdValue}</p>}
                {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
            </div>
        </div>
    );
}

function MiniBarChart({ data, polPrice }) {
    if (!data || data.length === 0) return <div className="h-44 flex items-center justify-center text-slate-600 text-xs">Sem dados no periodo</div>;
    const max = Math.max(...data.map(d => d.value), 0.000001);
    return (
        <div className="flex items-end gap-0.5 h-44 w-full">
            {data.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0 group relative">
                    <div
                        className="w-full bg-amber-500/70 hover:bg-amber-400 rounded-t transition-all cursor-default"
                        style={{ height: `${Math.max(3, (d.value / max) * 160)}px` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                        <div className="bg-slate-800 text-white text-[9px] font-black px-2 py-1.5 rounded-lg whitespace-nowrap border border-slate-700 shadow-xl space-y-0.5">
                            <div className="text-amber-400">{d.value.toFixed(6)} POL</div>
                            {polPrice > 0 && <div className="text-slate-400">${(d.value * polPrice).toFixed(4)}</div>}
                            <div className="text-slate-500">{d.label}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ForecastCard({ label, pol, usdVal, highlight }) {
    return (
        <div className={`flex flex-col gap-1 p-4 rounded-2xl border transition-colors ${highlight ? 'bg-amber-500/10 border-amber-500/25' : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest ${highlight ? 'text-amber-400' : 'text-slate-500'}`}>{label}</p>
            <p className={`text-sm font-black ${highlight ? 'text-amber-300' : 'text-white'}`}>{pol}</p>
            {usdVal && <p className="text-[10px] text-slate-500 font-bold">{usdVal}</p>}
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
        } catch {
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

    const { summary, forecast, topEarners, chartData, userRecentBlocks, polPrice = 0 } = data || {};
    const periodLabel = { week: '7 dias', month: '30 dias', year: '12 meses' }[period];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Analytics de Rendimentos</h2>
                    <p className="text-slate-500 text-sm font-medium">
                        Distribuicao de recompensas, saques e previsoes.
                        {polPrice > 0 && (
                            <span className="ml-2 text-amber-400 font-black">
                                1 POL = ${polPrice.toFixed(4)} USD
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {['week', 'month', 'year'].map(p => (
                        <button key={p} onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${period === p ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                            {p === 'week' ? '7D' : p === 'month' ? '30D' : '12M'}
                        </button>
                    ))}
                    <button onClick={fetchAnalytics} disabled={isLoading}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-all">
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Filtro de usuario */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Search className="w-3 h-3" /> Filtrar por Usuario (opcional)
                </p>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <input type="text" value={userSearch}
                            onChange={e => { setUserSearch(e.target.value); setUserQuery(e.target.value); }}
                            placeholder="Buscar por nome, e-mail, ID ou carteira..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2.5 px-4 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
                        />
                        {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 animate-spin" />}
                        {userResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 overflow-hidden">
                                {userResults.map(u => (
                                    <button key={u.id}
                                        onClick={() => { setSelectedUser(u); setUserSearch(u.username || u.email); setUserResults([]); }}
                                        className="w-full text-left px-4 py-3 hover:bg-slate-700 transition-colors flex items-center justify-between gap-3">
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
                        <button onClick={() => { setSelectedUser(null); setUserSearch(''); setUserQuery(''); }}
                            className="px-4 py-2.5 bg-slate-800 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-xs font-black uppercase transition-all">
                            Limpar
                        </button>
                    )}
                </div>
                {selectedUser && (
                    <p className="text-[10px] text-amber-500 font-black mt-2 uppercase tracking-widest">
                        Exibindo: {selectedUser.username || selectedUser.email} (#{selectedUser.id})
                        {summary?.userHashRate != null && ` - ${Number(summary.userHashRate).toFixed(2)} H/s`}
                        {forecast?.sharePercent != null && ` - ${Number(forecast.sharePercent).toFixed(3)}% da rede`}
                    </p>
                )}
            </div>

            {/* Cards de resumo */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 h-28 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Total distribuido" icon={TrendingUp} color="amber"
                        polValue={fmtPol(summary?.totalDistributed)}
                        usdValue={fmtUsd(summary?.totalDistributed, polPrice)}
                        sub="Historico completo"
                    />
                    <StatCard label={`Distribuido (${periodLabel})`} icon={BarChart2} color="emerald"
                        polValue={fmtPol(summary?.periodDistributed)}
                        usdValue={fmtUsd(summary?.periodDistributed, polPrice)}
                        sub={`Ultimos ${periodLabel}`}
                    />
                    <StatCard label="Total saques" icon={ArrowDownLeft} color="violet"
                        polValue={fmtPol(summary?.totalWithdrawals)}
                        usdValue={fmtUsd(summary?.totalWithdrawals, polPrice)}
                        sub="Saques completados"
                    />
                    {!selectedUser ? (
                        <StatCard label={`Usuarios ativos (${periodLabel})`} icon={Users} color="blue"
                            polValue={`${summary?.activeUsers ?? '--'} usuarios`}
                            sub={`${summary?.blockCount ?? '--'} blocos - ${summary?.totalBlocksEver ?? '--'} total`}
                        />
                    ) : (
                        <StatCard label={`Saques (${periodLabel})`} icon={ArrowDownLeft} color="blue"
                            polValue={fmtPol(summary?.periodWithdrawals)}
                            usdValue={fmtUsd(summary?.periodWithdrawals, polPrice)}
                            sub="No periodo"
                        />
                    )}
                </div>
            )}

            {/* Previsao */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-5">
                    <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-xs font-black text-white uppercase tracking-widest">
                            Previsao de Rendimento
                            {selectedUser ? ` -- ${selectedUser.username || selectedUser.email}` : ' -- Rede Total'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                            {selectedUser
                                ? `${Number(forecast?.userHashRate || 0).toFixed(2)} H/s - ${Number(forecast?.sharePercent || 0).toFixed(3)}% da rede`
                                : `${Number(summary?.networkHashRate || 0).toFixed(2)} H/s total`
                            } - 0.30 POL/bloco - bloco a cada 10 min
                        </p>
                    </div>
                </div>
                {isLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-20 bg-slate-800 rounded-2xl animate-pulse" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <ForecastCard label="Por dia"
                            pol={`${Number(forecast?.day?.pol || 0).toFixed(6)} POL`}
                            usdVal={fmtUsdLong(forecast?.day?.pol, polPrice)} />
                        <ForecastCard label="Por semana"
                            pol={`${Number(forecast?.week?.pol || 0).toFixed(6)} POL`}
                            usdVal={fmtUsdLong(forecast?.week?.pol, polPrice)} />
                        <ForecastCard label="Por mes"
                            pol={`${Number(forecast?.month?.pol || 0).toFixed(4)} POL`}
                            usdVal={fmtUsdLong(forecast?.month?.pol, polPrice)}
                            highlight />
                        <ForecastCard label="Por ano"
                            pol={`${Number(forecast?.year?.pol || 0).toFixed(2)} POL`}
                            usdVal={fmtUsd(forecast?.year?.pol, polPrice)} />
                    </div>
                )}
            </div>

            {/* Grafico */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <p className="text-xs font-black text-white uppercase tracking-widest">Distribuicao de Recompensas</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                            POL distribuido por {period === 'year' ? 'mes' : 'dia'} -- ultimos {periodLabel}
                        </p>
                    </div>
                    <Calendar className="w-4 h-4 text-slate-600" />
                </div>
                {isLoading ? (
                    <div className="h-44 bg-slate-800/50 rounded-xl animate-pulse" />
                ) : (
                    <>
                        <MiniBarChart data={chartData} polPrice={polPrice} />
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
                            <Award className="w-4 h-4 text-amber-500" /> Top 10 Ganhadores (historico)
                        </p>
                        {isLoading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="h-12 bg-slate-800 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : !topEarners || topEarners.length === 0 ? (
                            <p className="text-slate-600 text-xs text-center py-8">Sem dados de mineracao</p>
                        ) : (
                            <div className="space-y-1.5">
                                {topEarners.map((e, i) => (
                                    <div key={e.userId}
                                        className="flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-800 rounded-xl transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-black w-5 text-center ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-600' : 'text-slate-600'}`}>
                                                #{i + 1}
                                            </span>
                                            <div>
                                                <p className="text-white text-xs font-bold">{e.username}</p>
                                                <p className="text-slate-500 text-[9px]">ID #{e.userId}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-amber-400 font-black text-xs">{Number(e.total).toFixed(4)} POL</p>
                                            {polPrice > 0 && (
                                                <p className="text-slate-500 text-[9px]">${(Number(e.total) * polPrice).toFixed(2)}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Painel direito: blocos do usuario OU resumo do periodo */}
                <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-6 ${!selectedUser ? '' : 'md:col-span-2'}`}>
                    <p className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        {selectedUser ? `Ultimos 50 blocos -- ${selectedUser.username || selectedUser.email}` : 'Resumo do Periodo'}
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
                                    <thead>
                                        <tr className="text-slate-600 font-black uppercase tracking-tighter">
                                            <th className="pb-3 px-2">Bloco</th>
                                            <th className="pb-3 px-2">Recompensa POL</th>
                                            <th className="pb-3 px-2">Valor USD</th>
                                            <th className="pb-3 px-2">%</th>
                                            <th className="pb-3 px-2 text-right">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {userRecentBlocks.map(r => (
                                            <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="py-2 px-2 font-mono text-slate-400">#{r.block?.blockNumber ?? r.blockId}</td>
                                                <td className="py-2 px-2 font-black text-amber-400">{Number(r.rewardAmount).toFixed(8)}</td>
                                                <td className="py-2 px-2 text-slate-400">{polPrice > 0 ? `$${(Number(r.rewardAmount) * polPrice).toFixed(6)}` : '--'}</td>
                                                <td className="py-2 px-2 text-slate-400">{Number(r.percentage).toFixed(2)}%</td>
                                                <td className="py-2 px-2 text-right text-slate-600">{new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-slate-600 text-xs text-center py-8">Nenhum bloco encontrado para este usuario</p>
                        )
                    ) : (
                        <div className="space-y-2">
                            {[
                                { label: 'Distribuido no periodo', pol: summary?.periodDistributed, clr: 'text-amber-400' },
                                { label: 'Saques no periodo', pol: summary?.periodWithdrawals, clr: 'text-violet-400' },
                                { label: 'Usuarios mineradores', val: `${summary?.activeUsers ?? '--'} usuarios`, clr: 'text-blue-400' },
                                { label: 'Blocos distribuidos', val: `${summary?.blockCount ?? '--'} blocos`, clr: 'text-emerald-400' },
                                { label: 'Media por bloco', pol: summary?.blockCount ? Number(summary.periodDistributed) / summary.blockCount : null, clr: 'text-amber-400' },
                                { label: 'Total de blocos (historico)', val: `${summary?.totalBlocksEver ?? '--'} blocos`, clr: 'text-slate-400' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-xl transition-colors">
                                    <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
                                    <div className="text-right">
                                        {item.val && <span className={`text-xs font-black ${item.clr}`}>{item.val}</span>}
                                        {item.pol != null && (
                                            <>
                                                <p className={`text-xs font-black ${item.clr}`}>{Number(item.pol).toFixed(6)} POL</p>
                                                {polPrice > 0 && <p className="text-[9px] text-slate-500">${(Number(item.pol) * polPrice).toFixed(4)}</p>}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}