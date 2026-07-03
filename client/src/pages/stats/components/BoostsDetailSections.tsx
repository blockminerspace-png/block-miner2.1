import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CalendarCheck, Gamepad2, Timer, Youtube } from 'lucide-react';
import { formatHashrate } from '../../../shared/utils/machine';
import type { UserPowerStatsPayload } from '../stats.api';

function formatDurationMs(ms: number) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function ExpiryBadge({ expiresAt, t }: { expiresAt?: string | null; t: TFunction }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const end = expiresAt ? new Date(expiresAt).getTime() : 0;
  const left = end - Date.now();
  if (!expiresAt) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
      <Timer className="w-3 h-3" />
      {left <= 0 ? t('powerStats.expired') : formatDurationMs(left)}
    </span>
  );
}

type Props = {
  power: UserPowerStatsPayload;
};

function BoostsDetailSectionsInner({ power }: Props) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-6 pt-4 border-t border-slate-800">
      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
          <Youtube className="w-4 h-4" />
          {t('powerStats.youtube.title')} — {formatHashrate(power.youtube?.activeTotal)}
        </h3>
        <p className="text-[11px] text-slate-500">{t('powerStats.youtube.note')}</p>
        <ul className="space-y-2">
          {(power.youtube?.activeItems || []).map((y) => (
            <li key={y.id} className="flex justify-between items-center text-sm border-b border-slate-800/60 pb-2">
              <span className="text-slate-400 font-mono text-xs">{y.sourceVideoId || '—'}</span>
              <div className="flex items-center gap-2">
                <span className="text-sky-400 font-mono">{formatHashrate(y.hashRate)}</span>
                <ExpiryBadge expiresAt={y.expiresAt} t={t} />
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-slate-600 uppercase font-bold">{t('powerStats.youtube.history')}</p>
        <ul className="max-h-40 overflow-y-auto space-y-1 text-xs text-slate-500">
          {(power.youtube?.history || []).slice(0, 8).map((h) => (
            <li key={h.id} className="flex justify-between">
              <span>{h.sourceVideoId || '—'}</span>
              <span>{formatHashrate(h.hashRate)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black text-orange-400 uppercase tracking-widest flex items-center gap-2">
          <Gamepad2 className="w-4 h-4" />
          {t('powerStats.games.title')}
        </h3>
        <p className="text-[11px] text-slate-500">{t('powerStats.games.note')}</p>
        <p className="text-xs text-slate-500">
          {t('powerStats.games.minigames')}: {formatHashrate(power.games?.minigameTotal)} · {t('powerStats.games.checkin')}:{' '}
          {formatHashrate(power.games?.checkinBonusTotal)}
        </p>
        {(power.games?.byGame || []).map((g) => (
          <div key={g.slug} className="border border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex justify-between">
              <span className="font-bold text-white text-sm">{g.name}</span>
              <span className="text-sky-400 font-mono text-sm">{formatHashrate(g.totalHashRate)}</span>
            </div>
            {g.items.map((it) => (
              <div key={it.id} className="flex justify-between text-xs text-slate-500">
                <ExpiryBadge expiresAt={it.expiresAt} t={t} />
                <span>{formatHashrate(it.hashRate)}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black text-violet-400 uppercase tracking-widest">{t('powerStats.auto_mining.title')}</h3>
        <p className="text-[11px] text-slate-500">{t('powerStats.auto_mining.note')}</p>
        <p className="text-sm text-white">{formatHashrate(power.autoMining?.total)}</p>
        <ul className="space-y-2">
          {(power.autoMining?.items || []).map((p) => (
            <li key={p.id} className="flex justify-between items-center text-sm">
              <span className="font-mono text-sky-400">{formatHashrate(p.gpuHashRate)}</span>
              <ExpiryBadge expiresAt={p.expiresAt} t={t} />
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
          <CalendarCheck className="w-4 h-4" />
          {t('powerStats.checkin.title')}
        </h3>
        <p className="text-sm text-slate-300">{t('powerStats.checkin.streak', { n: power.checkin?.streak ?? 0 })}</p>
        <p className="text-xs text-slate-500">{t('powerStats.checkin.bonus_note')}</p>
        <ul className="text-xs text-slate-400 space-y-1">
          {(power.checkin?.nextHashrateMilestones || []).map((m) => (
            <li key={m.dayThreshold}>
              {t('powerStats.checkin.next_milestone', {
                days: m.dayThreshold,
                hr: m.rewardValue,
                daysValid: m.validityDays,
              })}
              {m.displayTitle ? ` — ${m.displayTitle}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl p-5">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('powerStats.other.title')}</h3>
        <p className="text-sm text-slate-500 mt-2">{t('powerStats.other.note')}</p>
      </section>
    </div>
  );
}

export default memo(BoostsDetailSectionsInner);
