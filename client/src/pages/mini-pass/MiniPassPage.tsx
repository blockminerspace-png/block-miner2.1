import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, Gift, Loader2, Lock, Sparkles, Trophy, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import { api } from '../../store/auth';

interface MiniPassSeasonSummary {
  id: number;
  title: string;
  subtitle?: string | null;
  state: string;
  startsAt: string;
  endsAt: string;
}

interface MiniPassSeasonFull {
  id: number;
  title: string;
  subtitle?: string | null;
  state: string;
  startsAt: string;
  endsAt: string;
  bannerImageUrl?: string | null;
  maxLevel: number;
  xpPerLevel: number;
  completePassPricePol: number | string;
}

interface MiniPassProgress {
  level: number;
  xpIntoLevel: number;
  totalXp: number;
  xpCap: number;
  xpRemainingToCap: number;
}

interface MiniPassMission {
  id: number;
  title: string;
  description?: string | null;
  xpReward: number;
  currentValue: number;
  targetValue: number;
  completed: boolean;
}

interface MiniPassRewardRow {
  id: number;
  level: number;
  title?: string | null;
  rewardKind: string;
  claimed: boolean;
  unlocked: boolean;
  minerId?: number;
  eventMinerId?: number;
  hashRate?: number;
  hashRateDays?: number;
  blkAmount?: number | string;
  polAmount?: number | string;
}

interface MiniPassSeasonsListResponse {
  ok?: boolean;
  seasons?: MiniPassSeasonSummary[];
}

interface MiniPassDetailResponse {
  ok?: boolean;
  season: MiniPassSeasonFull;
  progress: MiniPassProgress;
  missions: MiniPassMission[];
  rewards: MiniPassRewardRow[];
}

interface MiniPassClaimResponse {
  ok?: boolean;
  duplicate?: boolean;
}

interface MiniPassCompletePassResponse {
  ok?: boolean;
}

function msLeft(endsAtIso: string) {
  const t = new Date(endsAtIso).getTime() - Date.now();
  return Math.max(0, t);
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatSeasonDate(iso: string, locale: string | undefined) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  return new Intl.DateTimeFormat(locale || 'en', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(d);
}

function formatPolAmount(value: unknown, locale: string | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '0');
  return new Intl.NumberFormat(locale || 'en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  }).format(n);
}

function describeReward(reward: MiniPassRewardRow, t: TFunction) {
  let fallback = reward.rewardKind;
  switch (reward.rewardKind) {
    case 'SHOP_MINER':
      fallback = t('miniPass.reward_preview.shop_miner', { id: reward.minerId });
      break;
    case 'EVENT_MINER':
      fallback = t('miniPass.reward_preview.event_miner', { id: reward.eventMinerId });
      break;
    case 'HASHRATE_TEMP':
      fallback = t('miniPass.reward_preview.hashrate_temp', {
        hashRate: reward.hashRate,
        days: reward.hashRateDays
      });
      break;
    case 'BLK':
      fallback = t('miniPass.reward_preview.blk', { amount: reward.blkAmount });
      break;
    case 'POL':
      fallback = t('miniPass.reward_preview.pol', { amount: reward.polAmount });
      break;
    default:
      break;
  }
  return {
    title: reward.title || fallback,
    detail: reward.title && fallback !== reward.title ? fallback : null
  };
}

export default function MiniPass() {
  const { t, i18n } = useTranslation();
  const { seasonId: seasonIdParam } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<MiniPassSeasonSummary[]>([]);
  const [detail, setDetail] = useState<MiniPassDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const seasonId = seasonIdParam ? parseInt(seasonIdParam, 10) : null;

  const loadList = useCallback(async () => {
    const res = await api.get<MiniPassSeasonsListResponse>('/mini-pass/seasons', {
      headers: { 'Accept-Language': i18n.language || 'en' }
    });
    if (res.data.ok) setList(res.data.seasons || []);
  }, [i18n.language]);

  const loadDetail = useCallback(async () => {
    if (!seasonId) return;
    const res = await api.get<MiniPassDetailResponse>(`/mini-pass/seasons/${seasonId}`, {
      headers: { 'Accept-Language': i18n.language || 'en' }
    });
    if (res.data.ok) {
      setDetail(res.data);
    } else {
      toast.error(t('miniPass.errors.load_failed', 'Could not load Mini Pass'));
      navigate('/mini-pass');
    }
  }, [seasonId, i18n.language, navigate, t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        if (seasonId) {
          await loadDetail();
        } else {
          await loadList();
        }
      } catch {
        if (!cancelled) toast.error(t('miniPass.errors.network', 'Network error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seasonId, loadDetail, loadList]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    if (!detail?.season?.endsAt) return '';
    return formatDuration(msLeft(detail.season.endsAt));
  }, [detail, tick]);

  const claim = async (levelRewardId: number) => {
    if (!seasonId) return;
    try {
      setAction(`claim-${levelRewardId}`);
      const res = await api.post<MiniPassClaimResponse>(`/mini-pass/seasons/${seasonId}/claim/${levelRewardId}`);
      if (res.data.ok) {
        toast.success(
          res.data.duplicate
            ? t('miniPass.claim_already', 'Already claimed')
            : t('miniPass.claim_ok', 'Reward claimed')
        );
        loadDetail();
      }
    } catch (e: unknown) {
      const code = isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined;
      toast.error(
        code === 'not_eligible'
          ? t('miniPass.errors.not_eligible', 'Reach the tier level first')
          : code === 'season_not_live'
            ? t('miniPass.errors.season_not_live', 'This season is not live yet')
            : t('miniPass.errors.claim_failed', 'Claim failed')
      );
    } finally {
      setAction(null);
    }
  };

  const completePass = async () => {
    if (!seasonId) return;
    try {
      setAction('complete');
      const res = await api.post<MiniPassCompletePassResponse>(`/mini-pass/seasons/${seasonId}/complete-pass`);
      if (res.data.ok) {
        setShowCompleteModal(false);
        toast.success(t('miniPass.complete_ok', 'Pass completed'));
        loadDetail();
      }
    } catch (e: unknown) {
      const code = isAxiosError(e) ? (e.response?.data as { code?: string } | undefined)?.code : undefined;
      toast.error(
        code === 'season_not_live'
          ? t('miniPass.errors.season_not_live', 'This season is not live yet')
          : t('miniPass.errors.purchase_failed', 'Purchase failed')
      );
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!seasonId) {
    return (
      <div className="space-y-8 max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
          {t('miniPass.title', 'Mini Pass')}
        </h1>
        <p className="text-slate-400 text-sm">{t('miniPass.subtitle', 'Seasonal missions and rewards')}</p>
        {list.length === 0 ? (
          <p className="text-slate-500">{t('miniPass.no_seasons', 'No active season right now.')}</p>
        ) : (
          <ul className="space-y-3">
            {list.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/mini-pass/${s.id}`}
                  className="block rounded-2xl border border-white/10 bg-slate-900/50 p-5 hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-bold text-white">{s.title}</h2>
                      {s.subtitle ? <p className="text-xs text-slate-500 mt-1">{s.subtitle}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-1 font-black uppercase tracking-wider ${
                            s.state === 'live'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-sky-500/15 text-sky-300'
                          }`}
                        >
                          {t(
                            s.state === 'live' ? 'miniPass.states.live' : 'miniPass.states.upcoming',
                            s.state === 'live' ? 'Live' : 'Starts'
                          )}
                        </span>
                        <span className="text-slate-500">
                          {s.state === 'live'
                            ? t('miniPass.ends_at', {
                                date: formatSeasonDate(s.endsAt, i18n.language || 'en')
                              })
                            : t('miniPass.starts_at', {
                                date: formatSeasonDate(s.startsAt, i18n.language || 'en')
                              })}
                        </span>
                      </div>
                    </div>
                    <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!detail) return null;

  const { season, progress, missions, rewards } = detail;
  const isUpcoming = season.state === 'upcoming';
  const isLive = season.state === 'live';
  const claimableAfterComplete = rewards.filter((reward) => !reward.claimed && reward.rewardKind !== 'NONE');
  const levelPct =
    progress.level >= season.maxLevel
      ? 100
      : Math.min(100, (progress.xpIntoLevel / Math.max(1, season.xpPerLevel)) * 100);
  const countdownLabel = isUpcoming
    ? t('miniPass.starts_in', 'Starts in')
    : t('miniPass.ends_in', 'Ends in');
  const countdownBadge = isLive
    ? t('miniPass.states.live', 'Live')
    : t('miniPass.states.upcoming', 'Starts');
  const countdownTargetDate = isUpcoming ? season.startsAt : season.endsAt;

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <button
        type="button"
        onClick={() => navigate('/mini-pass')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('miniPass.back', 'All seasons')}
      </button>

      <header
        className="rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8"
        style={
          season.bannerImageUrl
            ? {
                backgroundImage: `linear-gradient(135deg,rgba(2,6,23,.92),rgba(15,23,42,.88)),url(${season.bannerImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }
            : undefined
        }
      >
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
                isLive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'
              }`}
            >
              {countdownBadge}
            </span>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">{season.title}</h1>
            {season.subtitle ? <p className="text-slate-400 text-sm mt-2">{season.subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2 text-amber-400 text-sm font-mono">
            <Clock className="w-4 h-4" />
            <span className="text-slate-400 font-sans uppercase tracking-wider text-[10px]">
              {countdownLabel}
            </span>
            {countdown}
          </div>
        </div>
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-xs text-slate-500 uppercase tracking-widest">
            <span>
              {t('miniPass.level_label', 'Level')} {progress.level} / {season.maxLevel}
            </span>
            <span>
              {progress.totalXp} / {progress.xpCap} XP
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-400"
              initial={false}
              animate={{ width: `${levelPct}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isLive || action === 'complete' || progress.xpRemainingToCap <= 0}
            onClick={() => setShowCompleteModal(true)}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-black uppercase transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            {t('miniPass.complete_pass', 'Complete pass')}
          </button>
        </div>
      </header>

      {isUpcoming ? (
        <section className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-sky-100">
          {t('miniPass.upcoming_notice', {
            date: formatSeasonDate(countdownTargetDate, i18n.language || 'en')
          })}
        </section>
      ) : null}

      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          {t('miniPass.missions', 'Missions')}
        </h2>
        <ul className="space-y-2">
          {missions.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-3 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="text-white font-medium">{m.title}</span>
                <span className="text-amber-400 text-xs font-mono">+{m.xpReward} XP</span>
              </div>
              {m.description ? <p className="text-xs text-slate-500 mt-1">{m.description}</p> : null}
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/80 transition-all"
                  style={{
                    width: `${Math.min(100, (m.currentValue / Math.max(1, m.targetValue)) * 100)}%`
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-mono">
                {m.currentValue} / {m.targetValue}
                {m.completed ? ` · ${t('miniPass.done', 'Done')}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Gift className="w-5 h-5 text-amber-500" />
          {t('miniPass.rewards_track', 'Reward track')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence>
            {rewards.map((r) => {
              const locked = !r.unlocked;
              const showSpark = r.unlocked && !r.claimed;
              return (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl border px-4 py-4 flex flex-col gap-2 ${
                    r.claimed
                      ? 'border-emerald-500/30 bg-emerald-950/20'
                      : locked
                        ? 'border-slate-800 bg-slate-950/50'
                        : 'border-amber-500/40 bg-amber-950/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 uppercase">Lv {r.level}</span>
                    {locked ? <Lock className="w-4 h-4 text-slate-600" /> : null}
                    {showSpark ? <Sparkles className="w-4 h-4 text-amber-400" /> : null}
                  </div>
                  <p className="text-white font-semibold text-sm">
                    {r.title || `${r.rewardKind}`}
                  </p>
                  <button
                    type="button"
                    disabled={!isLive || locked || r.claimed || action === `claim-${r.id}`}
                    onClick={() => claim(r.id)}
                    className="mt-auto text-xs font-black uppercase py-2 rounded-lg bg-amber-500 text-slate-950 disabled:opacity-30 disabled:bg-slate-700 disabled:text-slate-400"
                  >
                    {!isLive
                      ? t('miniPass.states.upcoming', 'Starts')
                      : r.claimed
                      ? t('miniPass.claimed', 'Claimed')
                      : locked
                        ? t('miniPass.locked', 'Locked')
                        : t('miniPass.claim', 'Claim')}
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      {showCompleteModal &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="relative w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 shadow-2xl">
              <div className="absolute right-0 top-0 p-5">
                <button
                  type="button"
                  onClick={() => setShowCompleteModal(false)}
                  disabled={action === 'complete'}
                  className="rounded-xl p-2 text-slate-500 transition-colors hover:text-white disabled:opacity-40"
                  aria-label={t('miniPass.complete_modal.close', 'Close')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6 p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                    <Gift className="h-7 w-7" />
                  </div>
                  <div className="pr-10">
                    <h3 className="text-xl font-black uppercase tracking-wide text-white">
                      {t('miniPass.complete_modal.title', 'Completar passe num tapa')}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">
                      {t('miniPass.complete_modal.body', {
                        current: progress.level,
                        max: season.maxLevel,
                        price: formatPolAmount(season.completePassPricePol, i18n.language || 'en')
                      })}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {t('miniPass.complete_modal.price_label', 'Preço')}
                    </p>
                    <p className="mt-2 text-lg font-black text-amber-400">
                      {formatPolAmount(season.completePassPricePol, i18n.language || 'en')} POL
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {t('miniPass.complete_modal.progress_label', 'Progressão')}
                    </p>
                    <p className="mt-2 text-lg font-black text-white">
                      {t('miniPass.complete_modal.progress_value', {
                        current: progress.level,
                        max: season.maxLevel
                      })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      {t('miniPass.complete_modal.rewards_count_label', 'Recompensas')}
                    </p>
                    <p className="mt-2 text-lg font-black text-emerald-400">
                      {t('miniPass.complete_modal.rewards_count_value', {
                        count: claimableAfterComplete.length
                      })}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/40">
                  <div className="border-b border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-2 text-amber-400">
                      <Sparkles className="h-4 w-4" />
                      <h4 className="text-xs font-black uppercase tracking-widest">
                        {t('miniPass.complete_modal.rewards_title', 'Recompensas que vais liberar')}
                      </h4>
                    </div>
                  </div>

                  {claimableAfterComplete.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-slate-500">
                      {t('miniPass.complete_modal.rewards_empty', 'Não há recompensas pendentes para resgatar neste passe.')}
                    </p>
                  ) : (
                    <ul className="max-h-80 divide-y divide-slate-800 overflow-y-auto">
                      {claimableAfterComplete.map((reward) => {
                        const info = describeReward(reward, t);
                        return (
                          <li key={reward.id} className="flex items-start justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{info.title}</p>
                              {info.detail ? <p className="mt-1 text-xs text-slate-500">{info.detail}</p> : null}
                            </div>
                            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300">
                              {t('miniPass.complete_modal.reward_level', { level: reward.level })}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-amber-500/70">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{t('miniPass.complete_modal.warning', 'A compra do passe é confirmada na hora e o saldo em POL é debitado imediatamente.')}</span>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => completePass()}
                    disabled={action === 'complete'}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                  >
                    {action === 'complete' ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                    {action === 'complete'
                      ? t('miniPass.complete_modal.processing', 'Processando compra')
                      : t('miniPass.complete_modal.confirm_button', 'Confirmar compra do passe')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCompleteModal(false)}
                    disabled={action === 'complete'}
                    className="rounded-2xl border border-slate-700 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:opacity-40"
                  >
                    {t('common.cancel', 'Cancelar')}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
