import type { EarningsCategoryKey } from '../stats.config';
import type { EarningsHistoryPoint, EarningsTotals, UserEarningsPayload } from '../stats.earnings.api';

export type DailyEarningsDelta = { date: string; total: number; byCategory: Partial<Record<EarningsCategoryKey, number>> };

export function deriveDailyDeltas(history: EarningsHistoryPoint[]): DailyEarningsDelta[] {
  const sorted = [...(history || [])].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point, index) => {
    const prev = index > 0 ? sorted[index - 1] : null;
    const byCategory: Partial<Record<EarningsCategoryKey, number>> = {};
    const keys: EarningsCategoryKey[] = [
      'mining',
      'offerwall',
      'faucet',
      'shortlinks',
      'autoMining',
      'games',
      'youtube',
      'checkin',
      'referrals',
    ];
    for (const key of keys) {
      const cur = Number(point[key]) || 0;
      const before = prev ? Number(prev[key]) || 0 : 0;
      byCategory[key] = Math.max(0, cur - before);
    }
    const total = prev ? Math.max(0, point.total - prev.total) : point.total;
    return { date: point.date, total, byCategory };
  });
}

function utcTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function utcYesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function computeEarningsInsights(
  totals: EarningsTotals,
  history: EarningsHistoryPoint[] | undefined,
) {
  const deltas = deriveDailyDeltas(history || []);
  const todayKey = utcTodayKey();
  const yesterdayKey = utcYesterdayKey();

  const todayRow = deltas.find((d) => d.date === todayKey);
  const yesterdayRow = deltas.find((d) => d.date === yesterdayKey);

  const nonZeroDeltas = deltas.filter((d) => d.total > 0);
  const bestDay = nonZeroDeltas.reduce<DailyEarningsDelta | null>(
    (best, row) => (!best || row.total > best.total ? row : best),
    null,
  );

  const dayCount = Math.max(deltas.length, 1);
  const avgDaily = totals.total / dayCount;

  const categoryEntries: Array<{ key: EarningsCategoryKey; value: number }> = [
    { key: 'mining', value: totals.mining },
    { key: 'offerwall', value: totals.offerwall },
    { key: 'faucet', value: totals.faucet },
    { key: 'shortlinks', value: totals.shortlinks },
    { key: 'autoMining', value: totals.autoMining },
    { key: 'games', value: totals.games },
    { key: 'youtube', value: totals.youtube },
    { key: 'checkin', value: totals.checkin },
    { key: 'referrals', value: totals.referrals },
  ];
  const bestSystem = categoryEntries.reduce((a, b) => (b.value > a.value ? b : a));

  const lastCategoryCredit: Partial<Record<EarningsCategoryKey, string>> = {};
  for (const key of categoryEntries.map((c) => c.key)) {
    for (let i = deltas.length - 1; i >= 0; i -= 1) {
      const row = deltas[i]!;
      const amt = row.byCategory[key] ?? 0;
      if (amt > 0) {
        lastCategoryCredit[key] = row.date;
        break;
      }
    }
  }

  const lastEarning = [...deltas].reverse().find((d) => d.total > 0) ?? null;

  return {
    today: todayRow?.total ?? 0,
    yesterday: yesterdayRow?.total ?? 0,
    avgDaily,
    bestDay,
    lastEarning,
    bestSystem,
    lastCategoryCredit,
    deltas,
  };
}

export function percentOfTotal(value: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

export function emptyTotals(): EarningsTotals {
  return {
    total: 0,
    mining: 0,
    offerwall: 0,
    offerwallInternal: 0,
    offerwallExternal: 0,
    faucet: 0,
    shortlinks: 0,
    youtube: 0,
    games: 0,
    autoMining: 0,
    checkin: 0,
    referrals: 0,
  };
}

export function resolveTotals(earnings: UserEarningsPayload | undefined): EarningsTotals {
  if (!earnings) return emptyTotals();
  return earnings;
}
