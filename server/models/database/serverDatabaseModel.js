import prisma from '../../src/db/prisma.js';
import { createNotification } from '../../controllers/notificationController.js';
import { getMiningEngine } from '../../src/miningEngineInstance.js';

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
  
  return prisma.$transaction(async (tx) => {
    const timestamp = new Date(now);

    for (const r of minerRewards) {
      // 1. Log the reward
      await tx.miningRewardsLog.create({
        data: {
          userId: r.userId,
          blockNumber,
          workAccumulated: r.workAccumulated,
          totalNetworkWork: totalWork,
          sharePercentage: r.sharePercentage,
          rewardAmount: r.rewardAmount,
          balanceAfterReward: r.balanceAfter,
          createdAt: timestamp
        }
      });

      // 2. Update user balances (merged into User in our schema)
      await tx.user.update({
        where: { id: r.userId },
        data: {
          polBalance: r.balanceAfter,
        }
      });

      // 3. Create Notification
      if (r.rewardAmount > 0) {
        await createNotification({
          userId: r.userId,
          title: `Bloco #${blockNumber} Minerado`,
          message: `Você recebeu +${Number(r.rewardAmount).toFixed(6)} POL de recompensa por sua participação no bloco.`,
          type: "reward",
          io: engine?.io
        });
      }
    }

    // 4. Persist global Block Distribution
    await tx.blockDistribution.create({
      data: {
        blockNumber,
        reward: blockReward,
        minerCount: minerRewards.length,
        totalWork: totalWork,
        createdAt: timestamp,
        minerRewards: {
          create: minerRewards.map(r => ({
            userId: r.userId,
            work: r.workAccumulated,
            percentage: r.sharePercentage,
            rewardAmount: r.rewardAmount,
            createdAt: timestamp
          }))
        }
      }
    });

  });
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

  return blocks.map(b => {
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
