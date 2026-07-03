import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { UserPowerStatsPayload } from '../../stats.api';
import { formatHashrate } from '../../../shared/utils/machine';

function MachinesPowerChart({ power }: { power: UserPowerStatsPayload }) {
  const { t } = useTranslation();
  const data = useMemo(() => {
    const items = power.machines?.items ?? [];
    const active = items.filter((m) => m.isActive);
    const totalHr = active.reduce((s, m) => s + (Number(m.hashRate) || 0), 0);
    return active.slice(0, 12).map((m) => ({
      name: (m.minerName || '—').slice(0, 14),
      hr: Number(m.hashRate) || 0,
      share: totalHr > 0 ? Math.round(((Number(m.hashRate) || 0) / totalHr) * 1000) / 10 : 0,
    }));
  }, [power.machines?.items]);

  if (data.length === 0) {
    return <p className="text-sm text-slate-600 py-8 text-center">{t('powerStats.charts.no_data')}</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} width={48} />
        <Tooltip
          formatter={(v: number) => [formatHashrate(v), t('powerStats.col.hashrate')]}
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
        />
        <Bar dataKey="hr" fill="#22c55e" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(MachinesPowerChart);
