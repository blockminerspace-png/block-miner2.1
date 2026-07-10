import { memo, Suspense, useMemo } from 'react';
import { lazyWithRetry } from '../../../../shared/utils/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import { Coins, TrendingUp, Calendar, Award } from 'lucide-react';
import { EARNINGS_CATEGORY_KEYS } from '../../stats.config';
import { computeEarningsInsights, percentOfTotal, resolveTotals } from '../../utils/earningsAnalytics';
import { formatPolAmount } from '../../stats.earnings.api';
import { formatUtcChartDay } from '../../../../shared/utils/utcStatsPeriod';
import type { StatsDashboardContext } from '../../stats.types';
import StatCard from '../ui/StatCard';
import PeriodPills from '../ui/PeriodPills';
import ChartsFallback from '../ui/ChartsFallback';

const EarningsChartsPanel = lazyWithRetry(() => import('../EarningsChartsPanel'));

function EarningsTab({ earnings, earningsLoading, earningsFilter, setEarningsFilter }: StatsDashboardContext) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const totals = resolveTotals(earnings);
  const insights = useMemo(() => computeEarningsInsights(totals, earnings?.history), [totals, earnings?.history]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-lg font-black text-white uppercase tracking-widest">{t('powerStats.tab.earnings')}</h2>
        <PeriodPills value={earningsFilter} onChange={setEarningsFilter} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('powerStats.dashboard.kpi_total')}
          value={`${earningsLoading ? '…' : formatPolAmount(totals.total, locale)} POL`}
          icon={Coins}
          accent="text-amber-400"
          border="border-amber-500/25 bg-amber-500/5"
        />
        <StatCard
          label={t('powerStats.dashboard.kpi_avg_daily')}
          value={`${formatPolAmount(insights.avgDaily, locale)} POL`}
          icon={TrendingUp}
          accent="text-sky-400"
        />
        <StatCard
          label={t('powerStats.dashboard.kpi_best_day')}
          value={
            insights.bestDay
              ? `${formatPolAmount(insights.bestDay.total, locale)} POL`
              : '—'
          }
          sub={insights.bestDay ? formatUtcChartDay(insights.bestDay.date) : undefined}
          icon={Award}
          accent="text-emerald-400"
        />
        <StatCard
          label={t('powerStats.dashboard.kpi_last_credit')}
          value={
            insights.lastEarning
              ? `${formatPolAmount(insights.lastEarning.total, locale)} POL`
              : '—'
          }
          sub={insights.lastEarning ? formatUtcChartDay(insights.lastEarning.date) : t('powerStats.charts.no_data')}
          icon={Calendar}
          accent="text-violet-400"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="p-3">{t('powerStats.dashboard.col_system')}</th>
              <th className="p-3">{t('powerStats.dashboard.col_earned')}</th>
              <th className="p-3">{t('powerStats.dashboard.col_share')}</th>
              <th className="p-3">{t('powerStats.dashboard.col_last_credit')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {EARNINGS_CATEGORY_KEYS.map((key) => {
              const val = Number(totals[key]) || 0;
              const last = insights.lastCategoryCredit[key];
              return (
                <tr key={key} className="hover:bg-slate-800/20">
                  <td className="p-3 font-medium text-white">{t(`powerStats.earnings.sources.${key}`)}</td>
                  <td className="p-3 font-mono text-amber-300">{formatPolAmount(val, locale)} POL</td>
                  <td className="p-3 text-sky-400">{percentOfTotal(val, totals.total)}%</td>
                  <td className="p-3 text-slate-500 text-xs">{last ? formatUtcChartDay(last) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-pink-400/90">{t('powerStats.earnings.referral_since_note')}</p>

      <Suspense fallback={<ChartsFallback />}>
        <EarningsChartsPanel totals={totals} history={earnings?.history ?? []} />
      </Suspense>
    </div>
  );
}

export default memo(EarningsTab);
