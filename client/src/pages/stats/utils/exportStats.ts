import type { UserPowerStatsPayload } from '../stats.api';
import type { UserEarningsPayload } from '../stats.earnings.api';
import { formatUtcCsvDay } from '../../../shared/utils/utcStatsPeriod';

function formatUtcTimestamp(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob(
    [rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')],
    { type: 'text/csv;charset=utf-8;' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPowerStatsCsv(data: UserPowerStatsPayload, filenameBase: string) {
  const rows: string[][] = [['section', 'field', 'value']];
  const add = (section: string, field: string, value: unknown) => {
    rows.push([section, field, String(value ?? '')]);
  };
  add('overview', 'totalHashrate', data.overview?.totalHashrate);
  add('overview', 'permanentHashrate', data.overview?.permanentHashrate);
  add('overview', 'temporaryHashrate', data.overview?.temporaryHashrate);
  (data.machines?.items || []).forEach((m, i) => {
    add('machine', `slot_${i}`, `${m.minerName},${m.hashRate},active=${m.isActive}`);
  });
  downloadCsv(`${filenameBase}.csv`, rows);
}

export function exportEarningsCsv(earnings: UserEarningsPayload, filenameBase: string) {
  const rows: string[][] = [
    ['section', 'field', 'value', 'extra'],
    ['meta', 'generatedAtUtc', formatUtcTimestamp(earnings.generatedAtUtc), ''],
    ['meta', 'fromUtc', formatUtcTimestamp(earnings.fromUtc), ''],
    ['meta', 'toUtc', formatUtcTimestamp(earnings.toUtc), ''],
    ['meta', 'period', earnings.period ?? '', ''],
  ];
  const total = earnings.total || 1;
  const entries: Array<[string, number]> = [
    ['mining', earnings.mining],
    ['offerwall', earnings.offerwall],
    ['faucet', earnings.faucet],
    ['shortlinks', earnings.shortlinks],
    ['autoMining', earnings.autoMining],
    ['games', earnings.games],
    ['youtube', earnings.youtube],
    ['checkin', earnings.checkin],
    ['referrals', earnings.referrals],
  ];
  for (const [cat, val] of entries) {
    rows.push(['category', cat, String(val), String(Math.round((val / total) * 1000) / 10)]);
  }
  rows.push(['category', 'total', String(earnings.total), '100']);
  (earnings.history || []).forEach((h) => {
    rows.push(['history_day', formatUtcCsvDay(h.date), String(h.total), h.date]);
  });
  downloadCsv(`${filenameBase}-earnings.csv`, rows);
}
