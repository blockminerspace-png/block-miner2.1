import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Globe,
  MousePointerClick,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ArrowLeft,
  Coins,
  Clock,
  Store,
} from 'lucide-react';
import { api, useAuthStore } from '../../store/auth';

// ─── Zerads provider detail ────────────────────────────────────────────────

interface ZeradsLinkResponse {
  ok: boolean;
  url?: string;
  exchangeRate?: number;
  reason?: string;
}

interface ZeradsStatsResponse {
  ok: boolean;
  totalZer: number;
  totalPol: number;
  totalClicks: number;
}

interface ZeradsHistoryEntry {
  id: number;
  amountZer: number;
  payoutAmount: number;
  clicks: number;
  callbackAt: string;
}

interface ZeradsHistoryResponse {
  ok: boolean;
  entries: ZeradsHistoryEntry[];
  total: number;
  page: number;
  totalPages: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function ZeradsDetail({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [linkData, setLinkData] = useState<ZeradsLinkResponse | null>(null);
  const [linkLoading, setLinkLoading] = useState(true);
  const [stats, setStats] = useState<ZeradsStatsResponse | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<ZeradsHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [lr, sr] = await Promise.all([
          api.get<ZeradsLinkResponse>('/zerads/link'),
          api.get<ZeradsStatsResponse>('/zerads/stats'),
        ]);
        if (!cancelled) { setLinkData(lr.data); setStats(sr.data); }
      } catch {
        if (!cancelled) setLinkData({ ok: false, reason: 'error' });
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await api.get<ZeradsHistoryResponse>(`/zerads/history?page=${page}`);
      setHistory(res.data);
    } catch { /* keep previous */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { void loadHistory(historyPage); }, [historyPage, loadHistory]);

  const exchangeRate = linkData?.exchangeRate ?? 0.07;
  const hasUsername = Boolean(user?.username);

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao Offerwall
      </button>

      {/* Provider header */}
      <div className="flex items-center gap-3 rounded-2xl border border-purple-500/20 bg-purple-500/5 px-5 py-4">
        <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
          <MousePointerClick className="w-6 h-6 text-purple-400" />
        </div>
        <div>
          <p className="text-base font-bold text-white">{t('zerads.title')}</p>
          <p className="text-sm text-gray-400">{t('zerads.subtitle')}</p>
        </div>
      </div>

      {/* No username warning */}
      {!hasUsername && (
        <div className="flex items-start gap-3 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-300">{t('zerads.no_username_title')}</p>
            <p className="text-sm text-yellow-400/80 mt-0.5">{t('zerads.no_username_body')}</p>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('zerads.stat_total_zer'), value: stats.totalZer.toFixed(4) + ' ZER' },
            { label: t('zerads.stat_total_pol'), value: stats.totalPol.toFixed(6) + ' POL' },
            { label: t('zerads.stat_total_clicks'), value: String(stats.totalClicks) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className="text-sm font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <p className="text-sm text-gray-400">{t('zerads.how_it_works_body')}</p>
        <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2">
          <Info className="w-4 h-4 text-purple-400 shrink-0" />
          <p className="text-sm text-purple-300">
            {t('zerads.exchange_rate', { rate: exchangeRate.toFixed(4) })}
          </p>
        </div>

        {linkLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : linkData?.ok ? (
          <button
            onClick={() => linkData.url && window.open(linkData.url, '_blank', 'noopener,noreferrer')}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 transition-colors text-white font-semibold py-3 px-6"
          >
            <MousePointerClick className="w-5 h-5" />
            {t('zerads.start_earning')}
            <ExternalLink className="w-4 h-4 opacity-70" />
          </button>
        ) : linkData?.reason === 'no_username' ? (
          <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-gray-700 text-gray-500 font-semibold py-3 px-6 cursor-not-allowed">
            <MousePointerClick className="w-5 h-5" />
            {t('zerads.start_earning')}
          </button>
        ) : (
          <p className="text-sm text-red-400 text-center">{t('zerads.load_error')}</p>
        )}

        <p className="text-xs text-gray-500 text-center">{t('zerads.credits_delay_note')}</p>
      </div>

      {/* History */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-white">{t('zerads.history_title')}</h3>
          {history && (
            <span className="ml-auto text-xs text-gray-500">
              {t('zerads.history_total', { count: history.total })}
            </span>
          )}
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : !history?.entries?.length ? (
          <p className="text-sm text-gray-500 text-center py-8">{t('zerads.history_empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-white/5">
                    <th className="text-left px-4 py-2">{t('zerads.col_date')}</th>
                    <th className="text-right px-4 py-2">{t('zerads.col_clicks')}</th>
                    <th className="text-right px-4 py-2">{t('zerads.col_zer')}</th>
                    <th className="text-right px-4 py-2">{t('zerads.col_pol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-gray-300">{formatDate(e.callbackAt)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{e.clicks}</td>
                      <td className="px-4 py-3 text-right text-purple-300">{e.amountZer.toFixed(4)}</td>
                      <td className="px-4 py-3 text-right font-medium text-green-400">+{e.payoutAmount.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {history.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-white/5">
                <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage <= 1}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">{historyPage} / {history.totalPages}</span>
                <button onClick={() => setHistoryPage((p) => Math.min(history.totalPages, p + 1))} disabled={historyPage >= history.totalPages}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Offerwall.me provider detail ─────────────────────────────────────────

const OFFERWALLME_API_KEY = 'yyu8i3jt58by9do1fbdr0fyn60yn5u';

function OfferwallMeDetail({ onBack }: { onBack: () => void }) {
  const { user } = useAuthStore();
  if (!user) return null;
  const iframeUrl = `https://offerwall.me/offerwall/${OFFERWALLME_API_KEY}/${user.id}`;
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar ao Offerwall
      </button>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
            <Store className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <p className="font-bold text-white">Offerwall.me</p>
            <p className="text-xs text-gray-400 mt-0.5">Complete ofertas e ganhe POL — 10 ofertas/dia = saque sem taxa</p>
          </div>
        </div>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white text-[11px] font-black uppercase transition-colors shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Nova aba
        </a>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <iframe
          src={iframeUrl}
          scrolling="yes"
          frameBorder="0"
          title="Offerwall.me"
          style={{ width: '100%', height: '800px', border: 0, display: 'block' }}
          allow="fullscreen"
        />
      </div>
    </div>
  );
}

// ─── Provider card (mural item) ────────────────────────────────────────────

type ProviderDef = {
  id: string;
  name: string;
  description: string;
  rewardLabel: string;
  creditTime: string;
  accentColor: string;
  Icon: React.ElementType;
};

const PROVIDERS: ProviderDef[] = [
  {
    id: 'zerads',
    name: 'Zerads PTC',
    description: 'Clique em anúncios e ganhe POL automaticamente a cada ~5 minutos.',
    rewardLabel: 'POL por clique',
    creditTime: '~5 min',
    accentColor: 'purple',
    Icon: MousePointerClick,
  },
  {
    id: 'offerwallme',
    name: 'Offerwall.me',
    description: 'Complete ofertas de anunciantes e ganhe POL instantaneamente. 10 ofertas/dia = saque sem taxa.',
    rewardLabel: 'POL por oferta',
    creditTime: 'Instantâneo',
    accentColor: 'violet',
    Icon: Store,
  },
];

const ACCENT: Record<string, { border: string; bg: string; icon: string; badge: string }> = {
  purple: {
    border: 'border-purple-500/25',
    bg: 'bg-purple-500/10',
    icon: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-300 border border-purple-500/25',
  },
  violet: {
    border: 'border-violet-500/25',
    bg: 'bg-violet-500/10',
    icon: 'text-violet-400',
    badge: 'bg-violet-500/15 text-violet-300 border border-violet-500/25',
  },
};

function ProviderCard({ provider, onSelect }: { provider: ProviderDef; onSelect: () => void }) {
  const accent = ACCENT[provider.accentColor] ?? ACCENT.purple;
  const { Icon } = provider;

  return (
    <div className={`rounded-2xl border ${accent.border} bg-white/5 overflow-hidden flex flex-col`}>
      {/* Visual banner */}
      <div className={`h-24 ${accent.bg} flex items-center justify-center`}>
        <Icon className={`w-10 h-10 ${accent.icon} opacity-80`} />
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="text-sm font-bold text-white">{provider.name}</p>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">{provider.description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${accent.badge}`}>
            <Coins className="w-3 h-3" />
            {provider.rewardLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-400 border border-white/10">
            <Clock className="w-3 h-3" />
            {provider.creditTime}
          </span>
        </div>

        <button
          onClick={onSelect}
          className={`mt-auto w-full py-2 rounded-xl text-sm font-semibold text-white transition-all
            ${accent.bg} border ${accent.border} hover:brightness-125`}
        >
          Acessar
        </button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function OfferwallPage() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  if (selected === 'zerads') {
    return (
      <div className="max-w-2xl mx-auto">
        <ZeradsDetail onBack={() => setSelected(null)} />
      </div>
    );
  }

  if (selected === 'offerwallme') {
    return <OfferwallMeDetail onBack={() => setSelected(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
          <Globe className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t('sidebar.offerwall')}</h1>
          <p className="text-sm text-gray-400">{t('offerwall.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p.id} provider={p} onSelect={() => setSelected(p.id)} />
        ))}
      </div>
    </div>
  );
}
