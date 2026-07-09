import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  UserPlus,
  Users,
  Coins,
  Copy,
  RefreshCw,
  Loader2,
  TrendingUp,
  Link2,
} from 'lucide-react';
import {
  buildReferralLink,
  fetchReferralStats,
  formatPolAmount,
  formatShibAmount,
  formatUsdAmount,
  type ReferralStatsPayload,
} from './referrals.api';

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof UserPlus;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{label}</p>
          <p className={`text-2xl font-black mt-1 ${accent}`}>{value}</p>
          {sub ? <p className="text-[10px] text-gray-500 mt-1">{sub}</p> : null}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 border border-white/8">
          <Icon className={`w-5 h-5 ${accent}`} />
        </div>
      </div>
    </div>
  );
}

export default function ReferralsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [data, setData] = useState<ReferralStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchReferralStats();
      if (res.ok) setData(res);
    } catch {
      toast.error(t('referrals.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const referralLink = useMemo(() => {
    if (!data) return '';
    return buildReferralLink(data.referralId, data.refCode);
  }, [data]);

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success(t('referrals.link_copied'));
    } catch {
      toast.error(t('referrals.copy_failed'));
    }
  };

  const commissionPct = data ? Math.round(data.commissionRate * 100) : 10;

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-pink-500/10 rounded-2xl">
            <UserPlus className="w-6 h-6 text-pink-400" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('referrals.title')}</h1>
          <p className="text-gray-500 font-medium max-w-2xl">{t('referrals.subtitle', { rate: commissionPct })}</p>
          {data?.statsSince ? (
            <p className="text-xs text-pink-400/90 font-bold">
              {t('referrals.stats_since', { date: data.statsSince })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-3 bg-gray-800/50 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl transition-all border border-gray-700/50"
          aria-label={t('referrals.refresh')}
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {data ? (
        <div className="rounded-2xl border border-pink-500/20 bg-pink-950/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-pink-400" />
            <p className="text-sm font-black text-white">{t('referrals.your_link')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={referralLink}
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-gray-300 font-mono"
            />
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-black transition-colors"
            >
              <Copy className="w-4 h-4" />
              {t('referrals.copy_link')}
            </button>
          </div>
          <p className="text-[10px] text-gray-500">
            {t('referrals.code_label')}: <span className="text-gray-300 font-mono">{data.refCode || data.referralId}</span>
          </p>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard
              label={t('referrals.total_referred')}
              value={String(data.summary.totalReferred)}
              sub={t('referrals.joined_since', { count: data.summary.referredJoinedSince })}
              icon={Users}
              accent="text-sky-400"
            />
            <StatCard
              label={t('referrals.total_deposited')}
              value={`${formatPolAmount(data.summary.totalDepositedPol, locale)} POL`}
              sub={[
                data.summary.totalDepositedUsd != null
                  ? formatUsdAmount(data.summary.totalDepositedUsd, locale)
                  : null,
                t('referrals.deposit_count', { count: data.summary.depositCount }),
              ].filter(Boolean).join(' · ')}
              icon={Coins}
              accent="text-violet-400"
            />
            <StatCard
              label={t('referrals.active_in_period')}
              value={String(data.summary.activeInPeriod)}
              sub={t('referrals.earnings_events', { count: data.summary.earningsCount })}
              icon={TrendingUp}
              accent="text-emerald-400"
            />
            <StatCard
              label={t('referrals.earned_pol')}
              value={`${formatPolAmount(data.summary.totalEarningsPol, locale)} POL`}
              icon={Coins}
              accent="text-amber-400"
            />
            <StatCard
              label={t('referrals.earned_shib')}
              value={`${formatShibAmount(data.summary.totalEarningsShib, locale)} SHIB`}
              icon={Coins}
              accent="text-orange-400"
            />
          </div>

          {data.bySource.length > 0 ? (
            <section className="rounded-2xl border border-white/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 bg-white/3">
                <p className="text-sm font-black text-white">{t('referrals.by_source')}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-gray-500 bg-black/20">
                    <tr>
                      <th className="px-5 py-3">{t('referrals.col_source')}</th>
                      <th className="px-5 py-3">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3">{t('referrals.col_shib')}</th>
                      <th className="px-5 py-3 text-right">{t('referrals.col_events')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.bySource.map((row) => (
                      <tr key={row.source}>
                        <td className="px-5 py-3 font-bold text-white">{row.source}</td>
                        <td className="px-5 py-3 text-amber-300 tabular-nums">{formatPolAmount(row.pol, locale)}</td>
                        <td className="px-5 py-3 text-orange-300 tabular-nums">{formatShibAmount(row.shib, locale)}</td>
                        <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-white/8 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/8 bg-white/3 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-white">{t('referrals.referred_users')}</p>
              <span className="text-[10px] font-bold text-gray-500">{data.referredUsers.length}</span>
            </div>
            {data.referredUsers.length === 0 ? (
              <div className="py-14 text-center text-gray-500 text-sm font-bold">{t('referrals.empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-gray-500 bg-black/20">
                    <tr>
                      <th className="px-5 py-3">{t('referrals.col_user')}</th>
                      <th className="px-5 py-3">{t('referrals.col_joined')}</th>
                      <th className="px-5 py-3">{t('referrals.col_deposited')}</th>
                      <th className="px-5 py-3">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3">{t('referrals.col_shib')}</th>
                      <th className="px-5 py-3 text-right">{t('referrals.col_events')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {data.referredUsers.map((row) => (
                      <tr key={row.userId}>
                        <td className="px-5 py-3 font-bold text-white">{row.username}</td>
                        <td className="px-5 py-3 text-gray-400 text-xs">
                          {new Date(row.joinedAt).toLocaleDateString(locale)}
                        </td>
                        <td className="px-5 py-3 text-violet-300 tabular-nums">
                          <div>{formatPolAmount(row.depositedPol, locale)} POL</div>
                          {row.depositedUsd != null ? (
                            <div className="text-[10px] text-gray-500">{formatUsdAmount(row.depositedUsd, locale)}</div>
                          ) : null}
                          {row.depositCount > 0 ? (
                            <div className="text-[10px] text-gray-600">{t('referrals.deposit_count', { count: row.depositCount })}</div>
                          ) : null}
                        </td>
                        <td className="px-5 py-3 text-amber-300 tabular-nums">{formatPolAmount(row.earningsPol, locale)}</td>
                        <td className="px-5 py-3 text-orange-300 tabular-nums">{formatShibAmount(row.earningsShib, locale)}</td>
                        <td className="px-5 py-3 text-right text-gray-400 tabular-nums">{row.transactionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {data.daily.length > 0 ? (
            <section className="rounded-2xl border border-white/8 overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8 bg-white/3">
                <p className="text-sm font-black text-white">{t('referrals.daily_earnings')}</p>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase tracking-widest text-gray-500 bg-black/20 sticky top-0">
                    <tr>
                      <th className="px-5 py-3">{t('referrals.col_date')}</th>
                      <th className="px-5 py-3">{t('referrals.col_pol')}</th>
                      <th className="px-5 py-3">{t('referrals.col_shib')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...data.daily].reverse().map((row) => (
                      <tr key={row.date}>
                        <td className="px-5 py-3 text-gray-300">{row.date}</td>
                        <td className="px-5 py-3 text-amber-300 tabular-nums">{formatPolAmount(row.pol, locale)}</td>
                        <td className="px-5 py-3 text-orange-300 tabular-nums">{formatShibAmount(row.shib, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
