import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Calendar, CheckCircle2, Trophy, Zap, Loader2, History, Gift, Lock, ExternalLink } from 'lucide-react';
import type { AxiosError } from 'axios';
import type { CheckinStatusPayload } from '../../types/checkin';
import { fetchCheckinStatus, postCheckinBalanceDaily, postCheckinWalletDaily } from './checkin.api';
import { sendCheckinTransaction, resolveCheckinPaymentTarget } from './checkin.contract';
import { CheckinWalletError, hasInjectedWallet } from './checkin.wallet';
import {
  balanceCoversWeiCost,
  buildPolygonscanTxUrl,
  formatPolFromWei,
  getDailySlice,
  isValidHistoryDateKey,
  mergeStatus,
  statusNeedsCheckinPoll,
} from '../../shared/utils/checkinHelpers';
import {
  formatCheckinAvailableUntil,
  formatCheckinNextReset,
  formatCheckinPeriodRange,
} from './checkinPeriodDisplay';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import {
  getCheckinMilestoneDayLabel,
  getCheckinMilestoneDescription,
  getCheckinMilestoneRewardLine,
  getCheckinMilestoneStatusLabel,
  getCheckinMilestoneTitle,
  normalizeCheckinRewardType,
} from './checkinMilestoneI18n';
import {
  readAxiosHttpStatus,
  readAxiosResponseMessage,
  shouldStopApiPolling,
} from '../../shared/utils/httpPollingGuard';

function readApiErrorPayload(err: unknown): { code?: string; message?: string } | null {
  if (!err || typeof err !== 'object' || !('response' in err)) return null;
  const ax = err as AxiosError<{ code?: string; message?: string }>;
  const d = ax.response?.data;
  if (!d || typeof d !== 'object') return null;
  return {
    code: typeof d.code === 'string' ? d.code : undefined,
    message: typeof d.message === 'string' ? d.message : undefined,
  };
}

export default function Checkin() {
  const { t } = useTranslation();
  const translateCheckinApi = useCallback(
    (code: string | undefined, fallbackMessage?: string) => {
      if (!code) return fallbackMessage || t('common.error');
      const key = `checkin.errors.${code}`;
      const txt = t(key);
      return txt === key ? fallbackMessage || t('common.error') : txt;
    },
    [t],
  );

  const [status, setStatus] = useState<CheckinStatusPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollHaltedRef = useRef(false);
  const [statusLoadError, setStatusLoadError] = useState<string | null>(null);
  /** Single-flight: wallet and balance paths cannot overlap (double-submit / race). */
  const payKindRef = useRef<'none' | 'wallet' | 'balance'>('none');

  const tryBeginPay = useCallback((kind: 'wallet' | 'balance'): boolean => {
    if (payKindRef.current !== 'none') return false;
    payKindRef.current = kind;
    setPaying(true);
    return true;
  }, []);

  const endPay = useCallback(() => {
    payKindRef.current = 'none';
    setPaying(false);
  }, []);

  const fetchStatus = useCallback(async (): Promise<CheckinStatusPayload | null> => {
    try {
      const data = await fetchCheckinStatus();
      if (data.ok) {
        setStatusLoadError(null);
        pollHaltedRef.current = false;
        setStatus((s) => mergeStatus(s, data));
        return data;
      }
      const envelopeMsg =
        typeof data === 'object' && data !== null && 'message' in data && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : null;
      setStatusLoadError(envelopeMsg || t('checkin.unavailable'));
      pollHaltedRef.current = true;
      setStatus({ ok: false });
    } catch (err) {
      const httpStatus = readAxiosHttpStatus(err);
      if (shouldStopApiPolling(httpStatus)) {
        pollHaltedRef.current = true;
      }
      setStatusLoadError(readAxiosResponseMessage(err, t('checkin.unavailable')));
      if (process.env.NODE_ENV !== 'production') {
        console.error('Check-in status', err);
      }
      setStatus({ ok: false });
    }
    return null;
  }, [t]);

  const load = useCallback(async () => {
    setIsLoading(true);
    await fetchStatus();
    setIsLoading(false);
  }, [fetchStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pollHaltedRef.current) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return undefined;
    }
    const needPoll = status && statusNeedsCheckinPoll(status);
    if (!needPoll) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return undefined;
    }
    pollRef.current = setInterval(() => {
      void fetchStatus();
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, fetchStatus]);

  const handleBalanceDaily = async () => {
    if (!status?.checkinBalanceAmountWei) {
      toast.error(t('common.error'));
      return;
    }
    if (!tryBeginPay('balance')) return;
    try {
      const d = await postCheckinBalanceDaily();
      if (d.ok && d.status === 'confirmed') {
        toast.success(
          t('checkin.reward_msg', {
            amount: `${formatPolFromWei(status.checkinBalanceAmountWei)} POL`,
          }),
        );
        await fetchStatus();
      } else if (d.ok && d.alreadyCheckedIn) {
        toast.success(t('checkin.claimed'));
        await fetchStatus();
      } else if (!d.ok) {
        toast.error(translateCheckinApi(d.code, d.message));
        await fetchStatus();
      }
    } catch (err) {
      const payload = readApiErrorPayload(err);
      if (payload?.code) {
        toast.error(translateCheckinApi(payload.code, payload.message));
        await fetchStatus();
      } else {
        const msg = err instanceof Error ? err.message : t('common.error');
        toast.error(msg);
      }
    } finally {
      endPay();
    }
  };

  const handleWalletDaily = async () => {
    if (!status || !resolveCheckinPaymentTarget(status)) {
      toast.error(t('common.error'));
      return;
    }
    if (!hasInjectedWallet()) {
      toast.error(t('checkin.no_wallet'));
      return;
    }
    if (!tryBeginPay('wallet')) return;
    try {
      const { txHash, walletAddress, chainId } = await sendCheckinTransaction(status);
      const d = await postCheckinWalletDaily({ txHash, walletAddress, chainId });
      if (d.ok && d.status === 'confirmed') {
        toast.success(
          t('checkin.reward_msg', { amount: `${formatPolFromWei(status.checkinAmountWei ?? '0')} POL` }),
        );
        await fetchStatus();
      } else if (d.ok && d.alreadyCheckedIn) {
        toast.success(t('checkin.claimed'));
        await fetchStatus();
      } else if (!d.ok && d.pending) {
        toast.message(translateCheckinApi(d.code, d.message));
        await fetchStatus();
      } else if (!d.ok) {
        toast.error(translateCheckinApi(d.code, d.message));
        await fetchStatus();
      }
    } catch (err: unknown) {
      if (err instanceof CheckinWalletError) {
        if (err.code === 'USER_REJECTED') {
          toast.error(t('checkin.rejected_wallet'));
        } else if (err.code === 'NO_INJECTED_WALLET') {
          toast.error(t('checkin.no_wallet'));
        } else if (err.code === 'WRONG_NETWORK') {
          toast.error(t('checkin.wrong_network'));
        } else {
          toast.error(err.message);
        }
        if (status?.allowsOffchainCheckin) {
          toast.message(
            t('checkin.wallet_failed_try_balance', {
              defaultValue: 'You can complete check-in using in-game POL instead.',
            }),
          );
        }
      } else {
        const e = err as { code?: number | string; message?: string };
        if (e?.code === 4001 || e?.code === '4001') {
          toast.error(t('checkin.rejected_wallet'));
        } else {
          const payload = readApiErrorPayload(err);
          if (payload?.code) {
            toast.error(translateCheckinApi(payload.code, payload.message));
            await fetchStatus();
          } else {
            toast.error(e?.message || t('common.error'));
          }
        }
      }
    } finally {
      endPay();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16 text-gray-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" />
        {t('common.loading')}
      </div>
    );
  }

  if (!status?.ok || status?.statusDegraded) {
    return (
      <div className="p-8 text-center text-gray-400 space-y-3 max-w-md mx-auto">
        <p>
          {status?.statusDegraded
            ? t('checkin.status_degraded')
            : statusLoadError || t('checkin.unavailable')}
        </p>
        {status?.statusDegraded ? (
          <p className="text-xs text-slate-600">{t('checkin.status_degraded_hint')}</p>
        ) : null}
        {!status?.statusDegraded ? (
          <button
            type="button"
            onClick={() => {
              pollHaltedRef.current = false;
              void load();
            }}
            className="mt-2 px-4 py-2 rounded-xl bg-surface border border-gray-700 text-sm font-semibold text-white hover:border-primary/50"
          >
            {t('common.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  const streak = status.streak ?? 0;
  const totalConfirmed = status.totalConfirmed ?? 0;
  const rawRecent = Array.isArray(status.recentCheckins) ? status.recentCheckins : [];
  const recentCheckins = rawRecent.filter((row) => row && isValidHistoryDateKey(row.date));
  const milestones = [...(Array.isArray(status.milestones) ? status.milestones : [])].sort(
    (a: any, b: any) => (Number(a.dayThreshold) || 0) - (Number(b.dayThreshold) || 0),
  );
  const allowsOffchain = status.allowsOffchainCheckin !== false;
  const allowsWallet = status.allowsWalletCheckin !== false;
  const walletPaymentConfigured = allowsWallet && Boolean(resolveCheckinPaymentTarget(status));
  const browserWalletAvailable = hasInjectedWallet();
  const showWalletBlock = status.walletLinked || allowsOffchain;
  const balanceWeiStr = status.checkinBalanceAmountWei || '0';
  const polBal = Number(status.polBalance ?? 0);
  const balanceAffordable = balanceCoversWeiCost(polBal, balanceWeiStr);
  const cs = getDailySlice(status);
  const currentPeriod = status.currentPeriod ?? cs.currentPeriod ?? null;
  const explorerDaily = buildPolygonscanTxUrl(cs.txHash);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl mb-2">
          <Calendar className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight">{t('checkin.title')}</h1>
        <p className="text-gray-500 font-medium max-w-lg mx-auto">{t('checkin.subtitle')}</p>
      </div>

      <AdRotator ads={POWER_STATS_ADS} size="468x60" slotId="checkin-top" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl relative overflow-hidden group">
          <div className="relative z-10">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">{t('checkin.streak')}</h3>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-gradient-to-tr from-amber-500 to-orange-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform duration-500">
                <Trophy className="text-white w-12 h-12" />
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black text-white tracking-tighter">{streak}</span>
                  <span className="text-xl font-bold text-amber-500 uppercase">{t('checkin.days')}</span>
                </div>
                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">{t('checkin.streak_sub')}</p>
                <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">{t('checkin.streak_daily_note')}</p>
                {status.graceEndsAt ? (
                  <p className="text-[10px] text-amber-500/90 mt-1">
                    {t('checkin.grace_until', {
                      defaultValue: 'Grace period until {{time}}',
                      time: new Date(status.graceEndsAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
                {currentPeriod ? (
                  <p className="text-[10px] text-slate-600 mt-1">{formatCheckinNextReset(t, currentPeriod)}</p>
                ) : status.nextResetAt ? (
                  <p className="text-[10px] text-slate-600 mt-1">
                    {t('checkin.next_reset', {
                      defaultValue: 'Next reset: {{time}}',
                      time: new Date(status.nextResetAt).toLocaleString(),
                    })}
                  </p>
                ) : null}
                {totalConfirmed > 0 && (
                  <p className="text-[10px] text-slate-600 mt-2">
                    {t('checkin.total_days')}: <span className="text-slate-400 font-mono">{totalConfirmed}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/5 rounded-tl-[100px] -z-0" />
        </div>

        <div className="space-y-5">
          {!showWalletBlock ? (
            <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-10 shadow-xl text-center space-y-4">
              <p className="text-gray-400 text-sm">{t('checkin.link_wallet_hint')}</p>
              <Link
                to="/wallet"
                className="inline-flex items-center justify-center gap-2 w-full py-4 bg-primary text-white rounded-2xl font-bold"
              >
                {t('checkin.open_wallet')}
              </Link>
            </div>
          ) : (
            <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-6 shadow-xl space-y-4">
              {!status.walletLinked && allowsOffchain ? (
                <p className="text-xs text-slate-500 text-center">
                  {t('checkin.offchain_without_wallet_hint', {
                    defaultValue: 'Wallet is optional. You can check in with in-game POL, or link a wallet for on-chain payment.',
                  })}
                </p>
              ) : null}
              <div>
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">
                  {t('checkin.period.current_title', { defaultValue: 'Período atual' })}
                </h3>
                <p className="text-sm text-amber-500/90 mt-1 font-medium">
                  {formatCheckinPeriodRange(t, currentPeriod)}
                </p>
                <p className="text-[11px] text-slate-600 mt-1">{t('checkin.daily_pay_hint')}</p>
                {status.lastCheckin && !status.lastCheckin.isCurrentPeriod ? (
                  <p className="text-[10px] text-slate-500 mt-1">
                    {t('checkin.period.last_confirmed', {
                      dateKey: status.lastCheckin.dateKey,
                      defaultValue: 'Último check-in confirmado: {{dateKey}}',
                    })}
                  </p>
                ) : null}
              </div>

              {cs.checkedIn ? (
                <div className="text-center space-y-3 py-1">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/25 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                  </div>
                  <p className="text-lg font-black text-white">
                    {t('checkin.claimed_period', { defaultValue: 'Já resgatado neste período' })}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">
                    {currentPeriod
                      ? formatCheckinNextReset(t, currentPeriod)
                      : t('checkin.come_back')}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-center">
                  <p className="text-sm font-bold text-emerald-400">
                    {t('checkin.available', { defaultValue: 'Check-in disponível' })}
                  </p>
                  {currentPeriod ? (
                    <p className="text-[11px] text-slate-500 mt-1">{formatCheckinAvailableUntil(t, currentPeriod)}</p>
                  ) : null}
                </div>
              )}
              {cs.checkedIn ? null : (
                <div className="space-y-3">
                  {!walletPaymentConfigured ? (
                    <p className="text-center text-xs text-amber-400/90 leading-relaxed px-1">
                      {t('checkin.wallet_unavailable_use_balance')}
                    </p>
                  ) : null}
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                    <div className="flex items-center justify-center gap-2 text-center font-bold text-amber-400 text-sm tracking-tight">
                      <Zap className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{t('checkin.wallet_pay_line')}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed">{t('checkin.anti_bot_note')}</p>
                  </div>
                  <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
                    <div className="flex items-center justify-center gap-2 text-center font-bold text-sky-300 text-sm tracking-tight">
                      <Zap className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{t('checkin.balance_pay_line')}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed">
                      {t('checkin.balance_pool_note', {
                        balance: polBal.toFixed(4),
                      })}
                    </p>
                  </div>

                  {cs.failed && <p className="text-red-400 text-sm text-center">{t('checkin.failed_retry')}</p>}

                  {cs.pending && (
                    <div className="flex flex-col items-center gap-2 text-amber-400 text-sm">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('checkin.waiting_blockchain')}
                      </div>
                      {explorerDaily ? (
                        <a
                          href={explorerDaily}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {t('checkin.view_on_polygonscan')}
                        </a>
                      ) : null}
                    </div>
                  )}

                  {allowsWallet ? (
                  <button
                    type="button"
                    onClick={() => void handleWalletDaily()}
                    disabled={
                      paying ||
                      isLoading ||
                      cs.pending ||
                      !walletPaymentConfigured ||
                      cs.checkedIn ||
                      !browserWalletAvailable ||
                      !status.walletLinked
                    }
                    aria-busy={paying}
                    className="flex w-full min-h-[3.75rem] flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-2xl bg-amber-500 px-4 py-3 text-slate-950 shadow-lg shadow-amber-500/15 hover:bg-amber-600 disabled:opacity-50"
                  >
                    {paying ? (
                      <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                    ) : (
                      <Zap className="h-5 w-5 shrink-0 fill-current" aria-hidden />
                    )}
                    <span className="flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
                      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.12em]">
                        {t('checkin.cta_wallet_line1')}
                      </span>
                      <span className="text-xs sm:text-sm font-black tracking-wide normal-case">{t('checkin.cta_wallet_line2')}</span>
                    </span>
                  </button>
                  ) : null}

                  {allowsOffchain ? (
                  <button
                    type="button"
                    onClick={() => void handleBalanceDaily()}
                    disabled={paying || isLoading || cs.pending || !balanceAffordable || cs.checkedIn}
                    aria-busy={paying}
                    className="flex w-full min-h-[3.5rem] flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 rounded-2xl border border-sky-500/40 bg-slate-900/80 px-4 py-3 text-sky-100 shadow-md hover:bg-slate-800 disabled:opacity-50"
                  >
                    {paying ? (
                      <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                    ) : (
                      <Zap className="h-5 w-5 shrink-0 text-sky-400" aria-hidden />
                    )}
                    <span className="flex flex-col items-center justify-center gap-0.5 text-center leading-tight">
                      <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.12em] text-sky-400/95">
                        {t('checkin.cta_balance_line1')}
                      </span>
                      <span className="text-xs sm:text-sm font-black tracking-wide normal-case">{t('checkin.cta_balance_line2')}</span>
                    </span>
                  </button>
                  ) : null}

                  {allowsWallet && !browserWalletAvailable && (
                    <p className="text-center text-xs text-slate-500 leading-relaxed">{t('checkin.no_wallet')}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {recentCheckins.length > 0 && (
        <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-8 shadow-xl">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            {t('checkin.history_title')}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {recentCheckins.map((row) => (
              <li
                key={row.date}
                className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400/90"
              >
                {row.date}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-center text-xs text-slate-600 max-w-xl mx-auto">{t('checkin.server_note')}</p>

      {milestones.length > 0 && (
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em]">{t('checkin.milestones.title')}</h3>
            <p className="text-xs text-slate-600 max-w-xl mx-auto">{t('checkin.milestones.description')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {milestones.map((m) => {
              const title = getCheckinMilestoneTitle(t, m);
              const rewardLine = getCheckinMilestoneRewardLine(t, m);
              const description = getCheckinMilestoneDescription(t, m);
              const state = m.state || 'locked';
              const rewardType = normalizeCheckinRewardType(m.rewardType);
              const border =
                state === 'claimed'
                  ? 'border-emerald-500/35'
                  : state === 'eligible'
                    ? 'border-amber-500/40 ring-1 ring-amber-500/20'
                    : 'border-gray-800 opacity-80';
              const iconBg =
                state === 'claimed'
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : state === 'eligible'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-slate-900 text-slate-600';
              const showMinerImg = rewardType === 'machine' && m.minerImageUrl;
              const showPolBadge = rewardType === 'pol';
              return (
                <div key={m.id} className={`bg-gray-800/30 border rounded-2xl p-5 flex items-start gap-4 ${border}`}>
                  {showMinerImg ? (
                    <div className="w-12 h-12 rounded-xl shrink-0 bg-slate-900/60 border border-slate-700/60 overflow-hidden flex items-center justify-center">
                      <img src={m.minerImageUrl as string} alt={m.minerName ?? ''} className="w-full h-full object-contain" />
                    </div>
                  ) : showPolBadge ? (
                    <div className={`w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-black text-sm ${iconBg}`}>
                      POL
                    </div>
                  ) : (
                    <div className={`p-3 rounded-xl shrink-0 ${iconBg}`}>
                      {state === 'locked' ? <Lock className="w-5 h-5" /> : <Gift className="w-5 h-5" />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {getCheckinMilestoneDayLabel(t, m.dayThreshold).toUpperCase()}
                    </p>
                    <p className="text-sm font-bold text-white truncate">{title}</p>
                    {rewardLine ? <p className="text-xs text-slate-400 mt-1">{rewardLine}</p> : null}
                    {description ? (
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{description}</p>
                    ) : null}
                    <p className="text-[10px] font-bold uppercase tracking-wider mt-2 text-slate-500">
                      {getCheckinMilestoneStatusLabel(t, state)}
                    </p>
                  </div>
                  {state === 'claimed' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-1" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
