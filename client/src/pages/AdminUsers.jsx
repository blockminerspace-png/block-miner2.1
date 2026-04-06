import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    Users,
    Search,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    Eye,
    Ban,
    ShieldCheck,
    Clock,
    Wallet,
    Activity,
    Cpu,
    X,
    Calendar,
    Globe,
    MessageSquare,
    CheckCircle2,
    AlertCircle,
    Package,
    Send,
    Minus,
    Plus,
    Terminal,
    Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../store/auth';
import { formatHashrate } from '../utils/machine';

export default function AdminUsers() {
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');    
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [isDetailsLoading, setIsDetailsLoading] = useState(false);
    const [detailsTab, setDetailsTab] = useState('perfil');
    const [minersList, setMinersList] = useState([]);
    const [sendMinerId, setSendMinerId] = useState('');
    const [sendQty, setSendQty] = useState(1);
    const [isSending, setIsSending] = useState(false);
    const [userLogs, setUserLogs] = useState([]);
    const [isLogsLoading, setIsLogsLoading] = useState(false);
    const navigate = useNavigate();

    const fetchUsers = useCallback(async () => {
        try {
            setIsLoading(true);
            const query = new URLSearchParams({
                page: String(page),
                pageSize: '20',
                q: search
            });
            const res = await api.get(`/admin/users?${query.toString()}`);
            if (res.data.ok) {
                setUsers(res.data.users);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error("Erro ao buscar usuários", err);
            toast.error("Erro ao buscar usuários");
        } finally {
            setIsLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleSearch = (e) => {
        e.preventDefault();
        setPage(1);
        fetchUsers();
    };

    const loadUserDetails = async (userId) => {
        try {
            setIsDetailsLoading(true);
            setDetailsTab('perfil');
            setSendMinerId('');
            setSendQty(1);
            setUserLogs([]);
            const [detailsRes, minersRes] = await Promise.all([
                api.get(`/admin/users/${userId}/details`),
                minersList.length === 0 ? api.get('/admin/miners?withEvents=1') : Promise.resolve(null)
            ]);
            if (detailsRes.data.ok) setSelectedUser(detailsRes.data);
            if (minersRes?.data?.ok) setMinersList(minersRes.data.miners || []);
        } catch (err) {
            toast.error('Erro ao carregar detalhes do usuário.');
        } finally {
            setIsDetailsLoading(false);
        }
    };

    const fetchUserLogs = async (userId) => {
        setIsLogsLoading(true);
        try {
            const res = await api.get(`/admin/users/${userId}/logs`);
            if (res.data.ok) setUserLogs(res.data.logs || []);
        } catch {
            toast.error('Erro ao carregar logs do usuário.');
        } finally {
            setIsLogsLoading(false);
        }
    };

    const handleSendMiner = async () => {
        if (isSending || !sendMinerId || !selectedUser) return;
        if (!confirm(`Enviar ${sendQty}x máquina para ${selectedUser.user.username || selectedUser.user.email}?`)) return;
        try {
            setIsSending(true);
            const res = await api.post(`/admin/users/${selectedUser.user.id}/send-miner`, {
                minerId: sendMinerId,
                quantity: sendQty
            });
            if (res.data.ok) {
                toast.success(res.data.message);
                setSendMinerId('');
                setSendQty(1);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao enviar máquina.');
        } finally {
            setIsSending(false);
        }
    };

    const handleBanToggle = async (user) => {
        const action = user.isBanned ? 'desbanir' : 'banir';
        if (!confirm(`Deseja realmente ${action} este usuário?`)) return;

        try {
            const res = await api.put(`/admin/users/${user.id}/ban`, { isBanned: !user.isBanned });
            if (res.data.ok) {
                toast.success(user.isBanned ? 'Usuário desbanido!' : 'Usuário banido!');
                fetchUsers();
                if (selectedUser?.user?.id === user.id) {
                    loadUserDetails(user.id);
                }
            }
        } catch (err) {
            toast.error('Erro ao processar banimento.');
        }
    };

    const pageCount = Math.ceil(total / 20);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white">Gestão de Usuários</h2>
                    <p className="text-slate-500 text-sm font-medium">Controle de acesso e monitoramento de atividades.</p>
                </div>
                <form onSubmit={handleSearch} className="relative group w-full md:w-96">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-amber-500 transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por ID, E-mail ou Username..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500/50 transition-all"
                    />
                </form>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-400">
                        <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                            <tr>
                                <th className="px-8 py-4">ID</th>
                                <th className="px-8 py-4">Usuário / E-mail</th>
                                <th className="px-8 py-4">IP</th>
                                <th className="px-8 py-4">Saldo</th>
                                <th className="px-8 py-4">Poder</th>
                                <th className="px-8 py-4">Status</th>
                                <th className="px-8 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 font-medium">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="7" className="px-8 py-6 bg-slate-800/10" />
                                    </tr>
                                ))
                            ) : users.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors group">
                                    <td className="px-8 py-5 text-slate-500 font-mono text-xs">#{u.id}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col">
                                            <span className="text-white font-bold text-xs">{u.username || u.name}</span>
                                            <span className="text-[10px] text-slate-500">{u.email}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 text-[10px] font-mono text-slate-500">{u.ip || '--'}</td>
                                    <td className="px-8 py-5 text-amber-500 font-black text-xs">
                                        {Number(u.polBalance || 0).toFixed(6)}
                                    </td>
                                    <td className="px-8 py-5 text-slate-300 font-bold text-xs">
                                        {formatHashrate(Number(u.baseHashRate || 0))}
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${u.isBanned ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                            }`}>
                                            {u.isBanned ? 'Banido' : 'Ativo'}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => loadUserDetails(u.id)}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-all"
                                                title="Ver Detalhes"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleBanToggle(u)}
                                                className={`p-2 rounded-lg transition-all ${u.isBanned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                                    }`}
                                                title={u.isBanned ? 'Desbanir' : 'Banir'}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-8 py-4 bg-slate-800/20 border-t border-slate-800 flex items-center justify-between">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                        Total: <span className="text-white">{total}</span> usuários
                    </p>
                    <div className="flex items-center gap-4">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(prev => prev - 1)}
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg disabled:opacity-30 transition-all hover:bg-slate-700"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-black text-white uppercase tracking-widest">Página {page} de {pageCount}</span>
                        <button
                            disabled={page >= pageCount}
                            onClick={() => setPage(prev => prev + 1)}
                            className="p-2 bg-slate-800 text-slate-400 rounded-lg disabled:opacity-30 transition-all hover:bg-slate-700"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Details Sidebar/Modal */}
            {selectedUser && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-2xl h-full bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500">
                        <div className="sticky top-0 z-10 p-8 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-white">Perfil do Usuário</h3>
                                <p className="text-[10px] text-amber-500 font-black uppercase tracking-[0.2em] mt-1">ID #{selectedUser.user.id}</p>
                            </div>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-2xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex flex-wrap px-8 pt-4 gap-2 border-b border-slate-800">
                            {['perfil', 'transações', 'tickets', 'logs', 'enviar máquina'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setDetailsTab(tab);
                                        if (tab === 'logs' && userLogs.length === 0) fetchUserLogs(selectedUser.user.id);
                                    }}
                                    className={`px-4 py-2 rounded-t-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                        detailsTab === tab
                                            ? tab === 'enviar máquina'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500'
                                                : tab === 'logs'
                                                    ? 'bg-purple-500/10 text-purple-400 border-b-2 border-purple-500'
                                                    : 'bg-amber-500/10 text-amber-500 border-b-2 border-amber-500'
                                            : 'text-slate-500 hover:text-white'
                                    }`}
                                >
                                    {tab === 'enviar máquina'
                                        ? <span className="flex items-center gap-1"><Send className="w-3 h-3" /> enviar máquina</span>
                                        : tab === 'logs'
                                            ? <span className="flex items-center gap-1"><Terminal className="w-3 h-3" /> logs</span>
                                            : tab}
                                </button>
                            ))}
                        </div>

                        <div className="p-8 space-y-10 pb-20">
                            {/* Tab: Perfil */}
                            {detailsTab === 'perfil' && (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        <DetailCard label="Username" value={selectedUser.user.username || selectedUser.user.name} icon={Users} />
                                        <DetailCard label="E-mail" value={selectedUser.user.email} icon={Search} small />
                                        <DetailCard label="Carteira" value={selectedUser.user.walletAddress || 'Não vinculada'} icon={Wallet} small />
                                        <DetailCard label="Saldo POL" value={`${Number(selectedUser.user.polBalance).toFixed(6)} POL`} icon={Wallet} color="amber" />
                                        <DetailCard label="Hash Rate" value={formatHashrate(Number(selectedUser.metrics?.realHashRate || selectedUser.user.oldBaseHashRate || 0))} icon={Cpu} color="blue" />
                                        <DetailCard label="Máquinas Ativas" value={selectedUser.metrics?.activeMachines ?? 0} icon={Activity} color="emerald" />
                                        <DetailCard label="Cadastro" value={selectedUser.user.createdAt ? new Date(selectedUser.user.createdAt).toLocaleDateString('pt-BR') : '--'} icon={Calendar} />
                                        <DetailCard label="Último Login" value={selectedUser.user.lastLoginAt ? new Date(selectedUser.user.lastLoginAt).toLocaleString('pt-BR') : '--'} icon={Clock} small />
                                        <DetailCard label="IP de Registro" value={selectedUser.user.registrationIp || '--'} icon={Globe} small />
                                        <DetailCard label="Último IP" value={selectedUser.user.ip || '--'} icon={Globe} small />
                                        <DetailCard label="Cód. Indicação" value={selectedUser.user.refCode || '--'} icon={Users} small />
                                        <DetailCard label="Faucet Claims" value={selectedUser.metrics?.faucetClaims ?? 0} icon={Activity} />
                                    </div>

                                    <button
                                        onClick={() => handleBanToggle(selectedUser.user)}
                                        className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                                            selectedUser.user.isBanned
                                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500'
                                                : 'bg-red-500/10 hover:bg-red-500/20 text-red-500'
                                        }`}
                                    >
                                        {selectedUser.user.isBanned ? 'Revogar Banimento' : 'Banir permanentemente'}
                                    </button>
                                </>
                            )}

                            {/* Tab: Transações */}
                            {detailsTab === 'transações' && (
                                <div className="bg-slate-950/50 rounded-[2rem] border border-slate-800 p-6 overflow-hidden">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-amber-500" /> Transações Recentes
                                    </h4>
                                    {(selectedUser.recentTransactions || []).length === 0 ? (
                                        <p className="text-slate-500 text-xs text-center py-8">Nenhuma transação encontrada</p>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left text-[10px]">
                                                <thead className="text-slate-600 font-black uppercase tracking-tighter">
                                                    <tr>
                                                        <th className="pb-3 px-2">Tipo</th>
                                                        <th className="pb-3 px-2">Valor</th>
                                                        <th className="pb-3 px-2">Status</th>
                                                        <th className="pb-3 px-2 text-right">Data</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800">
                                                    {selectedUser.recentTransactions.map(tx => (
                                                        <tr key={tx.id}>
                                                            <td className="py-3 px-2 font-bold uppercase">{tx.type}</td>
                                                            <td className="py-3 px-2 text-amber-500 font-bold">{Number(tx.amount).toFixed(6)}</td>
                                                            <td className="py-3 px-2">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                                                    tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                                                                }`}>{tx.status}</span>
                                                            </td>
                                                            <td className="py-3 px-2 text-right text-slate-500">{new Date(tx.createdAt).toLocaleDateString('pt-BR')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tab: Tickets */}
                            {detailsTab === 'tickets' && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-amber-500" /> Chamados de Suporte
                                    </h4>
                                    {(selectedUser.supportMessages || []).length === 0 ? (
                                        <p className="text-slate-500 text-xs text-center py-8">Nenhum chamado aberto</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {selectedUser.supportMessages.map(ticket => (
                                                <button
                                                    key={ticket.id}
                                                    onClick={() => { setSelectedUser(null); navigate('/admin/support'); }}
                                                    className="w-full text-left p-4 bg-slate-900/50 border border-slate-800 hover:border-amber-500/30 rounded-2xl transition-all"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-white font-bold text-sm truncate">{ticket.subject}</span>
                                                        <span className={`ml-2 text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${
                                                            ticket.isReplied ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                                                        }`}>
                                                            {ticket.isReplied ? 'Respondido' : 'Pendente'}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-500 text-[10px] mt-1">{new Date(ticket.createdAt).toLocaleString('pt-BR')}</p>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => { setSelectedUser(null); navigate('/admin/support'); }}
                                        className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all"
                                    >
                                        Ver todos os tickets
                                    </button>
                                </div>
                            )}

                            {/* Tab: Enviar Máquina */}
                            {detailsTab === 'enviar máquina' && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                                        <Package className="w-5 h-5 text-emerald-400 shrink-0" />
                                        <div>
                                            <p className="text-xs font-black text-white">Enviar Máquina Gratuitamente</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">A máquina vai direto pro inventário do usuário sem cobrar POL.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Máquina</label>
                                            <select
                                                value={sendMinerId}
                                                onChange={e => setSendMinerId(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all"
                                            >
                                                <option value="">Selecione uma máquina...</option>
                                                {minersList.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.name} — {Number(m.baseHashRate).toFixed(1)} H/s
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantidade</label>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setSendQty(q => Math.max(1, q - 1))}
                                                    disabled={sendQty <= 1}
                                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-all disabled:opacity-30"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100"
                                                    value={sendQty}
                                                    onChange={e => setSendQty(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                                                    className="w-20 text-center bg-slate-800 border border-slate-700 rounded-xl py-2 text-white font-black text-lg focus:outline-none focus:border-emerald-500/50"
                                                />
                                                <button
                                                    onClick={() => setSendQty(q => Math.min(100, q + 1))}
                                                    disabled={sendQty >= 100}
                                                    className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-all disabled:opacity-30"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {sendMinerId && (() => {
                                            const m = minersList.find(x => String(x.id) === String(sendMinerId));
                                            return m ? (
                                                <div className="flex items-center gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
                                                    <img src={m.imageUrl || '/machines/reward1.png'} className="w-12 h-12 object-contain" alt={m.name} />
                                                    <div className="flex-1">
                                                        <p className="text-white font-bold text-sm">{m.name}</p>
                                                        <p className="text-slate-500 text-[10px]">{Number(m.baseHashRate).toFixed(1)} H/s — {m.slotSize} slot(s)</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-emerald-400 font-black text-lg">{sendQty}x</p>
                                                        <p className="text-slate-500 text-[9px] uppercase">unidades</p>
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()
                                        }

                                        <button
                                            onClick={handleSendMiner}
                                            disabled={isSending || !sendMinerId}
                                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                                        >
                                            {isSending ? (
                                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <><Send className="w-4 h-4" /> Enviar para {selectedUser.user.username || selectedUser.user.email}</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {/* Tab: Logs */}
                            {detailsTab === 'logs' && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                        <Terminal className="w-4 h-4 text-purple-500" /> Histórico de Atividade
                                    </h4>
                                    {isLogsLoading ? (
                                        <div className="flex justify-center py-12">
                                            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                                        </div>
                                    ) : userLogs.length === 0 ? (
                                        <p className="text-slate-500 text-xs text-center py-8">Nenhum log de atividade encontrado</p>
                                    ) : (
                                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                            {userLogs.map(log => (
                                                <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800 hover:border-purple-500/20 rounded-2xl transition-all">
                                                    <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-bold text-xs">{log.action}</p>
                                                        {log.detailsJson && (() => {
                                                            try {
                                                                const d = JSON.parse(log.detailsJson);
                                                                return <p className="text-slate-500 text-[10px] mt-0.5 font-mono truncate">{JSON.stringify(d)}</p>;
                                                            } catch { return null; }
                                                        })()}
                                                        <div className="flex items-center gap-3 mt-1">
                                                            {log.ip && <span className="text-[9px] text-slate-600 font-mono">{log.ip}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] text-slate-600 shrink-0">
                                                        {new Date(log.createdAt).toLocaleString('pt-BR')}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

function DetailCard({ label, value, icon: Icon, color = 'slate', small = false }) {
    const colors = {
        slate: 'text-slate-400 bg-slate-800/50',
        amber: 'text-amber-500 bg-amber-500/5',
        blue: 'text-blue-500 bg-blue-500/5',
        emerald: 'text-emerald-500 bg-emerald-500/5',
    };
    const display = (value !== null && value !== undefined && value !== '') ? value : '--';
    return (
        <div className="p-4 rounded-2xl border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center gap-2 opacity-50">
                <Icon className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            </div>
            <p className={`font-bold truncate ${small ? 'text-xs' : 'text-sm'} ${colors[color].split(' ')[0]}`}>{display}</p>
        </div>
    );
}


