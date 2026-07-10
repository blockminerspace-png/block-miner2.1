/**
 * Prisma-backed queries for `serverDatabaseController` (admin + public DB-backed endpoints).
 * Extracted so the controller stays thin and `serverDatabaseModel.js` stays focused on mining/chat core exports.
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";

const userPublicSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  createdAt: true,
  lastLoginAt: true,
  ip: true,
  registrationIp: true,
  isBanned: true,
  polBalance: true,
  usdcBalance: true,
  walletAddress: true,
  miningPayoutMode: true,
  referredBy: true,
  refCode: true,
  hasAdblock: true,
  isCreator: true,
  youtubeUrl: true,
  totalWithdrawn: true,
  rigsCount: true,
  oldBaseHashRate: true,
  oldLifetimeMined: true
} satisfies Prisma.UserSelect;

export async function fetchAdminUserDetails(userId: number, nowMs: number) {
  const now = new Date(nowMs);
  const [
    user,
    faucet,
    shortlink,
    inventoryCount,
    activeMachinesCount,
    checkinsCount,
    autoGpuAgg,
    ytHistoryAgg,
    ytActiveAgg,
    recentTx,
    recentPayouts
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect
    }),
    prisma.faucetClaim.findUnique({ where: { userId } }),
    prisma.shortlinkCompletion.findUnique({ where: { userId } }),
    prisma.userInventory.count({ where: { userId } }),
    prisma.userMiner.count({ where: { userId, isActive: true } }),
    prisma.dailyCheckin.count({ where: { userId } }),
    prisma.autoMiningGpuLog.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { gpuHashRate: true }
    }),
    prisma.youtubeWatchHistory.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { hashRate: true }
    }),
    prisma.youtubeWatchPower.aggregate({
      where: { userId, expiresAt: { gt: now } },
      _sum: { hashRate: true }
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        type: true,
        amount: true,
        status: true,
        txHash: true,
        createdAt: true
      }
    }),
    prisma.payout.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        amountPol: true,
        source: true,
        txHash: true,
        createdAt: true
      }
    })
  ]);

  return {
    user,
    faucet: faucet
      ? { total_claims: faucet.totalClaims, day_key: faucet.dayKey }
      : { total_claims: 0, day_key: null },
    shortlink: shortlink
      ? {
          daily_runs: shortlink.dailyRuns,
          current_step: shortlink.currentStep,
          completed_at: shortlink.completedAt ? shortlink.completedAt.getTime() : null,
          reset_at: shortlink.resetAt ? shortlink.resetAt.getTime() : null
        }
      : null,
    autoGpu: {
      claims: autoGpuAgg._count._all,
      total_hash: Number(autoGpuAgg._sum.gpuHashRate ?? 0)
    },
    inventory: { count: inventoryCount },
    activeMachines: { count: activeMachinesCount },
    checkins: { count: checkinsCount },
    youtubeWatch: {
      claims: ytHistoryAgg._count._all,
      total_hash_granted: Number(ytHistoryAgg._sum.hashRate ?? 0),
      active_hash: Number(ytActiveAgg._sum.hashRate ?? 0)
    },
    recentTx,
    recentPayouts
  };
}

export async function fetchAdminFinanceOverview(sinceMs: number) {
  const since = new Date(sinceMs);
  const [
    blockRewardSum,
    payoutsSum,
    withdrawalsSumRow,
    pendingWithdrawalsCount,
    deposits24hSum
  ] = await Promise.all([
    prisma.blockMinerReward.aggregate({ _sum: { rewardAmount: true } }),
    prisma.payout.aggregate({ _sum: { amountPol: true } }),
    prisma.user.aggregate({ _sum: { totalWithdrawn: true } }),
    prisma.transaction.count({
      where: { type: "withdrawal", status: { in: ["pending", "processing"] } }
    }),
    prisma.transaction.aggregate({
      where: { type: "deposit", status: "completed", createdAt: { gte: since } },
      _sum: { amount: true }
    })
  ]);

  return {
    pool: {
      total_pool: Number(blockRewardSum._sum.rewardAmount ?? 0),
      lifetime_mined: Number(blockRewardSum._sum.rewardAmount ?? 0)
    },
    payouts: { total_paid: Number(payoutsSum._sum.amountPol ?? 0) },
    withdrawals: { total_withdrawn: Number(withdrawalsSumRow._sum.totalWithdrawn ?? 0) },
    pendingWithdrawals: { total_pending: pendingWithdrawalsCount },
    deposits24h: { total_deposits_24h: Number(deposits24hSum._sum.amount ?? 0) }
  };
}

export type FinanceActivityInput = {
  search: string;
  txType: string;
  txStatus: string;
  txFrom: Date | null;
  txTo: Date | null;
  payoutFrom: Date | null;
  payoutTo: Date | null;
  pageSize: number;
  offset: number;
};

function buildUserSearchWhere(search: string): Prisma.UserWhereInput | undefined {
  const q = search.trim();
  if (!q) return undefined;
  const idNum = Number(q);
  const or: Prisma.UserWhereInput[] = [
    { email: { contains: q, mode: "insensitive" } },
    { username: { contains: q, mode: "insensitive" } }
  ];
  if (Number.isFinite(idNum) && idNum > 0 && Number.isInteger(idNum)) {
    or.push({ id: idNum });
  }
  return { OR: or };
}

export async function fetchAdminFinanceActivity(filters: FinanceActivityInput) {
  const userSearch = buildUserSearchWhere(filters.search);

  const txWhere: Prisma.TransactionWhereInput = {};
  if (filters.txType) txWhere.type = { equals: filters.txType, mode: "insensitive" };
  if (filters.txStatus) txWhere.status = { equals: filters.txStatus, mode: "insensitive" };
  if (filters.txFrom || filters.txTo) {
    txWhere.createdAt = {};
    if (filters.txFrom) txWhere.createdAt.gte = filters.txFrom;
    if (filters.txTo) txWhere.createdAt.lte = filters.txTo;
  }
  if (userSearch) {
    txWhere.user = { is: userSearch };
  }

  const payoutWhere: Prisma.PayoutWhereInput = {};
  if (filters.payoutFrom || filters.payoutTo) {
    payoutWhere.createdAt = {};
    if (filters.payoutFrom) payoutWhere.createdAt.gte = filters.payoutFrom;
    if (filters.payoutTo) payoutWhere.createdAt.lte = filters.payoutTo;
  }
  if (userSearch) {
    payoutWhere.user = { is: userSearch };
  }

  const [txTotalRow, payoutsTotalRow, transactions, payoutsData] = await Promise.all([
    prisma.transaction.count({ where: txWhere }),
    prisma.payout.count({ where: payoutWhere }),
    prisma.transaction.findMany({
      where: txWhere,
      orderBy: { createdAt: "desc" },
      skip: filters.offset,
      take: filters.pageSize,
      include: {
        user: { select: { id: true, email: true, username: true } }
      }
    }),
    prisma.payout.findMany({
      where: payoutWhere,
      orderBy: { createdAt: "desc" },
      skip: filters.offset,
      take: filters.pageSize,
      include: {
        user: { select: { id: true, email: true, username: true } }
      }
    })
  ]);

  return {
    txTotalRow: { total: txTotalRow },
    payoutsTotalRow: { total: payoutsTotalRow },
    transactions,
    payoutsData
  };
}

export async function fetchAdminYoutubeStats(nowMs: number, dayAgoMs: number) {
  const now = new Date(nowMs);
  const dayAgo = new Date(dayAgoMs);
  const [activeHashRow, activeUsersRow, totalsRow, dayRow] = await Promise.all([
    prisma.youtubeWatchPower.aggregate({
      where: { expiresAt: { gt: now } },
      _sum: { hashRate: true }
    }),
    prisma.youtubeWatchPower.groupBy({
      by: ["userId"],
      where: { expiresAt: { gt: now } }
    }),
    prisma.youtubeWatchHistory.aggregate({
      _count: { _all: true },
      _sum: { hashRate: true }
    }),
    prisma.youtubeWatchHistory.aggregate({
      where: { claimedAt: { gte: dayAgo } },
      _count: { _all: true },
      _sum: { hashRate: true }
    })
  ]);

  const users24h = await prisma.youtubeWatchHistory.groupBy({
    by: ["userId"],
    where: { claimedAt: { gte: dayAgo } }
  });

  return {
    activeHashRow: { total: Number(activeHashRow._sum.hashRate ?? 0) },
    activeUsersRow: { total: activeUsersRow.length },
    totalsRow: {
      claims: totalsRow._count._all,
      hash_granted: Number(totalsRow._sum.hashRate ?? 0)
    },
    dayRow: {
      claims_24h: dayRow._count._all,
      hash_granted_24h: Number(dayRow._sum.hashRate ?? 0),
      users_24h: users24h.length
    }
  };
}

export async function fetchAdminYoutubeHistory(input: {
  userId: number;
  pageSize: number;
  offset: number;
}) {
  const where: Prisma.YoutubeWatchHistoryWhereInput = {};
  if (input.userId > 0) where.userId = input.userId;

  const [totalRow, rows] = await Promise.all([
    prisma.youtubeWatchHistory.count({ where }),
    prisma.youtubeWatchHistory.findMany({
      where,
      orderBy: { claimedAt: "desc" },
      skip: input.offset,
      take: input.pageSize,
      include: { user: { select: { id: true, username: true, email: true } } }
    })
  ]);

  return { totalRow: { total: totalRow }, rows };
}

export async function getLandingStatsRows() {
  const [usersRow, payoutsRow, withdrawalsRow] = await Promise.all([
    prisma.user.count(),
    prisma.payout.aggregate({ _sum: { amountPol: true } }),
    prisma.user.aggregate({ _sum: { totalWithdrawn: true } })
  ]);
  return {
    usersRow: { total: usersRow },
    payoutsRow: { total: Number(payoutsRow._sum.amountPol ?? 0) },
    withdrawalsRow: { total: Number(withdrawalsRow._sum.totalWithdrawn ?? 0) }
  };
}

export async function listRecentPayments(limit: number) {
  const rows = await prisma.payout.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { username: true } } }
  });
  return rows.map((p) => ({
    id: p.id,
    username: p.user?.username ?? "unknown",
    amount_pol: p.amountPol,
    source: p.source,
    tx_hash: p.txHash,
    created_at: p.createdAt.getTime()
  }));
}

export async function getNetworkStatsRows() {
  const [usersRow, payoutsRow, withdrawalsRow, baseNetworkRow] = await Promise.all([
    prisma.user.count(),
    prisma.payout.aggregate({ _sum: { amountPol: true } }),
    prisma.user.aggregate({ _sum: { totalWithdrawn: true } }),
    prisma.userMiner.aggregate({
      where: { isActive: true },
      _sum: { hashRate: true }
    })
  ]);
  return {
    usersRow: { total: usersRow },
    payoutsRow: { total: Number(payoutsRow._sum.amountPol ?? 0) },
    withdrawalsRow: { total: Number(withdrawalsRow._sum.totalWithdrawn ?? 0) },
    baseNetworkRow: { total: Number(baseNetworkRow._sum.hashRate ?? 0) }
  };
}

export async function getEstimatedRewardRows(userId: number | undefined) {
  const uid = typeof userId === "number" && Number.isFinite(userId) ? userId : 0;
  const [userBaseRow, baseNetworkRow] = await Promise.all([
    uid > 0
      ? prisma.userMiner.aggregate({
          where: { userId: uid, isActive: true },
          _sum: { hashRate: true }
        })
      : Promise.resolve({ _sum: { hashRate: 0 as number | null } }),
    prisma.userMiner.aggregate({
      where: { isActive: true },
      _sum: { hashRate: true }
    })
  ]);
  return {
    userBaseRow: { total: Number(userBaseRow._sum.hashRate ?? 0) },
    baseNetworkRow: { total: Number(baseNetworkRow._sum.hashRate ?? 0) }
  };
}

export async function getYoutubeStatusRows(userId: number, nowMs: number) {
  const now = new Date(nowMs);
  const [latest, activeAgg] = await Promise.all([
    prisma.youtubeWatchHistory.findFirst({
      where: { userId },
      orderBy: { claimedAt: "desc" }
    }),
    prisma.youtubeWatchPower.aggregate({
      where: { userId, expiresAt: { gt: now } },
      _sum: { hashRate: true }
    })
  ]);
  return {
    latestClaim: latest
      ? { id: latest.id, claimed_at: latest.claimedAt.getTime() }
      : { claimed_at: 0 },
    activeRow: { total: Number(activeAgg._sum.hashRate ?? 0) }
  };
}

export async function getYoutubeUserStatsRows(userId: number, nowMs: number, dayAgoMs: number) {
  const now = new Date(nowMs);
  const dayAgo = new Date(dayAgoMs);
  const [latest, activeAgg, totalsRow, dayRow] = await Promise.all([
    prisma.youtubeWatchHistory.findFirst({
      where: { userId },
      orderBy: { claimedAt: "desc" }
    }),
    prisma.youtubeWatchPower.aggregate({
      where: { userId, expiresAt: { gt: now } },
      _sum: { hashRate: true }
    }),
    prisma.youtubeWatchHistory.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { hashRate: true }
    }),
    prisma.youtubeWatchHistory.aggregate({
      where: { userId, claimedAt: { gte: dayAgo } },
      _count: { _all: true },
      _sum: { hashRate: true }
    })
  ]);
  return {
    latestClaim: latest ? { claimed_at: latest.claimedAt.getTime() } : { claimed_at: 0 },
    activeRow: { total: Number(activeAgg._sum.hashRate ?? 0) },
    totalsRow: {
      claims: totalsRow._count._all,
      hash_granted: Number(totalsRow._sum.hashRate ?? 0)
    },
    dayRow: {
      claims_24h: dayRow._count._all,
      hash_granted_24h: Number(dayRow._sum.hashRate ?? 0),
      users_24h: dayRow._count._all > 0 ? 1 : 0
    }
  };
}

export async function getLatestYoutubeClaim(userId: number) {
  const row = await prisma.youtubeWatchHistory.findFirst({
    where: { userId },
    orderBy: { claimedAt: "desc" }
  });
  if (!row) return { id: 0, claimed_at: 0 };
  return { id: row.id, claimed_at: row.claimedAt.getTime() };
}

export async function grantYoutubeReward(input: {
  userId: number;
  rewardGh: number;
  now: number;
  expiresAt: number;
  sourceVideoId: string | null;
}) {
  const now = new Date(input.now);
  const expiresAt = new Date(input.expiresAt);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.youtubeWatchHistory.create({
      data: {
        userId: input.userId,
        hashRate: input.rewardGh,
        claimedAt: now,
        expiresAt,
        sourceVideoId: input.sourceVideoId ?? undefined,
        status: "granted"
      }
    });
    await tx.youtubeWatchPower.deleteMany({ where: { userId: input.userId } });
    await tx.youtubeWatchPower.create({
      data: {
        userId: input.userId,
        hashRate: input.rewardGh,
        claimedAt: now,
        expiresAt,
        sourceVideoId: input.sourceVideoId ?? undefined
      }
    });
  });
}
