import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Fingerprint, RefreshCw, Search, ExternalLink, Copy, ShieldAlert, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../store/auth';
import { readAxiosResponseMessage } from './admin.api';

function isPolygonAddr(s: unknown): boolean {
  return typeof s === 'string' && /^0x[a-fA-F0-9]{40}$/i.test(s.trim());
}

const scopeButtons: [string, string][] = [
  ['all', 'scope_all'],
  ['wallets', 'scope_wallets'],
  ['ips', 'scope_ips'],
  ['devices', 'scope_devices'],
  ['ip_network', 'scope_ip_network'],
  ['asn', 'scope_asn'],
  ['chain', 'scope_chain'],
  ['high_risk', 'scope_high_risk'],
  ['low_confidence', 'scope_low_confidence'],
  ['false_positive', 'scope_false_positive'],
  ['shared_residential', 'scope_shared_residential'],
];

const RESET_FRAUD_COLLECTION_PHRASE = 'RESET_FRAUD_COLLECTION';

const riskClass: Record<'low' | 'medium' | 'high' | 'critical', string> = {
  low: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
  medium: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  high: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
  critical: 'text-red-300 bg-red-500/10 border-red-500/20',
};

type FraudIpIntel = {
  normalizedIp?: string | null;
  asn?: number | string | null;
  asnOrg?: string | null;
  providerLabel?: string | null;
  reverseDns?: string | null;
  proxyDetected?: boolean;
  proxyCheckedAt?: string | null;
  proxyType?: string | null;
  proxyRiskScore?: number | null;
  providerType?: string | null;
  confidence?: string | null;
  reverseDnsForwardConfirmed?: boolean;
  networkCidr?: string | null;
};

type FraudSignalUser = {
  id: number;
  email?: string | null;
  username?: string | null;
  walletAddress?: string | null;
};

type FraudRiskLevel = keyof typeof riskClass;

type FraudIpResolution = {
  storedIp?: string | null;
  isInfrastructure?: boolean;
  ignoredForFraudScore?: boolean;
  note?: string | null;
};

type FraudSignalRow = {
  id: string | number;
  kind: string;
  key?: string | null;
  value?: string | null;
  riskLevel: FraudRiskLevel | string;
  riskScore: number;
  confidence: string;
  userCount: number;
  recommendedAction: string;
  ipIntelligence?: FraudIpIntel | null;
  ipResolution?: FraudIpResolution | null;
  strongSignals?: string[];
  weakSignals?: string[];
  reasons?: string[];
  falsePositiveWarnings?: string[];
  users?: FraudSignalUser[];
};

type FraudSignalsPayload = {
  total?: number;
  limit?: number;
  generatedAt?: string;
  signals: FraudSignalRow[];
};

type FraudSignalsListResponse = { ok: true } & FraudSignalsPayload | { ok: false; message?: string };

type FraudResetResponse = {
  ok?: boolean;
  message?: string;
  ipLogsDeleted?: number;
  ipIntelDeleted?: number;
  usersProfileAntiFraudCleared?: number;
};

function CopyButton({ value, label }: { value: string | number; label?: string }) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(String(value));
        toast.success(t('admin_fraud.copied'));
      }}
      className="p-1 text-slate-500 hover:text-emerald-400 shrink-0"
      title={label || t('admin_fraud.copy')}
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

function SignalValue({ sig }: { sig: FraudSignalRow }) {
  const value = sig.value || sig.key || '';
  const str = String(value);
  return (
    <div className="flex flex-wrap items-center gap-1 max-w-[360px]">
      <span className="break-all font-mono text-xs text-slate-200" title={str}>
        {str}
      </span>
      <CopyButton value={str} />
      {isPolygonAddr(str) ? (
        <a
          href={`https://polygonscan.com/address/${encodeURIComponent(str.trim())}`}
          target="_blank"
          rel="noreferrer"
          className="p-1 text-sky-500 hover:text-sky-400 shrink-0"
          title="Polygonscan"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function IpResolutionBanner({ resolution }: { resolution: FraudIpResolution | null | undefined }) {
  if (!resolution?.isInfrastructure && !resolution?.ignoredForFraudScore) return null;
  return (
    <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
      <p className="font-black uppercase text-[10px] text-sky-300 tracking-widest">Infrastructure / proxy</p>
      <p className="mt-1 leading-relaxed">
        {resolution.note ||
          'This IP belongs to internal infrastructure or a trusted proxy hop and was excluded from fraud scoring.'}
      </p>
      {resolution.storedIp ? (
        <p className="mt-1 font-mono text-sky-200/80 text-[11px]">Stored: {resolution.storedIp}</p>
      ) : null}
    </div>
  );
}

function SignalStrength({ strong, weak }: { strong?: string[]; weak?: string[] }) {
  const hasStrong = Boolean(strong?.length);
  const hasWeak = Boolean(weak?.length);
  if (!hasStrong && !hasWeak) return null;
  return (
    <div className="space-y-2 text-xs">
      {hasStrong ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Strong signals</p>
          <ul className="mt-1 space-y-0.5 text-slate-200">
            {strong!.map((s, i) => (
              <li key={`s-${i}`} className="font-mono">
                {s}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasWeak ? (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">Weak signals (IP/network)</p>
          <ul className="mt-1 space-y-0.5 text-slate-400">
            {weak!.map((s, i) => (
              <li key={`w-${i}`}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function IpIntel({ intel }: { intel: FraudIpIntel | null | undefined }) {
  const { t } = useTranslation();
  if (!intel) return <span className="text-slate-600">-</span>;
  if (intel.providerType === 'infrastructure') {
    return (
      <div className="text-xs text-sky-200 space-y-1 min-w-[260px]">
        <p className="font-black uppercase text-[10px] text-sky-300">Provider</p>
        <p>{intel.providerLabel || 'infrastructure/proxy'}</p>
        <p className="text-slate-500">PTR/ASN lookups skipped for internal or proxy hops.</p>
      </div>
    );
  }
  const proxyDetected = intel.proxyDetected === true;
  const proxyChecked = Boolean(intel.proxyCheckedAt);
  const proxyBadge = proxyDetected
    ? intel.proxyType || t('admin_fraud.proxy_detected')
    : proxyChecked
      ? t('admin_fraud.proxy_clean')
      : t('admin_fraud.proxy_not_checked');
  return (
    <div className="space-y-1 text-xs min-w-[260px]">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-slate-500">ASN</span>
        <span className="font-mono text-slate-200">{intel.asn ? `AS${intel.asn}` : '-'}</span>
        <CopyButton value={intel.asn ? `AS${intel.asn}` : ''} label={t('admin_fraud.copy_asn')} />
      </div>
      <div className="text-slate-300 break-words">{intel.asnOrg || intel.providerLabel || t('admin_fraud.unknown_provider')}</div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-slate-500">PTR</span>
        <span className="font-mono text-slate-300 break-all">{intel.reverseDns || '-'}</span>
        <CopyButton value={intel.reverseDns || ''} label={t('admin_fraud.copy_dns')} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-slate-500">{t('admin_fraud.proxy_status')}</span>
        <span
          className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase ${
            proxyDetected
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : proxyChecked
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-950 text-slate-400'
          }`}
        >
          {proxyBadge}
        </span>
        {Number.isInteger(intel.proxyRiskScore) ? (
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">
            {t('admin_fraud.proxy_risk', { score: intel.proxyRiskScore })}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] uppercase font-black">
        <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-300">{intel.providerType || 'unknown'}</span>
        <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-400">{intel.confidence || 'low'}</span>
        {intel.reverseDnsForwardConfirmed === true ? <span className="text-emerald-300">FCrDNS</span> : null}
        {intel.networkCidr ? <span className="font-mono text-slate-500">{intel.networkCidr}</span> : null}
      </div>
    </div>
  );
}

function riskLevelClass(level: string): string {
  if (level === 'low' || level === 'medium' || level === 'high' || level === 'critical') {
    return riskClass[level];
  }
  return riskClass.low;
}

export default function AdminFraudSignals() {
  const { t } = useTranslation();
  const [scope, setScope] = useState('all');
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<FraudSignalsPayload | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPhrase, setResetPhrase] = useState('');
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('scope', scope);
      params.set('page', String(page));
      params.set('limit', '40');
      if (appliedQ.trim()) params.set('q', appliedQ.trim());
      const res = await api.get<FraudSignalsListResponse>(`/admin/fraud-signals?${params.toString()}`);
      if (res.data.ok) {
        setPayload({
          total: res.data.total != null ? Number(res.data.total) : undefined,
          limit: res.data.limit != null ? Number(res.data.limit) : undefined,
          generatedAt: res.data.generatedAt,
          signals: res.data.signals || [],
        });
      } else {
        toast.error(res.data.message || t('admin_fraud.error_load'));
      }
    } catch (e) {
      console.error(e);
      toast.error(t('admin_fraud.error_load'));
    } finally {
      setLoading(false);
    }
  }, [scope, page, appliedQ, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const kindLabel = (kind: string): string => t(`admin_fraud.kind_${kind}`, { defaultValue: kind });
  const total = Number(payload?.total || 0);
  const hasNext = page * Number(payload?.limit || 40) < total;
  const refreshIp = async (ip: string) => {
    try {
      await api.post('/admin/fraud-signals/refresh-ip', { ip });
      toast.success(t('admin_fraud.refresh_ip_ok'));
      void load();
    } catch {
      toast.error(t('admin_fraud.refresh_ip_error'));
    }
  };

  const runResetCollection = async () => {
    if (resetPhrase.trim() !== RESET_FRAUD_COLLECTION_PHRASE) {
      toast.error(t('admin_fraud.reset_phrase_mismatch'));
      return;
    }
    setResetting(true);
    try {
      const res = await api.post<FraudResetResponse>('/admin/fraud-signals/reset-collection', {
        confirm: RESET_FRAUD_COLLECTION_PHRASE,
      });
      if (res.data?.ok) {
        toast.success(
          t('admin_fraud.reset_ok', {
            logs: res.data.ipLogsDeleted ?? 0,
            cache: res.data.ipIntelDeleted ?? 0,
            users: res.data.usersProfileAntiFraudCleared ?? 0,
          }),
        );
        setResetOpen(false);
        setResetPhrase('');
        void load();
      } else {
        toast.error(res.data?.message || t('admin_fraud.reset_error'));
      }
    } catch (err: unknown) {
      toast.error(readAxiosResponseMessage(err) || t('admin_fraud.reset_error'));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-4 md:p-0">
      {resetOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fraud-reset-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-slate-950 p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="fraud-reset-title" className="text-lg font-black text-red-300 uppercase tracking-tight">
                  {t('admin_fraud.reset_title')}
                </h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{t('admin_fraud.reset_body')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetOpen(false);
                  setResetPhrase('');
                }}
                className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
                aria-label={t('admin_fraud.reset_close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase text-slate-500">{t('admin_fraud.reset_type_label')}</span>
              <input
                type="text"
                value={resetPhrase}
                onChange={(e) => setResetPhrase(e.target.value)}
                autoComplete="off"
                placeholder={RESET_FRAUD_COLLECTION_PHRASE}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder:text-slate-600"
              />
            </label>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setResetOpen(false);
                  setResetPhrase('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-400 border border-slate-700 hover:bg-slate-900"
              >
                {t('admin_fraud.reset_cancel')}
              </button>
              <button
                type="button"
                disabled={resetting || resetPhrase.trim() !== RESET_FRAUD_COLLECTION_PHRASE}
                onClick={() => void runResetCollection()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase bg-red-600 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {t('admin_fraud.reset_confirm_btn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <Fingerprint className="w-7 h-7 text-amber-500" />
            {t('admin_fraud.title')}
          </h2>
          <p className="text-slate-500 text-sm font-medium mt-1 max-w-3xl">{t('admin_fraud.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setResetPhrase('');
              setResetOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-950/40 hover:bg-red-900/50 text-red-200 rounded-xl text-xs font-bold border border-red-800/40 w-fit"
          >
            <Trash2 className="w-4 h-4" />
            {t('admin_fraud.reset_open')}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700/50 w-fit"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin_fraud.refresh')}
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('admin_fraud.filter_scope')}</p>
        <div className="flex flex-wrap gap-2">
          {scopeButtons.map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setScope(id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-colors ${
                scope === id
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
              }`}
            >
              {t(`admin_fraud.${labelKey}`)}
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
              setPage(1);
              setAppliedQ(q);
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase shrink-0"
          >
            <Search className="w-4 h-4" />
            {t('admin_fraud.search_run')}
          </button>
        </div>
        {payload?.generatedAt ? (
          <p className="text-[10px] text-slate-600">
            {t('admin_fraud.generated_at', { time: new Date(payload.generatedAt).toLocaleString() })} · {total}{' '}
            {t('admin_fraud.groups')}
          </p>
        ) : null}
      </div>

      {loading && !payload ? (
        <div className="text-center py-20 text-slate-500 font-bold uppercase tracking-widest animate-pulse">{t('admin_fraud.loading')}</div>
      ) : (
        <div className="space-y-4">
          {(payload?.signals || []).map((sig) => (
            <article key={sig.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-500/90">{kindLabel(sig.kind)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${riskLevelClass(String(sig.riskLevel))}`}>
                      {sig.riskLevel} {sig.riskScore}/100
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-black uppercase text-slate-400">
                      {sig.confidence}
                    </span>
                  </div>
                  <SignalValue sig={sig} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 min-w-[320px]">
                  <div>
                    <p className="text-[9px] uppercase font-black text-slate-600">{t('admin_fraud.col_accounts')}</p>
                    <p className="text-xl font-black text-white">{sig.userCount}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-black text-slate-600">{t('admin_fraud.action')}</p>
                    <p className="text-sm font-bold text-slate-200">{sig.recommendedAction}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase font-black text-slate-600">{t('admin_fraud.provider')}</p>
                    <p className="text-sm font-bold text-slate-200">{sig.ipIntelligence?.providerType || '-'}</p>
                  </div>
                </div>
              </div>

              <IpResolutionBanner resolution={sig.ipResolution} />

              <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr_1fr] gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">{t('admin_fraud.ip_intel')}</p>
                    {sig.ipIntelligence?.normalizedIp ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ip = sig.ipIntelligence?.normalizedIp;
                          if (ip) void refreshIp(String(ip));
                        }}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-200"
                      >
                        {t('admin_fraud.refresh_ip')}
                      </button>
                    ) : null}
                  </div>
                  <IpIntel intel={sig.ipIntelligence} />
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">Signal strength</p>
                  <SignalStrength strong={sig.strongSignals} weak={sig.weakSignals} />
                  <p className="mb-2 mt-3 text-[10px] font-black uppercase tracking-widest text-slate-600">{t('admin_fraud.reasons')}</p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {(sig.reasons || []).map((reason: string, idx: number) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                  {(sig.falsePositiveWarnings || []).length ? (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                      <div className="flex items-center gap-2 font-black uppercase text-[10px] text-amber-300">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {t('admin_fraud.false_positive')}
                      </div>
                      <ul className="mt-1 space-y-1">
                        {sig.falsePositiveWarnings!.map((warning: string, idx: number) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-600">{t('admin_fraud.col_users')}</p>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(sig.users || []).map((u) => (
                      <li key={u.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="font-mono text-amber-200/90">#{u.id}</span>
                        <span className="text-slate-400 break-all">{u.email}</span>
                        {u.username ? <span className="text-slate-500">@{u.username}</span> : null}
                        {u.walletAddress ? <CopyButton value={u.walletAddress} /> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
          {(!payload?.signals || payload.signals.length === 0) && !loading ? (
            <div className="px-8 py-14 text-center text-slate-500 italic bg-slate-900 border border-slate-800 rounded-2xl">{t('admin_fraud.empty')}</div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-bold text-slate-300 disabled:opacity-40"
            >
              {t('admin_fraud.prev')}
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-bold text-slate-300 disabled:opacity-40"
            >
              {t('admin_fraud.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
