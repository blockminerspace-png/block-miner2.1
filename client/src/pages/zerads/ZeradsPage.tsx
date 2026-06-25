import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  MousePointerClick,
  AlertTriangle,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import { api, useAuthStore } from '../../store/auth';

interface ZeradsLinkResponse {
  ok: boolean;
  url?: string;
  username?: string;
  exchangeRate?: number;
  reason?: string;
}

interface ZeradsStatsResponse {
  ok: boolean;
  totalZer: number;
  totalPol: number;
  totalClicks: number;
  totalCallbacks: number;
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
  pageSize: number;
  totalPages: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ZeradsPage() {
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
        const [linkRes, statsRes] = await Promise.all([
          api.get<ZeradsLinkResponse>('/zerads/link'),
          api.get<ZeradsStatsResponse>('/zerads/stats'),
        ]);
        if (!cancelled) {
          setLinkData(linkRes.data);
          setStats(statsRes.data);
          if (linkRes.data?.ok && linkRes.data.url) {
            window.open(linkRes.data.url, '_blank', 'noopener,noreferrer');
          }
        }
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
    } catch {
      // keep previous
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(historyPage);
  }, [historyPage, loadHistory]);

  const handleOpen = () => {
    if (linkData?.url) window.open(linkData.url, '_blank', 'noopener,noreferrer');
  };

  const exchangeRate = linkData?.exchangeRate ?? 0.07;
  const hasUsername = Boolean(user?.username);

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <MousePointerClick className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{t('zerads.title')}</h1>
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

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('zerads.stat_total_zer'), value: stats.totalZer.toFixed(4) + ' ZER' },
            { label: t('zerads.stat_total_pol'), value: stats.totalPol.toFixed(6) + ' POL' },
            { label: t('zerads.stat_total_clicks'), value: String(stats.totalClicks) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className="text-base font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white">{t('zerads.how_it_works_title')}</h2>
          <p className="text-sm text-gray-400">{t('zerads.how_it_works_body')}</p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-4 py-3">
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
            onClick={handleOpen}
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
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-white">{t('zerads.history_title')}</h2>
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
                    <th className="text-left px-5 py-2">{t('zerads.col_date')}</th>
                    <th className="text-right px-4 py-2">{t('zerads.col_clicks')}</th>
                    <th className="text-right px-4 py-2">{t('zerads.col_zer')}</th>
                    <th className="text-right px-5 py-2">{t('zerads.col_pol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-gray-300">{formatDate(e.callbackAt)}</td>
                      <td className="px-4 py-3 text-right text-gray-400">{e.clicks}</td>
                      <td className="px-4 py-3 text-right text-purple-300">{e.amountZer.toFixed(4)}</td>
                      <td className="px-5 py-3 text-right font-medium text-green-400">+{e.payoutAmount.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {history.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-white/5">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage <= 1}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500">
                  {historyPage} / {history.totalPages}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(history.totalPages, p + 1))}
                  disabled={historyPage >= history.totalPages}
                  className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                >
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
