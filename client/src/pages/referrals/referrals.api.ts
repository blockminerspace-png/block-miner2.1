import { api } from '../../store/auth';

export type ReferralStatsReferredRow = {
  userId: number;
  username: string;
  joinedAt: string;
  referredAt: string;
  earningsPol: number;
  earningsShib: number;
  transactionCount: number;
  depositedPol: number;
  depositedUsd: number | null;
  depositCount: number;
};

export type ReferralStatsDailyRow = {
  date: string;
  pol: number;
  shib: number;
};

export type ReferralStatsSourceRow = {
  source: string;
  pol: number;
  shib: number;
  count: number;
};

export type ReferralStatsPayload = {
  ok: boolean;
  statsSince: string;
  commissionRate: number;
  refCode: string | null;
  referralId: number;
  summary: {
    totalReferred: number;
    referredJoinedSince: number;
    activeInPeriod: number;
    totalEarningsPol: number;
    totalEarningsShib: number;
    earningsCount: number;
    totalDepositedPol: number;
    totalDepositedUsd: number | null;
    depositCount: number;
  };
  referredUsers: ReferralStatsReferredRow[];
  daily: ReferralStatsDailyRow[];
  bySource: ReferralStatsSourceRow[];
};

export async function fetchReferralStats(): Promise<ReferralStatsPayload> {
  const res = await api.get<ReferralStatsPayload>('/user/referral-stats');
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

export function formatUsdAmount(value: number, locale?: string): string {
  const n = Number(value) || 0;
  return n.toLocaleString(locale || 'en', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

export function formatShibAmount(value: number, locale?: string): string {
  const n = Number(value) || 0;
  return n.toLocaleString(locale || 'en', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

export function buildReferralLink(referralId: number, refCode: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const ref = refCode?.trim() || String(referralId);
  return `${origin}/register?ref=${encodeURIComponent(ref)}`;
}
