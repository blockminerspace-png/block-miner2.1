import prisma from '../../src/db/prisma.js';
import { createNotification } from '../../controllers/notificationController.js';
import { getMiningEngine } from '../../src/miningEngineInstance.js';
import { applyUserBalanceDelta } from '../../src/runtime/miningRuntime.js';
import { REFERRAL_MINING_COMMISSION_RATE } from '../referralModel.js';

export async function markCheckinConfirmed(checkinId, now) {
  return prisma.dailyCheckin.update({
    where: { id: checkinId },
    data: {
      status: "confirmed",
      confirmedAt: new Date(now)
    }
  });
}

export async function findDailyCheckinByUserAndDate(userId, dateKey) {
  return prisma.dailyCheckin.findUnique({
    where: {
      userId_checkinDate: {
        userId,
        checkinDate: dateKey
      }
    }
  });
}

export async function findLatestDailyCheckinByUser(userId) {
  return prisma.dailyCheckin.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
}

export async function getMiningEngineStateRows() {
  const [maxBlock, totalMinted] = await Promise.all([
    prisma.miningRewardsLog.aggregate({
      _max: { blockNumber: true }
    }),
    prisma.miningRewardsLog.aggregate({
      _sum: { rewardAmount: true }
    })
  ]);

  const recentBlocks = await prisma.blockDistribution.findMany({
    orderBy: { blockNumber: 'desc' },
    take: 12,
    include: {
      minerRewards: {
        select: {
          userId: true,
          rewardAmount: true
        }
      }
    }
  });

  return {
    maxBlockRow: { max_block: maxBlock._max.blockNumber || 0 },
    totalMintedRow: { total_minted: Number(totalMinted._sum.rewardAmount || 0) },
    recentBlocks: recentBlocks.map(b => {
      const userRewards = {};
      b.minerRewards.forEach(r => {
        userRewards[r.userId] = r.rewardAmount;
      });
      
      return {
        blockNumber: b.blockNumber,
        reward: b.reward,
        minerCount: b.minerCount,
        timestamp: b.createdAt.getTime(),
        userRewards
      };
    })
  };
}

export async function persistBlockRewards({
  blockNumber,
  blockReward,
  blockRewardShib = 0,
  totalWork,
  totalWorkPol = 0,
  totalWorkShib = 0,
  minerRewards,
  now,
}: {
  blockNumber: number;
  blockReward: number;
  blockRewardShib?: number;
  totalWork: number;
  totalWorkPol?: number;
  totalWorkShib?: number;
  // MinerRewardRow shape; SHIB / split fields default to 0 to keep callers without them working.
  minerRewards: Array<{
    userId: number;
    workAccumulated: number;
    sharePercentage: number;
    rewardAmount: number;
    balanceAfter: number;
    workPol?: number;
    workShib?: number;
    shareShibPercentage?: number;
    rewardAmountShib?: number;
  }>;
  now: number;
}) {
  const engine = getMiningEngine();
  const pendingReferralDeltas: Array<{ userId: number; delta: number }> = [];
  const pendingNotifications: Array<{
    userId: number;
    rewardAmount: number;
    rewardAmountShib: number;
  }> = [];
  const timestamp = new Date(now);

  // Pre-fetch all referrers in ONE query (not N+1 inside the transaction).
  const minerUserIds = minerRewards.map((r) => r.userId);
  const referrerRows = await prisma.user.findMany({
    where: { id: { in: minerUserIds } },
    select: { id: true, referredBy: true },
  });
  const referrerByMinerId = new Map<number, number | null>();
  for (const row of referrerRows) {
    referrerByMinerId.set(row.id, row.referredBy ?? null);
  }

  await prisma.$transaction(
    async (tx) => {
      // 1) Bulk-insert the per-miner reward log rows (POL + SHIB).
      await tx.miningRewardsLog.createMany({
        data: minerRewards.map((r) => ({
          userId: r.userId,
          blockNumber,
          workAccumulated: r.workAccumulated,
          totalNetworkWork: totalWork,
          sharePercentage: r.sharePercentage,
          rewardAmount: r.rewardAmount,
          balanceAfterReward: r.balanceAfter,
          rewardAmountShib: r.rewardAmountShib ?? 0,
          shareShibPercentage: r.shareShibPercentage ?? 0,
          workPol: r.workPol ?? r.workAccumulated,
          workShib: r.workShib ?? 0,
          createdAt: timestamp,
        })),
      });

      // 2) Increment each miner's POL + SHIB balance in a single update.
      for (const r of minerRewards) {
        const polInc = r.rewardAmount;
        const shibInc = r.rewardAmountShib ?? 0;
        if (polInc > 0 || shibInc > 0) {
          await tx.user.update({
            where: { id: r.userId },
            data: {
              ...(polInc > 0 ? { polBalance: { increment: polInc } } : {}),
              ...(shibInc > 0 ? { shibBalance: { increment: shibInc } } : {}),
            },
          });
        }

        // Referral commission on each currency, paid to the referrer's matching balance.
        const referredBy = referrerByMinerId.get(r.userId);
        if (referredBy) {
          const polCommission = polInc > 0 ? polInc * REFERRAL_MINING_COMMISSION_RATE : 0;
          const shibCommission = shibInc > 0 ? shibInc * REFERRAL_MINING_COMMISSION_RATE : 0;
          if (polCommission > 0 || shibCommission > 0) {
            await tx.user.update({
              where: { id: referredBy },
              data: {
                ...(polCommission > 0 ? { polBalance: { increment: polCommission } } : {}),
                ...(shibCommission > 0 ? { shibBalance: { increment: shibCommission } } : {}),
              },
            });
            if (polCommission > 0) {
              pendingReferralDeltas.push({ userId: referredBy, delta: polCommission });
            }
          }
        }

        if (polInc > 0 || shibInc > 0) {
          pendingNotifications.push({
            userId: r.userId,
            rewardAmount: polInc,
            rewardAmountShib: shibInc,
          });
        }
      }

      // 4) Bulk-insert referral earnings (POL amount + SHIB amount on the same row).
      const referralEarningsRows = minerRewards
        .map((r) => {
          const referredBy = referrerByMinerId.get(r.userId);
          const polInc = r.rewardAmount;
          const shibInc = r.rewardAmountShib ?? 0;
          if (!referredBy || (polInc <= 0 && shibInc <= 0)) return null;
          return {
            referrerId: referredBy,
            referredId: r.userId,
            amount: polInc > 0 ? polInc * REFERRAL_MINING_COMMISSION_RATE : 0,
            amountShib: shibInc > 0 ? shibInc * REFERRAL_MINING_COMMISSION_RATE : 0,
            source: `mining_block_${blockNumber}`,
            createdAt: timestamp,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (referralEarningsRows.length > 0) {
        await tx.referralEarning.createMany({ data: referralEarningsRows });
      }

      // 5) Block distribution + per-block miner reward rows (POL + SHIB).
      await tx.blockDistribution.create({
        data: {
          blockNumber,
          reward: blockReward,
          rewardShib: blockRewardShib,
          minerCount: minerRewards.length,
          totalWork,
          totalWorkShib,
          createdAt: timestamp,
          minerRewards: {
            create: minerRewards.map((r) => ({
              userId: r.userId,
              work: r.workAccumulated,
              percentage: r.sharePercentage,
              rewardAmount: r.rewardAmount,
              rewardAmountShib: r.rewardAmountShib ?? 0,
              workPol: r.workPol ?? r.workAccumulated,
              workShib: r.workShib ?? 0,
              createdAt: timestamp,
            })),
          },
        },
      });
    },
    {
      maxWait: 15_000,
      timeout: 120_000,
    },
  );

  // After commit: sync referral POL commissions to the engine for live dashboards.
  for (const { userId, delta } of pendingReferralDeltas) {
    applyUserBalanceDelta(userId, delta);
  }

  // After commit: fire per-miner notifications in parallel, outside the transaction.
  if (pendingNotifications.length > 0) {
    const notify = pendingNotifications.map((n) => {
      const parts: string[] = [];
      if (n.rewardAmount > 0) parts.push(`+${Number(n.rewardAmount).toFixed(6)} POL`);
      if (n.rewardAmountShib > 0) parts.push(`+${Number(n.rewardAmountShib).toFixed(2)} SHIB`);
      const summary = parts.join(" & ");
      return createNotification({
        userId: n.userId,
        title: `Bloco #${blockNumber} Minerado`,
        message: `Você recebeu ${summary} de recompensa por sua participação no bloco.`,
        type: "reward",
        io: engine?.io,
      }).catch(() => undefined);
    });
    void Promise.allSettled(notify);
  }
}

export async function loadRecentBlocks(limit = 12) {
  const blocks = await prisma.blockDistribution.findMany({
    orderBy: { blockNumber: 'desc' },
    take: limit,
    include: {
      minerRewards: {
        select: {
          userId: true,
          rewardAmount: true
        }
      }
    }
  });

  const formattedBlocks = blocks.map(b => {
    const userRewards = {};
    b.minerRewards.forEach(r => {
      userRewards[r.userId] = r.rewardAmount;
    });
    return {
      blockNumber: b.blockNumber,
      reward: b.reward,
      minerCount: b.minerCount,
      timestamp: b.createdAt.getTime(),
      userRewards
    };
  });

  if (formattedBlocks.length >= limit) {
    return formattedBlocks;
  }

  // Fallback: If we have fewer than `limit` blocks in `block_distributions`, 
  // try to build history from `mining_rewards_log` for the older entries.
  const alreadyLoadedNumbers = new Set(formattedBlocks.map(b => b.blockNumber));
  const remainingCount = limit - formattedBlocks.length;

  const recentLogs = await prisma.miningRewardsLog.findMany({
    where: {
      blockNumber: { notIn: Array.from(alreadyLoadedNumbers) }
    },
    orderBy: { id: 'desc' },
    take: 5000 // Increased sample size to ensure we find enough unique blocks
  });

  const fallbackBlocksMap = new Map();

  for (const log of recentLogs) {
    if (fallbackBlocksMap.size >= remainingCount && !fallbackBlocksMap.has(log.blockNumber)) {
      continue;
    }

    if (!fallbackBlocksMap.has(log.blockNumber)) {
      fallbackBlocksMap.set(log.blockNumber, {
        blockNumber: log.blockNumber,
        reward: 0.1, // Default reward base for migrated
        minerCount: 0,
        timestamp: log.createdAt.getTime(),
        userRewards: {}
      });
    }

    const b = fallbackBlocksMap.get(log.blockNumber);
    b.userRewards[log.userId] = log.rewardAmount;
    b.minerCount += 1;
  }

  const merged = [...formattedBlocks, ...Array.from(fallbackBlocksMap.values())];
  return merged.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, limit);
}

export async function listChatMessages(limit) {
  return prisma.chatMessage.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit
  });
}

export async function insertChatMessage({ userId, username, message, createdAt }) {
  return prisma.chatMessage.create({
    data: {
      userId,
      username,
      message,
      createdAt: new Date(createdAt)
    }
  });
}

export default {
  markCheckinConfirmed,
  findDailyCheckinByUserAndDate,
  findLatestDailyCheckinByUser,
  getMiningEngineStateRows,
  persistBlockRewards,
  listChatMessages,
  insertChatMessage,
  loadRecentBlocks
};
