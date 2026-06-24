import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Activity,
  Cpu,
  Gamepad2,
  Globe,
  History,
  Loader2,
  RefreshCw,
  Timer,
  Youtube,
  Zap,
  Download,
  ChevronDown,
  ChevronUp,
  CalendarCheck
} from 'lucide-react';
import { useUserPowerStats } from '../../shared/hooks/useUserPowerStats';
import { formatHashrate } from '../../shared/utils/machine';
import type { UserPowerStatsPayload } from './stats.api';
import CalculatorPage from '../calculator/CalculatorPage';
import AdRotator, { POWER_STATS_ADS, POWER_STATS_ADS_300 } from '../../shared/components/AdRotator';

/** Recharts is heavy (~hundreds of KB); load it in a separate chunk so `/power-stats` shell paints quickly. */
const PowerChartsPanel = lazy(() => import('./components/PowerChartsPanel'));

function PowerChartsFallback() {
  return (
    <div
      className="grid grid-cols-1 xl:grid-cols-2 gap-6"
      role="status"
      aria-busy="true"
      aria-label="Charts loading"
    >
      <div className="h-[280px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
      <div className="h-[280px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
    </div>
  );
}

const TABS = ['overview', 'machines', 'temporary', 'network', 'history', 'calculator'];

function formatDurationMs(ms: number) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function ExpiryBadge({ expiresAt, t }: { expiresAt?: string | null; t: TFunction }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const end = expiresAt ? new Date(expiresAt).getTime() : 0;
  const left = end - Date.now();
  if (!expiresAt) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
      <Timer className="w-3 h-3" />
      {left <= 0 ? t('powerStats.expired') : formatDurationMs(left)}
    </span>
  );
}

function exportPowerStatsCsv(data: UserPowerStatsPayload | null | undefined, filenameBase: string) {
  const rows: string[][] = [['section', 'field', 'value']];
  const add = (section: string, field: string, value: unknown) => {
    rows.push([section, field, String(value ?? '')]);
  };
  if (!data) return;
  add('overview', 'totalHashrate', data.overview?.totalHashrate);
  add('overview', 'permanentHashrate', data.overview?.permanentHashrate);
  add('overview', 'temporaryHashrate', data.overview?.temporaryHashrate);
  (data.machines?.items || []).forEach((m, i) => {
    add('machine', `slot_${i}`, `${m.minerName},${m.hashRate},active=${m.isActive}`);
  });
  const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8;'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PowerStatistics() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useUserPowerStats(45000);
  const [tab, setTab] = useState('overview');
  const [openMachine, setOpenMachine] = useState(true);
  const [openTemp, setOpenTemp] = useState(true);

  const overview = data?.overview;
  const ratioBar = useMemo(() => {
    if (!overview?.totalHashrate) return { p: 50, tmp: 50 };
    const t = overview.totalHashrate || 1;
    return {
      p: ((overview.permanentHashrate ?? 0) / t) * 100,
      tmp: ((overview.temporaryHashrate ?? 0) / t) * 100
    };
  }, [overview]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-24">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-sky-500/10 rounded-2xl">
            <Activity className="w-7 h-7 text-sky-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('powerStats.title')}</h1>
          <p className="text-slate-500 font-medium max-w-xl">{t('powerStats.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('powerStats.refresh')}
          </button>
          <button
            type="button"
            onClick={() => data && exportPowerStatsCsv(data, 'blockminer-power-stats')}
            disabled={!data}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 text-xs font-bold uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            {t('powerStats.export_csv')}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-3 py-24 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-bold uppercase tracking-widest">{t('common.loading')}</span>
        </div>
      ) : data ? (
        <>
          <div
            className="flex flex-wrap gap-2 p-1 bg-slate-900/80 border border-slate-800 rounded-2xl"
            role="tablist"
            aria-label={t('powerStats.tabs_label')}
          >
            {TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors ${
                  tab === id ? 'bg-sky-500 text-slate-950' : 'text-slate-500 hover:text-white'
                }`}
              >
                {t(`powerStats.tab.${id}`)}
              </button>
            ))}
          </div>

          {/* Slot A: Ad after tab bar */}
          <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="power-stats-top" />

          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('powerStats.total_power')}</p>
                  <p className="text-2xl font-black text-white">{formatHashrate(overview?.totalHashrate)}</p>
                  <p className="text-[10px] text-slate-600">{t('powerStats.total_tooltip')}</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 space-y-2">
                  <p className="text-[10px] font-black text-emerald-500/80 uppercase tracking-widest">{t('powerStats.permanent')}</p>
                  <p className="text-2xl font-black text-emerald-400">{formatHashrate(overview?.permanentHashrate)}</p>
                  <p className="text-[10px] text-slate-600">{t('powerStats.permanent_tooltip')}</p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-2">
                  <p className="text-[10px] font-black text-amber-500/80 uppercase tracking-widest">{t('powerStats.temporary')}</p>
                  <p className="text-2xl font-black text-amber-400">{formatHashrate(overview?.temporaryHashrate)}</p>
                  <p className="text-[10px] text-slate-600">{t('powerStats.temporary_tooltip')}</p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('powerStats.mix')}</p>
                  <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex" title={t('powerStats.mix_tooltip')}>
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${ratioBar.p}%` }} />
                    <div className="h-full bg-amber-500 transition-all" style={{ width: `${ratioBar.tmp}%` }} />
                  </div>
                  <p className="text-xs text-slate-400">
                    {overview?.permanentPercent ?? 0}% {t('powerStats.permanent_short')} · {overview?.temporaryPercent ?? 0}% {t('powerStats.temporary_short')}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                  <Timer className="w-4 h-4 text-amber-400" />
                  {t('powerStats.next_expirations')}
                </h2>
                {(overview?.nextExpirations || []).length === 0 ? (
                  <p className="text-sm text-slate-600">{t('powerStats.no_active_temporary')}</p>
                ) : (
                  <ul className="space-y-2">
                    {(overview?.nextExpirations || []).map((row, idx) => (
                      <li
                        key={`${row.source}-${row.slug}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800/80 last:border-0"
                      >
                        <div>
                          <span className="text-xs font-bold text-white">{row.name}</span>
                          <span className="text-[10px] text-slate-600 ml-2 uppercase">({row.source})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-sky-400">{formatHashrate(row.hashRate)}</span>
                          <ExpiryBadge expiresAt={row.expiresAt} t={t} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Suspense fallback={<PowerChartsFallback />}>
                <PowerChartsPanel overview={overview} history={data.history} />
              </Suspense>

              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-2">
                <h2 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.projections_title')}</h2>
                <p className="text-sm text-slate-400">{t('powerStats.projection_permanent', { hr: (overview?.permanentHashrate ?? 0).toFixed(2) })}</p>
                <p className="text-sm text-slate-400">{t('powerStats.projection_temporary', { hr: (overview?.temporaryHashrate ?? 0).toFixed(2) })}</p>
                <ul className="list-disc list-inside text-xs text-slate-500 space-y-1 mt-2">
                  {(data.projections?.hintKeys || []).map((k) => (
                    <li key={k}>{t(k)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Slot B: Ad after overview section */}
          {tab === 'overview' && <AdRotator ads={POWER_STATS_ADS_300} size="300x250" slotId="power-stats-mid" />}

          {tab === 'machines' && (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setOpenMachine((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl text-left"
              >
                <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  {t('powerStats.machines.summary', {
                    active: data.machines?.activeCount ?? 0,
                    inactive: data.machines?.inactiveCount ?? 0
                  })}
                </span>
                {openMachine ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </button>
              {openMachine && (
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
                      {(data.machines?.items || []).map((m) => (
                        <tr key={m.id} className="hover:bg-slate-800/30">
                          <td className="p-3 font-medium text-white">{m.minerName}</td>
                          <td className="p-3 font-mono text-sky-400">{formatHashrate(m.hashRate)}</td>
                          <td className="p-3">
                            <span className={m.isActive ? 'text-emerald-400' : 'text-slate-600'}>
                              {m.isActive ? t('powerStats.active') : t('powerStats.inactive')}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 text-xs">
                            {m.roomNumber != null ? t('powerStats.room_rack', { room: m.roomNumber, pos: m.rackPosition ?? '—' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'temporary' && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setOpenTemp((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 border border-slate-800 rounded-xl text-left"
              >
                <span className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  {t('powerStats.temporary_detail')}
                </span>
                {openTemp ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
              {openTemp && (
                <div className="grid gap-6">
                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                      <Youtube className="w-4 h-4" />
                      {t('powerStats.youtube.title')} — {formatHashrate(data.youtube?.activeTotal)}
                    </h3>
                    <ul className="space-y-2">
                      {(data.youtube?.activeItems || []).map((y) => (
                        <li key={y.id} className="flex justify-between items-center text-sm border-b border-slate-800/60 pb-2">
                          <span className="text-slate-400 font-mono text-xs">{y.sourceVideoId || '—'}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sky-400 font-mono">{formatHashrate(y.hashRate)}</span>
                            <ExpiryBadge expiresAt={y.expiresAt} t={t} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-slate-600 uppercase font-bold">{t('powerStats.youtube.history')}</p>
                    <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-slate-500">
                      {(data.youtube?.history || []).slice(0, 8).map((h) => (
                        <li key={h.id} className="flex justify-between">
                          <span>{h.sourceVideoId || '—'}</span>
                          <span>{formatHashrate(h.hashRate)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4" />
                      {t('powerStats.games.title')}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {t('powerStats.games.minigames')}: {formatHashrate(data.games?.minigameTotal)} · {t('powerStats.games.checkin')}:{' '}
                      {formatHashrate(data.games?.checkinBonusTotal)}
                    </p>
                    {(data.games?.byGame || []).map((g) => (
                      <div key={g.slug} className="border border-slate-800 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between">
                          <span className="font-bold text-white text-sm">{g.name}</span>
                          <span className="text-sky-400 font-mono text-sm">{formatHashrate(g.totalHashRate)}</span>
                        </div>
                        {g.items.map((it) => (
                          <div key={it.id} className="flex justify-between text-xs text-slate-500">
                            <ExpiryBadge expiresAt={it.expiresAt} t={t} />
                            <span>{formatHashrate(it.hashRate)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </section>

                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black text-violet-400 uppercase tracking-widest">{t('powerStats.auto_mining.title')}</h3>
                    <p className="text-sm text-white">{formatHashrate(data.autoMining?.total)}</p>
                    <ul className="space-y-2">
                      {(data.autoMining?.items || []).map((p) => (
                        <li key={p.id} className="flex justify-between items-center text-sm">
                          <span className="font-mono text-sky-400">{formatHashrate(p.gpuHashRate)}</span>
                          <ExpiryBadge expiresAt={p.expiresAt} t={t} />
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                      <CalendarCheck className="w-4 h-4" />
                      {t('powerStats.checkin.title')}
                    </h3>
                    <p className="text-sm text-slate-300">{t('powerStats.checkin.streak', { n: data.checkin?.streak ?? 0 })}</p>
                    <p className="text-xs text-slate-500">{t('powerStats.checkin.bonus_note')}</p>
                    <ul className="text-xs text-slate-400 space-y-1">
                      {(data.checkin?.nextHashrateMilestones || []).map((m) => (
                        <li key={m.dayThreshold}>
                          {t('powerStats.checkin.next_milestone', {
                            days: m.dayThreshold,
                            hr: m.rewardValue,
                            daysValid: m.validityDays
                          })}
                          {m.displayTitle ? ` — ${m.displayTitle}` : ''}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl p-5">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('powerStats.other.title')}</h3>
                    <p className="text-sm text-slate-500 mt-2">{t('powerStats.other.note')}</p>
                  </section>
                </div>
              )}
            </div>
          )}

          {tab === 'network' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Globe className="w-4 h-4 text-sky-400" />
                  {t('powerStats.network.title')}
                </h3>
                <p className="text-xs text-slate-500">{t('powerStats.network.rank_label')}</p>
                <p className="text-3xl font-black text-white">
                  {data.network?.userRank != null ? `#${data.network.userRank}` : '—'}{' '}
                  <span className="text-lg text-slate-500 font-bold">
                    / {data.network?.totalRankedUsers ?? '—'}
                  </span>
                </p>
                <p className="text-xs text-slate-400">{t('powerStats.network.active_users', { n: data.network?.activeUsersLast24h ?? 0 })}</p>
              </div>
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
                <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('powerStats.network.blk_pool')}</h3>
                {data.network?.lastBlkCycle ? (
                  <>
                    <p className="text-lg font-mono text-amber-400">{formatHashrate(data.network.lastBlkCycle.totalHashrate)}</p>
                    <p className="text-xs text-slate-500">
                      {t('powerStats.network.miners_in_cycle', { n: data.network.lastBlkCycle.minerCount })}
                    </p>
                    {data.network.blkPoolSharePercent != null && (
                      <p className="text-sm text-emerald-400">{t('powerStats.network.your_share', { pct: data.network.blkPoolSharePercent })}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-600">{t('powerStats.network.no_cycle')}</p>
                )}
                {data.network?.blkPaused && <p className="text-xs text-amber-500">{t('powerStats.network.blk_paused')}</p>}
              </div>
              <div className="md:col-span-2 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3">{t('powerStats.payout.title')}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {(data.payout?.rows || []).map((row) => (
                    <div key={row.key} className="rounded-xl border border-slate-800 p-4 space-y-2">
                      <p className="text-xs font-black text-slate-500 uppercase">{t(row.labelKey)}</p>
                      <p className="text-2xl font-black text-white">{row.percent}%</p>
                      <p className="text-[10px] text-slate-600">{t(row.noteKey)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'calculator' && <CalculatorPage />}

          {tab === 'history' && (
            <div className="space-y-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-4">
                  <History className="w-4 h-4" />
                  {t('powerStats.analytics.title')}
                </h3>
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.peak_share')}</p>
                    <p className="text-xl font-mono text-emerald-400">{data.analytics?.miningLogPeakShare?.toFixed(4) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.avg_share')}</p>
                    <p className="text-xl font-mono text-sky-400">{data.analytics?.miningLogAvgShare?.toFixed(4) ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{t('powerStats.analytics.samples')}</p>
                    <p className="text-xl font-mono text-white">{data.analytics?.miningLogSamples ?? 0}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-4">{t('powerStats.analytics.disclaimer')}</p>
              </div>
              <Suspense fallback={<PowerChartsFallback />}>
                <PowerChartsPanel overview={overview} history={data.history} />
              </Suspense>
            </div>
          )}

          {/* Slot C: Ad at bottom of page */}
          <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="power-stats-bottom" />
        </>
      ) : null}
    </div>
  );
}
