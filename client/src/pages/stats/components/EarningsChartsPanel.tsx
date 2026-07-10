import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { EarningsTotals, EarningsHistoryPoint } from '../stats.earnings.api';
import { formatPolAmount } from '../stats.earnings.api';
import { formatUtcChartDay } from '../../../shared/utils/utcStatsPeriod';

const SLICE_COLORS: Record<string, string> = {
  mining: '#22c55e',
  offerwall: '#a855f7',
  faucet: '#38bdf8',
  shortlinks: '#f97316',
  youtube: '#ef4444',
  games: '#eab308',
  autoMining: '#8b5cf6',
  checkin: '#14b8a6',
  referrals: '#ec4899',
};

type SliceKey = keyof Omit<EarningsTotals, 'total' | 'offerwallInternal' | 'offerwallExternal'>;

function buildPieData(totals: EarningsTotals) {
  const keys: SliceKey[] = [
    'mining',
    'offerwall',
    'faucet',
    'shortlinks',
    'youtube',
    'games',
    'autoMining',
    'checkin',
    'referrals',
  ];
  return keys
    .map((key) => ({ key, value: Number(totals[key]) || 0, color: SLICE_COLORS[key] }))
    .filter((d) => d.value > 0);
}

type Props = {
  totals: EarningsTotals;
  history: EarningsHistoryPoint[];
  mode?: 'full' | 'summary';
};

function ChartShell({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/90 to-slate-950/80 p-5 min-h-[320px]">
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">{title}</h3>
      <p className="text-[11px] text-slate-600 mb-4">{note}</p>
      {children}
    </div>
  );
}

function EarningsChartsPanelInner({ totals, history, mode = 'full' }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const pieData = useMemo(() => buildPieData(totals), [totals]);
  const pieTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  const lineData = useMemo(
    () =>
      (history || []).map((p) => ({
        date: formatUtcChartDay(p.date),
        total: p.total,
        rawDate: p.date,
      })),
    [history],
  );

  const evolutionChart = (
    <ChartShell title={t('powerStats.earnings.evolution_title')} note={t('powerStats.earnings.evolution_note')}>
      {lineData.length === 0 ? (
        <p className="text-sm text-slate-600 py-16 text-center">{t('powerStats.charts.no_data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={lineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={48} />
            <Tooltip
              formatter={(v: number) => [`${formatPolAmount(v, locale)} POL`, t('powerStats.earnings.total_label')]}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="total" stroke="#38bdf8" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );

  const originChart = (
    <ChartShell title={t('powerStats.earnings.origin_title')} note={t('powerStats.earnings.origin_note')}>
      {pieData.length === 0 ? (
        <p className="text-sm text-slate-600 py-16 text-center">{t('powerStats.charts.no_data')}</p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="key"
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={92}
              paddingAngle={2}
            >
              {pieData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => {
                const pct = pieTotal > 0 ? ((Number(value) / pieTotal) * 100).toFixed(1) : '0';
                return [
                  `${formatPolAmount(Number(value), locale)} POL (${pct}%)`,
                  t(`powerStats.earnings.sources.${name}`),
                ];
              }}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 12,
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );

  if (mode === 'summary') {
    return (
      <div className="space-y-6">
        {evolutionChart}
        <div className="max-w-xl">{originChart}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {originChart}
      {evolutionChart}
    </div>
  );
}

export default memo(EarningsChartsPanelInner);
