import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { formatHashrate } from '../../../shared/utils/machine';
import type { ExpiryRow } from './ExpiryProgressList';

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

function progressPercent(playedAt: string | null | undefined, expiresAt: string | null | undefined): number {
  if (!playedAt || !expiresAt) return 0;
  const start = new Date(playedAt).getTime();
  const end = new Date(expiresAt).getTime();
  const now = Date.now();
  const total = end - start;
  if (total <= 0) return 0;
  const elapsed = Math.min(Math.max(now - start, 0), total);
  return Math.round((elapsed / total) * 100);
}

type Props = {
  rows: ExpiryRow[];
};

function BoostsTableInner({ rows }: Props) {
  const { t } = useTranslation();
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt))),
    [rows],
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-600">{t('powerStats.no_active_temporary')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-sm text-left min-w-[720px]">
        <thead className="text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
          <tr>
            <th className="p-3">{t('powerStats.dashboard.col_source')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_name')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_power')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_expires')}</th>
            <th className="p-3 min-w-[140px]">{t('powerStats.dashboard.col_progress')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {sorted.map((row, idx) => {
            const end = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
            const left = end - Date.now();
            const expired = left <= 0;
            const pct = progressPercent(row.playedAt, row.expiresAt);
            return (
              <tr key={`${row.source}-${row.slug}-${idx}`} className="hover:bg-slate-800/20">
                <td className="p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-md">
                    {row.source}
                  </span>
                </td>
                <td className="p-3 font-medium text-white">{row.name}</td>
                <td className="p-3 font-mono text-sky-400">{formatHashrate(row.hashRate)}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                      expired
                        ? 'text-red-400 bg-red-500/10 border-red-500/20'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    <Timer className="w-3 h-3" />
                    {expired ? t('powerStats.expired') : formatDurationMs(left)}
                  </span>
                </td>
                <td className="p-3">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${expired ? 'bg-red-500/60' : 'bg-gradient-to-r from-amber-500 to-orange-400'}`}
                      style={{ width: `${expired ? 100 : pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(BoostsTableInner);
