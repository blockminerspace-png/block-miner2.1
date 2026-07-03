import { Suspense, useMemo, useState } from 'react';
import { lazyWithRetry } from '../../shared/utils/lazyWithRetry';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { useUserPowerStats } from '../../shared/hooks/useUserPowerStats';
import { useUserEarningsStats } from '../../shared/hooks/useUserEarningsStats';
import { dashboardQueryClient } from '../../shared/query/dashboardQueryClient';
import { STATS_TABS, earningsFilterToApiPeriod, type StatsTabId, type EarningsUiFilter } from './stats.config';
import type { StatsDashboardContext } from './stats.types';
import AdRotator, { POWER_STATS_ADS, POWER_STATS_ADS_300 } from '../../shared/components/AdRotator';

const SummaryTab = lazyWithRetry(() => import('./components/tabs/SummaryTab'));
const EarningsTab = lazyWithRetry(() => import('./components/tabs/EarningsTab'));
const PowerTab = lazyWithRetry(() => import('./components/tabs/PowerTab'));
const MachinesTab = lazyWithRetry(() => import('./components/tabs/MachinesTab'));
const BoostsTab = lazyWithRetry(() => import('./components/tabs/BoostsTab'));
const NetworkTab = lazyWithRetry(() => import('./components/tabs/NetworkTab'));
const HistoryTab = lazyWithRetry(() => import('./components/tabs/HistoryTab'));
const ToolsTab = lazyWithRetry(() => import('./components/tabs/ToolsTab'));

function TabFallback() {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-slate-500" role="status" aria-busy="true">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export default function PowerStatistics() {
  return (
    <QueryClientProvider client={dashboardQueryClient}>
      <PowerStatisticsInner />
    </QueryClientProvider>
  );
}

function PowerStatisticsInner() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useUserPowerStats(45000);
  const [tab, setTab] = useState<StatsTabId>('summary');
  const [earningsFilter, setEarningsFilter] = useState<EarningsUiFilter>('30d');
  const apiPeriod = earningsFilterToApiPeriod(earningsFilter);
  const { data: earnings, isLoading: earningsLoading, refetch: refetchEarnings } = useUserEarningsStats(apiPeriod);

  const ratioBar = useMemo(() => {
    const overview = data?.overview;
    if (!overview?.totalHashrate) return { p: 50, tmp: 50 };
    const total = overview.totalHashrate || 1;
    return {
      p: ((overview.permanentHashrate ?? 0) / total) * 100,
      tmp: ((overview.temporaryHashrate ?? 0) / total) * 100,
    };
  }, [data?.overview]);

  const ctx: StatsDashboardContext | null = data
    ? {
        power: data,
        earnings,
        earningsLoading,
        earningsFilter,
        setEarningsFilter,
        ratioBar,
        onNavigateTab: setTab,
      }
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-sky-500/10 rounded-2xl">
            <Activity className="w-7 h-7 text-sky-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('powerStats.title')}</h1>
          <p className="text-slate-500 font-medium max-w-2xl">{t('powerStats.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refetch();
            void refetchEarnings();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('powerStats.refresh')}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      ) : null}

      {loading && !data ? (
        <TabFallback />
      ) : ctx ? (
        <>
          <div
            className="flex gap-1.5 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-x-auto scrollbar-thin"
            role="tablist"
            aria-label={t('powerStats.tabs_label')}
          >
            {STATS_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`shrink-0 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                  tab === id ? 'bg-sky-500 text-slate-950' : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {t(`powerStats.tab.${id}`)}
              </button>
            ))}
          </div>

          {tab === 'summary' ? <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="power-stats-top" /> : null}

          <Suspense fallback={<TabFallback />}>
            {tab === 'summary' && <SummaryTab {...ctx} />}
            {tab === 'earnings' && <EarningsTab {...ctx} />}
            {tab === 'power' && <PowerTab {...ctx} />}
            {tab === 'machines' && <MachinesTab {...ctx} />}
            {tab === 'boosts' && <BoostsTab {...ctx} />}
            {tab === 'network' && <NetworkTab {...ctx} />}
            {tab === 'history' && <HistoryTab {...ctx} />}
            {tab === 'tools' && <ToolsTab {...ctx} />}
          </Suspense>

          {tab === 'summary' ? <AdRotator ads={POWER_STATS_ADS_300} size="300x250" slotId="power-stats-mid" /> : null}
          <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="power-stats-bottom" />
        </>
      ) : null}
    </div>
  );
}
