import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Rocket,
  Circle,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { api } from '../../store/auth';

interface BoostStatus {
  active: boolean;
  dayKey: string;
  costPol: number;
  entitlementExpiresAt: string | null;
  currentRewardDurationHours: number;
  normalRewardDurationHours: number;
  boostedRewardDurationHours: number;
}

const SYSTEM_ROWS = [
  { key: 'system_faucet', id: 'faucet' },
  { key: 'system_shortlinks', id: 'shortlinks' },
  { key: 'system_youtube', id: 'youtube' },
  { key: 'system_autoMining', id: 'autoMining' },
] as const;

const HOW_IT_WORKS_STEPS = [
  'how_it_works_s1',
  'how_it_works_s2',
  'how_it_works_s3',
  'how_it_works_s4',
  'how_it_works_s5',
] as const;

const IMPORTANT_KEYS = [
  'important_1',
  'important_2',
  'important_3',
  'important_4',
] as const;

function useEntitlementCountdown(expiresAt: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return useMemo(() => {
    if (!expiresAt) return null;
    const diff = Math.max(0, new Date(expiresAt).getTime() - now);
    const totalMinutes = Math.floor(diff / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    return { days, hours, minutes };
  }, [expiresAt, now]);
}

export default function PowerBoostBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const countdown = useEntitlementCountdown(status?.entitlementExpiresAt ?? null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/power-boost/status');
      setStatus(res.data);
    } catch {
      // silent — banner hidden on failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      const res = await api.post('/power-boost/activate');
      if (res.data.ok) {
        await fetchStatus();
        toast.success(t('powerBoost.toast_success'));
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('powerBoost.toast_error');
      toast.error(msg);
    } finally {
      setActivating(false);
    }
  };

  if (loading || !status) return null;

  const cost = status.costPol;
  const isActive = status.active;

  return (
    <div className="relative left-1/2 w-[min(100%,80%)] max-w-5xl -translate-x-1/2 px-3 sm:px-4">
      <section className="overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-lg ring-1 ring-white/5">
        <div className="mx-auto w-full max-w-none px-5 py-6 sm:px-6 md:max-w-[850px] md:py-7 lg:max-w-[900px]">
          {/* Header */}
          <header className="flex flex-col gap-4 border-b border-slate-800/70 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
                <Rocket className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="text-lg font-bold leading-snug text-white sm:text-xl">
                  {t('powerBoost.title')}
                </h2>
                <p className="text-sm leading-relaxed text-slate-400">{t('powerBoost.headline_desc')}</p>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1 sm:items-end">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {t('powerBoost.status_label')}
              </span>
              {isActive ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  {t('powerBoost.status_active')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-semibold text-slate-400">
                  <Circle className="h-2 w-2" />
                  {t('powerBoost.status_inactive')}
                </span>
              )}
            </div>
          </header>

          <div className="space-y-6 pt-6">
            {/* Como funciona — passos */}
            <section>
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
                {t('powerBoost.how_it_works_title')}
              </h3>
              <div className="flex flex-col items-stretch">
                {HOW_IT_WORKS_STEPS.map((key, idx) => (
                  <div key={key}>
                    <div className="flex items-start gap-3 rounded-xl border border-slate-700/50 bg-slate-900/50 px-4 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {idx + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-slate-200">
                        {t(`powerBoost.${key}`, { cost })}
                      </p>
                    </div>
                    {idx < HOW_IT_WORKS_STEPS.length - 1 ? (
                      <div className="flex justify-center py-1 text-slate-600">
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            {/* Tabela centralizada */}
            <div className="flex justify-center">
              <div className="overflow-hidden rounded-xl border border-slate-700/50 bg-slate-950/40">
                <table className="w-auto text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/70">
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                        {t('powerBoost.table_system')}
                      </th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                        {t('powerBoost.table_normal')}
                      </th>
                      <th className="px-5 py-3 text-xs font-bold uppercase tracking-wider text-emerald-400/90">
                        {t('powerBoost.table_boosted')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {SYSTEM_ROWS.map((row, idx) => (
                      <tr
                        key={row.id}
                        className={idx < SYSTEM_ROWS.length - 1 ? 'border-b border-slate-800/70' : ''}
                      >
                        <td className="px-5 py-3 font-semibold text-white">
                          {t(`powerBoost.${row.key}`)}
                        </td>
                        <td className="px-5 py-3 text-slate-400">{t('powerBoost.duration_24h')}</td>
                        <td className="px-5 py-3 font-semibold text-emerald-400">
                          {t('powerBoost.duration_7d')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Importante */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
                <h3 className="text-sm font-bold text-amber-100">{t('powerBoost.important_title')}</h3>
              </div>
              <ul className="space-y-2.5">
                {IMPORTANT_KEYS.map((key) => (
                  <li key={key} className="flex items-start gap-2.5 text-sm leading-relaxed text-amber-100/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2.5} />
                    <span className={key === 'important_3' ? 'font-semibold text-amber-50' : undefined}>
                      {t(`powerBoost.${key}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Countdown quando ativo */}
            {isActive && countdown ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  {t('powerBoost.benefit_window_ends')}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-emerald-200">
                  {t('powerBoost.countdown', countdown)}
                </p>
                <p className="mt-1.5 text-sm text-emerald-300/80">{t('powerBoost.active_hint')}</p>
              </div>
            ) : null}

            {/* CTA */}
            <div className="flex justify-center pt-2">
              {isActive ? (
                <button
                  type="button"
                  disabled
                  className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/12 px-5 py-3.5 text-base font-bold text-emerald-300"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  {t('powerBoost.active_button')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleActivate()}
                  disabled={activating}
                  className="group flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-base font-bold text-black shadow-md transition-all duration-200 hover:brightness-110 hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
                >
                  {activating ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t('powerBoost.activating')}
                    </>
                  ) : (
                    <>
                      <Rocket className="h-5 w-5 transition-transform group-hover:-translate-y-0.5" />
                      {t('powerBoost.activate', { cost })}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Rodapé */}
            <div className="flex items-start gap-2 border-t border-slate-800/60 pt-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              <p className="text-xs leading-relaxed text-slate-500">{t('powerBoost.footer_note')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
