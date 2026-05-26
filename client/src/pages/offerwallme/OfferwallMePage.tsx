import { useEffect, useState, useCallback } from 'react';
import { useAuthStore, api } from '../../store/auth';
import { Store, ExternalLink, Info, TrendingUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

const OFFERWALLME_API_KEY = 'yyu8i3jt58by9do1fbdr0fyn60yn5u';

interface OfferwallMeStatsResponse {
  ok: boolean;
  totalUsd: number;
  totalPol: number;
  totalOffers: number;
}

interface OfferwallMeHistoryEntry {
  id: number;
  offerName: string | null;
  offerType: string | null;
  payoutUsd: number;
  polCredited: number;
  polPrice: number;
  createdAt: string;
}

interface OfferwallMeHistoryResponse {
  ok: boolean;
  entries: OfferwallMeHistoryEntry[];
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

export default function OfferwallMePage() {
  const user = useAuthStore(s => s.user);

  const [stats, setStats] = useState<OfferwallMeStatsResponse | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<OfferwallMeHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    void api.get<OfferwallMeStatsResponse>('/offerwallme/stats').then(r => {
      if (r.data.ok) setStats(r.data);
    }).catch(() => {});
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await api.get<OfferwallMeHistoryResponse>(`/offerwallme/history?page=${page}`);
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

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Carregando...</p>
      </div>
    );
  }

  const iframeUrl = `https://offerwall.me/offerwall/${OFFERWALLME_API_KEY}/${user.id}`;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Store className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Offerwall.me</h1>
            <p className="text-[10px] text-gray-500">Complete ofertas e ganhe POL</p>
          </div>
        </div>
        <a
          href={iframeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white text-[11px] font-black uppercase transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir em nova aba
        </a>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 bg-violet-950/30 border border-violet-500/20 rounded-xl p-3">
        <Info className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Complete ofertas abaixo para ganhar POL. Cada oferta completa aqui (ou via Zerads) também conta para
          <span className="text-violet-300 font-black"> isenção da taxa de saque</span>{' '}
          — 10 completions no dia = saque sem taxa.
        </p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total USD', value: '$' + stats.totalUsd.toFixed(4) },
            { label: 'Total POL', value: stats.totalPol.toFixed(6) + ' POL' },
            { label: 'Ofertas', value: String(stats.totalOffers) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">{s.label}</p>
              <p className="text-base font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Offerwall iframe */}
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

      {/* History */}
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-white/10">
          <TrendingUp className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-white">Histórico</h2>
          {history && (
            <span className="ml-auto text-xs text-gray-500">
              {history.total} completions
            </span>
          )}
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : !history?.entries?.length ? (
          <p className="text-sm text-gray-500 text-center py-8">Nenhuma oferta completada ainda.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-white/5">
                    <th className="text-left px-5 py-2">Data</th>
                    <th className="text-left px-4 py-2">Oferta</th>
                    <th className="text-right px-4 py-2">USD</th>
                    <th className="text-right px-5 py-2">POL</th>
                  </tr>
                </thead>
                <tbody>
                  {history.entries.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="px-5 py-3 text-gray-300 whitespace-nowrap">{formatDate(e.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-400 max-w-[160px] truncate">{e.offerName ?? e.offerType ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-400">${e.payoutUsd.toFixed(4)}</td>
                      <td className="px-5 py-3 text-right font-medium text-green-400">+{e.polCredited.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
