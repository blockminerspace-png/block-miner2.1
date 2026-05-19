import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, Trash2, Save, Receipt, Pencil } from 'lucide-react';
import { api } from '../../../store/auth';
import ImageUploader from '../../../shared/components/ImageUploader';
import type {
    AdminOfferEventDetail,
    AdminOfferEventGetResponse,
    AdminOfferEventManageFormState,
    AdminOfferEventManageTab,
    AdminOfferEventMinerFormState,
    AdminOfferEventMinerRow,
    AdminOfferEventMinersListResponse,
    AdminOfferEventMutationResponse,
    AdminOfferEventPurchaseRow,
    AdminOfferEventPurchasesListResponse,
} from '../admin.types';

const CURRENCIES = ['POL', 'BTC', 'ETH', 'USDT', 'USDC', 'ZER'] as const;

const TAB_KEYS: AdminOfferEventManageTab[] = ['event', 'miners', 'sales'];

function readAxiosResponseMessage(err: unknown): string | undefined {
    if (typeof err !== 'object' || err === null) return undefined;
    const response = 'response' in err ? (err as { response?: unknown }).response : undefined;
    if (typeof response !== 'object' || response === null) return undefined;
    const data = 'data' in response ? (response as { data?: unknown }).data : undefined;
    if (typeof data !== 'object' || data === null) return undefined;
    const message = 'message' in data ? (data as { message?: unknown }).message : undefined;
    return typeof message === 'string' ? message : undefined;
}

const defaultEventForm = (): AdminOfferEventManageFormState => ({
    title: '',
    description: '',
    imageUrl: '',
    startsAt: '',
    endsAt: '',
    isActive: true,
});

const defaultMinerForm = (): AdminOfferEventMinerFormState => ({
    name: '',
    description: '',
    imageUrl: '',
    price: '',
    hashRate: '',
    currency: 'POL',
    stockUnlimited: false,
    stockCount: '',
    slotSize: 1,
    isActive: true,
    isFree: false,
    claimLimitPerUser: 1,
});

export default function AdminOfferEventManage() {
    const { id: routeId = '' } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') || 'event';
    const isNew = routeId === 'new';

    const [loading, setLoading] = useState<boolean>(!isNew);
    const [saving, setSaving] = useState<boolean>(false);
    const [eventForm, setEventForm] = useState<AdminOfferEventManageFormState>(defaultEventForm);
    const [miners, setMiners] = useState<AdminOfferEventMinerRow[]>([]);
    const [purchases, setPurchases] = useState<AdminOfferEventPurchaseRow[]>([]);
    const [showMinerForm, setShowMinerForm] = useState<boolean>(false);
    const [editingMinerId, setEditingMinerId] = useState<number | null>(null);
    const [minerForm, setMinerForm] = useState<AdminOfferEventMinerFormState>(defaultMinerForm);

    const loadEvent = useCallback(async () => {
        if (isNew) return;
        try {
            setLoading(true);
            const res = await api.get<AdminOfferEventGetResponse>(`/admin/offer-events/${routeId}`);
            if (res.data.ok && res.data.event) {
                const e: AdminOfferEventDetail = res.data.event;
                setEventForm({
                    title: e.title || '',
                    description: e.description || '',
                    imageUrl: e.imageUrl || '',
                    startsAt: e.startsAt ? new Date(e.startsAt).toISOString().slice(0, 16) : '',
                    endsAt: e.endsAt ? new Date(e.endsAt).toISOString().slice(0, 16) : '',
                    isActive: !!e.isActive,
                });
            }
        } catch {
            toast.error('Evento não encontrado');
            navigate('/admin/offer-events');
        } finally {
            setLoading(false);
        }
    }, [routeId, isNew, navigate]);

    const loadMiners = useCallback(async () => {
        if (isNew) return;
        try {
            const res = await api.get<AdminOfferEventMinersListResponse>(`/admin/offer-events/${routeId}/miners`);
            if (res.data.ok) {
                setMiners(res.data.miners || []);
            }
        } catch {
            toast.error('Erro ao carregar miners');
        }
    }, [routeId, isNew]);

    const loadPurchases = useCallback(async () => {
        if (isNew) return;
        try {
            const res = await api.get<AdminOfferEventPurchasesListResponse>(`/admin/offer-events/${routeId}/purchases`, {
                params: { pageSize: 100 },
            });
            if (res.data.ok) {
                setPurchases(res.data.purchases || []);
            }
        } catch {
            toast.error('Erro ao carregar vendas');
        }
    }, [routeId, isNew]);

    useEffect(() => {
        loadEvent();
    }, [loadEvent]);

    useEffect(() => {
        if (tab === 'miners') void loadMiners();
        if (tab === 'sales') void loadPurchases();
    }, [tab, loadMiners, loadPurchases]);

    const saveEvent = async (e?: FormEvent<HTMLFormElement>) => {
        e?.preventDefault();
        try {
            setSaving(true);
            const payload = {
                title: eventForm.title,
                description: eventForm.description,
                imageUrl: eventForm.imageUrl || null,
                startsAt: new Date(eventForm.startsAt).toISOString(),
                endsAt: new Date(eventForm.endsAt).toISOString(),
                isActive: eventForm.isActive,
            };
            if (isNew) {
                const res = await api.post<AdminOfferEventMutationResponse>('/admin/offer-events', payload);
                if (res.data.ok && res.data.event?.id != null) {
                    toast.success('Evento criado');
                    navigate(`/admin/offer-events/${res.data.event.id}?tab=miners`);
                }
            } else {
                await api.put<AdminOfferEventMutationResponse>(`/admin/offer-events/${routeId}`, payload);
                toast.success('Evento atualizado');
                loadEvent();
            }
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar');
        } finally {
            setSaving(false);
        }
    };

    const resetMinerForm = () => {
        setEditingMinerId(null);
        setMinerForm(defaultMinerForm());
    };

    const openNewMiner = () => {
        resetMinerForm();
        setShowMinerForm(true);
    };

    const openEditMiner = (m: AdminOfferEventMinerRow) => {
        setEditingMinerId(m.id);
        setMinerForm({
            name: m.name,
            description: m.description,
            imageUrl: m.imageUrl || '',
            price: String(m.price),
            hashRate: String(m.hashRate),
            currency: m.currency || 'POL',
            stockUnlimited: m.stockUnlimited,
            stockCount: m.stockCount != null ? String(m.stockCount) : '',
            slotSize: m.slotSize === 2 ? 2 : 1,
            isActive: m.isActive,
            isFree: m.isFree || false,
            claimLimitPerUser: m.claimLimitPerUser ?? 1,
        });
        setShowMinerForm(true);
    };

    const saveMiner = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isNew) return;
        try {
            setSaving(true);
            const payload = {
                name: minerForm.name,
                description: minerForm.description,
                imageUrl: minerForm.imageUrl || null,
                price: minerForm.isFree ? 0 : Number(minerForm.price),
                hashRate: Number(minerForm.hashRate),
                currency: minerForm.currency,
                stockUnlimited: minerForm.stockUnlimited,
                stockCount: minerForm.stockUnlimited ? null : Number(minerForm.stockCount),
                slotSize: Number(minerForm.slotSize),
                isActive: minerForm.isActive,
                isFree: minerForm.isFree,
                claimLimitPerUser: Number(minerForm.claimLimitPerUser),
            };
            if (editingMinerId) {
                await api.put(`/admin/offer-events/${routeId}/miners/${editingMinerId}`, payload);
                toast.success('Miner atualizado');
            } else {
                await api.post(`/admin/offer-events/${routeId}/miners`, payload);
                toast.success('Miner criado');
            }
            setShowMinerForm(false);
            resetMinerForm();
            loadMiners();
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar miner');
        } finally {
            setSaving(false);
        }
    };

    const removeMiner = async (minerId: number) => {
        if (!confirm('Remover este miner do evento?')) return;
        try {
            await api.delete(`/admin/offer-events/${routeId}/miners/${minerId}`);
            toast.success('Removido');
            loadMiners();
        } catch {
            toast.error('Erro ao remover');
        }
    };

    const setTab = (t: AdminOfferEventManageTab) => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', t);
        setSearchParams(next, { replace: true });
    };

    if (loading && !isNew) {
        return (
            <div className="flex justify-center py-24">
                <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-5xl">
            <button
                type="button"
                onClick={() => navigate('/admin/offer-events')}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-white uppercase font-bold tracking-wider"
            >
                <ArrowLeft className="w-4 h-4" />
                Voltar
            </button>

            <div className="flex gap-2 border-b border-slate-800 pb-2">
                {TAB_KEYS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        disabled={isNew && t !== 'event'}
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider ${
                            tab === t ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-white'
                        } disabled:opacity-30`}
                    >
                        {t === 'event' ? 'Dados' : t === 'miners' ? 'Miners' : 'Vendas'}
                    </button>
                ))}
            </div>

            {tab === 'event' && (
                <form onSubmit={saveEvent} className="space-y-4 rounded-2xl border border-slate-800 p-8 bg-slate-900/40">
                    <h2 className="text-xl font-black text-white">{isNew ? 'Novo evento' : 'Editar evento'}</h2>
                    <div className="grid gap-4">
                        <div>
                            <label className="text-[10px] uppercase text-slate-500 font-bold">Título</label>
                            <input
                                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white"
                                value={eventForm.title}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setEventForm((f) => ({ ...f, title: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase text-slate-500 font-bold">Descrição</label>
                            <textarea
                                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white min-h-[120px]"
                                value={eventForm.description}
                                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                    setEventForm((f) => ({ ...f, description: e.target.value }))
                                }
                                required
                            />
                        </div>
                        <ImageUploader
                            label="Imagem do Evento"
                            value={eventForm.imageUrl}
                            onChange={(url: string) => setEventForm((f) => ({ ...f, imageUrl: url }))}
                            previewClass="max-h-40"
                        />
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold">Início</label>
                                <input
                                    type="datetime-local"
                                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white"
                                    value={eventForm.startsAt}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                        setEventForm((f) => ({ ...f, startsAt: e.target.value }))
                                    }
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold">Fim</label>
                                <input
                                    type="datetime-local"
                                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white"
                                    value={eventForm.endsAt}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                        setEventForm((f) => ({ ...f, endsAt: e.target.value }))
                                    }
                                    required
                                />
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={eventForm.isActive}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setEventForm((f) => ({ ...f, isActive: e.target.checked }))
                                }
                            />
                            Evento ativo
                        </label>
                    </div>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Salvar
                    </button>
                </form>
            )}

            {tab === 'miners' && !isNew && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-black text-white">Miners do evento</h2>
                        <button
                            type="button"
                            onClick={openNewMiner}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase"
                        >
                            <Plus className="w-4 h-4" />
                            Adicionar miner
                        </button>
                    </div>
                    <div className="rounded-2xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-950 text-[10px] uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Nome</th>
                                    <th className="px-4 py-3">Preco / Tipo</th>
                                    <th className="px-4 py-3">Hash</th>
                                    <th className="px-4 py-3">Estoque</th>
                                    <th className="px-4 py-3">Coletados</th>
                                    <th className="px-4 py-3">Ativo</th>
                                    <th className="px-4 py-3 text-right">Acoes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                {miners.map((m) => (
                                    <tr key={m.id}>
                                        <td className="px-4 py-3 text-white font-semibold">{m.name}</td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {m.isFree ? (
                                                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-black text-[9px] uppercase">
                                                    GRATIS
                                                </span>
                                            ) : (
                                                <>
                                                    {Number(m.price)} {m.currency}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">{m.hashRate}</td>
                                        <td className="px-4 py-3">{m.stockUnlimited ? '∞' : (m.stockCount ?? '—')}</td>
                                        <td className="px-4 py-3">{m.soldCount}</td>
                                        <td className="px-4 py-3">{m.isActive ? 'Sim' : 'Não'}</td>
                                        <td className="px-4 py-3 text-right space-x-1">
                                            <button
                                                type="button"
                                                onClick={() => openEditMiner(m)}
                                                className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg inline-flex"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeMiner(m.id)}
                                                className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg inline-flex"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === 'sales' && !isNew && (
                <div className="space-y-4">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Receipt className="w-6 h-6 text-amber-500" />
                        Compras
                    </h2>
                    <div className="rounded-2xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-950 text-[10px] uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">ID</th>
                                    <th className="px-4 py-3">Usuário</th>
                                    <th className="px-4 py-3">Miner</th>
                                    <th className="px-4 py-3">Valor</th>
                                    <th className="px-4 py-3">Data</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 text-slate-300">
                                {purchases.map((p) => (
                                    <tr key={p.id}>
                                        <td className="px-4 py-3 font-mono text-xs">{p.id}</td>
                                        <td className="px-4 py-3 text-xs">
                                            {p.user?.email || p.user?.username || `#${p.userId}`}
                                        </td>
                                        <td className="px-4 py-3">{p.minerName}</td>
                                        <td className="px-4 py-3 font-mono">
                                            {p.pricePaid} {p.currency}
                                        </td>
                                        <td className="px-4 py-3 text-xs">{new Date(p.createdAt).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showMinerForm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80">
                    <form
                        onSubmit={saveMiner}
                        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-8 space-y-4 max-h-[90vh] overflow-y-auto"
                    >
                        <h3 className="text-lg font-black text-white">{editingMinerId ? 'Editar miner' : 'Novo miner'}</h3>
                        <input
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                            placeholder="Nome"
                            value={minerForm.name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setMinerForm((f) => ({ ...f, name: e.target.value }))
                            }
                            required
                        />
                        <textarea
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white min-h-[80px]"
                            placeholder="Descrição"
                            value={minerForm.description}
                            onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                                setMinerForm((f) => ({ ...f, description: e.target.value }))
                            }
                            required
                        />
                        <ImageUploader
                            label="Imagem do Miner"
                            value={minerForm.imageUrl}
                            onChange={(url: string) => setMinerForm((f) => ({ ...f, imageUrl: url }))}
                            previewClass="max-h-32"
                        />
                        {/* Maquina gratuita */}
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={minerForm.isFree}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setMinerForm((f) => ({
                                        ...f,
                                        isFree: e.target.checked,
                                        price: e.target.checked ? '0' : f.price,
                                    }))
                                }
                            />
                            Maquina gratuita (coletavel sem custo)
                        </label>
                        {minerForm.isFree && (
                            <div>
                                <label className="text-[10px] uppercase text-slate-500 font-bold">
                                    Limite por jogador (0 = ilimitado)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                                    placeholder="Ex: 1 (cada jogador coleta 1 vez)"
                                    value={minerForm.claimLimitPerUser}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                        setMinerForm((f) => ({ ...f, claimLimitPerUser: e.target.value }))
                                    }
                                />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="number"
                                step="any"
                                min="0"
                                disabled={minerForm.isFree}
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white disabled:opacity-30"
                                placeholder={minerForm.isFree ? 'Gratis' : 'Preco'}
                                value={minerForm.isFree ? '0' : minerForm.price}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setMinerForm((f) => ({ ...f, price: e.target.value }))
                                }
                                required={!minerForm.isFree}
                            />
                            <input
                                type="number"
                                step="any"
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                                placeholder="Hashrate (H/s)"
                                value={minerForm.hashRate}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setMinerForm((f) => ({ ...f, hashRate: e.target.value }))
                                }
                                required
                            />
                        </div>
                        {!minerForm.isFree && (
                            <select
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                                value={minerForm.currency}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                    setMinerForm((f) => ({ ...f, currency: e.target.value }))
                                }
                            >
                                {CURRENCIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        )}
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input
                                type="checkbox"
                                checked={minerForm.stockUnlimited}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setMinerForm((f) => ({ ...f, stockUnlimited: e.target.checked }))
                                }
                            />
                            Estoque ilimitado
                        </label>
                        {!minerForm.stockUnlimited && (
                            <input
                                type="number"
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                                placeholder="Quantidade em estoque"
                                value={minerForm.stockCount}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                    setMinerForm((f) => ({ ...f, stockCount: e.target.value }))
                                }
                                required={!minerForm.stockUnlimited}
                            />
                        )}
                        <select
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-white"
                            value={minerForm.slotSize}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                                setMinerForm((f) => ({
                                    ...f,
                                    slotSize: Number(e.target.value) === 2 ? 2 : 1,
                                }))
                            }
                        >
                            <option value={1}>Slot 1</option>
                            <option value={2}>Slot 2</option>
                        </select>
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300"
                                onClick={() => {
                                    setShowMinerForm(false);
                                    resetMinerForm();
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-black uppercase text-xs"
                            >
                                {editingMinerId ? 'Salvar' : 'Criar'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
