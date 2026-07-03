import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Rocket, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
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

export default function PowerBoostBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<BoostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

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
    <section className="w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-4 py-3 shadow-lg ring-1 ring-white/5 sm:px-5 sm:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white sm:text-base">{t('powerBoost.title')}</h2>
            <p className="mt-0.5 text-xs leading-snug text-slate-400 sm:text-sm">
              <Trans
                i18nKey="powerBoost.headline_desc"
                components={{ strong: <strong className="font-semibold text-slate-200" /> }}
              />
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:inline">
              {t('powerBoost.status_label')}
            </span>
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {t('powerBoost.status_active')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-semibold text-slate-400">
                <Circle className="h-1.5 w-1.5" />
                {t('powerBoost.status_inactive')}
              </span>
            )}
          </div>

          {isActive ? (
            <button
              type="button"
              disabled
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 sm:text-sm"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {t('powerBoost.active_button')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={activating}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-black transition-all hover:brightness-110 disabled:opacity-60 sm:text-sm"
            >
              {activating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('powerBoost.activating')}
                </>
              ) : (
                <>
                  <Rocket className="h-3.5 w-3.5" />
                  {t('powerBoost.activate', { cost })}
                </>
              )}
            </button>
          )}

          <Link
            to="/taxes/power-boost"
            className="text-xs font-semibold text-primary/90 transition-colors hover:text-primary sm:text-sm"
          >
            {t('powerBoost.learn_more')}
          </Link>
        </div>
      </div>
    </section>
  );
}
