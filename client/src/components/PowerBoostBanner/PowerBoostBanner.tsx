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
    <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/80 p-5 shadow-lg ring-1 ring-white/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <Rocket className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-snug text-white">{t('powerBoost.title')}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              <Trans
                i18nKey="powerBoost.headline_desc"
                components={{ strong: <strong className="font-semibold text-slate-200" /> }}
              />
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {isActive ? (
          <button
            type="button"
            disabled
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t('powerBoost.active_button')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleActivate()}
            disabled={activating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-black transition-all hover:brightness-110 disabled:opacity-60"
          >
            {activating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('powerBoost.activating')}
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                {t('powerBoost.activate', { cost })}
              </>
            )}
          </button>
        )}

        <Link
          to="/taxes/power-boost"
          className="text-center text-sm font-semibold text-primary/90 transition-colors hover:text-primary"
        >
          {t('powerBoost.learn_more')}
        </Link>
      </div>
    </section>
  );
}
