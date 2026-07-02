import { useState, useCallback } from 'react';
import axios from 'axios';
import { BarChart2, Loader2, RefreshCw, Search } from 'lucide-react';

const adminApi = axios.create({
  baseURL: '/',
  withCredentials: true,
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
});

type DailyRow = {
  day: string;
  dayBrt: string;
  internal: number;
  internalPol: number;
  offerwallMe: number;
  offerwallMePol: number;
  zeradsCallbacks: number;
  zeradsClicks: number;
  zeradsPol: number;
};

export default function AdminOfferwallAnalytics() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 16);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 16));
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      };
      if (userId.trim()) params.userId = userId.trim();
      const res = await adminApi.get('/api/admin/offerwall/analytics', { params });
      if (res.data?.ok) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [from, to, userId]);

  const totals = data?.totals as {
    internal?: { count: number; pol: number };
    offerwallMe?: { count: number; pol: number };
    zerads?: { callbacks: number; clicks: number; pol: number };
  } | undefined;
  const daily = (data?.daily as DailyRow[] | undefined) ?? [];
  const scoringConfig = data?.scoringConfig as { zeradsMaxPerWindow?: number } | undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-8 w-8 text-violet-400" />
        <div>
          <h1 className="text-2xl font-black text-white">Offerwall Analytics</h1>
          <p className="text-xs text-slate-500 font-mono">
            Servidor: {String(data?.serverNow ?? '—')} · BRT: {String(data?.serverNowBrt ?? '—')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-end rounded-2xl border border-white/8 bg-slate-900/50 p-4">
        <label className="text-xs text-slate-400">
          De
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-400">
          Até
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="text-xs text-slate-400">
          User ID
          <div className="flex mt-1 items-center gap-1">
            <Search className="h-3.5 w-3.5 text-slate-600" />
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value.replace(/\D/g, ''))}
              placeholder="opcional"
              className="rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-sm text-white w-28"
            />
          </div>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      {totals && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
            <p className="text-[10px] uppercase text-sky-400 tracking-widest">Internas</p>
            <p className="text-2xl font-black text-white font-mono">{totals.internal?.count ?? 0}</p>
            <p className="text-xs text-slate-500">{Number(totals.internal?.pol ?? 0).toFixed(4)} POL</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
            <p className="text-[10px] uppercase text-amber-400 tracking-widest">OfferwallMe</p>
            <p className="text-2xl font-black text-white font-mono">{totals.offerwallMe?.count ?? 0}</p>
            <p className="text-xs text-slate-500">{Number(totals.offerwallMe?.pol ?? 0).toFixed(4)} POL</p>
          </div>
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
            <p className="text-[10px] uppercase text-violet-400 tracking-widest">Zerads PTC</p>
            <p className="text-2xl font-black text-white font-mono">{totals.zerads?.callbacks ?? 0} cb</p>
            <p className="text-xs text-slate-500">
              {totals.zerads?.clicks ?? 0} cliques · {Number(totals.zerads?.pol ?? 0).toFixed(4)} POL
            </p>
            <p className="text-[10px] text-violet-300 mt-1">Torneio: {scoringConfig?.zeradsMaxPerUtcDay ?? scoringConfig?.zeradsMaxPerWindow ?? 100} cliques Zerads/dia UTC</p>
          </div>
        </div>
      )}

      {daily.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/8">
          <table className="w-full text-xs">
            <thead className="bg-slate-800/80 text-slate-400 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Dia BRT</th>
                <th className="px-3 py-2 text-right">Int</th>
                <th className="px-3 py-2 text-right">OWM</th>
                <th className="px-3 py-2 text-right">Zerads cb</th>
                <th className="px-3 py-2 text-right">Zerads cliques</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {daily.map((row) => (
                <tr key={row.day}>
                  <td className="px-3 py-2 text-slate-300">{row.dayBrt}</td>
                  <td className="px-3 py-2 text-right">{row.internal}</td>
                  <td className="px-3 py-2 text-right">{row.offerwallMe}</td>
                  <td className="px-3 py-2 text-right text-violet-300">{row.zeradsCallbacks}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{row.zeradsClicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
