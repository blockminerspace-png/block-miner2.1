import { useEffect, useState } from 'react';
import axios from 'axios';

const adminApi = axios.create({
  baseURL: '/',
  withCredentials: true,
  xsrfCookieName: 'blockminer_csrf',
  xsrfHeaderName: 'x-csrf-token',
});

type Summary = {
  totalHits: number; periodHits: number;
  totalRegs: number; periodRegs: number;
  conversionRate: number; days: number;
};
type DomainRow = { domain: string; hits: number; registrations: number; conversionRate: number };
type UtmRow = { source: string; hits: number; registrations: number; conversionRate: number };
type DailyRow = { date: string; hits: number; registrations: number };

type Tab = 'overview' | 'domains' | 'utm';

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

function pct(n: number) { return n.toFixed(2) + '%'; }
function num(n: number) { return n.toLocaleString(); }

function StatCard({ label, value, sub, color = 'text-white' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{typeof value === 'number' ? num(value) : value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ rows, days }: { rows: DailyRow[]; days: number }) {
  const maxHits = Math.max(...rows.map(r => r.hits), 1);
  const maxRegs = Math.max(...rows.map(r => r.registrations), 1);
  const barMax = Math.max(maxHits, maxRegs);
  const show = rows.slice(-days);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex items-end gap-0.5 h-40 mb-1">
          {show.map(r => (
            <div key={r.date} className="flex-1 flex gap-px items-end h-full" title={`${r.date}: ${r.hits} visitas, ${r.registrations} cadastros`}>
              <div className="flex-1 bg-sky-500/40 rounded-t" style={{ height: `${(r.hits / barMax) * 100}%` }} />
              <div className="flex-1 bg-emerald-500/60 rounded-t" style={{ height: `${(r.registrations / barMax) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-gray-500 mt-1">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-500/40 inline-block" />Visitas</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500/60 inline-block" />Cadastros</span>
        </div>
      </div>
    </div>
  );
}

function TableRows({ rows, keyCol, keyLabel }: { rows: Array<Record<string, unknown>>; keyCol: string; keyLabel: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">{keyLabel}</th>
            <th className="text-right py-2 px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Visitas</th>
            <th className="text-right py-2 px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Cadastros</th>
            <th className="text-right py-2 px-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Conversão</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="text-center py-8 text-gray-600 text-[11px]">sem dados</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-900/40">
              <td className="py-2 px-3 font-mono text-gray-300 max-w-[200px] truncate">{String(r[keyCol] ?? '—')}</td>
              <td className="py-2 px-3 text-right text-sky-400 font-black">{num(r.hits as number)}</td>
              <td className="py-2 px-3 text-right text-emerald-400 font-black">{num(r.registrations as number)}</td>
              <td className="py-2 px-3 text-right text-amber-400 font-black">{pct(r.conversionRate as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTrafficStats() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('overview');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [utmRows, setUtmRows] = useState<UtmRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, d, dom, utm] = await Promise.all([
        adminApi.get<Summary & { ok: boolean }>(`/api/admin/traffic/summary?days=${days}`),
        adminApi.get<{ ok: boolean; rows: DailyRow[] }>(`/api/admin/traffic/daily?days=${days}`),
        adminApi.get<{ ok: boolean; rows: DomainRow[] }>(`/api/admin/traffic/by-domain?days=${days}`),
        adminApi.get<{ ok: boolean; rows: UtmRow[] }>(`/api/admin/traffic/by-utm?days=${days}`),
      ]);
      setSummary(s.data);
      setDaily(d.data.rows ?? []);
      setDomains(dom.data.rows ?? []);
      setUtmRows(utm.data.rows ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [days]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Visão Geral' },
    { id: 'domains', label: 'Por Domínio' },
    { id: 'utm', label: 'Por UTM Source' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tight">Estatísticas de Tráfego</h1>
          <p className="text-xs text-gray-500 mt-0.5">Visitas, cadastros e conversão por origem</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest">Período</span>
          <div className="flex gap-1">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-colors ${
                  days === d ? 'bg-primary text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >{d}d</button>
            ))}
          </div>
          <button onClick={load} className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 text-[11px] font-black uppercase">
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label={`Visitas (${days}d)`} value={summary.periodHits} color="text-sky-400" />
          <StatCard label={`Cadastros (${days}d)`} value={summary.periodRegs} color="text-emerald-400" />
          <StatCard label="Taxa de Conversão" value={pct(summary.conversionRate)} color="text-amber-400" sub="cadastros/visitas" />
          <StatCard label="Visitas Total" value={summary.totalHits} sub="todos os tempos" />
          <StatCard label="Cadastros Total" value={summary.totalRegs} sub="todos os tempos" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[11px] font-black uppercase tracking-wide transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Visitas & Cadastros — últimos {days} dias</p>
          {daily.length === 0 ? (
            <p className="text-xs text-gray-600 py-8 text-center">sem dados</p>
          ) : (
            <BarChart rows={daily} days={days} />
          )}
        </div>
      )}

      {tab === 'domains' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Origem por domínio referenciador</p>
          </div>
          <TableRows rows={domains as unknown as Array<Record<string, unknown>>} keyCol="domain" keyLabel="Domínio" />
        </div>
      )}

      {tab === 'utm' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Origem por utm_source</p>
          </div>
          <TableRows rows={utmRows as unknown as Array<Record<string, unknown>>} keyCol="source" keyLabel="UTM Source" />
        </div>
      )}
    </div>
  );
}
