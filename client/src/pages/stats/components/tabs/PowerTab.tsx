import { memo, Suspense } from 'react';
import { lazyWithRetry } from '../../../../shared/utils/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import { Activity, Zap, Cpu } from 'lucide-react';
import { formatHashrate } from '../../../../shared/utils/machine';
import type { StatsDashboardContext } from '../../stats.types';
import StatCard from '../ui/StatCard';
import ChartsFallback from '../ui/ChartsFallback';

const PowerChartsPanel = lazyWithRetry(() => import('../PowerChartsPanel'));

function PowerTab({ power, ratioBar }: StatsDashboardContext) {
  const { t } = useTranslation();
  const overview = power.overview;
  const tempCount = overview?.nextExpirations?.length ?? 0;
  const avgBoost =
    tempCount > 0
      ? (overview?.temporaryHashrate ?? 0) / tempCount
      : overview?.temporaryHashrate ?? 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('powerStats.total_power')}
          value={formatHashrate(overview?.totalHashrate)}
          icon={Activity}
          accent="text-sky-400"
          border="border-sky-500/30 bg-sky-500/5"
        />
        <StatCard
          label={t('powerStats.permanent')}
          value={formatHashrate(overview?.permanentHashrate)}
          icon={Cpu}
          accent="text-emerald-400"
          border="border-emerald-500/25 bg-emerald-500/5"
        />
        <StatCard
          label={t('powerStats.temporary')}
          value={formatHashrate(overview?.temporaryHashrate)}
          icon={Zap}
          accent="text-amber-400"
          border="border-amber-500/25 bg-amber-500/5"
        />
        <StatCard
          label={t('powerStats.dashboard.avg_boost')}
          value={formatHashrate(avgBoost)}
          sub={t('powerStats.dashboard.avg_boost_note')}
          accent="text-violet-400"
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">{t('powerStats.mix')}</p>
        <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex mb-3">
          <div className="h-full bg-emerald-500" style={{ width: `${ratioBar.p}%` }} />
          <div className="h-full bg-amber-500" style={{ width: `${ratioBar.tmp}%` }} />
        </div>
        <p className="text-xs text-slate-400">
          {overview?.permanentPercent ?? 0}% {t('powerStats.permanent_short')} · {overview?.temporaryPercent ?? 0}%{' '}
          {t('powerStats.temporary_short')}
        </p>
      </div>

      <Suspense fallback={<ChartsFallback />}>
        <PowerChartsPanel overview={overview} history={power.history} />
      </Suspense>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-2">
        <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.projections_title')}</h3>
        <p className="text-sm text-slate-400">
          {t('powerStats.projection_permanent', { hr: (overview?.permanentHashrate ?? 0).toFixed(2) })}
        </p>
        <p className="text-sm text-slate-400">
          {t('powerStats.projection_temporary', { hr: (overview?.temporaryHashrate ?? 0).toFixed(2) })}
        </p>
        <ul className="list-disc list-inside text-xs text-slate-500 space-y-1 mt-2">
          {(power.projections?.hintKeys || []).map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default memo(PowerTab);
