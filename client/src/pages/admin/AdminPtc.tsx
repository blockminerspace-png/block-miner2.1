import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Eye, Loader2, Settings, ChevronDown, ChevronUp, Save, Layers, Plus, Trash2, Edit3 } from 'lucide-react';
import { api } from '../../store/auth';

interface Campaign {
    id: number;
    title: string;
    description: string;
    url: string;
    adType: string;
    durationSeconds: number;
    status: string;
    views: number;
    targetViews: number;
    costShib: string;
    createdAt: string;
    user: { id: number; name: string; email: string };
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

interface Tier {
    id: number;
    label: string;
    durationSeconds: number;
    pricePerViewShib: string;
    rewardPerViewShib: string;
    isActive: boolean;
    sortOrder: number;
}

const EMPTY_TIER = { label: '', durationSeconds: 10, pricePerViewShib: '', rewardPerViewShib: '', isActive: true, sortOrder: 0 };

export default function AdminPtc() {
    const [pending, setPending] = useState<Campaign[]>([]);
    const [all, setAll] = useState<Campaign[]>([]);
    const [settings, setSettings] = useState<PtcSettings | null>(null);
    const [settingsForm, setSettingsForm] = useState<Partial<PtcSettings>>({});
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [tierForm, setTierForm] = useState<typeof EMPTY_TIER>({ ...EMPTY_TIER });
    const [editingTierId, setEditingTierId] = useState<number | null>(null);
    const [showTierForm, setShowTierForm] = useState(false);
    const [tierLoading, setTierLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'pending' | 'all' | 'settings' | 'tiers'>('pending');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [settingsSaving, setSettingsSaving] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const [pendRes, allRes, setRes, tierRes] = await Promise.all([
                api.get('/admin/ptc/campaigns/pending'),
                api.get('/admin/ptc/campaigns'),
                api.get('/admin/ptc/settings'),
                api.get('/admin/ptc/tiers'),
            ]);
            setPending(pendRes.data.campaigns ?? []);
            setAll(allRes.data.items ?? []);
            setSettings(setRes.data.settings);
            setSettingsForm(setRes.data.settings);
            setTiers(tierRes.data.tiers ?? []);
        } catch {
            toast.error('Erro ao carregar dados PTC');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleApprove(id: number) {
        setActionLoading(id);
        try {
            await api.post(`/admin/ptc/campaigns/${id}/approve`);
            toast.success('Campanha aprovada');
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleReject(id: number) {
        const reason = rejectReason[id]?.trim();
        if (!reason) { toast.error('Informe o motivo da rejeição'); return; }
        setActionLoading(id);
        try {
            await api.post(`/admin/ptc/campaigns/${id}/reject`, { reason });
            toast.success('Campanha rejeitada (SHIB reembolsado)');
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleSaveTier(e: React.FormEvent) {
        e.preventDefault();
        setTierLoading(true);
        try {
            if (editingTierId !== null) {
                await api.put(`/admin/ptc/tiers/${editingTierId}`, {
                    ...tierForm,
                    pricePerViewShib: Number(tierForm.pricePerViewShib),
                    rewardPerViewShib: Number(tierForm.rewardPerViewShib),
                });
                toast.success('Tier atualizado');
            } else {
                await api.post('/admin/ptc/tiers', {
                    ...tierForm,
                    pricePerViewShib: Number(tierForm.pricePerViewShib),
                    rewardPerViewShib: Number(tierForm.rewardPerViewShib),
                });
                toast.success('Tier criado');
            }
            setShowTierForm(false);
            setEditingTierId(null);
            setTierForm({ ...EMPTY_TIER });
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro ao salvar tier');
        } finally {
            setTierLoading(false);
        }
    }

    async function handleDeleteTier(id: number) {
        if (!confirm('Deletar este tier? Campanhas existentes não serão afetadas.')) return;
        try {
            await api.delete(`/admin/ptc/tiers/${id}`);
            toast.success('Tier deletado');
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro ao deletar');
        }
    }

    function startEditTier(t: Tier) {
        setTierForm({
            label: t.label,
            durationSeconds: t.durationSeconds,
            pricePerViewShib: t.pricePerViewShib,
            rewardPerViewShib: t.rewardPerViewShib,
            isActive: t.isActive,
            sortOrder: t.sortOrder,
        });
        setEditingTierId(t.id);
        setShowTierForm(true);
    }

    async function saveSettings() {
        setSettingsSaving(true);
        try {
            await api.put('/admin/ptc/settings', {
                ...settingsForm,
                pricePerViewShib: Number(settingsForm.pricePerViewShib),
                rewardPerViewShib: Number(settingsForm.rewardPerViewShib),
            });
            toast.success('Configurações salvas');
            fetchData();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            toast.error(msg ?? 'Erro ao salvar');
        } finally {
            setSettingsSaving(false);
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    const STATUS_COLOR: Record<string, string> = {
        pending_approval: 'text-amber-400',
        active: 'text-emerald-400',
        rejected: 'text-red-400',
        paused: 'text-slate-400',
        completed: 'text-blue-400',
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black text-white uppercase italic tracking-tight">Admin — PTC</h2>
                <div className="flex items-center gap-2">
                    <img src="/shib.png" alt="" className="w-6 h-6 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }} />
                    <span className="text-orange-300 font-black text-xs uppercase tracking-widest">SHIB</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-900/50 p-1.5 rounded-2xl gap-2 flex-wrap">
                {(['pending', 'all', 'tiers', 'settings'] as const).map((t) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`flex-1 py-2.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-1.5 min-w-[80px] ${tab === t ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                        {t === 'pending' && <><Clock className="w-3 h-3" /> Pendentes ({pending.length})</>}
                        {t === 'all' && <><Eye className="w-3 h-3" /> Todas</>}
                        {t === 'tiers' && <><Layers className="w-3 h-3" /> Tiers</>}
                        {t === 'settings' && <><Settings className="w-3 h-3" /> Config</>}
                    </button>
                ))}
            </div>

            {/* Pending */}
            {tab === 'pending' && (
                <div className="space-y-4">
                    {pending.length === 0 ? (
                        <div className="text-center py-16 text-gray-600 font-black uppercase tracking-widest text-sm">
                            Nenhuma campanha pendente
                        </div>
                    ) : pending.map((c) => (
                        <div key={c.id} className="bg-surface border border-gray-800/50 rounded-2xl overflow-hidden">
                            <div className="p-5 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-black text-sm uppercase italic truncate">{c.title}</p>
                                    <p className="text-gray-500 text-xs font-mono truncate">{c.url}</p>
                                    <p className="text-gray-600 text-[9px] font-bold mt-0.5">{c.user.name} · {c.user.email}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-orange-300 font-black text-xs">{Number(c.costShib).toLocaleString(undefined, { maximumFractionDigits: 2 })} SHIB</p>
                                    <p className="text-gray-600 text-[9px] font-bold">{c.targetViews.toLocaleString()} views · {c.adType} · {c.durationSeconds}s</p>
                                </div>
                                {expandedId === c.id ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                            </div>
                            {expandedId === c.id && (
                                <div className="px-5 pb-5 pt-0 border-t border-gray-800/50 space-y-4">
                                    {c.description && <p className="text-gray-400 text-xs font-medium">{c.description}</p>}
                                    <a href={c.url} target="_blank" rel="noreferrer" className="text-primary text-xs font-mono underline break-all">{c.url}</a>

                                    <div className="flex gap-3">
                                        <button onClick={() => handleApprove(c.id)} disabled={actionLoading === c.id}
                                            className="flex-1 py-3 bg-emerald-600 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-emerald-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                            {actionLoading === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            Aprovar
                                        </button>
                                        <div className="flex-1 space-y-2">
                                            <input value={rejectReason[c.id] ?? ''} onChange={(e) => setRejectReason({ ...rejectReason, [c.id]: e.target.value })}
                                                placeholder="Motivo da rejeição..."
                                                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500 transition-colors" />
                                            <button onClick={() => handleReject(c.id)} disabled={actionLoading === c.id}
                                                className="w-full py-3 bg-red-600/80 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                                {actionLoading === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                                Rejeitar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* All Campaigns */}
            {tab === 'all' && (
                <div className="space-y-3">
                    {all.map((c) => (
                        <div key={c.id} className="flex items-center gap-4 p-4 bg-surface border border-gray-800/30 rounded-2xl">
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-black text-xs uppercase italic truncate">{c.title}</p>
                                <p className="text-gray-500 text-[9px] font-mono truncate">{c.url}</p>
                                <p className="text-gray-600 text-[9px] font-bold">{c.user.name}</p>
                            </div>
                            <div className="text-right shrink-0 space-y-0.5">
                                <p className={`font-black text-[9px] uppercase tracking-widest ${STATUS_COLOR[c.status] ?? 'text-gray-500'}`}>{c.status}</p>
                                <p className="text-gray-600 text-[9px]">{c.views}/{c.targetViews} views</p>
                                <p className="text-orange-300 text-[9px] font-black">{Number(c.costShib).toLocaleString(undefined, { maximumFractionDigits: 0 })} SHIB</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tiers */}
            {tab === 'tiers' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-400 text-xs font-medium">{tiers.length} tier(s) cadastrado(s)</p>
                        <button
                            onClick={() => { setTierForm({ ...EMPTY_TIER }); setEditingTierId(null); setShowTierForm(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white font-black text-[9px] uppercase tracking-widest rounded-xl hover:bg-orange-400 transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Novo Tier
                        </button>
                    </div>

                    {/* Tier form */}
                    {showTierForm && (
                        <form onSubmit={handleSaveTier} className="bg-surface border border-gray-800/50 rounded-2xl p-6 space-y-4">
                            <h3 className="text-white font-black text-sm uppercase tracking-widest">
                                {editingTierId !== null ? 'Editar Tier' : 'Novo Tier'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Nome do Tier</label>
                                    <input value={tierForm.label} onChange={(e) => setTierForm({ ...tierForm, label: e.target.value })} required
                                        placeholder="ex: Básico 10s"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Duração (segundos)</label>
                                    <input type="number" min="1" value={tierForm.durationSeconds} onChange={(e) => setTierForm({ ...tierForm, durationSeconds: Number(e.target.value) })} required
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Custo anunciante (SHIB/view)</label>
                                    <input type="number" step="0.000001" min="0" value={tierForm.pricePerViewShib} onChange={(e) => setTierForm({ ...tierForm, pricePerViewShib: e.target.value })} required
                                        placeholder="0.000000"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Recompensa viewer (SHIB/view)</label>
                                    <input type="number" step="0.000001" min="0" value={tierForm.rewardPerViewShib} onChange={(e) => setTierForm({ ...tierForm, rewardPerViewShib: e.target.value })} required
                                        placeholder="0.000000"
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-orange-500 transition-colors" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">Ordem</label>
                                    <input type="number" value={tierForm.sortOrder} onChange={(e) => setTierForm({ ...tierForm, sortOrder: Number(e.target.value) })}
                                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 transition-colors" />
                                </div>
                                <div className="flex items-center gap-3 pt-5">
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Ativo</label>
                                    <button type="button"
                                        onClick={() => setTierForm({ ...tierForm, isActive: !tierForm.isActive })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tierForm.isActive ? 'bg-emerald-600' : 'bg-gray-700'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${tierForm.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button type="submit" disabled={tierLoading}
                                    className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-orange-400 transition-colors disabled:opacity-50">
                                    {tierLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {editingTierId !== null ? 'Salvar' : 'Criar'}
                                </button>
                                <button type="button" onClick={() => { setShowTierForm(false); setEditingTierId(null); }}
                                    className="px-6 py-3 bg-gray-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-700 transition-colors">
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Tier list */}
                    {tiers.length === 0 ? (
                        <div className="text-center py-12 text-gray-600 font-black uppercase tracking-widest text-sm">
                            Nenhum tier cadastrado
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tiers.map((t) => (
                                <div key={t.id} className="flex items-center gap-4 p-4 bg-surface border border-gray-800/30 rounded-2xl">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="text-white font-black text-sm uppercase italic">{t.label}</p>
                                            <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full ${t.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-500'}`}>
                                                {t.isActive ? 'ativo' : 'inativo'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[9px] text-gray-500 font-medium">
                                            <span>⏱ {t.durationSeconds}s</span>
                                            <span>Custo: <span className="text-orange-300 font-black">{Number(t.pricePerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} SHIB/view</span></span>
                                            <span>Recompensa: <span className="text-emerald-400 font-black">{Number(t.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 6 })} SHIB/view</span></span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => startEditTier(t)}
                                            className="p-2 bg-gray-800 text-white rounded-xl hover:bg-gray-700 transition-colors">
                                            <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDeleteTier(t.id)}
                                            className="p-2 bg-red-600/20 text-red-400 rounded-xl hover:bg-red-600/40 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Settings */}
            {tab === 'settings' && settings && (
                <div className="bg-surface border border-gray-800/50 rounded-2xl p-6 space-y-5">
                    <h3 className="text-white font-black uppercase tracking-widest text-sm">Configurações PTC</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { key: 'pricePerViewShib', label: 'Custo por view (SHIB)', type: 'number', step: '0.0001' },
                            { key: 'rewardPerViewShib', label: 'Recompensa por view (SHIB)', type: 'number', step: '0.0001' },
                            { key: 'minDurationSeconds', label: 'Duração mínima (s)', type: 'number', step: '1' },
                            { key: 'maxDurationSeconds', label: 'Duração máxima (s)', type: 'number', step: '1' },
                            { key: 'minViews', label: 'Visualizações mínimas', type: 'number', step: '1' },
                            { key: 'maxViews', label: 'Visualizações máximas', type: 'number', step: '1' },
                        ].map(({ key, label, type, step }) => (
                            <div key={key}>
                                <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block">{label}</label>
                                <input
                                    type={type} step={step}
                                    value={String(settingsForm[key as keyof PtcSettings] ?? '')}
                                    onChange={(e) => setSettingsForm({ ...settingsForm, [key]: type === 'number' ? e.target.value : e.target.value })}
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary transition-colors"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Sistema habilitado</label>
                        <button
                            onClick={() => setSettingsForm({ ...settingsForm, isEnabled: !settingsForm.isEnabled })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settingsForm.isEnabled ? 'bg-emerald-600' : 'bg-gray-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settingsForm.isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <button onClick={saveSettings} disabled={settingsSaving}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/80 transition-colors disabled:opacity-50">
                        {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar configurações
                    </button>
                </div>
            )}
        </div>
    );
}
