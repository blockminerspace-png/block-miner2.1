import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend
} from 'recharts';
import type { PowerStatsHistory, UserPowerStatsPayload } from '../stats.api';

const COLORS = {
  machines: '#22c55e',
  gamesMinigame: '#f97316',
  gamesCheckin: '#eab308',
  youtube: '#ef4444',
  autoMining: '#a855f7'
} as const;

type PieSliceKey = keyof typeof COLORS;

/**
 * Lazy-loaded charts for power breakdown and history (Recharts).
 */
export default function PowerChartsPanel({
  overview,
  history
}: {
  overview?: UserPowerStatsPayload['overview'] | null;
  history?: PowerStatsHistory | null;
}) {
  const { t } = useTranslation();

  const pieData = useMemo(() => {
    if (!overview?.breakdown) return [];
    const b = overview.breakdown;
    const rows: Array<{ key: PieSliceKey; name: string; value: number }> = [
      { key: 'machines', name: t('powerStats.source.machines'), value: Number(b.machines) || 0 },
      { key: 'gamesMinigame', name: t('powerStats.source.games'), value: Number(b.gamesMinigame) || 0 },
      { key: 'gamesCheckin', name: t('powerStats.source.checkin_bonus'), value: Number(b.gamesCheckin) || 0 },
      { key: 'youtube', name: t('powerStats.source.youtube'), value: Number(b.youtube) || 0 },
      { key: 'autoMining', name: t('powerStats.source.auto_mining'), value: Number(b.autoMining) || 0 }
    ];
    return rows.filter((r) => r.value > 0);
  }, [overview, t]);

  const lineHistory = useMemo(() => {
    const days = history?.miningLogByDay || [];
    return days.map((d) => ({
      date: d.date.slice(5),
      share: Math.round((d.avgSharePercent || 0) * 100) / 100
    }));
  }, [history]);

  const lineBlk = useMemo(() => {
    const c = history?.blkCycles || [];
    return [...c]
      .reverse()
      .slice(-14)
      .map((row) => ({
        t: row.windowStart ? row.windowStart.slice(5, 16) : '',
        pool: row.totalHashrate || 0
      }));
  }, [history]);

  const pieSummary = pieData.map((p) => `${p.name}: ${p.value.toFixed(2)} H/s`).join('; ');

  if (!overview) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" role="region" aria-label={t('powerStats.charts.region')}>
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 min-h-[280px]">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('powerStats.charts.share_by_source')}</h3>
        <p className="sr-only">{pieSummary}</p>
        {pieData.length === 0 ? (
          <p className="text-sm text-slate-600 py-12 text-center">{t('powerStats.charts.no_data')}</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
              >
                {pieData.map((entry: { key: PieSliceKey; name: string; value: number }) => (
                  <Cell key={entry.key} fill={COLORS[entry.key] || '#64748b'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} H/s`, t('powerStats.hashrate')]}
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 min-h-[280px]">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('powerStats.charts.permanent_vs_temporary')}</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={[
              {
                name: t('powerStats.permanent'),
                permanent: overview?.permanentHashrate || 0,
                temporary: 0
              },
              {
                name: t('powerStats.temporary'),
                permanent: 0,
                temporary: overview?.temporaryHashrate || 0
              }
            ]}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(2)} H/s`, t('powerStats.hashrate')]}
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
            />
            <Bar dataKey="permanent" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name={t('powerStats.permanent')} />
            <Bar dataKey="temporary" stackId="a" fill="#f59e0b" radius={[8, 8, 0, 0]} name={t('powerStats.temporary')} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {lineHistory.length > 1 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 min-h-[260px] xl:col-span-2">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('powerStats.charts.mining_share_history')}</h3>
          <p className="text-[10px] text-slate-600 mb-2">{t('powerStats.charts.mining_share_note')}</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineHistory} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
              />
              <Line type="monotone" dataKey="share" stroke="#22c55e" strokeWidth={2} dot={false} name={t('powerStats.charts.share_percent')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {lineBlk.length > 1 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 min-h-[260px] xl:col-span-2">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">{t('powerStats.charts.blk_pool_history')}</h3>
          <p className="text-[10px] text-slate-600 mb-2">{t('powerStats.charts.blk_pool_note')}</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={lineBlk} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="t" tick={{ fill: '#94a3b8', fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(2)} H/s`, t('powerStats.network.pool_total')]}
                contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12 }}
              />
              <Line type="monotone" dataKey="pool" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
