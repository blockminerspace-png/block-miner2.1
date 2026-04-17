import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, RefreshCw, Search, ExternalLink, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../store/auth';

function isPolygonAddr(s) {
    return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(s.trim());
}

export default function AdminFraudSignals() {
    const { t } = useTranslation();
    const [scope, setScope] = useState('all');
    const [q, setQ] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [payload, setPayload] = useState(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            params.set('scope', scope);
            if (appliedQ.trim()) params.set('q', appliedQ.trim());
            const res = await api.get(`/admin/fraud-signals?${params.toString()}`);
            if (res.data.ok) setPayload(res.data);
            else toast.error(res.data.message || t('admin_fraud.error_load'));
        } catch (e) {
            console.error(e);
            toast.error(t('admin_fraud.error_load'));
        } finally {
            setLoading(false);
        }
    }, [scope, appliedQ, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const copyText = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast.success(t('admin_fraud.copied'));
    };

    const kindLabel = (kind) => t(`admin_fraud.kind_${kind}`, { defaultValue: kind });

    return (
        <div className="space-y-8 animate-in fade-in duration-500 p-4 md:p-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Fingerprint className="w-7 h-7 text-amber-500" />
                        {t('admin_fraud.title')}
                    </h2>
                    <p className="text-slate-500 text-sm font-medium mt-1 max-w-2xl">{t('admin_fraud.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700/50 w-fit"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    {t('admin_fraud.refresh')}
                </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('admin_fraud.filter_scope')}</p>
                <div className="flex flex-wrap gap-2">
                    {[
                        { id: 'all', labelKey: 'admin_fraud.scope_all' },
                        { id: 'wallets', labelKey: 'admin_fraud.scope_wallets' },
                        { id: 'ips', labelKey: 'admin_fraud.scope_ips' },
                        { id: 'chain', labelKey: 'admin_fraud.scope_chain' },
                    ].map((b) => (
                        <button
                            key={b.id}
                            type="button"
                            onClick={() => setScope(b.id)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                                scope === b.id
                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            {t(b.labelKey)}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                    <label className="flex-1 space-y-1">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('admin_fraud.search_label')}</span>
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder={t('admin_fraud.search_placeholder')}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-600 font-mono"
                            autoComplete="off"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => {
                            setAppliedQ(q);
                        }}
                        className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase shrink-0"
                    >
                        <Search className="w-4 h-4" />
                        {t('admin_fraud.search_run')}
                    </button>
                </div>
                {payload?.generatedAt && (
                    <p className="text-[10px] text-slate-600">
                        {t('admin_fraud.generated_at', { time: new Date(payload.generatedAt).toLocaleString() })}
                    </p>
                )}
            </div>

            {loading && !payload ? (
                <div className="text-center py-20 text-slate-500 font-bold uppercase tracking-widest animate-pulse">{t('admin_fraud.loading')}</div>
            ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-400">
                            <thead className="bg-slate-800/30 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                                <tr>
                                    <th className="px-6 py-4">{t('admin_fraud.col_kind')}</th>
                                    <th className="px-6 py-4">{t('admin_fraud.col_key')}</th>
                                    <th className="px-6 py-4">{t('admin_fraud.col_accounts')}</th>
                                    <th className="px-6 py-4">{t('admin_fraud.col_users')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {(payload?.signals || []).map((sig, idx) => (
                                    <tr key={`${sig.kind}-${sig.key}-${idx}`} className="hover:bg-slate-800/30 align-top">
                                        <td className="px-6 py-4 text-xs font-black uppercase text-amber-500/90 whitespace-nowrap">
                                            {kindLabel(sig.kind)}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-slate-300 max-w-[280px]">
                                            <div className="flex flex-wrap items-center gap-1">
                                                <span className="break-all" title={sig.key}>
                                                    {sig.key}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => copyText(sig.key)}
                                                    className="p-1 text-slate-500 hover:text-emerald-400 shrink-0"
                                                    title={t('admin_fraud.copy')}
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                                {isPolygonAddr(sig.key) ? (
                                                    <a
                                                        href={`https://polygonscan.com/address/${encodeURIComponent(sig.key.trim())}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="p-1 text-sky-500 hover:text-sky-400 shrink-0"
                                                        title="Polygonscan"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-white whitespace-nowrap">{sig.userCount}</td>
                                        <td className="px-6 py-4 text-xs text-slate-300">
                                            <ul className="space-y-1.5">
                                                {(sig.users || []).map((u) => (
                                                    <li key={u.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                        <span className="font-mono text-amber-200/90">#{u.id}</span>
                                                        <span className="text-slate-400">{u.email}</span>
                                                        {u.username ? <span className="text-slate-500">@{u.username}</span> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                    </tr>
                                ))}
                                {(!payload?.signals || payload.signals.length === 0) && !loading && (
                                    <tr>
                                        <td colSpan="4" className="px-8 py-14 text-center text-slate-500 italic">
                                            {t('admin_fraud.empty')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
