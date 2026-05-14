import prisma from "../src/db/prisma.js";

/** Same basis as Landing.jsx public hashrate estimate (H/s). */
export const HS_PER_ACTIVE_RIG = 4000;
export const MIN_NETWORK_HS = 800_000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function estimateNetworkHashRateHs(activeRigs) {
  const rigs = Math.max(0, Math.floor(Number(activeRigs) || 0));
  if (rigs > 0) return Math.max(rigs * HS_PER_ACTIVE_RIG, MIN_NETWORK_HS);
  return MIN_NETWORK_HS;
}

function formatBlockListTime(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatIntervalLabel(seconds) {
  const s = Math.max(60, Math.round(Number(seconds) || 600));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return `${m} min`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export async function getPublicLiveStats() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    usersTotal,
    polUserBalances,
    depositsAll,
    withdrawalsAll,
    deposits24h,
    withdrawals24h,
    pendingWithdrawals,
    newUsers24h,
    activeMiners,
    totalTransactions,
    transactionLast24h,
    blkConfig,
    recentDistributions
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.aggregate({ _sum: { polBalance: true } }),
    prisma.transaction.aggregate({
      where: { type: "deposit", status: "completed" },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: "withdrawal", status: "completed" },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: "deposit", status: "completed", createdAt: { gte: dayAgo } },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { type: "withdrawal", status: "completed", createdAt: { gte: dayAgo } },
      _sum: { amount: true }
    }),
    Promise.all([
      prisma.transaction.count({
        where: { type: "withdrawal", status: { in: ["pending", "approved"] } }
      }),
      prisma.transaction.aggregate({
        where: { type: "withdrawal", status: { in: ["pending", "approved"] } },
        _sum: { amount: true }
      })
    ]),
    prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.userMiner.count({ where: { isActive: true } }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.blkEconomyConfig.findUnique({ where: { id: 1 } }),
    prisma.blockDistribution.findMany({
      orderBy: { blockNumber: "desc" },
      take: 5,
      select: { blockNumber: true, reward: true, totalWork: true, createdAt: true }
    })
  ]);

  const intervalSec = num(blkConfig?.blkCycleIntervalSec) || 600;
  const blkCycleReward = num(blkConfig?.blkCycleReward) || 0.03;

  let avgBlockSeconds = intervalSec;
  if (recentDistributions.length >= 2) {
    const a = recentDistributions[0].createdAt.getTime();
    const b = recentDistributions[1].createdAt.getTime();
    const diff = Math.abs(a - b) / 1000;
    if (diff >= 30 && diff <= 3600) avgBlockSeconds = diff;
  }

  const latest = recentDistributions[0];
  const polRewardDisplay = latest ? num(latest.reward) : 0.3;
  const totalWork = latest ? num(latest.totalWork) : 0;
  const networkDifficultyT = totalWork > 0 ? totalWork / 1e12 : estimateNetworkHashRateHs(activeMiners) / 1e12;

  const recentBlocks = recentDistributions.map((row) => ({
    num: row.blockNumber,
    time: formatBlockListTime(row.createdAt),
    reward: `+${num(row.reward).toFixed(2)} POL`
  }));

  const networkHashRate = estimateNetworkHashRateHs(activeMiners);

  return {
    generatedAt: new Date().toISOString(),
    usersTotal,
    newUsers24h,
    polInUserBalances: num(polUserBalances._sum.polBalance),
    polDepositedTotal: num(depositsAll._sum.amount),
    polWithdrawnTotal: num(withdrawalsAll._sum.amount),
    polDeposited24h: num(deposits24h._sum.amount),
    polWithdrawn24h: num(withdrawals24h._sum.amount),
    pendingWithdrawalsCount: pendingWithdrawals[0] ?? 0,
    pendingWithdrawalsPol: num(pendingWithdrawals[1]._sum.amount),
    activeMiners: activeMiners ?? 0,
    totalTransactions,
    transactionsLast24h: transactionLast24h,
    networkHashRate,
    networkDifficulty: networkDifficultyT,
    rewardPerBlockPol: polRewardDisplay,
    blkCycleReward,
    avgBlockSeconds,
    blockTimeLabel: formatIntervalLabel(avgBlockSeconds),
    frequencyLabel: formatIntervalLabel(intervalSec),
    rewardPolLabel: `${polRewardDisplay.toFixed(2)} POL`,
    rewardBlkLabel: `${blkCycleReward.toFixed(2)} BLK`,
    recentBlocks
  };
}
