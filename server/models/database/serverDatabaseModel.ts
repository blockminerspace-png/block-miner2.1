import prisma from '../../src/db/prisma.js';
import { createNotification } from '../../controllers/notificationController.js';
import { getMiningEngine } from '../../src/miningEngineInstance.js';
import { applyUserBalanceDelta } from '../../src/runtime/miningRuntime.js';

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

export async function persistBlockRewards({ blockNumber, blockReward, totalWork, minerRewards, now }) {
  const engine = getMiningEngine();
  const pendingReferralDeltas: Array<{ userId: number; delta: number }> = [];
  const pendingNotifications: Array<{ userId: number; rewardAmount: number }> = [];
  const timestamp = new Date(now);

  // Pre-fetch all referrers in ONE query (not N+1 inside the transaction).
  // The old code did `tx.user.findUnique` per miner — for 1,286 miners that's
  // ~1,286 sequential DB roundtrips, which is what pushed the transaction
  // past its 120s `timeout` and caused the Prisma pool to starve out
  // /api/auth/login (→ nginx 502 Bad Gateway).
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
      // 1) Bulk-insert the per-miner reward log rows.
      await tx.miningRewardsLog.createMany({
        data: minerRewards.map((r) => ({
          userId: r.userId,
          blockNumber,
          workAccumulated: r.workAccumulated,
          totalNetworkWork: totalWork,
          sharePercentage: r.sharePercentage,
          rewardAmount: r.rewardAmount,
          balanceAfterReward: r.balanceAfter,
          createdAt: timestamp,
        })),
      });

      // 2) Increment each miner's POL balance. UPDATEs are not (yet) batchable
      //    in Prisma without raw SQL, but they're cheap — what made the old
      //    transaction slow was the cross-pool `prisma.notification.create`
      //    awaited *inside* this loop. That second pool acquire from a
      //    transaction worker was the real deadlock vector.
      for (const r of minerRewards) {
        await tx.user.update({
          where: { id: r.userId },
          data: { polBalance: { increment: r.rewardAmount } },
        });

        // 3) Referral commission (1%) — referrer was already resolved above.
        const referredBy = referrerByMinerId.get(r.userId);
        if (referredBy && r.rewardAmount > 0) {
          const commission = r.rewardAmount * 0.01;
          await tx.user.update({
            where: { id: referredBy },
            data: { polBalance: { increment: commission } },
          });
          pendingReferralDeltas.push({ userId: referredBy, delta: commission });
        }

        if (r.rewardAmount > 0) {
          pendingNotifications.push({ userId: r.userId, rewardAmount: r.rewardAmount });
        }
      }

      // 4) Bulk-insert referral earnings.
      const referralEarningsRows = minerRewards
        .map((r) => {
          const referredBy = referrerByMinerId.get(r.userId);
          if (!referredBy || r.rewardAmount <= 0) return null;
          return {
            referrerId: referredBy,
            referredId: r.userId,
            amount: r.rewardAmount * 0.01,
            source: `mining_block_${blockNumber}`,
            createdAt: timestamp,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);
      if (referralEarningsRows.length > 0) {
        await tx.referralEarning.createMany({ data: referralEarningsRows });
      }

      // 5) Block distribution + per-block miner reward rows.
      await tx.blockDistribution.create({
        data: {
          blockNumber,
          reward: blockReward,
          minerCount: minerRewards.length,
          totalWork: totalWork,
          createdAt: timestamp,
          minerRewards: {
            create: minerRewards.map((r) => ({
              userId: r.userId,
              work: r.workAccumulated,
              percentage: r.sharePercentage,
              rewardAmount: r.rewardAmount,
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

  // After commit: sync referral commissions to the engine for live dashboards.
  for (const { userId, delta } of pendingReferralDeltas) {
    applyUserBalanceDelta(userId, delta);
  }

  // After commit: fire per-miner notifications in parallel, OUTSIDE the
  // critical transaction path. `createNotification` writes through the global
  // Prisma client; running this inside `$transaction` would acquire a second
  // pool connection per miner and starve /api/auth/login under load.
  if (pendingNotifications.length > 0) {
    const notify = pendingNotifications.map((n) =>
      createNotification({
        userId: n.userId,
        title: `Bloco #${blockNumber} Minerado`,
        message: `Você recebeu +${Number(n.rewardAmount).toFixed(6)} POL de recompensa por sua participação no bloco.`,
        type: "reward",
        io: engine?.io,
      }).catch(() => undefined),
    );
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
