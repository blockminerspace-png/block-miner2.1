import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Plus, Eye, PauseCircle, PlayCircle, Trash2, Edit3,
    ChevronDown, ChevronUp, Loader2, Clock, CheckCircle2,
    XCircle, AlertCircle, Info
} from 'lucide-react';
import { api } from '../../store/auth';

interface Campaign {
    id: number;
    title: string;
    description: string;
    url: string;
    adType: 'iframe' | 'window';
    durationSeconds: number;
    status: 'pending_approval' | 'rejected' | 'active' | 'paused' | 'completed';
    rejectionReason: string | null;
    views: number;
    targetViews: number;
    costShib: string;
    rewardPerViewShib: string;
    createdAt: string;
}

interface PtcSettings {
    pricePerViewShib: string;
    rewardPerViewShib: string;
    minDurationSeconds: number;
    maxDurationSeconds: number;
    minViews: number;
    maxViews: number;
    isEnabled: boolean;
}

const STATUS_CONFIG = {
    pending_approval: { label: 'Aguardando aprovação', icon: Clock, color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
    rejected: { label: 'Rejeitada', icon: XCircle, color: 'text-red-400 bg-red-400/10 border-red-400/20' },
    active: { label: 'Ativa', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
    paused: { label: 'Pausada', icon: PauseCircle, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' },
    completed: { label: 'Concluída', icon: CheckCircle2, color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
};

export default function PtcCampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [settings, setSettings] = useState<PtcSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Create form
    const [form, setForm] = useState({
        title: '', description: '', url: '', adType: 'window' as 'window' | 'iframe',
        durationSeconds: 10, targetViews: 100,
    });

    // Edit form
    const [editForm, setEditForm] = useState({ title: '', description: '' });

    // Add/remove views
    const [viewsDelta, setViewsDelta] = useState<Record<number, string>>({});

    const fetchData = useCallback(async () => {
        try {
            const [camRes, setRes] = await Promise.all([
                api.get('/ptc/my-campaigns'),
                api.get('/ptc/settings'),
            ]);
            setCampaigns(camRes.data.campaigns ?? []);
            setSettings(setRes.data.settings);
        } catch {
            toast.error('Erro ao carregar campanhas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setActionLoading(true);
        try {
            const res = await api.post('/ptc/campaigns', form);
            if (res.data.ok) {
                toast.success('Campanha enviada para aprovação!');
                setShowCreate(false);
                setForm({ title: '', description: '', url: '', adType: 'window', durationSeconds: 10, targetViews: 100 });
                fetchData();
            } else {
                toast.error(res.data.message ?? 'Erro');
            }
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro ao criar campanha');
        } finally {
            setActionLoading(false);
        }
    }

    async function toggleActive(c: Campaign) {
        const active = c.status === 'paused';
        try {
            await api.patch(`/ptc/campaigns/${c.id}`, { active });
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        }
    }

    async function handleEdit(id: number) {
        setActionLoading(true);
        try {
            await api.patch(`/ptc/campaigns/${id}`, editForm);
            toast.success('Campanha atualizada');
            setEditingId(null);
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        } finally {
            setActionLoading(false);
        }
    }

    async function handleAddViews(id: number) {
        const views = Number(viewsDelta[id]);
        if (!views || views < 1) { toast.error('Informe a quantidade de visualizações'); return; }
        setActionLoading(true);
        try {
            const res = await api.post(`/ptc/campaigns/${id}/add-views`, { views });
            if (res.data.ok) { toast.success('Visualizações adicionadas'); fetchData(); }
            else toast.error(res.data.message ?? 'Erro');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRemoveViews(id: number) {
        const views = Number(viewsDelta[id]);
        if (!views || views < 1) { toast.error('Informe a quantidade'); return; }
        setActionLoading(true);
        try {
            const res = await api.post(`/ptc/campaigns/${id}/remove-views`, { views });
            if (res.data.ok) { toast.success('Visualizações removidas (reembolso creditado)'); fetchData(); }
            else toast.error(res.data.message ?? 'Erro');
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        } finally {
            setActionLoading(false);
        }
    }

    const costPreview = settings
        ? (Number(settings.pricePerViewShib) * form.targetViews).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : '...';

    if (loading) return (
        <div className="h-[60vh] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight uppercase italic">Minhas Campanhas PTC</h1>
                    <p className="text-gray-500 text-sm font-medium mt-1">Gerencie seus anúncios pagos por visualização</p>
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="flex items-center gap-2 px-5 py-3 bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-all hover:scale-[1.02] shadow-lg shadow-orange-500/20"
                >
                    <Plus className="w-4 h-4" />
                    Nova Campanha
                </button>
            </div>

            {/* Settings info */}
            {settings && (
                <div className="bg-orange-500/5 border border-orange-500/15 rounded-2xl p-5 flex gap-4">
                    <Info className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                    <div className="text-[10px] text-gray-500 font-medium flex flex-wrap gap-x-6 gap-y-1">
                        <span>Custo: <span className="text-orange-300 font-black">{Number(settings.pricePerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} SHIB</span>/view</span>
                        <span>Recompensa viewer: <span className="text-emerald-400 font-black">{Number(settings.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} SHIB</span>/view</span>
                        <span>Duração: <span className="text-white font-black">{settings.minDurationSeconds}–{settings.maxDurationSeconds}s</span></span>
                        <span>Visualizações: <span className="text-white font-black">{settings.minViews.toLocaleString()}–{settings.maxViews.toLocaleString()}</span></span>
                    </div>
                </div>
            )}

            {/* Create Form */}
            {showCreate && (
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 space-y-6">
                    <h2 className="text-white font-black uppercase tracking-widest text-sm">Nova Campanha</h2>
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Título</label>
                                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" placeholder="Nome da campanha" />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">URL do anúncio</label>
                                <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required type="url"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors" placeholder="https://..." />
                                <p className="text-[9px] text-gray-600 mt-1 font-medium">⚠ URL não pode ser alterada após criação</p>
                            </div>
                        </div>

                        <div>
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Descrição (opcional)</label>
                            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none" rows={2} placeholder="Descreva seu anúncio..." />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Tipo</label>
                                <select value={form.adType} onChange={(e) => setForm({ ...form, adType: e.target.value as 'window' | 'iframe' })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors">
                                    <option value="window">Nova janela</option>
                                    <option value="iframe">iframe</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">
                                    Duração ({settings?.minDurationSeconds}–{settings?.maxDurationSeconds}s)
                                </label>
                                <input type="number" value={form.durationSeconds}
                                    min={settings?.minDurationSeconds ?? 10} max={settings?.maxDurationSeconds ?? 60}
                                    onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                            </div>
                            <div>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">
                                    Visualizações ({settings?.minViews.toLocaleString()}+)
                                </label>
                                <input type="number" value={form.targetViews}
                                    min={settings?.minViews ?? 100} max={settings?.maxViews ?? 1000000}
                                    onChange={(e) => setForm({ ...form, targetViews: Number(e.target.value) })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                            </div>
                        </div>

                        {/* Cost preview */}
                        <div className="flex items-center gap-3 p-4 bg-orange-500/5 border border-orange-500/15 rounded-xl">
                            <img src="/shib.svg" alt="" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                            <div>
                                <p className="text-[9px] text-gray-500 font-black uppercase tracking-widest">Custo total estimado</p>
                                <p className="text-orange-300 font-black text-lg">{costPreview} SHIB</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button type="submit" disabled={actionLoading}
                                className="flex-1 py-4 bg-orange-500 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Enviar para aprovação
                            </button>
                            <button type="button" onClick={() => setShowCreate(false)}
                                className="px-6 py-4 bg-gray-800 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-gray-700 transition-colors text-xs">
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Campaigns List */}
            {campaigns.length === 0 ? (
                <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-16 text-center space-y-4">
                    <Eye className="w-16 h-16 text-gray-700 mx-auto" />
                    <p className="text-white font-black uppercase tracking-widest text-sm">Nenhuma campanha criada</p>
                    <p className="text-gray-600 text-xs font-medium">Crie sua primeira campanha PTC acima.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {campaigns.map((c) => {
                        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.pending_approval;
                        const StatusIcon = cfg.icon;
                        const pct = c.targetViews > 0 ? Math.min(100, Math.round((c.views / c.targetViews) * 100)) : 0;
                        const expanded = expandedId === c.id;
                        const editing = editingId === c.id;

                        return (
                            <div key={c.id} className="bg-surface border border-gray-800/50 rounded-[2rem] overflow-hidden">
                                {/* Header Row */}
                                <div className="p-6 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(expanded ? null : c.id)}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest border rounded-full px-2 py-0.5 ${cfg.color}`}>
                                                <StatusIcon className="w-2.5 h-2.5" />
                                                {cfg.label}
                                            </span>
                                            <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">{c.adType} · {c.durationSeconds}s</span>
                                        </div>
                                        <h3 className="text-white font-black text-sm uppercase italic tracking-tight truncate">{c.title}</h3>
                                        <p className="text-gray-600 text-xs font-mono truncate">{c.url}</p>
                                    </div>
                                    <div className="text-right shrink-0 space-y-1">
                                        <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">{c.views.toLocaleString()} / {c.targetViews.toLocaleString()} views</p>
                                        <div className="flex items-center gap-1.5">
                                            <img src="/shib.svg" alt="" className="w-3.5 h-3.5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                                            <span className="text-orange-300 font-black text-xs">{Number(c.costShib).toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB</span>
                                        </div>
                                    </div>
                                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />}
                                </div>

                                {/* Progress bar */}
                                <div className="h-1 bg-gray-900 mx-6 rounded-full mb-1">
                                    <div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                </div>

                                {/* Expanded content */}
                                {expanded && (
                                    <div className="px-6 pb-6 pt-4 space-y-5 border-t border-gray-800/50 mt-3">
                                        {c.rejectionReason && (
                                            <div className="flex gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-red-400 font-black text-[9px] uppercase tracking-widest mb-1">Motivo da rejeição</p>
                                                    <p className="text-red-300/80 text-xs font-medium">{c.rejectionReason}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        {(c.status === 'active' || c.status === 'paused') && (
                                            <div className="flex flex-wrap gap-3">
                                                <button onClick={() => toggleActive(c)}
                                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-gray-700 transition-colors">
                                                    {c.status === 'active' ? <PauseCircle className="w-3.5 h-3.5" /> : <PlayCircle className="w-3.5 h-3.5" />}
                                                    {c.status === 'active' ? 'Pausar' : 'Reativar'}
                                                </button>
                                                <button onClick={() => { setEditingId(c.id); setEditForm({ title: c.title, description: c.description }); }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-gray-700 transition-colors">
                                                    <Edit3 className="w-3.5 h-3.5" /> Editar
                                                </button>
                                            </div>
                                        )}

                                        {/* Edit form */}
                                        {editing && (
                                            <div className="space-y-3 p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                                <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" placeholder="Título" />
                                                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none" rows={2} placeholder="Descrição" />
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEdit(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2 bg-orange-500 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-orange-400 transition-colors disabled:opacity-50">
                                                        Salvar
                                                    </button>
                                                    <button onClick={() => setEditingId(null)}
                                                        className="px-4 py-2 bg-gray-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-gray-700 transition-colors">
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Add/Remove views */}
                                        {(c.status === 'active' || c.status === 'paused') && (
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Gerenciar visualizações</p>
                                                <div className="flex gap-2 items-center">
                                                    <input type="number" min="1" placeholder="Quantidade"
                                                        value={viewsDelta[c.id] ?? ''}
                                                        onChange={(e) => setViewsDelta({ ...viewsDelta, [c.id]: e.target.value })}
                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                                                    <button onClick={() => handleAddViews(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2.5 bg-emerald-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center gap-1">
                                                        <Plus className="w-3 h-3" /> Adicionar
                                                    </button>
                                                    <button onClick={() => handleRemoveViews(c.id)} disabled={actionLoading}
                                                        className="px-4 py-2.5 bg-red-600/80 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1">
                                                        <Trash2 className="w-3 h-3" /> Remover
                                                    </button>
                                                </div>
                                                {viewsDelta[c.id] && Number(viewsDelta[c.id]) > 0 && settings && (
                                                    <p className="text-[9px] text-gray-600 font-medium">
                                                        Custo adicional: <span className="text-orange-300 font-black">{(Number(viewsDelta[c.id]) * Number(settings.pricePerViewShib)).toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB</span>
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
