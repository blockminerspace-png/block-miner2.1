import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOfferwallTimerStore } from '../../store/offerwallTimer';
import { useDocumentTitleCountdown } from '../../shared/hooks/useDocumentTitleCountdown';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { ArrowLeft, ExternalLink, LayoutGrid, Loader2, PlayCircle, Send } from 'lucide-react';
import { api } from '../../store/auth';
import AdRotator, { POWER_STATS_ADS } from '../../shared/components/AdRotator';
import { formatHoursClock, openPartnerWithReferrer, rewardLine } from './internalOfferwallHelpers';
import { useActiveViewSeconds, useDecountingSeconds } from './internalOfferwallHooks';
import type {
  InternalOfferwallAttempt,
  InternalOfferwallMutationResponse,
  InternalOfferwallOffer,
  InternalOfferwallOffersResponse,
  InternalOfferwallStatusResponse,
  InternalOfferwallUsage,
  IoTranslate
} from './internalOfferwallTypes';

const KIND_PTC = 'PTC_IFRAME';
const MODE_ADMIN = 'ADMIN_APPROVAL';
const STATUS_STARTED = 'STARTED';

function ioErrorBody(e: unknown): InternalOfferwallMutationResponse | undefined {
  if (!axios.isAxiosError(e) || e.response?.data == null || typeof e.response.data !== 'object') return undefined;
  return e.response.data as InternalOfferwallMutationResponse;
}

export default function InternalOfferwall() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flagLoading, setFlagLoading] = useState(true);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offers, setOffers] = useState<InternalOfferwallOffer[]>([]);
  const [openAttempts, setOpenAttempts] = useState<InternalOfferwallAttempt[]>([]);
  const [startBusyId, setStartBusyId] = useState<number | null>(null);
  const [submitBusyId, setSubmitBusyId] = useState<number | null>(null);
  const [partnerBusyAttemptId, setPartnerBusyAttemptId] = useState<number | null>(null);
  const [abandonBusyId, setAbandonBusyId] = useState<number | null>(null);

  const clearOfferQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (!next.has('offer')) return;
    next.delete('offer');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFlagLoading(true);
      try {
        const res = await api.get<InternalOfferwallStatusResponse>('/internal-offerwall/status');
        if (!cancelled) setFeatureEnabled(Boolean(res.data?.enabled));
      } catch {
        if (!cancelled) setFeatureEnabled(false);
      } finally {
        if (!cancelled) setFlagLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const res = await api.get<InternalOfferwallOffersResponse>('/internal-offerwall/offers');
      const d = res.data;
      if (d?.ok) {
        setOffers(d.offers ?? []);
        setOpenAttempts(d.openAttempts ?? []);
      } else if (d?.code === 'FEATURE_DISABLED' || res.status === 403) {
        setFeatureEnabled(false);
        setOffers([]);
        setOpenAttempts([]);
      } else {
        toast.error(t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      const st = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (d?.code === 'FEATURE_DISABLED' || st === 403) {
        setFeatureEnabled(false);
        setOffers([]);
        setOpenAttempts([]);
      } else {
        toast.error(t('internalOfferwallPage.load_error'));
      }
    } finally {
      setOffersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!featureEnabled || flagLoading) return;
    void loadOffers();
  }, [featureEnabled, flagLoading, loadOffers]);

  const focusOfferId = useMemo(() => {
    const raw = searchParams.get('offer');
    const n = parseInt(String(raw || ''), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [searchParams]);

  useEffect(() => {
    if (!focusOfferId || offersLoading || !offers.length) return;
    const exists = offers.some((o) => o.id === focusOfferId);
    if (!exists) {
      toast.error(t('internalOfferwallPage.inactive_or_missing'));
      return;
    }
    const id = requestAnimationFrame(() => {
      document.getElementById(`io-offer-${focusOfferId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [focusOfferId, offers, offersLoading, t]);

  const attemptByOfferId = useMemo(() => {
    const m = new Map<number, InternalOfferwallAttempt>();
    for (const a of openAttempts) {
      if (a?.offerId != null) m.set(a.offerId, a);
    }
    return m;
  }, [openAttempts]);

  const onPartnerPageOpen = async (offer: InternalOfferwallOffer, attempt: InternalOfferwallAttempt) => {
    const targetUrl = String(offer.iframeUrl || '').trim();
    if (!targetUrl) return;
    const opened = openPartnerWithReferrer(targetUrl);
    if (!opened) {
      toast.info(t('internalOfferwallPage.popup_blocked'));
      return;
    }
    setPartnerBusyAttemptId(attempt.id);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(
        `/internal-offerwall/attempts/${attempt.id}/partner-opened`
      );
      const d = res.data;
      if (d?.ok) {
        await loadOffers();
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      toast.error(d?.message || t('internalOfferwallPage.load_error'));
    } finally {
      setPartnerBusyAttemptId(null);
    }
  };

  const onStart = async (offer: InternalOfferwallOffer) => {
    const offerId = offer.id;
    setStartBusyId(offerId);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/offers/${offerId}/start`);
      const d = res.data;
      if (d?.ok) {
        await loadOffers();
      } else {
        const key = d?.messageKey;
        if (key && typeof key === 'string') {
          const time = formatHoursClock(d?.secondsUntilReset ?? 0);
          toast.error(t(key, { time }));
        } else if (d?.code === 'TASK_LIMIT_REACHED' || d?.code === 'DAILY_LIMIT' || res.status === 429) {
          toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
        } else if (d?.code === 'TASK_NOT_AVAILABLE') {
          toast.error(t('internalOfferwallPage.errors.task_not_available'));
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      const key = d?.messageKey;
      if (key && typeof key === 'string') {
        toast.error(t(key, { time: formatHoursClock(d?.secondsUntilReset ?? 0) }));
      } else if (axios.isAxiosError(e) && e.response?.status === 429) {
        toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
      } else if (d?.code === 'TASK_LIMIT_REACHED' || d?.code === 'DAILY_LIMIT') {
        toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
      } else if (d?.code === 'TASK_NOT_AVAILABLE') {
        toast.error(t('internalOfferwallPage.errors.task_not_available'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } finally {
      setStartBusyId(null);
    }
  };

  const onSubmit = async (attemptId: number) => {
    setSubmitBusyId(attemptId);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/attempts/${attemptId}/submit`);
      const d = res.data;
      if (d?.ok) {
        if (d.status === 'PENDING_REVIEW') toast.success(t('internalOfferwallPage.submit_pending'));
        else toast.success(t('internalOfferwallPage.submit_ok'));
        await loadOffers();
      } else if (d?.code === 'MIN_VIEW_NOT_MET') {
        toast.error(d.message || t('internalOfferwallPage.load_error'));
      } else if (d?.code === 'PARTNER_NOT_OPENED') {
        toast.error(t('internalOfferwallPage.partner_not_opened'));
      } else if (d?.code === 'REWARD_CONFIG_INVALID') {
        toast.error(t('internalOfferwallPage.submit_reward_config_error'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      if (d?.code === 'MIN_VIEW_NOT_MET') {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      } else if (d?.code === 'PARTNER_NOT_OPENED') {
        toast.error(t('internalOfferwallPage.partner_not_opened'));
      } else if (d?.code === 'REWARD_CONFIG_INVALID') {
        toast.error(t('internalOfferwallPage.submit_reward_config_error'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } finally {
      setSubmitBusyId(null);
    }
  };

  const onAbandonAttempt = useCallback(
    async (attemptId: number) => {
      setAbandonBusyId(attemptId);
      try {
        const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/attempts/${attemptId}/abandon`);
        const d = res.data;
        if (d?.ok) {
          toast.success(t('internalOfferwallPage.abandon_ok'));
          clearOfferQuery();
          await loadOffers();
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      } catch (e: unknown) {
        const d = ioErrorBody(e);
        if (d?.code === 'CANNOT_ABANDON_PENDING_REVIEW') {
          toast.error(t('internalOfferwallPage.cannot_abandon_pending_review'));
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      } finally {
        setAbandonBusyId(null);
      }
    },
    [t, clearOfferQuery, loadOffers]
  );

  if (flagLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-sky-400" aria-hidden />
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl border border-white/5 bg-slate-900/50 p-8 text-center text-slate-400">
        <LayoutGrid className="w-12 h-12 mx-auto mb-3 text-slate-600" aria-hidden />
        <p>{t('internalOfferwallPage.disabled')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20">
          <LayoutGrid className="w-8 h-8 text-sky-400" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{t('internalOfferwallPage.title')}</h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base max-w-xl">{t('internalOfferwallPage.subtitle')}</p>
        </div>
      </div>

      {offersLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-sky-400" aria-hidden />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-10 text-center text-slate-500">
          {t('internalOfferwallPage.empty')}
        </div>
      ) : (
        <ul className="space-y-6">
          {offers.map((offer) => {
            const attempt = attemptByOfferId.get(offer.id);
            return (
              <OfferCard
                key={offer.id}
                domId={`io-offer-${offer.id}`}
                offer={offer}
                attempt={attempt}
                t={t}
                rewardLabel={rewardLine(t, offer)}
                startBusy={startBusyId === offer.id}
                submitBusy={submitBusyId === attempt?.id}
                partnerBusy={partnerBusyAttemptId === attempt?.id}
                abandonBusy={abandonBusyId != null && abandonBusyId === attempt?.id}
                onStart={() => void onStart(offer)}
                onSubmit={() => attempt && void onSubmit(attempt.id)}
                onPartnerOpen={attempt ? () => void onPartnerPageOpen(offer, attempt) : undefined}
                onCooldownElapsed={loadOffers}
                onClearOfferFocus={clearOfferQuery}
                onAbandonAttempt={onAbandonAttempt}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

type OfferCardProps = {
  domId: string;
  offer: InternalOfferwallOffer;
  attempt: InternalOfferwallAttempt | undefined;
  t: IoTranslate;
  rewardLabel: string;
  startBusy: boolean;
  submitBusy: boolean;
  partnerBusy: boolean;
  abandonBusy: boolean;
  onStart: () => void;
  onSubmit: () => void;
  onPartnerOpen: (() => void) | undefined;
  onCooldownElapsed: () => Promise<void>;
  onClearOfferFocus: () => void;
  onAbandonAttempt: (attemptId: number) => Promise<void>;
};

function OfferCard({
  domId,
  offer,
  attempt,
  t,
  rewardLabel,
  startBusy,
  submitBusy,
  partnerBusy,
  abandonBusy,
  onStart,
  onSubmit,
  onPartnerOpen,
  onCooldownElapsed,
  onClearOfferFocus,
  onAbandonAttempt
}: OfferCardProps) {
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  useEffect(() => {
    if (!exitConfirmOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExitConfirmOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitConfirmOpen]);

  const isPtc = String(offer.kind).toUpperCase() === KIND_PTC;
  const minSec = Number(offer.minViewSeconds) || 0;
  const usage: InternalOfferwallUsage = (offer.usage || {
    completedCount: 0,
    maxPerPeriod: Number(offer.maxExecutionsPerPeriod ?? offer.dailyLimitPerUser) || 3,
    secondsUntilAvailable: null,
    canStartNew: true
  }) as InternalOfferwallUsage;
  const limitBlocksStart = !attempt && !usage.canStartNew;
  const countdownRemain = useDecountingSeconds(usage.secondsUntilAvailable);
  const cooldownFireRef = useRef(false);
  useEffect(() => {
    cooldownFireRef.current = false;
  }, [usage.secondsUntilAvailable, offer.id]);
  useEffect(() => {
    if (countdownRemain !== 0) return undefined;
    if (usage.secondsUntilAvailable == null || usage.secondsUntilAvailable <= 0) return undefined;
    if (cooldownFireRef.current) return undefined;
    cooldownFireRef.current = true;
    void onCooldownElapsed();
    return undefined;
  }, [countdownRemain, usage.secondsUntilAvailable, onCooldownElapsed]);

  const clockIso = isPtc ? String(attempt?.partnerOpenedAt || '') : String(attempt?.startedAt || '');
  const timerActive = attempt?.status === STATUS_STARTED && Boolean(clockIso);
  const { elapsed, isPaused } = useActiveViewSeconds(clockIso, timerActive);
  const canSubmit = attempt?.status === STATUS_STARTED && elapsed >= minSec;
  const modeSelf = String(offer.completionMode || '') !== MODE_ADMIN;
  const remaining = Math.max(0, Math.ceil(minSec - elapsed));

  // Contador regressivo na aba do browser
  useDocumentTitleCountdown({
    remainingSeconds: remaining,
    isPaused,
    isActive: timerActive && minSec > 0,
    isComplete: canSubmit,
    pageName: 'Offerwall',
  });

  // Sync timer state to global store so Header shows live progress
  const syncTimer = useOfferwallTimerStore((s) => s.sync);
  const clearTimer = useOfferwallTimerStore((s) => s.clear);
  useEffect(() => {
    if (timerActive && minSec > 0) {
      syncTimer({ offerTitle: String(offer.title || ''), elapsed, minSec, isPaused, canSubmit });
    } else if (!timerActive) {
      clearTimer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, elapsed, isPaused, canSubmit, minSec]);
  // Clear global timer when this card unmounts
  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleBackToListOnly = () => {
    onClearOfferFocus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmLeaveTask = async () => {
    if (!attempt?.id) return;
    setExitConfirmOpen(false);
    await onAbandonAttempt(attempt.id);
  };

  return (
    <li id={domId} className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 space-y-4">
      {attempt?.status === STATUS_STARTED ? (
        <div className="pb-3 border-b border-white/10">
          <button
            type="button"
            disabled={abandonBusy || submitBusy || partnerBusy}
            onClick={() => setExitConfirmOpen(true)}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 text-sm font-semibold hover:bg-slate-700/90 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}
      {attempt?.status === 'PENDING_REVIEW' ? (
        <div className="flex flex-wrap items-center gap-2 justify-between pb-3 border-b border-white/10">
          <button
            type="button"
            onClick={handleBackToListOnly}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 text-sm font-semibold hover:bg-slate-700/90 w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}

      {exitConfirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="presentation"
          onClick={() => setExitConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="io-exit-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="io-exit-title" className="text-lg font-bold text-white">
              {t('internalOfferwallPage.exit_task_confirm_title')}
            </h3>
            <p className="text-sm text-slate-400">{t('internalOfferwallPage.exit_task_confirm_body')}</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-600 text-slate-200 text-sm font-semibold hover:bg-slate-800"
                onClick={() => setExitConfirmOpen(false)}
              >
                {t('internalOfferwallPage.exit_task_confirm_stay')}
              </button>
              <button
                type="button"
                disabled={abandonBusy}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
                onClick={() => void confirmLeaveTask()}
              >
                {abandonBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden /> : t('internalOfferwallPage.exit_task_confirm_leave')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-white text-lg">{offer.title}</h2>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
              {isPtc ? t('internalOfferwallPage.kind_ptc') : t('internalOfferwallPage.kind_general')}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
              {modeSelf ? t('internalOfferwallPage.mode_self') : t('internalOfferwallPage.mode_admin')}
            </span>
          </div>
          {offer.description ? <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">{offer.description}</p> : null}
          {Array.isArray(offer.taskMetadata?.requiredActions) && offer.taskMetadata.requiredActions.length > 0 ? (
            <ul className="list-decimal pl-5 text-sm text-slate-400 mt-2 space-y-1">
              {offer.taskMetadata.requiredActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(offer.taskMetadata?.targetCountryCodes) && offer.taskMetadata.targetCountryCodes.length > 0 ? (
            <p className="text-xs text-slate-500 mt-2">
              {t('internalOfferwallPage.target_regions')}: {offer.taskMetadata.targetCountryCodes.join(', ')}
            </p>
          ) : null}
          {offer.taskMetadata?.verificationNote ? (
            <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">{offer.taskMetadata.verificationNote}</p>
          ) : null}
          <p className="text-sm text-sky-300/90 mt-2 font-semibold">{rewardLabel}</p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            {t('internalOfferwallPage.usage_progress', {
              completed: String(usage.completedCount),
              max: String(usage.maxPerPeriod)
            })}
          </p>
          {limitBlocksStart && countdownRemain != null && countdownRemain > 0 ? (
            <p className="text-sm text-amber-400/95 mt-2 font-semibold tabular-nums" role="status" aria-live="polite">
              {t('internalOfferwallPage.available_in', { time: formatHoursClock(countdownRemain) })}
            </p>
          ) : null}
        </div>
        {!attempt ? (
          <button
            type="button"
            disabled={startBusy || limitBlocksStart}
            onClick={onStart}
            className="shrink-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm disabled:opacity-50"
          >
            {startBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
            {t('internalOfferwallPage.start')}
          </button>
        ) : null}
      </div>

      {attempt?.status === 'PENDING_REVIEW' ? (
        <p className="text-sm text-amber-400/90">{t('internalOfferwallPage.pending_review')}</p>
      ) : null}

      {attempt?.status === 'STARTED' ? (
        <>
          {isPtc && offer.iframeUrl ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <p className="text-sm text-slate-400">{t('internalOfferwallPage.ptc_new_window_hint')}</p>
              <button
                type="button"
                disabled={partnerBusy || !onPartnerOpen}
                onClick={() => onPartnerOpen?.()}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm disabled:opacity-50"
              >
                {partnerBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                )}
                {t('internalOfferwallPage.open_partner_new_window')}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-400">
              <p>{t('internalOfferwallPage.general_started_hint')}</p>
              {offer.taskMetadata?.externalInfoUrl ? (
                <a
                  href={offer.taskMetadata.externalInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline break-all"
                >
                  {t('internalOfferwallPage.open_external_link')}
                </a>
              ) : null}
            </div>
          )}

          {minSec > 0 ? (
            !canSubmit ? (
              <div
                className={`rounded-2xl border px-6 py-8 text-center transition-colors duration-300 ${
                  isPaused
                    ? 'border-amber-500/30 bg-amber-950/20'
                    : 'border-sky-500/25 bg-sky-950/30'
                }`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className={`text-xs font-bold uppercase tracking-widest ${isPaused ? 'text-amber-400/90' : 'text-sky-300/90'}`}>
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused')
                    : t('internalOfferwallPage.countdown_title')}
                </p>
                <p className="mt-3 text-5xl font-black tabular-nums tracking-tight text-white sm:text-6xl">{remaining}</p>
                <p className="mt-1 text-sm text-slate-400">{t('internalOfferwallPage.countdown_unit')}</p>
                <p className="mt-4 text-xs text-slate-500 max-w-md mx-auto">
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused_hint')
                    : t('internalOfferwallPage.min_view_hint', { seconds: String(minSec) })}
                </p>
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-400/95">{t('internalOfferwallPage.countdown_ready')}</p>
            )
          ) : (
            <p className="text-xs text-slate-500">{t('internalOfferwallPage.min_view_zero_hint')}</p>
          )}

          {canSubmit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitBusy}
                onClick={onSubmit}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {submitBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                {t('internalOfferwallPage.submit')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
