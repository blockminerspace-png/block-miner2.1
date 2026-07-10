import { api } from '../../store/auth';
import type { EarningsUiFilter } from './stats.config';
import { resolveEarningsWindow } from '../../shared/utils/utcStatsPeriod';

export type EarningsPeriod = EarningsUiFilter;

export type EarningsTotals = {
  total: number;
  mining: number;
  offerwall: number;
  offerwallInternal: number;
  offerwallExternal: number;
  faucet: number;
  shortlinks: number;
  youtube: number;
  games: number;
  autoMining: number;
  checkin: number;
  referrals: number;
};

export type EarningsHistoryPoint = EarningsTotals & { date: string };

export type UserEarningsPayload = EarningsTotals & {
  ok?: boolean;
  referralStatsSince?: string;
  period?: EarningsPeriod;
  fromUtc?: string | null;
  toUtc?: string;
  generatedAtUtc?: string;
  history?: EarningsHistoryPoint[];
  powerMeta?: {
    machineCount: number;
    activeBoosts: number;
    powerGained24h: number;
  };
};

export async function fetchEarningsStats(filter: EarningsUiFilter = '30d'): Promise<UserEarningsPayload> {
  const { fromUtc, toUtc } = resolveEarningsWindow(filter);
  const res = await api.get<UserEarningsPayload>('/stats/earnings', {
    params: {
      period: filter,
      fromUtc: fromUtc?.toISOString(),
      toUtc: toUtc.toISOString(),
    },
  });
  return res.data;
}

export function formatPolAmount(value: number, locale?: string): string {
  const n = Number(value) || 0;
  if (n >= 1000) {
    return n.toLocaleString(locale || 'en', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  if (n >= 1) return n.toLocaleString(locale || 'en', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  return n.toLocaleString(locale || 'en', { maximumFractionDigits: 6, minimumFractionDigits: 2 });
}
