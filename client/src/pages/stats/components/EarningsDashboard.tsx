import { lazy, memo, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Coins,
  Droplets,
  Gamepad2,
  Gift,
  Link2,
  Pickaxe,
  TrendingUp,
  Users,
  Youtube,
  Zap,
  Cpu,
  Sparkles,
  CalendarCheck,
  LayoutGrid,
} from 'lucide-react';
import { formatHashrate } from '../../../shared/utils/machine';
import type { UserPowerStatsPayload } from '../stats.api';
import {
  formatPolAmount,
  type EarningsPeriod,
  type UserEarningsPayload,
} from '../stats.earnings.api';

const EarningsChartsPanel = lazy(() => import('./EarningsChartsPanel'));

const PERIODS: EarningsPeriod[] = ['7d', '30d', '90d', 'all'];

type CardDef = {
  key: keyof Pick<
    UserEarningsPayload,
    'mining' | 'offerwall' | 'faucet' | 'shortlinks' | 'youtube' | 'games' | 'autoMining' | 'checkin' | 'referrals'
  >;
  icon: LucideIcon;
  color: string;
  border: string;
  showReferralNote?: boolean;
};

const EARNING_CARDS: CardDef[] = [
  { key: 'mining', icon: Pickaxe, color: 'text-emerald-400', border: 'border-emerald-500/25 bg-emerald-500/5' },
  { key: 'offerwall', icon: LayoutGrid, color: 'text-violet-400', border: 'border-violet-500/25 bg-violet-500/5' },
  { key: 'faucet', icon: Droplets, color: 'text-sky-400', border: 'border-sky-500/25 bg-sky-500/5' },
  { key: 'shortlinks', icon: Link2, color: 'text-orange-400', border: 'border-orange-500/25 bg-orange-500/5' },
  { key: 'autoMining', icon: Zap, color: 'text-purple-400', border: 'border-purple-500/25 bg-purple-500/5' },
  { key: 'youtube', icon: Youtube, color: 'text-red-400', border: 'border-red-500/25 bg-red-500/5' },
  { key: 'games', icon: Gamepad2, color: 'text-yellow-400', border: 'border-yellow-500/25 bg-yellow-500/5' },
  { key: 'checkin', icon: CalendarCheck, color: 'text-teal-400', border: 'border-teal-500/25 bg-teal-500/5' },
  { key: 'referrals', icon: Users, color: 'text-pink-400', border: 'border-pink-500/25 bg-pink-500/5', showReferralNote: true },
];

type Props = {
  power: UserPowerStatsPayload | null;
  earnings: UserEarningsPayload | undefined;
  earningsLoading: boolean;
  period: EarningsPeriod;
  onPeriodChange: (p: EarningsPeriod) => void;
  ratioBar: { p: number; tmp: number };
};

function ChartsFallback() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="h-[320px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
      <div className="h-[320px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
    </div>
  );
}

function EarningsDashboardInner({ power, earnings, earningsLoading, period, onPeriodChange, ratioBar }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const overview = power?.overview;

  const totals = useMemo(
    () =>
      earnings ?? {
        total: 0,
        mining: 0,
        offerwall: 0,
        offerwallInternal: 0,
        offerwallExternal: 0,
        faucet: 0,
        shortlinks: 0,
        youtube: 0,
        games: 0,
        autoMining: 0,
        checkin: 0,
        referrals: 0,
      },
    [earnings],
  );

  const meta = earnings?.powerMeta;

  return (
    <div className="space-y-8">
      {/* Hero — power + meta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-slate-900/80 to-slate-950 p-6">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-sky-400/90">
            <Activity className="w-4 h-4" />
            {t('powerStats.total_power')}
          </div>
          <p className="mt-2 text-3xl font-black text-white tabular-nums">{formatHashrate(overview?.totalHashrate)}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t('powerStats.total_tooltip')}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-slate-950 p-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">{t('powerStats.permanent')}</div>
          <p className="mt-2 text-2xl font-black text-emerald-400 tabular-nums">{formatHashrate(overview?.permanentHashrate)}</p>
        </div>
        <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-slate-950 p-6">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">{t('powerStats.temporary')}</div>
          <p className="mt-2 text-2xl font-black text-amber-400 tabular-nums">{formatHashrate(overview?.temporaryHashrate)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-6 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <Cpu className="w-4 h-4 mx-auto text-slate-500 mb-1" />
              <p className="text-lg font-black text-white tabular-nums">{meta?.machineCount ?? '—'}</p>
              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">{t('powerStats.earnings.machines')}</p>
            </div>
            <div>
              <Sparkles className="w-4 h-4 mx-auto text-amber-500 mb-1" />
              <p className="text-lg font-black text-white tabular-nums">{meta?.activeBoosts ?? '—'}</p>
              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">{t('powerStats.earnings.boosts')}</p>
            </div>
            <div>
              <TrendingUp className="w-4 h-4 mx-auto text-sky-400 mb-1" />
              <p className="text-lg font-black text-sky-400 tabular-nums">+{formatHashrate(meta?.powerGained24h)}</p>
              <p className="text-[9px] uppercase font-bold text-slate-600 tracking-wider">{t('powerStats.earnings.delta_24h')}</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${ratioBar.p}%` }} />
            <div className="h-full bg-amber-500" style={{ width: `${ratioBar.tmp}%` }} />
          </div>
        </div>
      </div>

      {/* Total earnings hero card */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-slate-900 to-slate-950 p-8">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <Coins className="w-4 h-4" />
              {t('powerStats.earnings.total_title')}
            </div>
            <p className="mt-2 text-4xl md:text-5xl font-black text-white tabular-nums tracking-tight">
              {earningsLoading ? '…' : formatPolAmount(totals.total, locale)}
              <span className="text-xl text-amber-400/80 ml-2">POL</span>
            </p>
            <p className="mt-2 text-sm text-slate-400 max-w-lg">{t('powerStats.earnings.total_desc')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-colors ${
                  period === p
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900/80 text-slate-500 border-slate-700 hover:text-white'
                }`}
              >
                {t(`powerStats.earnings.period.${p}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seus Ganhos */}
      <div>
        <h2 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2 mb-1">
          <Gift className="w-5 h-5 text-amber-400" />
          {t('powerStats.earnings.section_title')}
        </h2>
        <p className="text-sm text-slate-500 mb-5">{t('powerStats.earnings.section_subtitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {EARNING_CARDS.map(({ key, icon: Icon, color, border, showReferralNote }) => (
            <div key={key} className={`rounded-2xl border p-5 ${border}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon className={`w-5 h-5 ${color}`} />
                <h3 className="text-xs font-black uppercase tracking-widest text-white">
                  {t(`powerStats.earnings.sources.${key}`)}
                </h3>
              </div>
              <p className={`text-2xl font-black tabular-nums ${color}`}>
                {earningsLoading ? '…' : formatPolAmount(Number(totals[key]), locale)}
                <span className="text-sm ml-1 opacity-70">POL</span>
              </p>
              <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                {t(`powerStats.earnings.descriptions.${key}`)}
              </p>
              {showReferralNote && (
                <p className="mt-3 text-[10px] text-pink-400/90 font-medium leading-snug border-t border-pink-500/20 pt-3">
                  {t('powerStats.earnings.referral_since_note')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <Suspense fallback={<ChartsFallback />}>
        <EarningsChartsPanel totals={totals} history={earnings?.history ?? []} />
      </Suspense>
    </div>
  );
}

export default memo(EarningsDashboardInner);
