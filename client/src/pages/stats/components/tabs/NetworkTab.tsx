import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { formatHashrate } from '../../../../shared/utils/machine';
import type { StatsDashboardContext } from '../../stats.types';

function NetworkTab({ power }: StatsDashboardContext) {
  const { t } = useTranslation();
  const network = power.network;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            {t('powerStats.network.title')}
          </h3>
          <p className="text-xs text-slate-500">{t('powerStats.network.rank_label')}</p>
          <p className="text-3xl font-black text-white">
            {network?.userRank != null ? `#${network.userRank}` : '—'}{' '}
            <span className="text-lg text-slate-500 font-bold">/ {network?.totalRankedUsers ?? '—'}</span>
          </p>
          <p className="text-xs text-slate-400">
            {t('powerStats.network.active_users', { n: network?.activeUsersLast24h ?? 0 })}
          </p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.network.blk_pool')}</h3>
          {network?.lastBlkCycle ? (
            <>
              <p className="text-lg font-mono text-amber-400">{formatHashrate(network.lastBlkCycle.totalHashrate)}</p>
              <p className="text-xs text-slate-500">
                {t('powerStats.network.miners_in_cycle', { n: network.lastBlkCycle.minerCount })}
              </p>
              {network.blkPoolSharePercent != null && (
                <p className="text-sm text-emerald-400">
                  {t('powerStats.network.your_share', { pct: network.blkPoolSharePercent })}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-600">{t('powerStats.network.no_cycle')}</p>
          )}
          {network?.blkPaused && <p className="text-xs text-amber-500">{t('powerStats.network.blk_paused')}</p>}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.peak_share')}</p>
          <p className="text-2xl font-mono text-emerald-400 mt-2">
            {power.analytics?.miningLogPeakShare?.toFixed(4) ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.avg_share')}</p>
          <p className="text-2xl font-mono text-sky-400 mt-2">
            {power.analytics?.miningLogAvgShare?.toFixed(4) ?? '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
          <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.samples')}</p>
          <p className="text-2xl font-mono text-white mt-2">{power.analytics?.miningLogSamples ?? 0}</p>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">{t('powerStats.payout.title')}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {(power.payout?.rows || []).map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-800 p-4 space-y-2">
              <p className="text-xs font-black text-slate-500 uppercase">{t(row.labelKey)}</p>
              <p className="text-2xl font-black text-white">{row.percent}%</p>
              <p className="text-[10px] text-slate-600">{t(row.noteKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(NetworkTab);
