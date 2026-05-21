import prisma from '../src/db/prisma.js';
import crypto from 'crypto';
import { isAutoMiningV2SchemaAvailable } from '../services/autoMiningV2/autoMiningV2DbAvailability.js';
import { lockUserRowForUpdate } from '../utils/transactionLocks.js';

export async function getOrCreateMinerProfile(user: { id: number }) {
  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      walletAddress: true,
      polBalance: true,
      miningPayoutMode: true,
      refCode: true,
      _count: {
        select: { referrals: true }
      }
    }
  });

  if (!dbUser) {
    throw new Error("User not found");
  }

  // Ensure user has a refCode
  if (!dbUser.refCode) {
    const newRefCode = crypto.randomBytes(5).toString("hex");
    dbUser = await prisma.user.update({
      where: { id: user.id },
      data: { refCode: newRefCode },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        polBalance: true,
        miningPayoutMode: true,
        refCode: true,
        _count: {
          select: { referrals: true }
        }
      }
    });
  }

  const profile = dbUser;

  // Count machines in the rack (UserMiner)
  const activeMiners = await prisma.userMiner.findMany({
    where: { userId: user.id, isActive: true }
  });

  // Count machines in the inventory (UserInventory)
  const inventoryCount = await prisma.userInventory.count({
    where: { userId: user.id }
  });

  // Count active temporary powers (Games, YouTube, Shortlink & Auto Mining)
  const now = new Date();
  const v2Ok = await isAutoMiningV2SchemaAvailable();
  const [gamePowers, ytPowers, shortlinkPowers, gpuPowers, autoMiningV2Grants] = await Promise.all([
    prisma.userPowerGame.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.youtubeWatchPower.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.shortlinkPower.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.autoMiningGpu.findMany({
      where: { userId: user.id, isClaimed: true, expiresAt: { gt: now } }
    }),
    v2Ok
      ? prisma.autoMiningV2PowerGrant.findMany({
          where: { userId: user.id, expiresAt: { gt: now } },
          select: { hashRate: true }
        })
      : Promise.resolve([])
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // We only count permanent machines. Pulse GPUs are counted separately below.
    return sum + (m.hashRate || 0);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + (g.hashRate || 0), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + (y.hashRate || 0), 0);
  const shortlinkHashRate = shortlinkPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
  const legacyGpuHashRate = gpuPowers.reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);
  const v2GpuHashRate = autoMiningV2Grants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);
  const gpuHashRate = legacyGpuHashRate + v2GpuHashRate;

  const totalHashRate = machineHashRate + gameHashRate + ytHashRate + shortlinkHashRate + gpuHashRate;

  return {
    ...profile,
    walletAddress: profile.walletAddress ?? null,
    rigs: activeMiners.length, // Number of active machines in rack
    inventoryCount: inventoryCount, // Number of machines waiting to be installed
    base_hash_rate: totalHashRate,
    machine_hash_rate: machineHashRate,
    game_hash_rate: gameHashRate,
    youtube_hash_rate: ytHashRate,
    auto_mining_hash_rate: gpuHashRate,
    balance: Number(profile.polBalance || 0),
    lifetime_mined: 0, // Can be calculated from logs if needed
    refCode: profile.refCode,
    referralCount: profile._count.referrals,
    mining_payout_mode: profile.miningPayoutMode === "blk" ? "blk" : "pol"
  };
}

export async function persistMinerProfile(miner: {
  userId: number;
  balance: number;
  lastPersistedBalance?: number;
}) {
  if (!miner?.userId) return;

  /**
   * Serialize balance persistence per user with a row lock, then recompute the delta inside
   * the transaction so concurrent persist calls cannot double-apply the same in-memory delta.
   * Deposits and other services that increment `pol_balance` directly remain safe because we
   * only ever apply the engine delta as an atomic increment/decrement.
   */
  await prisma.$transaction(async (tx) => {
    await lockUserRowForUpdate(tx, miner.userId);
    const delta = miner.balance - (miner.lastPersistedBalance ?? miner.balance);
    if (Math.abs(delta) < 0.0000001) return;
    await tx.user.update({
      where: { id: miner.userId },
      data: {
        polBalance: delta > 0 ? { increment: delta } : { decrement: -delta },
      },
    });
    miner.lastPersistedBalance = miner.balance;
  });
}

export async function syncUserBaseHashRate(userId) {
  const now = new Date();
  const v2Ok = await isAutoMiningV2SchemaAvailable();
  const [activeMiners, gamePowers, ytPowers, shortlinkPowers, gpuPowers, autoMiningV2Grants] = await Promise.all([
    prisma.userMiner.findMany({ where: { userId, isActive: true } }),
    prisma.userPowerGame.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.youtubeWatchPower.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.shortlinkPower.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.autoMiningGpu.findMany({ where: { userId, isClaimed: true, expiresAt: { gt: now } } }),
    v2Ok
      ? prisma.autoMiningV2PowerGrant.findMany({
          where: { userId, expiresAt: { gt: now } },
          select: { hashRate: true }
        })
      : Promise.resolve([])
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // If we ever allow Pulse GPU to be installed in rack, we must not count its hashRate here
    // because it's already counted in gpuHashRate via autoMiningGpu table
    return sum + (m.hashRate || 0);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + (g.hashRate || 0), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + (y.hashRate || 0), 0);
  const shortlinkHashRate = shortlinkPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
  const legacyGpuHashRate = gpuPowers.reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);
  const v2GpuHashRate = autoMiningV2Grants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);
  const gpuHashRate = legacyGpuHashRate + v2GpuHashRate;

  return machineHashRate + gameHashRate + ytHashRate + shortlinkHashRate + gpuHashRate;
}
