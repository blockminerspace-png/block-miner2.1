import { memo, Suspense, useMemo } from 'react';
import { lazyWithRetry } from '../../../../shared/utils/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import { Activity, Coins, Cpu, Sparkles, TrendingUp } from 'lucide-react';
import { formatHashrate } from '../../../../shared/utils/machine';
import { formatPolAmount } from '../../stats.earnings.api';
import { EARNINGS_CATEGORY_KEYS } from '../../stats.config';
import { computeEarningsInsights, percentOfTotal, resolveTotals } from '../../utils/earningsAnalytics';
import type { StatsDashboardContext } from '../../stats.types';
import StatCard from '../ui/StatCard';
import ChartsFallback from '../ui/ChartsFallback';

const EarningsChartsPanel = lazyWithRetry(() => import('../EarningsChartsPanel'));
const ExpiryProgressList = lazyWithRetry(() => import('../ExpiryProgressList'));

function SummaryTab({ power, earnings, earningsLoading, ratioBar, onNavigateTab }: StatsDashboardContext) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const overview = power.overview;
  const totals = resolveTotals(earnings);
  const meta = earnings?.powerMeta;
  const insights = useMemo(() => computeEarningsInsights(totals, earnings?.history), [totals, earnings?.history]);

  const topExpirations = (overview?.nextExpirations ?? []).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('powerStats.total_power')}
          value={formatHashrate(overview?.totalHashrate)}
          icon={Activity}
          accent="text-sky-400"
          border="border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-slate-950"
        />
        <StatCard
          label={t('powerStats.earnings.total_title')}
          value={
            <>
              {earningsLoading ? '…' : formatPolAmount(totals.total, locale)}
              <span className="text-lg text-amber-400/80 ml-1">POL</span>
            </>
          }
          icon={Coins}
          accent="text-amber-400"
          border="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-slate-950"
        />
        <StatCard
          label={t('powerStats.earnings.machines')}
          value={meta?.machineCount ?? '—'}
          icon={Cpu}
          accent="text-emerald-400"
          border="border-emerald-500/25 bg-emerald-500/5"
        />
        <StatCard
          label={t('powerStats.earnings.boosts')}
          value={meta?.activeBoosts ?? '—'}
          sub={
            <span className="inline-flex items-center gap-1 text-sky-400">
              <TrendingUp className="w-3 h-3" />+{formatHashrate(meta?.powerGained24h)} {t('powerStats.dashboard.last_24h')}
            </span>
          }
          icon={Sparkles}
          accent="text-amber-400"
          border="border-amber-500/25 bg-amber-500/5"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label={t('powerStats.dashboard.earn_today')}
          value={`${formatPolAmount(insights.today, locale)} POL`}
          accent="text-white"
          className="!p-4"
        />
        <StatCard
          label={t('powerStats.dashboard.earn_yesterday')}
          value={`${formatPolAmount(insights.yesterday, locale)} POL`}
          accent="text-slate-300"
          className="!p-4"
        />
        <StatCard
          label={t('powerStats.dashboard.best_system')}
          value={t(`powerStats.earnings.sources.${insights.bestSystem.key}`)}
          sub={`${formatPolAmount(insights.bestSystem.value, locale)} POL`}
          accent="text-violet-400"
          className="!p-4"
        />
        <StatCard
          label={t('powerStats.mix')}
          value={`${Math.round(ratioBar.p)}% / ${Math.round(ratioBar.tmp)}%`}
          sub={t('powerStats.mix_tooltip')}
          accent="text-slate-300"
          className="!p-4"
        />
      </div>

      <section>
        <h2 className="text-sm font-black text-white uppercase tracking-widest mb-4">
          {t('powerStats.dashboard.financial_summary')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {EARNINGS_CATEGORY_KEYS.map((key) => {
            const val = Number(totals[key]) || 0;
            const pct = percentOfTotal(val, totals.total);
            return (
              <div key={key} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-white">{t(`powerStats.earnings.sources.${key}`)}</p>
                  <span className="text-[10px] font-black text-sky-400">{pct}%</span>
                </div>
                <p className="text-lg font-black text-sky-300 tabular-nums">
                  {earningsLoading ? '…' : formatPolAmount(val, locale)} <span className="text-xs text-slate-500">POL</span>
                </p>
                <p className="text-[10px] text-slate-600 mt-1">{t(`powerStats.earnings.descriptions.${key}`)}</p>
                {key === 'referrals' ? (
                  <p className="text-[10px] text-pink-400/90 mt-2 border-t border-pink-500/20 pt-2">
                    {t('powerStats.earnings.referral_since_note')}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <Suspense fallback={<ChartsFallback />}>
        <EarningsChartsPanel totals={totals} history={earnings?.history ?? []} mode="summary" />
      </Suspense>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.next_expirations')}</h2>
          <button
            type="button"
            onClick={() => onNavigateTab('boosts')}
            className="text-[10px] font-black uppercase tracking-wider text-sky-400 hover:text-sky-300"
          >
            {t('powerStats.dashboard.view_all')}
          </button>
        </div>
        <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-slate-800/40" />}>
          <ExpiryProgressList rows={topExpirations} />
        </Suspense>
      </section>
    </div>
  );
}

export default memo(SummaryTab);
