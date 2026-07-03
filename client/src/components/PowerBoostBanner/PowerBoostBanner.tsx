import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CheckCircle2,
  Loader2,
  Rocket,
  Circle,
  ShieldCheck,
  Sparkles,
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

const HOW_IT_WORKS_KEYS = [
  'how_it_works_b1',
  'how_it_works_b2',
  'how_it_works_b3',
  'how_it_works_b4',
  'how_it_works_b5',
] as const;

const IMPORTANT_KEYS = [
  'important_1',
  'important_2',
  'important_3',
  'important_4',
  'important_5',
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
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-6xl xl:max-w-7xl overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/5">
        {/* Header */}
        <header className="border-b border-slate-800/80 bg-slate-900/40 px-6 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
                  <Rocket className="h-7 w-7 text-primary" />
                </div>
                <div className="min-w-0 space-y-3">
                  <h2 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                    {t('powerBoost.title')}
                  </h2>
                  <p className="max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">
                    {t('powerBoost.headline_desc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 lg:items-end">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                {t('powerBoost.status_label')}
              </span>
              {isActive ? (
                <span className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-5 py-3 text-base font-bold text-emerald-300">
                  <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.75)]" />
                  {t('powerBoost.status_active')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-700 bg-slate-800/60 px-5 py-3 text-base font-bold text-slate-400">
                  <Circle className="h-3 w-3" />
                  {t('powerBoost.status_inactive')}
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="space-y-10 px-6 py-10 sm:space-y-12 sm:px-8 sm:py-12 lg:px-12 lg:py-14">
          {/* Como funciona */}
          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-slate-900/50 to-slate-950/80 p-6 sm:p-8 lg:p-10">
            <div className="mb-6 flex items-center gap-3">
              <Sparkles className="h-6 w-6 text-primary" />
              <h3 className="text-xl font-black text-white sm:text-2xl">{t('powerBoost.how_it_works_title')}</h3>
            </div>
            <p className="mb-5 text-base font-semibold text-slate-200 sm:text-lg">
              {t('powerBoost.how_it_works_intro')}
            </p>
            <ul className="space-y-4 text-base leading-relaxed text-slate-300 sm:text-lg">
              {HOW_IT_WORKS_KEYS.map((key) => (
                <li key={key} className="flex gap-3">
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span>{t(`powerBoost.${key}`)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 space-y-3 rounded-xl border border-slate-700/60 bg-slate-950/50 p-5 sm:p-6">
              <p className="text-base font-bold text-white sm:text-lg">{t('powerBoost.how_it_works_today')}</p>
              <p className="text-base leading-relaxed text-slate-400 sm:text-lg">
                {t('powerBoost.how_it_works_tomorrow')}
              </p>
            </div>
          </div>

          {/* Tabela */}
          <div>
            <div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950/40">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-5 py-5 text-sm font-black uppercase tracking-wider text-slate-400 sm:px-8 sm:py-6 sm:text-base">
                      {t('powerBoost.table_system')}
                    </th>
                    <th className="px-5 py-5 text-sm font-black uppercase tracking-wider text-slate-400 sm:px-8 sm:py-6 sm:text-base">
                      {t('powerBoost.table_normal')}
                    </th>
                    <th className="px-5 py-5 text-sm font-black uppercase tracking-wider text-emerald-400/90 sm:px-8 sm:py-6 sm:text-base">
                      {t('powerBoost.table_boosted')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SYSTEM_ROWS.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={idx < SYSTEM_ROWS.length - 1 ? 'border-b border-slate-800/80' : ''}
                    >
                      <td className="px-5 py-5 text-base font-bold text-white sm:px-8 sm:py-6 sm:text-lg">
                        {t(`powerBoost.${row.key}`)}
                      </td>
                      <td className="px-5 py-5 text-base text-slate-400 sm:px-8 sm:py-6 sm:text-lg">
                        {t('powerBoost.duration_24h')}
                      </td>
                      <td className="px-5 py-5 text-base font-bold text-emerald-400 sm:px-8 sm:py-6 sm:text-lg">
                        {t('powerBoost.duration_7d')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Importante */}
          <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-slate-950/60 p-6 sm:p-8 lg:p-10">
            <div className="mb-6 flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-amber-300" />
              <h3 className="text-xl font-black text-amber-100 sm:text-2xl">{t('powerBoost.important_title')}</h3>
            </div>
            <ul className="space-y-4">
              {IMPORTANT_KEYS.map((key) => (
                <li
                  key={key}
                  className={`flex gap-3 text-base leading-relaxed sm:text-lg ${
                    key === 'important_2' ? 'font-bold text-amber-50' : 'text-amber-100/85'
                  }`}
                >
                  <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-amber-400" />
                  <span>{t(`powerBoost.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Countdown quando ativo */}
          {isActive && countdown ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-6 sm:px-8 sm:py-8">
              <p className="text-sm font-bold uppercase tracking-wider text-emerald-400 sm:text-base">
                {t('powerBoost.benefit_window_ends')}
              </p>
              <p className="mt-2 text-2xl font-black tabular-nums text-emerald-200 sm:text-3xl">
                {t('powerBoost.countdown', countdown)}
              </p>
              <p className="mt-3 text-base leading-relaxed text-emerald-300/90 sm:text-lg">
                {t('powerBoost.active_hint')}
              </p>
            </div>
          ) : null}

          {/* CTA */}
          {isActive ? (
            <button
              type="button"
              disabled
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/15 px-6 py-5 text-lg font-black text-emerald-300 sm:py-6 sm:text-xl"
            >
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              {t('powerBoost.active_button')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={activating}
              className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-5 text-lg font-black text-black shadow-[0_12px_40px_-12px_rgba(250,204,21,0.55)] transition-all duration-200 hover:scale-[1.01] hover:brightness-110 hover:shadow-[0_16px_48px_-12px_rgba(250,204,21,0.7)] active:scale-[0.99] disabled:opacity-60 sm:py-6 sm:text-xl"
            >
              {activating ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  {t('powerBoost.activating')}
                </>
              ) : (
                <>
                  <Rocket className="h-6 w-6 transition-transform group-hover:-translate-y-0.5" />
                  {t('powerBoost.activate', { cost })}
                </>
              )}
            </button>
          )}

          {/* Rodapé */}
          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-5 py-4 sm:px-6 sm:py-5">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
            <p className="text-sm leading-relaxed text-slate-500 sm:text-base">{t('powerBoost.footer_note')}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
