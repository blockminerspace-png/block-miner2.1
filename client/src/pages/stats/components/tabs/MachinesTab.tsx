import { lazy, memo, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu } from 'lucide-react';
import { formatHashrate } from '../../../../shared/utils/machine';
import type { StatsDashboardContext } from '../../stats.types';
import StatCard from '../ui/StatCard';
import ChartsFallback from '../ui/ChartsFallback';

const MachinesPowerChart = lazy(() => import('../MachinesPowerChart'));

function MachinesTab({ power }: StatsDashboardContext) {
  const { t } = useTranslation();
  const machines = power.machines;
  const activeHr = useMemo(
    () => (machines?.items ?? []).filter((m) => m.isActive).reduce((s, m) => s + (Number(m.hashRate) || 0), 0),
    [machines?.items],
  );
  const totalHr = power.overview?.totalHashrate || 1;
  const share = Math.round((activeHr / totalHr) * 1000) / 10;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('powerStats.dashboard.machine_count')}
          value={(machines?.activeCount ?? 0) + (machines?.inactiveCount ?? 0)}
          sub={t('powerStats.machines.summary', {
            active: machines?.activeCount ?? 0,
            inactive: machines?.inactiveCount ?? 0,
          })}
          icon={Cpu}
          accent="text-emerald-400"
        />
        <StatCard label={t('powerStats.dashboard.machine_output')} value={formatHashrate(activeHr)} accent="text-sky-400" />
        <StatCard
          label={t('powerStats.dashboard.machine_share')}
          value={`${share}%`}
          sub={t('powerStats.dashboard.machine_share_note')}
          accent="text-amber-400"
        />
        <StatCard
          label={t('powerStats.permanent')}
          value={formatHashrate(power.overview?.permanentHashrate)}
          accent="text-emerald-400"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
          {t('powerStats.dashboard.machine_chart')}
        </h3>
        <Suspense fallback={<ChartsFallback cols={1} />}>
          <MachinesPowerChart power={power} />
        </Suspense>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="p-3">{t('powerStats.col.machine')}</th>
              <th className="p-3">{t('powerStats.col.hashrate')}</th>
              <th className="p-3">{t('powerStats.col.status')}</th>
              <th className="p-3">{t('powerStats.col.room')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {(machines?.items || []).map((m) => (
              <tr key={m.id} className="hover:bg-slate-800/30">
                <td className="p-3 font-medium text-white">{m.minerName}</td>
                <td className="p-3 font-mono text-sky-400">{formatHashrate(m.hashRate)}</td>
                <td className="p-3">
                  <span className={m.isActive ? 'text-emerald-400' : 'text-slate-600'}>
                    {m.isActive ? t('powerStats.active') : t('powerStats.inactive')}
                  </span>
                </td>
                <td className="p-3 text-slate-400 text-xs">
                  {m.roomNumber != null
                    ? t('powerStats.room_rack', { room: m.roomNumber, pos: m.rackPosition ?? '—' })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(MachinesTab);
