import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Zap, Calendar, CheckCircle2, AlertCircle, Loader2, History, Sparkles, BookOpen, CreditCard, Clock } from 'lucide-react';
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
  unpaidDays: number;
  todayPaid: boolean;
  todayRewards: number;
  todayDailyCharge: number;
  days: Array<{
    dayStart: string;
    rewards: number;
    charge: ChargeRow | null;
  }>;
  history: Array<ChargeRow & { rewardsBase: number; periodDayStartsAt: string }>;
};

function fmtPol(n: number, decimals = 6): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
  const fmtDayLabel = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' });

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
  const todayBlocked = notYetActive || summary.todayPaid || summary.todayRewards <= 0;
  const ctdown = nextMondayBrtCountdown();

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
    <div className="w-full space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
          <Zap className="w-5 h-5 text-orange-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-black text-white tracking-tight">{t('taxes.energy_tax.header_title')}</h2>
          <p className="text-xs text-slate-500">{t('taxes.energy_tax.header_subtitle')}</p>
        </div>
      </div>

      {notYetActive && (
        <div className="rounded-2xl border-2 border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-slate-900/80 to-slate-900 p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center shrink-0">
            <Calendar className="w-6 h-6 text-sky-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-sky-300 uppercase tracking-widest">
              {t('taxes.energy_tax.starts_in_title', { date: startsAtShort })}
            </p>
            <p className="text-base text-white mt-1">
              <Trans
                i18nKey="taxes.energy_tax.starts_in_body"
                values={{ datetime: startsAtDatetime }}
                components={{ strong: <span className="font-black" /> }}
              />
            </p>
            {startsInLabel && (
              <p className="text-xs text-sky-200/80 mt-2 font-mono">
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

      <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/5 via-slate-900/80 to-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-3.5 h-3.5 text-orange-400" />
          <p className="text-[10px] uppercase tracking-widest text-orange-400 font-mono font-black">{t('taxes.energy_tax.how_title')}</p>
        </div>
        <div className="space-y-3">
          {([
            { Icon: BookOpen, titleKey: 'taxes.energy_tax.how_step1_title', descKey: 'taxes.energy_tax.how_step1_desc' },
            { Icon: CreditCard, titleKey: 'taxes.energy_tax.how_step2_title', descKey: 'taxes.energy_tax.how_step2_desc' },
            { Icon: Clock, titleKey: 'taxes.energy_tax.how_step3_title', descKey: 'taxes.energy_tax.how_step3_desc' },
          ] as const).map(({ Icon, titleKey, descKey }, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-900/40 p-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-widest">{t(titleKey)}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{t(descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-slate-900/80 to-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-orange-400" />
          <p className="text-[10px] uppercase tracking-widest text-orange-400 font-mono font-black">{t('taxes.energy_tax.bill_header')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 relative overflow-hidden">
            <div className="absolute top-2 right-2 bg-emerald-500 text-slate-950 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">
              -25%
            </div>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono font-black mb-1">{t('taxes.energy_tax.bill_daily_label')}</p>
            <p className="text-3xl font-black text-white font-mono">{fmtPol(summary.dailyRateTax, 6)} <span className="text-sm text-emerald-400">POL</span></p>
            <p className="text-[11px] text-slate-400 mt-2">
              {t('taxes.energy_tax.bill_savings', { amount: fmtPol(discountPol, 6) })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 opacity-80">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-black mb-1">{t('taxes.energy_tax.bill_full_label')}</p>
            <p className="text-3xl font-black text-slate-300 font-mono line-through decoration-slate-600">{fmtPol(summary.fullRateTax, 6)} <span className="text-sm text-slate-500">POL</span></p>
            <p className="text-[11px] text-slate-500 mt-2">{t('taxes.energy_tax.bill_auto_charge')}</p>
          </div>
        </div>

        <div className="mt-5 text-xs text-slate-400 leading-relaxed">
          {t('taxes.energy_tax.bill_rewards7d', { amount: fmtPol(summary.totalRewards7d, 6) })}
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/25 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-sm font-black text-white">{t('taxes.energy_tax.pay_card_title')}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t('taxes.energy_tax.pay_card_subtitle')}
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            <Calendar className="w-3 h-3 inline mr-1" />
            {t('taxes.energy_tax.pay_card_next_auto', { countdown: ctdown })}
          </span>
        </div>

        <button
          type="button"
          onClick={() => void payToday()}
          disabled={todayBlocked || paying}
          className={`w-full py-4 font-black text-sm rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 ${
            todayBlocked
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              : 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/30'
          }`}
        >
          {paying && <Loader2 className="w-4 h-4 animate-spin" />}
          {notYetActive
            ? t('taxes.energy_tax.pay_button_pre_launch', { date: startsAtNumeric })
            : summary.todayPaid
              ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> {t('taxes.energy_tax.pay_button_paid')}</>
              : summary.todayRewards <= 0
                ? t('taxes.energy_tax.pay_button_no_rewards')
                : t('taxes.energy_tax.pay_button_pay', { amount: fmtPol(summary.todayDailyCharge, 6) })}
        </button>

        {!notYetActive && !summary.todayPaid && summary.todayRewards > 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            {t('taxes.energy_tax.pay_button_formula', {
              rewards: fmtPol(summary.todayRewards, 6),
              charge: fmtPol(summary.todayDailyCharge, 6),
            })}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/8 bg-slate-900/40 p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono font-black">{t('taxes.energy_tax.week_status_header')}</p>
          <p className="text-[11px] text-slate-400 font-mono">
            <span className="text-emerald-400 font-bold">
              {t('taxes.energy_tax.week_status_paid_count', { paid: summary.paidDays })}
            </span>
          </p>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {summary.days.map((d) => {
            const status: 'daily' | 'auto' | 'pending' | 'no-reward' =
              d.charge?.mode === 'daily' ? 'daily'
              : d.charge?.mode === 'auto' ? 'auto'
              : d.rewards <= 0 ? 'no-reward'
              : 'pending';
            const cls =
              status === 'daily' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              : status === 'auto' ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              : status === 'no-reward' ? 'border-slate-800 bg-slate-900 text-slate-700'
              : 'border-slate-700 bg-slate-800/60 text-slate-400';
            const icon =
              status === 'daily' ? <CheckCircle2 className="w-4 h-4" />
              : status === 'auto' ? <AlertCircle className="w-4 h-4" />
              : status === 'no-reward' ? <span className="text-[14px]">—</span>
              : <span className="text-[10px] font-black">?</span>;
            return (
              <div key={d.dayStart} className={`relative rounded-xl border-2 ${cls} aspect-square p-2 flex flex-col items-center justify-center text-center`}>
                <span className="text-[9px] font-mono uppercase opacity-60 leading-none mb-1">{fmtDayLabel(d.dayStart).split(',')[1]?.trim() ?? fmtDayLabel(d.dayStart)}</span>
                {icon}
                {d.charge && (
                  <span className="text-[8px] font-mono mt-1 font-black">{fmtPol(d.charge.amount, 4)}</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" /> {t('taxes.energy_tax.legend_daily')}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> {t('taxes.energy_tax.legend_auto')}</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-700" /> {t('taxes.energy_tax.legend_pending')}</span>
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
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${h.mode === 'daily' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                        {h.mode === 'daily' ? t('taxes.energy_tax.mode_daily') : t('taxes.energy_tax.mode_auto')}
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
