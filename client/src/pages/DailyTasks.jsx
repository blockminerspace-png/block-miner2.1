import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { CalendarClock, CheckCircle2, CircleDashed, Gift, Loader2, PlayCircle } from 'lucide-react';
import { api } from '../store/auth';

function formatRewardSummary(t, reward) {
  if (!reward) return '';
  const k = String(reward.kind || '').toUpperCase();
  if (k === 'BLK' && reward.amount != null) {
    return t('dailyTasks.reward.blk', { amount: reward.amount });
  }
  if (k === 'POL' && reward.amount != null) {
    return t('dailyTasks.reward.pol', { amount: reward.amount });
  }
  if (k === 'HASHRATE_TEMP') {
    return t('dailyTasks.reward.hashrate', {
      hashRate: reward.hashRate ?? 0,
      days: reward.days ?? 1
    });
  }
  return k;
}

function statusLabel(t, status) {
  const map = {
    available: 'dailyTasks.status.available',
    in_progress: 'dailyTasks.status.in_progress',
    completed: 'dailyTasks.status.completed',
    claimed: 'dailyTasks.status.claimed'
  };
  return t(map[status] || 'dailyTasks.status.available');
}

function taskDescription(t, task) {
  const key = task.translationKey || '';
  const opts = { target: task.targetValue };
  return t(key, opts);
}

export default function DailyTasks() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  /** When set, the list request failed — do not show the “no tasks configured” empty copy. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [claimingId, setClaimingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get('/daily-tasks');
      if (res.data?.ok) {
        setData(res.data);
        setLoadFailed(false);
      } else {
        setData(null);
        setLoadFailed(true);
        toast.error(t('dailyTasks.errors.load_failed'));
      }
    } catch (e) {
      setData(null);
      setLoadFailed(true);
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401) {
          toast.error(t('dailyTasks.errors.unauthorized'));
        } else if (status != null && status >= 500) {
          toast.error(t('dailyTasks.errors.server'));
        } else if (e.response) {
          toast.error(t('dailyTasks.errors.load_failed'));
        } else {
          toast.error(t('dailyTasks.errors.network'));
        }
      } else {
        toast.error(t('dailyTasks.errors.network'));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const nextResetLabel = useMemo(() => {
    if (!data?.nextResetAt) return '';
    try {
      return new Date(data.nextResetAt).toLocaleString();
    } catch {
      return data.nextResetAt;
    }
  }, [data]);

  const claim = async (taskId) => {
    try {
      setClaimingId(taskId);
      const res = await api.post(`/daily-tasks/${taskId}/claim`);
      if (res.data?.ok) {
        toast.success(t('dailyTasks.claim_ok'));
        await load();
      }
    } catch (e) {
      const code = e?.response?.data?.code;
      if (code === 'not_completed') toast.error(t('dailyTasks.errors.not_completed'));
      else if (code === 'already_claimed') toast.error(t('dailyTasks.errors.already_claimed'));
      else toast.error(t('dailyTasks.errors.claim_failed'));
    } finally {
      setClaimingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" aria-hidden />
      </div>
    );
  }

  const tasks = data?.tasks || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <PlayCircle className="w-8 h-8 text-emerald-400 shrink-0" aria-hidden />
          {t('dailyTasks.title')}
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl">{t('dailyTasks.subtitle')}</p>
        {data?.periodKey && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 font-mono uppercase tracking-widest">
            <span>
              {t('dailyTasks.period_label')}: {data.periodKey}
            </span>
            {nextResetLabel && (
              <span className="flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" aria-hidden />
                {t('dailyTasks.next_reset')}: {nextResetLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {loadFailed ? (
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 space-y-4 max-w-xl">
          <p className="text-slate-300 text-sm leading-relaxed">{t('dailyTasks.load_error_body')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest bg-white/10 hover:bg-white/15 border border-white/10 text-white transition-colors"
          >
            {t('dailyTasks.retry')}
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-slate-500">{t('dailyTasks.empty')}</p>
      ) : (
        <ul className="grid gap-4">
          {tasks.map((task) => {
            const cur = Number(task.currentValue) || 0;
            const tgt = Number(task.targetValue) || 1;
            const pct = Math.min(100, (cur / Math.max(tgt, 1)) * 100);
            const canClaim = task.status === 'completed';
            const isClaimed = task.status === 'claimed';

            return (
              <li
                key={task.id}
                className="rounded-2xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-sm"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isClaimed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden />
                      ) : (
                        <CircleDashed className="w-5 h-5 text-slate-500 shrink-0" aria-hidden />
                      )}
                      <span
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          task.status === 'claimed'
                            ? 'border-emerald-500/30 text-emerald-300'
                            : task.status === 'completed'
                              ? 'border-amber-500/30 text-amber-200'
                              : task.status === 'in_progress'
                                ? 'border-sky-500/30 text-sky-200'
                                : 'border-slate-600 text-slate-400'
                        }`}
                      >
                        {statusLabel(t, task.status)}
                      </span>
                    </div>
                    <p className="text-white font-medium leading-snug">{taskDescription(t, task)}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2">
                      <Gift className="w-3.5 h-3.5 text-amber-400/80" aria-hidden />
                      {formatRewardSummary(t, task.reward)}
                    </p>
                    <div className="pt-1">
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 font-mono">
                        {t('dailyTasks.progress', {
                          current: Number(cur.toFixed(4)),
                          target: Number(tgt.toFixed(4))
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 w-full md:w-auto md:min-w-[12rem]">
                    <button
                      type="button"
                      disabled={!canClaim || claimingId === task.id}
                      onClick={() => claim(task.id)}
                      className="w-full px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-[0.2em] bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-35 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-emerald-900/30 border border-emerald-400/20 disabled:border-transparent disabled:shadow-none"
                    >
                      {claimingId === task.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                          {t('dailyTasks.claiming')}
                        </span>
                      ) : (
                        t('dailyTasks.claim')
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
