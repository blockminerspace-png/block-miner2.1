import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Zap, Calendar, CheckCircle2, AlertCircle, Loader2, History, Sparkles, BookOpen, CreditCard, Clock, Gift, Gamepad2, LayoutGrid, Droplets, Link2, Youtube } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../store/auth';

type ChargeRow = {
  id: number;
  mode: string;
  amount: number;
  ratePercent: number;
  status: string;
  createdAt: string;
};

type EnergyTaxSummary = {
  ok?: boolean;
  startsAt: string;
  active: boolean;
  weekStart: string;
  weekEnd: string;
  totalRewards7d: number;
  fullRateTax: number;
  dailyRateTax: number;
  paidPol: number;
  paidDays: number;
  paidDaysManual: number;
  paidDaysAuto: number;
  paidDaysExempt: number;
  unpaidDays: number;
  todayPaid: boolean;
  todayRewards: number;
  yesterdayRewards: number;
  todayDailyCharge: number;
  todayExempt: boolean;
  offerwallExtToday: number;
  offerwallIntToday: number;
  faucetToday: number;
  shortlinkToday: number;
  youtubeToday: number;
  gamesToday: number;
  totalActivitiesToday: number;
  days: Array<{
    dayStart: string;
    rewards: number;
    charge: ChargeRow | null;
  }>;
  history: Array<ChargeRow & { rewardsBase: number; periodDayStartsAt: string }>;
};

const BRT = 'America/Sao_Paulo';

function fmtPol(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** 00:00 BRT do dia em que a taxa passou a valer (primeiro dia minerado cobrável). */
function firstTaxableDayStartMs(startsAtIso: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(startsAtIso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T03:00:00.000Z`).getTime();
}

function fmtBrtNow(locale: string): string {
  return new Date().toLocaleString(locale, {
    timeZone: BRT,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nextMondayBrtCountdown(now = new Date()): string {
  const offsetMs = 3 * 60 * 60 * 1000;
  const brtNow = new Date(now.getTime() - offsetMs);
  const day = brtNow.getUTCDay();
  let daysAhead = (1 - day + 7) % 7;
  if (daysAhead === 0 && brtNow.getUTCHours() >= 21) daysAhead = 7;
  const target = new Date(brtNow);
  target.setUTCDate(target.getUTCDate() + daysAhead);
  target.setUTCHours(21, 0, 0, 0);
  const ms = target.getTime() - brtNow.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

export default function EnergyTaxSection() {
  const { t, i18n } = useTranslation();
  const [summary, setSummary] = useState<EnergyTaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [, tick] = useState(0);

  const locale = i18n.language || 'pt-BR';
  const fmtDayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      timeZone: BRT,
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<EnergyTaxSummary>('/energy-tax/summary');
      setSummary(r.data);
    } catch {
      toast.error(t('taxes.energy_tax.toast_load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => tick((v) => v + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const payToday = async () => {
    setPaying(true);
    try {
      await api.post('/energy-tax/pay-daily');
      toast.success(t('taxes.energy_tax.toast_paid_success'));
      void load();
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? t('taxes.energy_tax.toast_pay_error_default');
      toast.error(msg);
    } finally {
      setPaying(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="w-full rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 to-slate-900/50 p-8 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
        <span className="text-sm text-slate-400">{t('taxes.energy_tax.loading')}</span>
      </div>
    );
  }
  if (!summary) return null;

  const discountPol = Math.max(0, summary.fullRateTax - summary.dailyRateTax);
  const notYetActive = !summary.active;
  const THRESHOLD = 10;
  const totalAct = summary.totalActivitiesToday;
  const todayExempt = summary.todayExempt;
  const todayBlocked = notYetActive || summary.todayPaid || (!todayExempt && summary.yesterdayRewards <= 0);
  const ctdown = nextMondayBrtCountdown();
  const firstTaxableMs = firstTaxableDayStartMs(summary.startsAt);
  const todayDayStartIso = summary.days[6]?.dayStart ?? '';
  const yesterdayDayLabel = summary.days[5]
    ? fmtDayLabel(summary.days[5].dayStart).split(',')[1]?.trim() ?? fmtDayLabel(summary.days[5].dayStart)
    : '';

  const startsAtDate = new Date(summary.startsAt);
  const msUntilStart = startsAtDate.getTime() - Date.now();
  let startsInLabel = '';
  if (msUntilStart > 0) {
    const days = Math.floor(msUntilStart / 86400000);
    const hours = Math.floor((msUntilStart % 86400000) / 3600000);
    startsInLabel = days >= 1 ? `${days}d ${hours}h` : `${hours}h`;
  }

  const startsAtShort = startsAtDate.toLocaleDateString(locale, { day: '2-digit', month: 'long' });
  const startsAtDatetime = startsAtDate.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const startsAtNumeric = startsAtDate.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
          <Zap className="w-6 h-6 sm:w-7 sm:h-7 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">{t('taxes.energy_tax.header_title')}</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-snug">{t('taxes.energy_tax.header_subtitle')}</p>
        </div>
      </div>

      {notYetActive && (
        <div className="rounded-2xl border-2 border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-slate-900/80 to-slate-900 p-5 sm:p-7 flex items-start gap-4">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 sm:w-7 sm:h-7 text-sky-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm sm:text-base font-black text-sky-300 uppercase tracking-widest">
              {t('taxes.energy_tax.starts_in_title', { date: startsAtShort })}
            </p>
            <p className="text-sm sm:text-base text-white mt-1">
              <Trans
                i18nKey="taxes.energy_tax.starts_in_body"
                values={{ datetime: startsAtDatetime }}
                components={{ strong: <span className="font-black" /> }}
              />
            </p>
            {startsInLabel && (
              <p className="text-xs sm:text-sm text-sky-200/80 mt-2 font-mono">
                <Trans
                  i18nKey="taxes.energy_tax.starts_in_countdown"
                  values={{ remaining: startsInLabel }}
                  components={{ strong: <span className="font-black text-sky-200" /> }}
                />
              </p>
            )}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-slate-900/80 to-slate-900 p-5 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <BookOpen className="w-4 h-4 text-orange-400" />
          <p className="text-xs uppercase tracking-widest text-orange-400 font-mono font-black">{t('taxes.energy_tax.how_title')}</p>
        </div>
        <div className="space-y-3">
          {([
            { Icon: BookOpen, titleKey: 'taxes.energy_tax.how_step1_title', descKey: 'taxes.energy_tax.how_step1_desc' },
            { Icon: CreditCard, titleKey: 'taxes.energy_tax.how_step2_title', descKey: 'taxes.energy_tax.how_step2_desc' },
            { Icon: Clock, titleKey: 'taxes.energy_tax.how_step3_title', descKey: 'taxes.energy_tax.how_step3_desc' },
          ] as const).map(({ Icon, titleKey, descKey }, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl border border-white/5 bg-slate-900/40 p-4 sm:p-5">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-black text-white uppercase tracking-widest">{t(titleKey)}</p>
                <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bill */}
      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-slate-900/80 to-slate-900 p-5 sm:p-7">
        <div className="flex items-center gap-2 mb-5">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <p className="text-xs uppercase tracking-widest text-orange-400 font-mono font-black">{t('taxes.energy_tax.bill_header')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/8 p-5 sm:p-6 relative overflow-hidden">
            <div className="absolute top-3 right-3 bg-emerald-500 text-slate-950 text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg">
              -67%
            </div>
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-mono font-black mb-3">{t('taxes.energy_tax.bill_daily_label')}</p>
            <p className="text-3xl sm:text-4xl font-black text-white font-mono">{fmtPol(summary.dailyRateTax, 6)}</p>
            <p className="text-base sm:text-lg text-emerald-400 font-bold mt-0.5">POL</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-3">
              {t('taxes.energy_tax.bill_savings', { amount: fmtPol(discountPol, 6) })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 sm:p-6 opacity-75">
            <p className="text-xs uppercase tracking-widest text-slate-500 font-mono font-black mb-3">{t('taxes.energy_tax.bill_full_label')}</p>
            <p className="text-3xl sm:text-4xl font-black text-slate-400 font-mono line-through decoration-slate-600">{fmtPol(summary.fullRateTax, 6)}</p>
            <p className="text-base sm:text-lg text-slate-500 font-bold mt-0.5">POL</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-3">{t('taxes.energy_tax.bill_auto_charge')}</p>
          </div>
        </div>
        <div className="mt-5 text-xs sm:text-sm text-slate-400 leading-relaxed">
          {t('taxes.energy_tax.bill_rewards7d', { amount: fmtPol(summary.totalRewards7d, 6) })}
        </div>
        <div className="mt-3 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-xs text-sky-200/80 leading-relaxed">
          {t('taxes.energy_tax.bill_disclaimer')}
        </div>
      </div>

      {/* Activity Discount */}
      <div className={`rounded-2xl border p-5 sm:p-7 ${todayExempt ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 via-slate-900/80 to-slate-900' : 'border-white/8 bg-slate-900/40'}`}>
        <div className="flex items-center gap-2 mb-4">
          <Gift className={`w-4 h-4 ${todayExempt ? 'text-emerald-400' : 'text-slate-500'}`} />
          <p className={`text-xs uppercase tracking-widest font-mono font-black ${todayExempt ? 'text-emerald-400' : 'text-slate-500'}`}>
            {t('taxes.energy_tax.discount_header')}
          </p>
          {todayExempt && (
            <span className="ml-auto bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg">
              {t('taxes.energy_tax.discount_badge')}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-slate-400 mb-4 leading-relaxed">
          {t('taxes.energy_tax.discount_desc', { threshold: THRESHOLD })}
        </p>

        {/* Total progress bar */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-400 font-medium">{t('taxes.energy_tax.discount_total')}</span>
            <span className={`text-xs font-mono font-black ${todayExempt ? 'text-emerald-400' : 'text-slate-300'}`}>
              {Math.min(totalAct, THRESHOLD)}/{THRESHOLD}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${todayExempt ? 'bg-emerald-500' : 'bg-orange-500/70'}`}
              style={{ width: `${Math.min((totalAct / THRESHOLD) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Per-source breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {([
            { icon: <LayoutGrid className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_ow_ext'), count: summary.offerwallExtToday },
            { icon: <LayoutGrid className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_ow_int'), count: summary.offerwallIntToday },
            { icon: <Droplets className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_faucet'), count: summary.faucetToday },
            { icon: <Link2 className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_shortlink'), count: summary.shortlinkToday },
            { icon: <Youtube className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_youtube'), count: summary.youtubeToday },
            { icon: <Gamepad2 className="w-3 h-3" />, label: t('taxes.energy_tax.discount_src_games'), count: summary.gamesToday },
          ] as const).map(({ icon, label, count }) => (
            <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2 border ${count > 0 ? 'border-white/10 bg-slate-800/60' : 'border-slate-800/60 bg-slate-900/40'}`}>
              <span className={`flex items-center gap-1.5 text-[11px] ${count > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                {icon} {label}
              </span>
              <span className={`text-[11px] font-mono font-black ${count > 0 ? 'text-orange-300' : 'text-slate-600'}`}>
                {count}
              </span>
            </div>
          ))}
        </div>
        {todayExempt && (
          <p className="mt-4 text-xs sm:text-sm text-emerald-300 font-medium">
            {t('taxes.energy_tax.discount_eligible_msg')}
          </p>
        )}
      </div>

      {/* Pay today */}
      <div className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-base sm:text-lg font-black text-white">{t('taxes.energy_tax.pay_card_title')}</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 leading-snug">
              {t('taxes.energy_tax.pay_card_subtitle')}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            <span className="text-[10px] text-slate-500 font-mono">
              {t('taxes.energy_tax.server_clock', { datetime: fmtBrtNow(locale) })}
            </span>
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {t('taxes.energy_tax.pay_card_next_auto', { countdown: ctdown })}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void payToday()}
          disabled={todayBlocked || paying}
          className={`w-full py-5 font-black text-base rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 ${
            todayBlocked
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              : todayExempt
                ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/30'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
          }`}
        >
          {paying && <Loader2 className="w-5 h-5 animate-spin" />}
          {notYetActive
            ? t('taxes.energy_tax.pay_button_pre_launch', { date: startsAtNumeric })
            : summary.todayPaid
              ? <><CheckCircle2 className="w-5 h-5 text-emerald-400" /> {t('taxes.energy_tax.pay_button_paid')}</>
              : todayExempt
                ? <><Gift className="w-5 h-5" /> {t('taxes.energy_tax.pay_button_exempt')}</>
                : summary.yesterdayRewards <= 0
                  ? t('taxes.energy_tax.pay_button_no_rewards')
                  : t('taxes.energy_tax.pay_button_pay', { amount: fmtPol(summary.todayDailyCharge, 6) })}
        </button>

        {!notYetActive && !summary.todayPaid && summary.yesterdayRewards > 0 && (
          <p className="mt-3 text-xs sm:text-sm text-slate-500">
            {t('taxes.energy_tax.pay_button_formula', {
              rewards: fmtPol(summary.yesterdayRewards, 6),
              charge: fmtPol(summary.todayDailyCharge, 6),
            })}
          </p>
        )}
        {!notYetActive && summary.todayPaid && (
          <p className="mt-3 text-xs sm:text-sm text-emerald-400/90">
            {t('taxes.energy_tax.pay_already_settled', { day: yesterdayDayLabel })}
          </p>
        )}
        {!notYetActive && summary.todayPaid && summary.todayRewards > 0 && (
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {t('taxes.energy_tax.pay_tomorrow_hint', {
              rewards: fmtPol(summary.todayRewards, 6),
              charge: fmtPol(Number((summary.todayRewards * (0.05 / 7)).toFixed(8)), 6),
            })}
          </p>
        )}
      </div>

      {/* Week status */}
      <div className="rounded-2xl border border-white/8 bg-slate-900/40 p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs uppercase tracking-widest text-slate-500 font-mono font-black">{t('taxes.energy_tax.week_status_header')}</p>
          <p className="text-xs sm:text-sm text-slate-400 font-mono">
            <span className="text-emerald-400 font-bold">
              {t('taxes.energy_tax.week_status_manual_count', { manual: summary.paidDaysManual ?? 0 })}
            </span>
            <span className="text-slate-600 mx-1">·</span>
            <span className="text-amber-400">{t('taxes.energy_tax.week_status_auto_count', { auto: summary.paidDaysAuto ?? 0 })}</span>
            {(summary.paidDaysExempt ?? 0) > 0 && (
              <>
                <span className="text-slate-600 mx-1">·</span>
                <span className="text-emerald-300">{t('taxes.energy_tax.week_status_exempt_count', { exempt: summary.paidDaysExempt })}</span>
              </>
            )}
          </p>
        </div>
        <p className="text-[10px] text-slate-600 font-mono mb-3">{t('taxes.energy_tax.week_status_order_hint')}</p>
        <div className="grid grid-cols-7 gap-2 sm:gap-3">
          {/* Esquerda = mais antigo · direita = hoje (ordem cronológica ascendente) */}
          {summary.days.map((d) => {
            const dayMs = new Date(d.dayStart).getTime();
            const isPreLaunch = dayMs < firstTaxableMs;
            const isTodayCell = d.dayStart === todayDayStartIso;
            const status: 'exempt' | 'daily' | 'auto' | 'pending' | 'no-reward' | 'pre-launch' | 'today' =
              d.charge?.mode === 'exempt' ? 'exempt'
              : d.charge?.mode === 'daily' ? 'daily'
              : d.charge?.mode === 'auto' ? 'auto'
              : isPreLaunch ? 'pre-launch'
              : isTodayCell && !d.charge ? 'today'
              : d.rewards <= 0 ? 'no-reward'
              : 'pending';
            const cls =
              status === 'exempt' ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
              : status === 'daily' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : status === 'auto' ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              : status === 'pre-launch' ? 'border-slate-800/80 bg-slate-950/80 text-slate-600'
              : status === 'today' ? 'border-sky-500/30 bg-sky-500/8 text-sky-300/80'
              : status === 'no-reward' ? 'border-slate-800 bg-slate-900 text-slate-700'
              : 'border-slate-700 bg-slate-800/60 text-slate-400';
            const icon =
              status === 'exempt' ? <Gift className="w-4 h-4 sm:w-5 sm:h-5" />
              : status === 'daily' ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
              : status === 'auto' ? <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              : status === 'pre-launch' ? <span className="text-[9px] font-black uppercase tracking-tighter">N/A</span>
              : status === 'today' ? <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              : status === 'no-reward' ? <span className="text-base sm:text-lg">—</span>
              : <span className="text-xs font-black">?</span>;
            return (
              <div key={d.dayStart} className={`relative rounded-xl border-2 ${cls} aspect-square p-1.5 sm:p-2 flex flex-col items-center justify-center text-center`}>
                <span className="text-[9px] sm:text-[10px] font-mono uppercase opacity-60 leading-none mb-1">{fmtDayLabel(d.dayStart).split(',')[1]?.trim() ?? fmtDayLabel(d.dayStart)}</span>
                {icon}
                {d.rewards > 0 && (
                  <span className="text-[7px] sm:text-[8px] font-mono opacity-50 leading-none">{fmtPol(d.rewards, 4)}</span>
                )}
                {d.charge && (
                  <span className="text-[8px] sm:text-[9px] font-mono mt-0.5 font-black">{fmtPol(d.charge.amount, 4)}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> {t('taxes.energy_tax.legend_exempt')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> {t('taxes.energy_tax.legend_daily')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> {t('taxes.energy_tax.legend_auto')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-700" /> {t('taxes.energy_tax.legend_pending')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500/60" /> {t('taxes.energy_tax.legend_today')}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-900 border border-slate-700" /> {t('taxes.energy_tax.legend_pre_launch')}</span>
        </div>
      </div>

      {summary.history.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-slate-900/40 overflow-hidden">
          <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-black">{t('taxes.energy_tax.history_header')}</p>
            <span className="ml-auto text-[10px] text-slate-600">
              {t('taxes.energy_tax.history_records', { count: summary.history.length })}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-400">
              <thead className="bg-slate-800/40 text-[10px] uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-2">{t('taxes.energy_tax.col_day')}</th>
                  <th className="px-5 py-2">{t('taxes.energy_tax.col_mode')}</th>
                  <th className="px-5 py-2 text-right">{t('taxes.energy_tax.col_base')}</th>
                  <th className="px-5 py-2 text-right">{t('taxes.energy_tax.col_rate')}</th>
                  <th className="px-5 py-2 text-right">{t('taxes.energy_tax.col_charged')}</th>
                  <th className="px-5 py-2 text-right">{t('taxes.energy_tax.col_status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {summary.history.map((h) => (
                  <tr key={h.id} className="hover:bg-white/4">
                    <td className="px-5 py-2 text-white">{fmtDayLabel(h.periodDayStartsAt)}</td>
                    <td className="px-5 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                        h.mode === 'exempt' ? 'bg-emerald-400/15 text-emerald-200'
                        : h.mode === 'daily' ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/15 text-amber-300'
                      }`}>
                        {h.mode === 'exempt' ? t('taxes.energy_tax.mode_exempt')
                          : h.mode === 'daily' ? t('taxes.energy_tax.mode_daily')
                          : t('taxes.energy_tax.mode_auto')}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right">{fmtPol(h.rewardsBase, 4)}</td>
                    <td className="px-5 py-2 text-right">{Number(h.ratePercent).toFixed(4)}%</td>
                    <td className="px-5 py-2 text-right text-amber-300 font-black">{fmtPol(h.amount, 6)}</td>
                    <td className="px-5 py-2 text-right">
                      <span className={`text-[10px] font-bold uppercase ${
                        h.status === 'paid' ? 'text-emerald-400'
                        : h.status === 'partial' ? 'text-amber-400'
                        : 'text-red-400'
                      }`}>
                        {h.status === 'paid' ? t('taxes.energy_tax.status_paid')
                          : h.status === 'partial' ? t('taxes.energy_tax.status_partial')
                          : t('taxes.energy_tax.status_skipped')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
