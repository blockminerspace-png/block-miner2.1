import { CalendarClock, CheckCircle2, CircleDashed, Gift, Loader2, PlayCircle } from 'lucide-react';
import { CADENCE_SECTIONS } from './dailyTasks/dailyTasksCadence';
import {
  cadenceLabel,
  formatIsoLocal,
  formatRewardSummary,
  statusLabel,
  taskDescription
} from './dailyTasks/dailyTasksHelpers';
import { useDailyTasksDashboard } from './dailyTasks/useDailyTasksDashboard';

export default function DailyTasks() {
  const { t, loading, loadFailed, tasks, tasksByCadence, nextResetLabel, claimingId, load, claim } =
    useDailyTasksDashboard();

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <PlayCircle className="w-8 h-8 text-emerald-400 shrink-0" aria-hidden />
          {t('dailyTasks.title')}
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl">{t('dailyTasks.subtitle')}</p>
        {tasks.length > 0 && nextResetLabel && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 font-mono uppercase tracking-widest">
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" aria-hidden />
              {t('dailyTasks.earliest_reset')}: {nextResetLabel}
            </span>
          </div>
        )}
        {!loadFailed && tasks.length > 0 ? (
          <nav className="flex flex-wrap gap-2 pt-2" aria-label={t('dailyTasks.nav_aria')}>
            {CADENCE_SECTIONS.map((c) => {
              const count = tasksByCadence[c]?.length ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    document.getElementById(`tasks-section-${c}`)?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start'
                    })
                  }
                  className="rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-slate-300 transition-all hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-100"
                >
                  {t(`dailyTasks.jump_${c}`)}
                </button>
              );
            })}
          </nav>
        ) : null}
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
        <div className="space-y-10">
          {CADENCE_SECTIONS.map((cadence) => {
            const sectionTasks = tasksByCadence[cadence] || [];
            if (sectionTasks.length === 0) return null;
            return (
              <section
                key={cadence}
                id={`tasks-section-${cadence}`}
                className="scroll-mt-24 space-y-4"
                aria-labelledby={`tasks-heading-${cadence}`}
              >
                <h2
                  id={`tasks-heading-${cadence}`}
                  className="text-sm font-black uppercase tracking-[0.25em] text-violet-300/90 border-b border-violet-500/20 pb-2"
                >
                  {t(`dailyTasks.section_${cadence}`)}
                </h2>
                <ul className="grid gap-4">
                  {sectionTasks.map((task) => {
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
                                {statusLabel(t, String(task.status))}
                              </span>
                              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border border-violet-500/30 text-violet-200">
                                {cadenceLabel(t, task.resetCadence)}
                              </span>
                            </div>
                            <p className="text-white font-medium leading-snug">{taskDescription(t, task)}</p>
                            <p className="text-[11px] text-slate-500 font-mono leading-snug">
                              {t('dailyTasks.period')}: {task.periodKey}
                              <span className="text-slate-600"> · </span>
                              {t('dailyTasks.next_reset')}: {formatIsoLocal(task.nextResetAt)}
                            </p>
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
                              onClick={() => void claim(task.id)}
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
