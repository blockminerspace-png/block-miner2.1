import { useState, useEffect } from 'react';
import {
    Ticket, Search, RefreshCw, ExternalLink, CheckCircle2,
    XCircle, AlertCircle, ChevronRight, Loader2, ShieldCheck,
    Clock, Eye, Wallet, ArrowDownCircle, Hash
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

const STATUS_CFG = {
    open:      { color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',      label: 'Aberto' },
    analyzing: { color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',   label: 'Em Análise' },
    credited:  { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Creditado' },
    rejected:  { color: 'text-red-400 bg-red-400/10 border-red-400/20',         label: 'Rejeitado' },
    approved:  { color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', label: 'Aprovado' },
};

export default function AdminDepositTickets() {
    const [tickets, setTickets] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [approveAmount, setApproveAmount] = useState('');
    const [actionNote, setActionNote] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => { fetchTickets(); }, [statusFilter, page]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/admin/deposit-tickets?status=${statusFilter}&page=${page}`);
            if (res.data.ok) {
                setTickets(res.data.tickets);
                setTotal(res.data.total);
            }
        } catch { toast.error('Erro ao carregar tickets.'); }
        setLoading(false);
    };

    const openTicket = async (ticket) => {
        setSelected(null);
        setLoadingDetail(true);
        setApproveAmount(ticket.amountClaimed ? String(Number(ticket.amountClaimed)) : '');
        setActionNote('');
        try {
            const res = await api.get(`/admin/deposit-tickets/${ticket.id}`);
            if (res.data.ok) setSelected(res.data.ticket);
        } catch { toast.error('Erro ao carregar ticket.'); }
        setLoadingDetail(false);
    };

    const handleApprove = async () => {
        if (!approveAmount || isNaN(Number(approveAmount)) || Number(approveAmount) <= 0) {
            toast.error('Informe um valor válido para creditar.');
            return;
        }
        if (!selected) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/admin/deposit-tickets/${selected.id}/approve`, {
                amount: approveAmount,
                note: actionNote
            });
            if (res.data.ok) {
                toast.success('Depósito creditado com sucesso!');
                setSelected(null);
                fetchTickets();
            } else {
                toast.error(res.data.message);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao aprovar.');
        }
        setSubmitting(false);
    };

    const handleReject = async () => {
        if (!selected) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/admin/deposit-tickets/${selected.id}/reject`, { note: actionNote });
            if (res.data.ok) {
                toast.success('Ticket rejeitado.');
                setSelected(null);
                fetchTickets();
            } else {
                toast.error(res.data.message);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao rejeitar.');
        }
        setSubmitting(false);
    };

    const onchain = selected?.onchainData;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <Ticket className="w-6 h-6 text-amber-500" />
                        Tickets de Depósito
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">{total} tickets no total</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {['all', 'open', 'analyzing', 'credited', 'rejected'].map(s => (
                        <button key={s}
                            onClick={() => { setStatusFilter(s); setPage(1); }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-slate-500 border-slate-800 hover:border-slate-600'}`}
                        >
                            {s === 'all' ? 'Todos' : STATUS_CFG[s]?.label || s}
                        </button>
                    ))}
                    <button onClick={fetchTickets} className="p-2 border border-slate-800 hover:border-slate-600 rounded-xl text-slate-400 transition-all">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                {/* Lista */}
                <div className="lg:col-span-2 space-y-3">
                    {loading ? (
                        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
                    ) : tickets.length === 0 ? (
                        <div className="text-center py-16 text-slate-600">
                            <Ticket className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-black uppercase">Nenhum ticket</p>
                        </div>
                    ) : tickets.map(t => {
                        const s = STATUS_CFG[t.status] || STATUS_CFG.open;
                        return (
                            <button key={t.id} onClick={() => openTicket(t)}
                                className={`w-full text-left p-4 bg-slate-900/60 border rounded-2xl transition-all hover:border-amber-500/30 space-y-2 ${selected?.id === t.id ? 'border-amber-500/50' : 'border-slate-800/50'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-white">Ticket #{t.id}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${s.color}`}>{s.label}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 font-mono truncate">{t.walletAddress}</p>
                                {t.txHash && <p className="text-[9px] text-slate-600 font-mono truncate">TX: {t.txHash}</p>}
                                <div className="flex justify-between items-center">
                                    <p className="text-[9px] text-slate-600">{t.user?.username || t.user?.email || `User #${t.userId}`}</p>
                                    <p className="text-[9px] text-slate-600">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</p>
                                </div>
                            </button>
                        );
                    })}

                    {/* Pagination */}
                    {total > 30 && (
                        <div className="flex gap-2 justify-center pt-2">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="px-3 py-2 text-[10px] font-black border border-slate-800 rounded-xl text-slate-400 disabled:opacity-30">Ant</button>
                            <span className="px-3 py-2 text-[10px] font-black text-slate-400">Pág {page}</span>
                            <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total}
                                className="px-3 py-2 text-[10px] font-black border border-slate-800 rounded-xl text-slate-400 disabled:opacity-30">Próx</button>
                        </div>
                    )}
                </div>

                {/* Detalhe */}
                <div className="lg:col-span-3">
                    {loadingDetail && (
                        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-amber-500" /></div>
                    )}
                    {!loadingDetail && !selected && (
                        <div className="text-center py-24 text-slate-700">
                            <Eye className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p className="text-xs font-black uppercase">Selecione um ticket</p>
                        </div>
                    )}
                    {!loadingDetail && selected && (
                        <div className="space-y-6">
                            {/* Info do usuário */}
                            <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-4">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Informações do Ticket</h3>
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                    <div><p className="text-slate-600 text-[9px] uppercase mb-1">Usuário</p><p className="text-white font-bold">{selected.user?.username || selected.user?.email}</p></div>
                                    <div><p className="text-slate-600 text-[9px] uppercase mb-1">Saldo Atual</p><p className="text-emerald-400 font-bold">{Number(selected.user?.polBalance || 0).toFixed(4)} POL</p></div>
                                    <div className="col-span-2"><p className="text-slate-600 text-[9px] uppercase mb-1">Carteira Informada</p><p className="text-white font-mono text-[10px] break-all">{selected.walletAddress}</p></div>
                                    {selected.txHash && <div className="col-span-2"><p className="text-slate-600 text-[9px] uppercase mb-1">TX Hash</p>
                                        <div className="flex items-center gap-2">
                                            <p className="text-white font-mono text-[10px] break-all flex-1">{selected.txHash}</p>
                                            <a href={`https://polygonscan.com/tx/${selected.txHash}`} target="_blank" rel="noopener noreferrer" className="text-amber-400 shrink-0">
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>}
                                    {selected.amountClaimed && <div><p className="text-slate-600 text-[9px] uppercase mb-1">Valor Alegado</p><p className="text-white font-bold">{Number(selected.amountClaimed).toFixed(4)} POL</p></div>}
                                    {selected.description && <div className="col-span-2"><p className="text-slate-600 text-[9px] uppercase mb-1">Descrição</p><p className="text-slate-300 text-[10px]">{selected.description}</p></div>}
                                </div>
                            </div>

                            {/* Análise on-chain */}
                            {onchain && (
                                <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-4">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <Hash className="w-4 h-4 text-blue-400" />
                                        Análise On-Chain (Polygonscan)
                                    </h3>

                                    {onchain.error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400">{onchain.error}</div>
                                    )}

                                    {onchain.txHash && (
                                        <div className="grid grid-cols-1 gap-3">
                                            <InfoRow icon={<ShieldCheck className="w-3 h-3" />} label="Transação encontrada" value={onchain.found ? 'SIM' : 'NÃO'} ok={onchain.found} />
                                            {onchain.found && <>
                                                <InfoRow label="Status" value={onchain.isSuccess === true ? 'Sucesso' : onchain.isSuccess === false ? 'Falhou' : 'Pendente'} ok={onchain.isSuccess === true} />
                                                <InfoRow label="Valor" value={onchain.valueEther ? `${onchain.valueEther} POL` : '—'} />
                                                <InfoRow label="Para nossa wallet" value={onchain.toIsOurWallet ? 'SIM ✓' : `NÃO — ${onchain.to || '?'}`} ok={onchain.toIsOurWallet} />
                                                <InfoRow label="Origem bate com carteira" value={onchain.fromMatchesTicket ? 'SIM ✓' : `NÃO — ${onchain.from || '?'}`} ok={onchain.fromMatchesTicket} />
                                                <InfoRow label="Já creditado no sistema" value={onchain.alreadyCredited ? 'SIM (duplicata!)' : 'NÃO'} ok={!onchain.alreadyCredited} warn={onchain.alreadyCredited} />
                                            </>}
                                        </div>
                                    )}

                                    {onchain.recentTxsFromWallet?.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[9px] font-black text-slate-500 uppercase">Transações recentes desta carteira para nós:</p>
                                            {onchain.recentTxsFromWallet.map(tx => (
                                                <div key={tx.hash} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl text-[9px]">
                                                    <a href={`https://polygonscan.com/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer"
                                                        className="text-blue-400 font-mono hover:underline truncate max-w-[180px]">{tx.hash.slice(0, 16)}...</a>
                                                    <span className="text-emerald-400 font-bold">{tx.value} POL</span>
                                                    <span className="text-slate-500">{new Date(tx.timestamp * 1000).toLocaleDateString('pt-BR')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Ações */}
                            {['open', 'analyzing'].includes(selected.status) && (
                                <div className="bg-slate-900/60 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ação do Admin</h3>

                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-500 uppercase">Valor a Creditar (POL) *</label>
                                        <input
                                            type="number" min="0" step="0.0001"
                                            value={approveAmount}
                                            onChange={e => setApproveAmount(e.target.value)}
                                            placeholder="Ex: 0.5000"
                                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl py-3 px-4 text-slate-200 text-xs font-mono outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[9px] font-black text-slate-500 uppercase">Nota Interna</label>
                                        <textarea
                                            value={actionNote}
                                            onChange={e => setActionNote(e.target.value)}
                                            rows={2}
                                            placeholder="Nota para o usuário / log interno..."
                                            className="w-full bg-slate-950 border border-slate-800 focus:border-slate-600 rounded-xl py-3 px-4 text-slate-200 text-xs outline-none transition-all resize-none"
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <button onClick={handleApprove} disabled={submitting}
                                            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                            Creditar Depósito
                                        </button>
                                        <button onClick={handleReject} disabled={submitting}
                                            className="flex-1 py-3 bg-red-900/50 hover:bg-red-800/50 text-red-400 border border-red-800/50 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                            {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                            Rejeitar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Resultado */}
                            {['credited', 'rejected'].includes(selected.status) && (
                                <div className={`p-4 rounded-2xl border text-xs font-bold ${selected.status === 'credited' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                                    {selected.status === 'credited'
                                        ? `✓ Depositado: ${Number(selected.creditedAmount).toFixed(4)} POL creditados.`
                                        : `✗ Ticket rejeitado.`}
                                    {selected.adminNote && <p className="mt-1 text-[10px] opacity-70">{selected.adminNote}</p>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function InfoRow({ icon, label, value, ok, warn }) {
    const color = warn ? 'text-red-400' : ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-slate-300';
    return (
        <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl">
            <span className="text-[9px] text-slate-500 font-black uppercase flex items-center gap-1">{icon}{label}</span>
            <span className={`text-[10px] font-bold ${color}`}>{value}</span>
        </div>
    );
}
