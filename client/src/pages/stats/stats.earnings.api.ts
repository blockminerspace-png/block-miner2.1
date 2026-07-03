import { api } from '../../store/auth';

export type EarningsPeriod = '7d' | '30d' | '90d' | 'all';

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
  history?: EarningsHistoryPoint[];
  powerMeta?: {
    machineCount: number;
    activeBoosts: number;
    powerGained24h: number;
  };
};

export async function fetchEarningsStats(period: EarningsPeriod = '30d'): Promise<UserEarningsPayload> {
  const res = await api.get<UserEarningsPayload>('/stats/earnings', { params: { period } });
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
