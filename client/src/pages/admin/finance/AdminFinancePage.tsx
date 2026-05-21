import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Wallet,
    CheckCircle2,
    XCircle,
    RefreshCw,
    ArrowUpCircle,
    ArrowDownCircle,
    Copy,
    ExternalLink,
    User,
    Filter,
    AlertTriangle,
    Bell,
    Bot,
    Camera,
    Save,
} from 'lucide-react';
import { api } from '../../../store/auth';
import { readAxiosResponseMessage } from '../admin.api';
import type {
    ActivityFiltersSnapshot,
    AdminFinanceActivityRow,
    AdminFinanceOverview,
    AdminFinancePendingWithdrawal,
    BlkEconomyFormState,
    CollisionHints,
    CompleteWithdrawalModalState,
    TelegramEventRow,
    TelegramHealthState,
    TelegramSettingsState,
    UserDetailModalState,
    UserFinanceDetailData,
} from './adminFinance.types';

function isPolygonEvmAddress(s: unknown): boolean {
    return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(s.trim());
}

function polygonAddressUrl(addr: string): string {
    return `https://polygonscan.com/address/${encodeURIComponent(String(addr).trim())}`;
}

function polygonTxUrl(hash: string): string {
    return `https://polygonscan.com/tx/${encodeURIComponent(String(hash).trim())}`;
}

function polygonSearchUrl(q: string | undefined | null): string {
    return `https://polygonscan.com/search?q=${encodeURIComponent(String(q ?? '').trim())}`;
}

type ActivityAddressLineProps = {
    label: string;
    value: string | null | undefined;
    onCopy: (v: string, label: string) => void;
};

function ActivityAddressLine({ label, value, onCopy }: ActivityAddressLineProps) {
    if (!value || !String(value).trim()) return null;
    const v = String(value).trim();
    const evm = isPolygonEvmAddress(v);
    return (
        <div>
            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-600 mb-0.5">{label}</span>
            <div className="flex flex-wrap items-start gap-1">
                <span className="break-all text-slate-300 leading-snug" title={v}>
                    {v.length > 22 ? `${v.slice(0, 12)}…${v.slice(-8)}` : v}
                </span>
                <button
                    type="button"
                    onClick={() => onCopy(v, `${label} copiado`)}
                    className="p-0.5 text-slate-500 hover:text-emerald-400 shrink-0"
                    title="Copiar"
                >
                    <Copy className="w-3 h-3" />
                </button>
                {evm ? (
                    <a
                        href={polygonAddressUrl(v)}
                        target="_blank"
                        rel="noreferrer"
                        className="p-0.5 text-slate-500 hover:text-sky-400 shrink-0 inline-flex"
                        title="Polygonscan (conta)"
                    >
                        <ExternalLink className="w-3 h-3" />
                    </a>
                ) : null}
            </div>
        </div>
    );
}

export default function AdminFinance() {
    const [withdrawals, setWithdrawals] = useState<AdminFinancePendingWithdrawal[]>([]);
    const [blkEconomyForm, setBlkEconomyForm] = useState<BlkEconomyFormState | null>(null);
    const [overview, setOverview] = useState<AdminFinanceOverview | null>(null);
    const [activity, setActivity] = useState<AdminFinanceActivityRow[]>([]);
    const [activityTotal, setActivityTotal] = useState(0);
    const [activityPage, setActivityPage] = useState(1);
    const [activityLimit] = useState(50);
    const [activityType, setActivityType] = useState(''); // '' | 'deposit' | 'withdrawal'
    const [activityHash, setActivityHash] = useState('');
    const [activityUserQ, setActivityUserQ] = useState('');
    const [activityStatus, setActivityStatus] = useState('');
    const [activityLoading, setActivityLoading] = useState(false);
    const [userDetailModal, setUserDetailModal] = useState<UserDetailModalState | null>(null);
    const [userDetailLoading, setUserDetailLoading] = useState(false);
    const [userDetailData, setUserDetailData] = useState<UserFinanceDetailData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [tab, setTab] = useState('withdrawals'); // 'withdrawals', 'blk', 'activity', 'telegram'
    const [completeModal, setCompleteModal] = useState<CompleteWithdrawalModalState | null>(null);
    const [completeTxHash, setCompleteTxHash] = useState('');
    const [telegramSettings, setTelegramSettings] = useState<TelegramSettingsState | null>(null);
    const [telegramSaving, setTelegramSaving] = useState(false);
    const [telegramHealth, setTelegramHealth] = useState<TelegramHealthState | null>(null);
    const [telegramEvents, setTelegramEvents] = useState<TelegramEventRow[]>([]);
    const [telegramTxHash, setTelegramTxHash] = useState('');
    const [telegramLoadingEvents, setTelegramLoadingEvents] = useState(false);

    const activityFiltersRef = useRef<ActivityFiltersSnapshot>({
        page: 1,
        limit: 50,
        type: '',
        hash: '',
        q: '',
        status: '',
    });
    activityFiltersRef.current = {
        page: activityPage,
        limit: activityLimit,
        type: activityType,
        hash: activityHash,
        q: activityUserQ,
        status: activityStatus,
    };

    const copyText = (text: string | null | undefined, label = 'Copiado') => {
        if (!text) return;
        void navigator.clipboard.writeText(text);
        toast.success(label);
    };

    const formatCollisionHints = (h: CollisionHints | null | undefined): string[] | null => {
        if (!h || !h.hasRisk) return null;
        const parts = [];
        if (h.ipOverlapUsers?.length) parts.push(`IP sobreposto: ${h.ipOverlapUsers.length} outra(s) conta(s)`);
        if (h.otherUsersForDestination?.length)
            parts.push(`Destino do saque ligado a outras contas: ${h.otherUsersForDestination.length}`);
        if (h.otherUsersForProfileWallet?.length)
            parts.push(`Carteira do perfil duplicada: ${h.otherUsersForProfileWallet.length} outra(s)`);
        return parts;
    };

    const loadActivity = useCallback(async (override: Partial<ActivityFiltersSnapshot> = {}) => {
        const f: ActivityFiltersSnapshot = { ...activityFiltersRef.current, ...override };
        try {
            setActivityLoading(true);
            const params = new URLSearchParams();
            params.set('limit', String(f.limit));
            params.set('page', String(f.page));
            if (f.type) params.set('type', f.type);
            if (String(f.hash || '').trim()) params.set('hash', String(f.hash).trim());
            if (String(f.q || '').trim()) params.set('q', String(f.q).trim());
            if (f.status) params.set('status', f.status);
            const activityRes = await api.get<{ ok: boolean; activity?: AdminFinanceActivityRow[]; total?: number }>(
                `/admin/finance/activity?${params.toString()}`
            );
            if (activityRes.data.ok) {
                setActivity(activityRes.data.activity || []);
                setActivityTotal(Number(activityRes.data.total) || 0);
                setActivityPage(f.page);
            }
        } catch (err) {
            console.error('Erro ao carregar atividade', err);
            toast.error('Erro ao carregar atividade financeira');
        } finally {
            setActivityLoading(false);
        }
    }, []);

    const loadTelegramSettings = useCallback(async () => {
        try {
            const [settingsRes, healthRes] = await Promise.all([
                api.get('/admin/finance/telegram/settings'),
                api.get('/admin/finance/telegram/health'),
            ]);
            if (settingsRes.data?.ok) setTelegramSettings(settingsRes.data.settings || {});
            if (healthRes.data?.ok) setTelegramHealth(healthRes.data.health || null);
        } catch (err) {
            toast.error('Erro ao carregar configurações de Telegram');
        }
    }, []);

    const loadTelegramEvents = useCallback(async () => {
        try {
            setTelegramLoadingEvents(true);
            const res = await api.get('/admin/finance/telegram/events?limit=25');
            if (res.data?.ok) setTelegramEvents(res.data.events || []);
        } catch (_err) {
            toast.error('Erro ao carregar eventos Telegram');
        } finally {
            setTelegramLoadingEvents(false);
        }
    }, []);

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true);
            const [withdrawalsRes, overviewRes, blkEcRes] = await Promise.all([
                api.get('/admin/withdrawals/pending'),
                api.get('/admin/finance/overview'),
                api.get('/admin/blk/economy')
            ]);

            if (withdrawalsRes.data.ok) setWithdrawals(withdrawalsRes.data.withdrawals || []);
            if (overviewRes.data.ok) setOverview(overviewRes.data.overview || {});
            await loadActivity();
            if (blkEcRes.data.ok && blkEcRes.data.economy) {
                const e = blkEcRes.data.economy as Record<string, unknown>;
                setBlkEconomyForm({
                    polPerBlk: String(e.polPerBlk ?? ''),
                    convertFeeBps: String(e.convertFeeBps ?? ''),
                    minConvertPol: String(e.minConvertPol ?? ''),
                    dailyConvertLimitBlk: e.dailyConvertLimitBlk != null && e.dailyConvertLimitBlk !== '' ? String(e.dailyConvertLimitBlk) : '',
                    convertCooldownSec: String(e.convertCooldownSec ?? ''),
                    blkCycleReward: String(e.blkCycleReward ?? ''),
                    blkCycleIntervalSec: String(e.blkCycleIntervalSec ?? ''),
                    blkCycleActivitySec: String(e.blkCycleActivitySec ?? ''),
                    blkCycleMinHashrate: String(e.blkCycleMinHashrate ?? ''),
                    blkCyclePaused: Boolean(e.blkCyclePaused),
                    blkCycleBoost: String(e.blkCycleBoost ?? ''),
                });
            }
        } catch (err) {
            console.error("Erro ao carregar dados financeiros", err);
            toast.error("Erro ao carregar dados financeiros");
        } finally {
            setIsLoading(false);
        }
    }, [loadActivity]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        loadTelegramSettings();
        loadTelegramEvents();
    }, [loadTelegramSettings, loadTelegramEvents]);

    const applyActivityFilters = () => {
        loadActivity({ page: 1 });
    };

    const openUserDetail = async (userId: number | string | null | undefined) => {
        if (userId == null || userId === '') return;
        const uid = typeof userId === 'number' ? userId : Number(userId);
        if (!Number.isFinite(uid)) return;
        setUserDetailModal({ userId: uid });
        setUserDetailData(null);
        setUserDetailLoading(true);
        try {
            const res = await api.get<UserFinanceDetailData & { ok: boolean; message?: string }>(`/admin/users/${uid}/details`);
            if (res.data.ok) setUserDetailData(res.data);
            else toast.error(res.data.message || 'Não foi possível carregar o utilizador');
        } catch (e: unknown) {
            toast.error(readAxiosResponseMessage(e) || 'Erro ao carregar detalhes');
        } finally {
            setUserDetailLoading(false);
        }
    };

    const activityTotalPages = Math.max(1, Math.ceil(activityTotal / activityLimit) || 1);

    const handleApprove = async (id: number) => {
        if (!confirm("Confirmar aprovação deste saque?")) return;
        try {
            const res = await api.post(`/admin/withdrawals/${id}/approve`);
            if (res.data.ok) {
                toast.success('Saque aprovado com sucesso!');
                fetchData();
            }
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao aprovar saque.');
        }
    };

    const handleReject = async (id: number) => {
        if (!confirm("Confirmar rejeição deste saque? Os fundos poderão ser devolvidos.")) return;
        try {
            const res = await api.post(`/admin/withdrawals/${id}/reject`);
            if (res.data.ok) {
                toast.success('Saque rejeitado.');
                fetchData();
            }
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao rejeitar saque.');
        }
    };

    const openCompleteModal = (w: AdminFinancePendingWithdrawal) => {
        setCompleteTxHash('');
        setCompleteModal({
            id: w.id,
            address: w.address,
            amount: w.amount,
            username: w.user?.username,
            userId: w.userId,
            status: w.status
        });
    };

    const submitCompleteWithdrawal = async () => {
        if (!completeModal) return;
        const h = completeTxHash.trim();
        if (!/^0x[a-fA-F0-9]{64}$/.test(h)) {
            toast.error('txHash obrigatório: 0x + 64 caracteres hexadecimais');
            return;
        }
        try {
            const res = await api.post(`/admin/withdrawals/${completeModal.id}/complete`, { txHash: h });
            if (res.data.ok) {
                toast.success('Saque concluído com txHash registado.');
                setCompleteModal(null);
                fetchData();
            }
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao concluir saque.');
        }
    };

    const saveBlkEconomy = async () => {
        if (!blkEconomyForm) return;
        try {
            const body = {
                polPerBlk: Number(blkEconomyForm.polPerBlk),
                convertFeeBps: Number(blkEconomyForm.convertFeeBps),
                minConvertPol: Number(blkEconomyForm.minConvertPol),
                convertCooldownSec: Number(blkEconomyForm.convertCooldownSec),
                dailyConvertLimitBlk: blkEconomyForm.dailyConvertLimitBlk === '' ? null : Number(blkEconomyForm.dailyConvertLimitBlk),
                blkCycleReward: Number(blkEconomyForm.blkCycleReward),
                blkCycleIntervalSec: Number(blkEconomyForm.blkCycleIntervalSec),
                blkCycleActivitySec: Number(blkEconomyForm.blkCycleActivitySec),
                blkCycleMinHashrate: Number(blkEconomyForm.blkCycleMinHashrate),
                blkCyclePaused: Boolean(blkEconomyForm.blkCyclePaused),
                blkCycleBoost: Number(blkEconomyForm.blkCycleBoost)
            };
            const res = await api.put('/admin/blk/economy', body);
            if (res.data.ok) toast.success('Economia BLK atualizada.');
            else toast.error(res.data.message || 'Erro');
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao salvar BLK');
        }
    };

    const saveTelegramSettings = async () => {
        toast.info('Telegram é configurado por variáveis de ambiente no backend/worker.');
    };

    const queueTelegramPrivateTest = async () => {
        try {
            setTelegramSaving(true);
            await api.post('/admin/finance/telegram/test-private-alert', {});
            toast.success('Teste privado enfileirado.');
            loadTelegramEvents();
            loadTelegramSettings();
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao enfileirar teste privado');
        } finally {
            setTelegramSaving(false);
        }
    };

    const queueTelegramPublicTest = async () => {
        const txHash = telegramTxHash.trim();
        if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
            toast.error('txHash inválido: use 0x + 64 caracteres hexadecimais');
            return;
        }
        try {
            setTelegramSaving(true);
            await api.post('/admin/finance/telegram/test-public-proof', { txHash });
            toast.success('Teste público enfileirado.');
            setTelegramTxHash('');
            loadTelegramEvents();
            loadTelegramSettings();
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao enfileirar teste público');
        } finally {
            setTelegramSaving(false);
        }
    };

    const retryTelegramEvent = async (eventId: number | string) => {
        try {
            await api.post(`/admin/finance/telegram/events/${eventId}/retry`);
            toast.success('Evento reenfileirado.');
            loadTelegramEvents();
            loadTelegramSettings();
        } catch (err: unknown) {
            toast.error(readAxiosResponseMessage(err) || 'Erro ao reenviar evento');
        }
    };

    if (isLoading && !overview) return <div className="p-8 text-slate-400 font-bold uppercase tracking-widest animate-pulse text-center py-40">Carregando financeiro...</div>;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Wallet className="w-6 h-6 text-emerald-500" /> Gestão Financeira
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">
                        Saques POL são manuais: copie o endereço de destino, envie da hot wallet e marque concluído com o hash da transação.
                    </p>
                </div>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700/50 w-fit"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Sincronizar
                </button>
            </div>

            {/* Overview Stats */}
            {overview && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                    <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-amber-500/10 text-amber-500">
                            <Wallet className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Saques Pendentes/Aprovados</p>
                            <h3 className="text-xl font-black text-white">{withdrawals.length}</h3>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500">
                            <ArrowUpCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Depositado (24h)</p>
                            <h3 className="text-xl font-black text-white">{Number(overview.deposits24h || 0).toFixed(2)} POL</h3>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-[2rem] shadow-lg flex items-center gap-4">
                        <div className="p-4 rounded-2xl bg-red-500/10 text-red-500">
                            <ArrowDownCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Sacado (24h)</p>
                            <h3 className="text-xl font-black text-white">{Number(overview.withdrawals24h || 0).toFixed(2)} POL</h3>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-2 sm:gap-4 sm:pb-px">
                <button
                    onClick={() => setTab('withdrawals')}
                    className={`rounded-xl px-4 py-2.5 font-black text-[11px] uppercase tracking-widest transition-all sm:rounded-none sm:px-6 sm:py-3 sm:text-xs ${tab === 'withdrawals' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 sm:bg-transparent sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:border-emerald-500' : 'border border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 sm:hover:bg-transparent'}`}
                >
                    Saques POL
                </button>
                <button
                    onClick={() => setTab('blk')}
                    className={`rounded-xl px-4 py-2.5 font-black text-[11px] uppercase tracking-widest transition-all sm:rounded-none sm:px-6 sm:py-3 sm:text-xs ${tab === 'blk' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 sm:bg-transparent sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:border-emerald-500' : 'border border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 sm:hover:bg-transparent'}`}
                >
                    Economia BLK
                </button>
                <button
                    onClick={() => setTab('activity')}
                    className={`rounded-xl px-4 py-2.5 font-black text-[11px] uppercase tracking-widest transition-all sm:rounded-none sm:px-6 sm:py-3 sm:text-xs ${tab === 'activity' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 sm:bg-transparent sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:border-emerald-500' : 'border border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 sm:hover:bg-transparent'}`}
                >
                    Atividade Recente
                </button>
                <button
                    onClick={() => setTab('telegram')}
                    className={`rounded-xl px-4 py-2.5 font-black text-[11px] uppercase tracking-widest transition-all sm:rounded-none sm:px-6 sm:py-3 sm:text-xs ${tab === 'telegram' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 sm:bg-transparent sm:border-x-0 sm:border-t-0 sm:border-b-2 sm:border-emerald-500' : 'border border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 sm:hover:bg-transparent'}`}
                >
                    Telegram
                </button>
            </div>

            {/* Content */}
            {tab === 'withdrawals' && (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-6 py-4">Data</th>
                                    <th className="px-6 py-4">Usuário</th>
                                    <th className="px-6 py-4">Destino do saque</th>
                                    <th className="px-6 py-4">Carteira no perfil</th>
                                    <th className="px-6 py-4">Valor</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800 font-medium">
                                {withdrawals.map((w) => (
                                    <tr key={w.id} className="hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-5 text-xs whitespace-nowrap">
                                            {(() => {
                                                const ts = w.created_at ?? w.createdAt;
                                                return ts != null && ts !== '' ? new Date(ts as string | number | Date).toLocaleString() : '—';
                                            })()}
                                        </td>
                                        <td className="px-6 py-5 align-top">
                                            <span className="text-white font-bold text-xs block">{w.user?.username || `User #${w.userId}`}</span>
                                            {w.user?.email ? (
                                                <span className="text-[10px] text-slate-500 block truncate max-w-[140px]" title={w.user.email}>{w.user.email}</span>
                                            ) : null}
                                            {(w.user?.registrationIp || w.user?.ip) && (
                                                <div className="mt-1 text-[9px] text-slate-600 font-mono space-y-0.5">
                                                    {w.user?.registrationIp ? <div title="IP no registo">Reg: {w.user.registrationIp}</div> : null}
                                                    {w.user?.ip ? <div title="Último IP">IP: {w.user.ip}</div> : null}
                                                </div>
                                            )}
                                            {w.collisionHints?.hasRisk ? (
                                                <div className="mt-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-2 py-1.5 text-[9px] text-amber-100/95 space-y-1">
                                                    <p className="flex items-center gap-1 font-black uppercase tracking-wider text-amber-400">
                                                        <AlertTriangle className="w-3 h-3 shrink-0" /> Multi-conta / carteiras
                                                    </p>
                                                    <ul className="list-disc pl-3 space-y-0.5 text-amber-100/90">
                                                        {(formatCollisionHints(w.collisionHints) || []).map((line, i) => (
                                                            <li key={i}>{line}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-5 max-w-[220px]">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] font-mono text-slate-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 break-all">{w.address}</span>
                                                    <button type="button" onClick={() => copyText(w.address, 'Destino copiado')} className="p-1.5 shrink-0 text-slate-500 hover:text-emerald-400 transition-colors" title="Copiar destino">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <a
                                                        href={`https://polygonscan.com/address/${encodeURIComponent(w.address)}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="p-1.5 shrink-0 text-slate-500 hover:text-sky-400 transition-colors"
                                                        title="Polygonscan"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                </div>
                                                <span className="text-[9px] text-slate-600">Envie POL para este endereço</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 max-w-[200px]">
                                            {w.user?.walletAddress ? (
                                                <div className="flex items-start gap-1">
                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950/80 px-2 py-1 rounded border border-slate-800/80 break-all">{w.user.walletAddress}</span>
                                                    <button type="button" onClick={() => copyText(w.user?.walletAddress ?? '', 'Carteira do perfil copiada')} className="p-1.5 shrink-0 text-slate-500 hover:text-emerald-400 transition-colors" title="Copiar">
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-600 italic">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className="text-amber-500 font-black">{Number(w.amount).toFixed(4)} POL</span>
                                        </td>
                                        <td className="px-6 py-5">
                                            {w.status === 'pending' ? (
                                                <span className="text-[9px] font-black uppercase px-2 py-1 bg-amber-500/10 text-amber-500 rounded">Pendente</span>
                                            ) : (
                                                <span className="text-[9px] font-black uppercase px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded">Aprovado</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex flex-wrap gap-2 justify-end">
                                                {w.status === 'pending' && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleApprove(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" /> Aprovar
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleReject(w.id)}
                                                            className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                        >
                                                            <XCircle className="w-3 h-3" /> Rejeitar
                                                        </button>
                                                    </>
                                                )}
                                                {w.status === 'approved' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleReject(w.id)}
                                                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
                                                    >
                                                        <XCircle className="w-3 h-3" /> Rejeitar
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => openCompleteModal(w)}
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-sky-500 border border-sky-400/20 hover:bg-sky-400 text-white rounded-lg transition-all text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-500/20"
                                                >
                                                    <CheckCircle2 className="w-3 h-3" /> Concluir (tx)
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {withdrawals.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-8 py-12 text-center text-slate-500 italic font-medium">
                                            Não há saques POL pendentes.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {completeModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-4">
                        <h3 className="text-lg font-black text-white">Concluir saque manual</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Depois de enviar <span className="text-amber-400 font-bold">{Number(completeModal.amount).toFixed(4)} POL</span> da hot wallet para o destino abaixo, cole o hash da transação (Polygon).
                        </p>
                        <div className="space-y-1">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Destino</span>
                            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                                <code className="text-[11px] font-mono text-slate-300 break-all flex-1">{completeModal.address}</code>
                                <button type="button" onClick={() => copyText(completeModal.address, 'Destino copiado')} className="p-2 text-slate-400 hover:text-white shrink-0">
                                    <Copy className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        <label className="block space-y-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">txHash (obrigatório)</span>
                            <input
                                type="text"
                                value={completeTxHash}
                                onChange={(e) => setCompleteTxHash(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder:text-slate-600"
                                autoComplete="off"
                            />
                        </label>
                        {/^0x[a-fA-F0-9]{64}$/.test(completeTxHash.trim()) && (
                            <a
                                href={`https://polygonscan.com/tx/${completeTxHash.trim()}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                            >
                                Ver no Polygonscan <ExternalLink className="w-3 h-3" />
                            </a>
                        )}
                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={() => setCompleteModal(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={submitCompleteWithdrawal}
                                className="px-4 py-2 rounded-xl text-xs font-black uppercase bg-sky-600 hover:bg-sky-500 text-white"
                            >
                                Guardar concluído
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {userDetailModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <h3 className="text-lg font-black text-white">Utilizador #{userDetailModal.userId}</h3>
                            <button
                                type="button"
                                onClick={() => {
                                    setUserDetailModal(null);
                                    setUserDetailData(null);
                                }}
                                className="text-slate-500 hover:text-white text-sm font-bold px-2"
                            >
                                Fechar
                            </button>
                        </div>
                        {userDetailLoading && <p className="text-sm text-slate-500 animate-pulse">A carregar…</p>}
                        {!userDetailLoading && userDetailData?.user && (
                            <div className="space-y-4 text-xs text-slate-300">
                                <div className="grid gap-2">
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Nome</span>
                                        <br />
                                        <span className="text-white font-semibold">{userDetailData.user.name}</span>
                                    </p>
                                    {userDetailData.user.username && (
                                        <p>
                                            <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Username</span>
                                            <br />
                                            @{userDetailData.user.username}
                                        </p>
                                    )}
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Email</span>
                                        <br />
                                        <span className="break-all">{userDetailData.user.email}</span>
                                    </p>
                                    {userDetailData.user.walletAddress && (
                                        <p>
                                            <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Carteira (perfil)</span>
                                            <br />
                                            <code className="text-[11px] font-mono break-all">{userDetailData.user.walletAddress}</code>
                                            <button
                                                type="button"
                                                onClick={() => copyText(userDetailData.user.walletAddress, 'Carteira copiada')}
                                                className="ml-2 text-emerald-400 text-[10px] font-bold uppercase"
                                            >
                                                Copiar
                                            </button>
                                        </p>
                                    )}
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">POL saldo</span>
                                        <br />
                                        <span className="font-mono text-amber-400">{Number(userDetailData.user.polBalance ?? 0).toFixed(4)} POL</span>
                                    </p>
                                    <p className="flex flex-wrap gap-2">
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Estado</span>
                                        {userDetailData.user.isBanned ? (
                                            <span className="text-red-400 font-black uppercase">Banido</span>
                                        ) : (
                                            <span className="text-emerald-400 font-black uppercase">Ativo</span>
                                        )}
                                    </p>
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">IPs</span>
                                        <br />
                                        Último: {userDetailData.user.ip || '—'} · Registo: {userDetailData.user.registrationIp || '—'}
                                    </p>
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Conta criada</span>
                                        <br />
                                        {userDetailData.user.createdAt ? new Date(userDetailData.user.createdAt).toLocaleString() : '—'}
                                    </p>
                                    <p>
                                        <span className="text-slate-500 font-bold uppercase text-[10px] tracking-wider">Último login</span>
                                        <br />
                                        {userDetailData.user.lastLoginAt ? new Date(userDetailData.user.lastLoginAt).toLocaleString() : '—'}
                                    </p>
                                </div>
                                {userDetailData.metrics && (
                                    <div className="border border-slate-800 rounded-xl p-3 space-y-1 bg-slate-950/50">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Métricas</p>
                                        <p>Máquinas ativas: {userDetailData.metrics.activeMachines ?? '—'}</p>
                                        <p>Hash rate: {Number(userDetailData.metrics.realHashRate || 0).toFixed(2)}</p>
                                        <p>Claims faucet (total): {userDetailData.metrics.faucetClaims ?? '—'}</p>
                                    </div>
                                )}
                                {Array.isArray(userDetailData.recentTransactions) && userDetailData.recentTransactions.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Últimas transações</p>
                                        <ul className="space-y-1 text-[11px] font-mono text-slate-400">
                                            {userDetailData.recentTransactions.slice(0, 5).map((rt) => (
                                                <li key={rt.id}>
                                                    {rt.type} · {Number(rt.amount).toFixed(4)} · {rt.status} ·{' '}
                                                    {rt.createdAt ? new Date(rt.createdAt).toLocaleDateString() : ''}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <Link
                                    to="/admin/users"
                                    className="inline-block text-sky-400 hover:text-sky-300 text-[11px] font-bold uppercase tracking-wider"
                                >
                                    Abrir lista de utilizadores →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {tab === 'telegram' && telegramSettings && (
                <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            ['Automação', telegramSettings.enabled],
                            ['Bot token', telegramSettings.botTokenConfigured],
                            ['Chat privado', telegramSettings.privateChatConfigured],
                            ['Canal público', telegramSettings.publicChatConfigured],
                            ['Tópico público', telegramSettings.publicThreadConfigured],
                            ['Screenshot', telegramSettings.screenshotEnabled],
                            ['Worker/fila', telegramHealth?.configured],
                            ['Token legado no DB', !telegramSettings.legacyDbTokenPresent],
                        ].map(([label, ok]) => (
                            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
                                <p className={`mt-2 text-xs font-black uppercase ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {ok ? 'OK' : 'Pendente'}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 space-y-5">
                            <div className="flex items-start gap-3">
                                <div className="rounded-2xl bg-sky-500/10 p-3 text-sky-400">
                                    <Bell className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Automação de saques no Telegram</h3>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                                        Configuração via ambiente: o token não é exibido nem editado pela interface.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white">
                                        <Bot className="w-4 h-4 text-amber-400" /> Alerta privado
                                    </div>
                                    <dl className="mt-3 space-y-2 text-xs text-slate-300">
                                        <div><dt className="text-slate-500">Env</dt><dd>TELEGRAM_WITHDRAWAL_ALERTS_ENABLED={String(telegramSettings.privateAlertsEnabled)}</dd></div>
                                        <div><dt className="text-slate-500">Chat ID</dt><dd className="break-all font-mono">{telegramSettings.privateChatId || 'não configurado'}</dd></div>
                                    </dl>
                                    <button type="button" onClick={queueTelegramPrivateTest} disabled={telegramSaving} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-amber-500 disabled:opacity-60">
                                        {telegramSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                                        Testar alerta privado
                                    </button>
                                </div>

                                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white">
                                        <Camera className="w-4 h-4 text-emerald-400" /> Prova pública
                                    </div>
                                    <dl className="mt-3 space-y-2 text-xs text-slate-300">
                                        <div><dt className="text-slate-500">Env</dt><dd>TELEGRAM_PUBLIC_PROOFS_ENABLED={String(telegramSettings.publicProofsEnabled)}</dd></div>
                                        <div><dt className="text-slate-500">Chat ID</dt><dd className="break-all font-mono">{telegramSettings.publicChatId || 'não configurado'}</dd></div>
                                        <div><dt className="text-slate-500">message_thread_id</dt><dd className="break-all font-mono">{telegramSettings.publicThreadId || 'sem tópico'}</dd></div>
                                        <div><dt className="text-slate-500">Polygonscan</dt><dd className="break-all font-mono">{telegramSettings.polygonscanBaseUrl}</dd></div>
                                    </dl>
                                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="text"
                                            value={telegramTxHash}
                                            onChange={(e) => setTelegramTxHash(e.target.value)}
                                            placeholder="0x... txHash para teste"
                                            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-white"
                                            autoComplete="off"
                                        />
                                        <button type="button" onClick={queueTelegramPublicTest} disabled={telegramSaving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500 disabled:opacity-60">
                                            <Camera className="w-3 h-3" /> Testar prova
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                                Defina TELEGRAM_BOT_TOKEN, TELEGRAM_PRIVATE_WITHDRAWAL_ALERT_CHAT_ID, TELEGRAM_PUBLIC_PROOF_CHAT_ID e TELEGRAM_PUBLIC_PROOF_THREAD_ID no ambiente do app e do worker. Chat IDs são strings e preservam prefixos como -100.
                            </div>

                            <button
                                type="button"
                                onClick={saveTelegramSettings}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-200 hover:bg-slate-700 sm:w-auto"
                            >
                                <Save className="w-4 h-4" /> Como configurar
                            </button>
                        </div>

                        <div className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
                            <div className="flex items-center justify-between gap-3">
                                <h4 className="text-xs font-black uppercase tracking-widest text-white">Fila Telegram</h4>
                                <button type="button" onClick={() => { loadTelegramEvents(); loadTelegramSettings(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:bg-slate-800">
                                    <RefreshCw className={`w-3 h-3 ${telegramLoadingEvents ? 'animate-spin' : ''}`} /> Atualizar
                                </button>
                            </div>
                            {telegramHealth?.queue && (
                                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-black uppercase">
                                    {Object.entries(telegramHealth.queue).filter(([k]) => k !== 'lastSent').map(([k, v]) => (
                                        <div key={k} className="rounded-xl bg-slate-950 p-2 text-slate-300">
                                            <div className="text-slate-500">{k}</div>
                                            <div>{String(v)}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="max-h-[480px] overflow-y-auto overflow-x-auto rounded-2xl border border-slate-800">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-950 text-[9px] uppercase tracking-widest text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2">Tipo</th>
                                            <th className="px-3 py-2">Status</th>
                                            <th className="px-3 py-2">Tent.</th>
                                            <th className="px-3 py-2">Erro</th>
                                            <th className="px-3 py-2">Data</th>
                                            <th className="px-3 py-2"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-slate-300">
                                        {telegramEvents.map((ev) => (
                                            <tr key={ev.id}>
                                                <td className="px-3 py-2 break-all">{ev.type}</td>
                                                <td className="px-3 py-2 font-black uppercase">{ev.status}</td>
                                                <td className="px-3 py-2">{ev.attempts}</td>
                                                <td className="px-3 py-2 max-w-[180px] truncate" title={ev.lastError || ''}>{ev.lastError || '—'}</td>
                                                <td className="px-3 py-2 whitespace-nowrap">{ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}</td>
                                                <td className="px-3 py-2 text-right">
                                                    {['failed', 'dead'].includes(String(ev.status ?? '')) && (
                                                        <button type="button" onClick={() => retryTelegramEvent(ev.id)} className="rounded-lg bg-sky-600 px-2 py-1 text-[9px] font-black uppercase text-white hover:bg-sky-500">
                                                            Reenviar
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {telegramEvents.length === 0 && (
                                            <tr><td colSpan={6} className="px-3 py-10 text-center text-slate-500">Nenhum evento Telegram.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'blk' && (
                <div className="space-y-8">
                    {blkEconomyForm && (
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">Economia BLK (1 BLK ≈ 1 USD)</h3>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                BLK não é sacável — conversão POL → BLK, recompensa por tempo (pool) e uso interno (loja / perks).
                            </p>
                            <div className="flex flex-wrap gap-3 items-center pb-2 border-b border-slate-800/80">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!confirm('Disparar distribuição BLK do ciclo atual (idempotente)?')) return;
                                        try {
                                            const res = await api.post('/admin/mining/blk-cycle/run');
                                            if (res.data.ok) {
                                                const r = res.data.result || {};
                                                toast.success(
                                                    r.skipped
                                                        ? `Ciclo BLK: ${r.skipped}`
                                                        : `Ciclo BLK OK${r.cycleId != null ? ` #${r.cycleId}` : ''}`
                                                );
                                            }
                                            else toast.error('Falhou');
                                            fetchData();
                                        } catch (err: unknown) {
                                            toast.error(readAxiosResponseMessage(err) || 'Erro');
                                        }
                                    }}
                                    className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase"
                                >
                                    Rodar ciclo BLK agora
                                </button>
                                <span className="text-[9px] text-slate-600">Cron UTC a cada 10 min; manual usa a mesma janela.</span>
                            </div>
                            <h4 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest pt-2">Emissão BLK (pool / 10 min)</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">BLK / ciclo (base)</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleReward}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleReward: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Duração ciclo (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleIntervalSec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleIntervalSec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Janela atividade (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleActivitySec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleActivitySec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Hashrate mínimo</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleMinHashrate}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleMinHashrate: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Boost (multiplier)</span>
                                    <input
                                        type="number"
                                        step="any"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.blkCycleBoost}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCycleBoost: e.target.value } : p))}
                                    />
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer pt-6">
                                    <input
                                        type="checkbox"
                                        checked={blkEconomyForm.blkCyclePaused}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, blkCyclePaused: e.target.checked } : p))}
                                        className="rounded border-slate-600"
                                    />
                                    <span className="text-slate-500 font-bold">Pausar emissão BLK</span>
                                </label>
                            </div>
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest pt-4">Conversão POL → BLK</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">POL por 1 BLK</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.polPerBlk}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, polPerBlk: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Fee conversão (bps, 500 = 5%)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.convertFeeBps}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, convertFeeBps: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Mín. POL conversão</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.minConvertPol}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, minConvertPol: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Cooldown conversão (s)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.convertCooldownSec}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, convertCooldownSec: e.target.value } : p))}
                                    />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-slate-500 font-bold">Limite diário conversão (BLK, vazio = ∞)</span>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
                                        value={blkEconomyForm.dailyConvertLimitBlk}
                                        onChange={(e) => setBlkEconomyForm((p) => (p ? { ...p, dailyConvertLimitBlk: e.target.value } : p))}
                                        placeholder="∞"
                                    />
                                </label>
                            </div>
                            <button
                                type="button"
                                onClick={saveBlkEconomy}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase"
                            >
                                Salvar economia BLK
                            </button>
                        </div>
                    )}
                </div>
            )}

            {tab === 'activity' && (
                <div className="space-y-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <Filter className="w-4 h-4 text-emerald-500" />
                            Filtros da atividade
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { id: '', label: 'Todos' },
                                { id: 'deposit', label: 'Só depósitos' },
                                { id: 'withdrawal', label: 'Só saques' },
                            ].map((b) => (
                                <button
                                    key={b.id || 'all'}
                                    type="button"
                                    onClick={() => setActivityType(b.id)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                                        activityType === b.id
                                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                                    }`}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            <label className="space-y-1 block">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hash (contém)</span>
                                <input
                                    type="text"
                                    value={activityHash}
                                    onChange={(e) => setActivityHash(e.target.value)}
                                    placeholder="0x… ou parte do hash"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-600"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="space-y-1 block">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Utilizador (id, email, @)</span>
                                <input
                                    type="text"
                                    value={activityUserQ}
                                    onChange={(e) => setActivityUserQ(e.target.value)}
                                    placeholder="481 ou email"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="space-y-1 block">
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Status</span>
                                <select
                                    value={activityStatus}
                                    onChange={(e) => setActivityStatus(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                                >
                                    <option value="">Qualquer</option>
                                    <option value="completed">completed</option>
                                    <option value="pending">pending</option>
                                    <option value="approved">approved</option>
                                    <option value="rejected">rejected</option>
                                </select>
                            </label>
                            <div className="flex items-end gap-2">
                                <button
                                    type="button"
                                    onClick={applyActivityFilters}
                                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase"
                                >
                                    Aplicar filtros
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityType('');
                                        setActivityHash('');
                                        setActivityUserQ('');
                                        setActivityStatus('');
                                        loadActivity({ page: 1, type: '', hash: '', q: '', status: '' });
                                    }}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold uppercase border border-slate-700"
                                >
                                    Limpar
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-600 font-medium">
                            {activityTotal} registo(s) · página {activityPage} de {activityTotalPages}
                            {activityLoading ? ' · a carregar…' : ''}
                        </p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-400">
                                <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-6 py-4">Data</th>
                                        <th className="px-6 py-4">Tipo</th>
                                        <th className="px-6 py-4">Usuário</th>
                                        <th className="px-6 py-4 min-w-[200px]">Tx / explorador</th>
                                        <th className="px-6 py-4 min-w-[220px]">Carteiras on-chain</th>
                                        <th className="px-6 py-4">Valor</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 font-medium">
                                    {activity.map((t) => {
                                        const uid = t.user_id ?? t.userId;
                                        const tx = t.tx_hash ?? t.txHash;
                                        const txStr = tx != null ? String(tx).trim() : '';
                                        const shortHash =
                                            txStr && txStr.length > 18 ? `${txStr.slice(0, 10)}…${txStr.slice(-6)}` : txStr || '';
                                        const fullTx = /^0x[a-fA-F0-9]{64}$/i.test(txStr);
                                        const fromAddr = t.from_address ?? t.fromAddress;
                                        const toAddr = t.toAddress ?? t.address;
                                        return (
                                            <tr key={t.id} className="hover:bg-slate-800/30 transition-colors align-top">
                                                <td className="px-6 py-4 text-xs whitespace-nowrap">
                                                    {(() => {
                                                        const ts = t.created_at ?? t.createdAt;
                                                        return ts != null && ts !== ''
                                                            ? new Date(ts as string | number | Date).toLocaleString()
                                                            : '—';
                                                    })()}
                                                    <span className="block text-[9px] text-slate-600 font-mono mt-1">ID #{t.id}</span>
                                                </td>
                                                <td className="px-6 py-4 text-xs uppercase font-bold tracking-widest">
                                                    {t.type === 'deposit' ? (
                                                        <span className="text-emerald-500 flex items-center gap-1">
                                                            <ArrowDownCircle className="w-3 h-3 shrink-0" /> Depósito
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-500 flex items-center gap-1">
                                                            <ArrowUpCircle className="w-3 h-3 shrink-0" /> Saque
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-white min-w-[140px]">
                                                    <span className="font-bold block">
                                                        {t.user?.username ? `@${t.user.username}` : `User #${uid}`}
                                                    </span>
                                                    {t.user?.email && (
                                                        <span className="text-[10px] text-slate-500 block truncate max-w-[180px]" title={t.user.email}>
                                                            {t.user.email}
                                                        </span>
                                                    )}
                                                    {t.user?.walletAddress ? (
                                                        <div className="mt-1.5 text-[9px] text-slate-600">
                                                            <span className="font-bold uppercase text-slate-500">Carteira perfil</span>
                                                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                                                                <span className="font-mono text-slate-400 break-all max-w-[160px]">
                                                                    {t.user.walletAddress.length > 24
                                                                        ? `${t.user.walletAddress.slice(0, 10)}…${t.user.walletAddress.slice(-6)}`
                                                                        : t.user.walletAddress}
                                                                </span>
                                                                {isPolygonEvmAddress(t.user.walletAddress) ? (
                                                                    <a
                                                                        href={polygonAddressUrl(t.user.walletAddress)}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-sky-500 hover:text-sky-400 shrink-0"
                                                                        title="Polygonscan perfil"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </td>
                                                <td className="px-6 py-4 text-[10px] font-mono max-w-[220px]">
                                                    {txStr ? (
                                                        <div className="space-y-1">
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                <span className="break-all text-slate-300" title={txStr}>
                                                                    {shortHash}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyText(txStr, 'Hash copiado')}
                                                                    className="p-1 text-slate-500 hover:text-emerald-400 shrink-0"
                                                                    title="Copiar hash"
                                                                >
                                                                    <Copy className="w-3 h-3" />
                                                                </button>
                                                                {fullTx ? (
                                                                    <a
                                                                        href={polygonTxUrl(txStr)}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="p-1 text-slate-500 hover:text-sky-400 shrink-0 inline-flex"
                                                                        title="Abrir tx no Polygonscan"
                                                                    >
                                                                        <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                ) : (
                                                                    <a
                                                                        href={polygonSearchUrl(txStr)}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="text-[9px] font-bold uppercase text-sky-500 hover:text-sky-400 shrink-0"
                                                                        title="Procurar no Polygonscan"
                                                                    >
                                                                        Buscar
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-600">—</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-[10px] max-w-[260px] text-slate-400 flex flex-col gap-2">
                                                    <ActivityAddressLine label="Origem (from)" value={fromAddr} onCopy={copyText} />
                                                    <ActivityAddressLine
                                                        label={t.type === 'withdrawal' ? 'Destino do saque' : 'Endereço / destino'}
                                                        value={toAddr}
                                                        onCopy={copyText}
                                                    />
                                                    {!fromAddr && !toAddr ? <span className="text-slate-600">—</span> : null}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-slate-300 whitespace-nowrap">
                                                    {Number(t.amount).toFixed(4)} POL
                                                </td>
                                                <td className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">
                                                    {t.status === 'completed' || t.status === 'approved' ? (
                                                        <span className="text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Completo</span>
                                                    ) : t.status === 'pending' ? (
                                                        <span className="text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Pendente</span>
                                                    ) : (
                                                        <span className="text-red-500 bg-red-500/10 px-2 py-1 rounded">{t.status}</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => openUserDetail(uid ?? undefined)}
                                                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold uppercase text-slate-200 border border-slate-700"
                                                    >
                                                        <User className="w-3 h-3" />
                                                        Perfil
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {activity.length === 0 && !activityLoading && (
                                        <tr>
                                            <td colSpan={8} className="px-8 py-12 text-center text-slate-500 italic">
                                                Nenhuma transação encontrada.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {activityTotalPages > 1 && (
                            <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-slate-800 bg-slate-950/40">
                                <button
                                    type="button"
                                    disabled={activityPage <= 1 || activityLoading}
                                    onClick={() => loadActivity({ page: activityPage - 1 })}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 disabled:opacity-40 border border-slate-700"
                                >
                                    Anterior
                                </button>
                                <span className="text-xs text-slate-500 font-medium">
                                    Página {activityPage} / {activityTotalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={activityPage >= activityTotalPages || activityLoading}
                                    onClick={() => loadActivity({ page: activityPage + 1 })}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 disabled:opacity-40 border border-slate-700"
                                >
                                    Seguinte
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
