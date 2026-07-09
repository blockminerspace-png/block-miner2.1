import prisma from "../../src/db/prisma.js";
import {
  REFERRAL_MINING_COMMISSION_RATE,
  REFERRAL_STATS_SINCE,
} from "../../models/referralModel.js";
import { countsForDepositTournament } from "../tournaments/depositTournamentScore.js";

export type ReferralDepositTotals = {
  depositedPol: number;
  depositedUsd: number | null;
  depositCount: number;
};

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

export type UserReferralStatsPayload = {
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

function roundPol(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function roundShib(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

function roundUsd(n: number): number {
  return Math.round(n * 100) / 100;
}

type DepositRow = {
  userId: number;
  amount: unknown;
  rawTx: string | null;
  completedAt: Date | null;
  createdAt: Date;
  confirmedEventAt: Date | null;
  usdValueAtConfirmation: unknown;
};

function depositEventAt(row: DepositRow): Date {
  return row.confirmedEventAt ?? row.completedAt ?? row.createdAt;
}

function aggregateReferralDeposits(
  rows: DepositRow[],
  since: Date,
): { byUser: Map<number, ReferralDepositTotals>; summary: ReferralDepositTotals } {
  const byUser = new Map<number, ReferralDepositTotals>();
  let totalPol = 0;
  let totalUsd = 0;
  let hasUsd = false;
  let depositCount = 0;

  for (const row of rows) {
    if (!countsForDepositTournament(row.rawTx)) continue;
    if (depositEventAt(row) < since) continue;

    const pol = Number(row.amount) || 0;
    const usdRaw = row.usdValueAtConfirmation;
    const usd = usdRaw != null && Number.isFinite(Number(usdRaw)) ? Number(usdRaw) : null;

    const prev = byUser.get(row.userId) ?? { depositedPol: 0, depositedUsd: null, depositCount: 0 };
    const nextUsd =
      usd != null
        ? roundUsd((prev.depositedUsd ?? 0) + usd)
        : prev.depositedUsd;
    byUser.set(row.userId, {
      depositedPol: roundPol(prev.depositedPol + pol),
      depositedUsd: nextUsd,
      depositCount: prev.depositCount + 1,
    });

    totalPol = roundPol(totalPol + pol);
    depositCount += 1;
    if (usd != null) {
      hasUsd = true;
      totalUsd = roundUsd(totalUsd + usd);
    }
  }

  return {
    byUser,
    summary: {
      depositedPol: totalPol,
      depositedUsd: hasUsd ? totalUsd : null,
      depositCount,
    },
  };
}

async function loadReferralDepositRows(referredUserIds: number[]): Promise<DepositRow[]> {
  if (referredUserIds.length === 0) return [];
  return prisma.transaction.findMany({
    where: {
      userId: { in: referredUserIds },
      type: "deposit",
      status: "completed",
    },
    select: {
      userId: true,
      amount: true,
      rawTx: true,
      completedAt: true,
      createdAt: true,
      confirmedEventAt: true,
      usdValueAtConfirmation: true,
    },
  });
}

export async function getUserReferralStats(userId: number): Promise<UserReferralStatsPayload> {
  const since = REFERRAL_STATS_SINCE;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, refCode: true },
  });
  if (!user) {
    throw new Error("user_not_found");
  }

  const [
    totalsAgg,
    shibAgg,
    earningsCount,
    referrals,
    referredEarnings,
    dailyRows,
    bySourceRows,
  ] = await Promise.all([
    prisma.referralEarning.aggregate({
      _sum: { amount: true },
      where: { referrerId: userId, createdAt: { gte: since } },
    }),
    prisma.referralEarning.aggregate({
      _sum: { amountShib: true },
      where: { referrerId: userId, createdAt: { gte: since } },
    }),
    prisma.referralEarning.count({
      where: { referrerId: userId, createdAt: { gte: since } },
    }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referred: {
          select: { id: true, username: true, name: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.referralEarning.groupBy({
      by: ["referredId"],
      where: { referrerId: userId, createdAt: { gte: since } },
      _sum: { amount: true, amountShib: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ day: Date; pol: number; shib: number }>>`
      SELECT date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
             COALESCE(SUM(amount), 0)::float AS pol,
             COALESCE(SUM(amount_shib), 0)::float AS shib
      FROM referral_earnings
      WHERE referrer_id = ${userId}
        AND created_at >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ source: string; pol: number; shib: number; cnt: bigint }>>`
      SELECT source,
             COALESCE(SUM(amount), 0)::float AS pol,
             COALESCE(SUM(amount_shib), 0)::float AS shib,
             COUNT(*)::bigint AS cnt
      FROM referral_earnings
      WHERE referrer_id = ${userId}
        AND created_at >= ${since}
      GROUP BY source
      ORDER BY pol DESC
    `,
  ]);

  const earningsByReferred = new Map(
    referredEarnings.map((row) => [row.referredId, row]),
  );

  const referredUserIds = referrals.map((row) => row.referredId);
  const depositRows = await loadReferralDepositRows(referredUserIds);
  const { byUser: depositsByUser, summary: depositSummary } = aggregateReferralDeposits(
    depositRows,
    since,
  );

  const referredUsers: ReferralStatsReferredRow[] = referrals.map((row) => {
    const earnings = earningsByReferred.get(row.referredId);
    const deposits = depositsByUser.get(row.referredId);
    const username = row.referred.username?.trim() || row.referred.name?.trim() || `user-${row.referred.id}`;
    return {
      userId: row.referred.id,
      username,
      joinedAt: row.referred.createdAt.toISOString(),
      referredAt: row.createdAt.toISOString(),
      earningsPol: roundPol(Number(earnings?._sum.amount ?? 0)),
      earningsShib: roundShib(Number(earnings?._sum.amountShib ?? 0)),
      transactionCount: earnings?._count._all ?? 0,
      depositedPol: deposits?.depositedPol ?? 0,
      depositedUsd: deposits?.depositedUsd ?? null,
      depositCount: deposits?.depositCount ?? 0,
    };
  });

  referredUsers.sort(
    (a, b) =>
      b.depositedPol - a.depositedPol ||
      b.earningsPol - a.earningsPol ||
      b.earningsShib - a.earningsShib ||
      b.transactionCount - a.transactionCount,
  );

  const activeInPeriod = referredUsers.filter((u) => u.transactionCount > 0).length;
  const referredJoinedSince = referrals.filter((r) => r.createdAt >= since).length;

  return {
    statsSince: since.toISOString().slice(0, 10),
    commissionRate: REFERRAL_MINING_COMMISSION_RATE,
    refCode: user.refCode,
    referralId: user.id,
    summary: {
      totalReferred: referrals.length,
      referredJoinedSince,
      activeInPeriod,
      totalEarningsPol: roundPol(Number(totalsAgg._sum.amount ?? 0)),
      totalEarningsShib: roundShib(Number(shibAgg._sum.amountShib ?? 0)),
      earningsCount,
      totalDepositedPol: depositSummary.depositedPol,
      totalDepositedUsd: depositSummary.depositedUsd,
      depositCount: depositSummary.depositCount,
    },
    referredUsers,
    daily: dailyRows.map((row) => ({
      date: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      pol: roundPol(Number(row.pol) || 0),
      shib: roundShib(Number(row.shib) || 0),
    })),
    bySource: bySourceRows.map((row) => ({
      source: row.source,
      pol: roundPol(Number(row.pol) || 0),
      shib: roundShib(Number(row.shib) || 0),
      count: Number(row.cnt) || 0,
    })),
  };
}
