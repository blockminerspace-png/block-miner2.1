import { useState, useEffect, useCallback, useMemo } from 'react';
import { Zap, CheckCircle2, Loader2, Rocket, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation, Trans } from 'react-i18next';
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

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-sm font-black uppercase tracking-wide text-white">{t('powerBoost.title')}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="text-slate-500">{t('powerBoost.status_label')}:</span>
          {status.active ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('powerBoost.status_active')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Circle className="w-3 h-3" />
              {t('powerBoost.status_inactive')}
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4 text-sm text-slate-300">
        <p className="leading-relaxed">
          <Trans i18nKey="powerBoost.intro" values={{ cost }} components={{ strong: <strong className="text-white" /> }} />
        </p>
        <p className="leading-relaxed text-slate-400 text-xs">{t('powerBoost.body')}</p>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/50 text-slate-400">
                <th className="text-left px-3 py-2 font-bold">{t('powerBoost.table_system')}</th>
                <th className="text-left px-3 py-2 font-bold">{t('powerBoost.table_normal')}</th>
                <th className="text-left px-3 py-2 font-bold">{t('powerBoost.table_boosted')}</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEM_ROWS.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-white font-medium">{t(`powerBoost.${row.key}`)}</td>
                  <td className="px-3 py-2">{t('powerBoost.duration_24h')}</td>
                  <td className="px-3 py-2 text-emerald-400 font-semibold">{t('powerBoost.duration_7d')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-slate-950/60 border border-slate-800 px-4 py-3 space-y-1.5">
          <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">{t('powerBoost.important_title')}</p>
          <ul className="text-xs text-slate-500 space-y-1 list-disc pl-4">
            <li>{t('powerBoost.important_1')}</li>
            <li>{t('powerBoost.important_2')}</li>
            <li>{t('powerBoost.important_3')}</li>
            <li>{t('powerBoost.important_4')}</li>
          </ul>
          <p className="text-[10px] text-slate-600 pt-1">{t('powerBoost.entitlement_note')}</p>
        </div>

        {status.active && countdown ? (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 space-y-1">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wide">{t('powerBoost.expires_in')}</p>
            <p className="text-lg font-black text-emerald-300 tabular-nums">
              {t('powerBoost.countdown', countdown)}
            </p>
            <p className="text-xs text-emerald-400/80">{t('powerBoost.active_hint')}</p>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <p className="text-xs text-slate-500 max-w-xl">{t('powerBoost.entitlement_note')}</p>
            <button
              type="button"
              onClick={() => void handleActivate()}
              disabled={activating}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-black text-xs font-black uppercase tracking-wider rounded-xl hover:brightness-110 transition-all disabled:opacity-60"
            >
              {activating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t('powerBoost.activating')}
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  {t('powerBoost.activate', { cost })}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
