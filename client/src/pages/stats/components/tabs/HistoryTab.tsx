import { lazy, memo, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, History } from 'lucide-react';
import type { StatsDashboardContext } from '../../stats.types';
import { exportEarningsCsv, exportPowerStatsCsv } from '../../utils/exportStats';
import ChartsFallback from '../ui/ChartsFallback';
import PeriodPills from '../ui/PeriodPills';

const PowerChartsPanel = lazy(() => import('../PowerChartsPanel'));

function HistoryTab({ power, earnings, earningsFilter, setEarningsFilter }: StatsDashboardContext) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
          <History className="w-5 h-5 text-sky-400" />
          {t('powerStats.tab.history')}
        </h2>
        <PeriodPills value={earningsFilter} onChange={setEarningsFilter} />
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
        <div className="grid sm:grid-cols-3 gap-4 text-sm mb-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.peak_share')}</p>
            <p className="text-xl font-mono text-emerald-400">{power.analytics?.miningLogPeakShare?.toFixed(4) ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.avg_share')}</p>
            <p className="text-xl font-mono text-sky-400">{power.analytics?.miningLogAvgShare?.toFixed(4) ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.samples')}</p>
            <p className="text-xl font-mono text-white">{power.analytics?.miningLogSamples ?? 0}</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-600">{t('powerStats.analytics.disclaimer')}</p>
      </div>

      <Suspense fallback={<ChartsFallback />}>
        <PowerChartsPanel overview={power.overview} history={power.history} />
      </Suspense>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => exportPowerStatsCsv(power, 'blockminer-power-history')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider"
        >
          <Download className="w-4 h-4" />
          {t('powerStats.export_csv')}
        </button>
        {earnings ? (
          <button
            type="button"
            onClick={() => exportEarningsCsv(earnings, 'blockminer-earnings-history')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            {t('powerStats.dashboard.export_earnings')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default memo(HistoryTab);
