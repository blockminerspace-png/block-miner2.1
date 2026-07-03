import { memo, Suspense, useMemo, useState } from 'react';
import { lazyWithRetry } from '../../../../shared/utils/lazyWithRetry';
import { useTranslation } from 'react-i18next';
import type { BoostFilter } from '../../stats.config';
import { collectAllBoostRows, filterBoostRows } from '../../utils/boostRows';
import type { StatsDashboardContext } from '../../stats.types';

const BoostsTable = lazyWithRetry(() => import('../BoostsTable'));
const BoostsDetailSections = lazyWithRetry(() => import('../BoostsDetailSections'));

const FILTERS: BoostFilter[] = ['all', 'games', 'youtube', 'autoMining', 'faucet', 'checkin'];

function BoostsTab({ power }: StatsDashboardContext) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<BoostFilter>('all');
  const allRows = useMemo(() => collectAllBoostRows(power), [power]);
  const rows = useMemo(() => filterBoostRows(allRows, filter), [allRows, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
              filter === f
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-900/80 text-slate-500 border-slate-700 hover:text-white'
            }`}
          >
            {t(`powerStats.dashboard.boost_filter.${f}`)}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">
        {t('powerStats.dashboard.boosts_active', { n: rows.length })}
      </p>

      <Suspense fallback={<div className="h-32 animate-pulse rounded-xl bg-slate-800/40" />}>
        <BoostsTable rows={rows} />
      </Suspense>

      {filter === 'all' ? (
        <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-slate-800/40" />}>
          <BoostsDetailSections power={power} />
        </Suspense>
      ) : null}
    </div>
  );
}

export default memo(BoostsTab);
