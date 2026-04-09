import prisma from '../src/db/prisma.js';
import crypto from 'crypto';

export async function getOrCreateMinerProfile(user) {
  let dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      polBalance: true,
      miningPayoutMode: true,
      refCode: true,
      _count: {
        select: { referrals: true }
      }
    }
  });

  // Ensure user has a refCode
  if (!dbUser.refCode) {
    const newRefCode = crypto.randomBytes(5).toString("hex");
    dbUser = await prisma.user.update({
      where: { id: user.id },
      data: { refCode: newRefCode },
      select: {
        id: true,
        username: true,
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

  // Count active temporary powers (Games, YouTube & Auto Mining)
  const now = new Date();
  const [gamePowers, ytPowers, gpuPowers, autoMiningV2Grants] = await Promise.all([
    prisma.userPowerGame.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.youtubeWatchPower.findMany({
      where: { userId: user.id, expiresAt: { gt: now } }
    }),
    prisma.autoMiningGpu.findMany({
      where: { userId: user.id, isClaimed: true, expiresAt: { gt: now } }
    }),
    prisma.autoMiningV2PowerGrant.findMany({
      where: { userId: user.id, expiresAt: { gt: now } },
      select: { hashRate: true }
    })
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // We only count permanent machines. Pulse GPUs are counted separately below.
    return sum + (m.hashRate || 0);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + (g.hashRate || 0), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + (y.hashRate || 0), 0);
  const legacyGpuHashRate = gpuPowers.reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);
  const v2GpuHashRate = autoMiningV2Grants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);
  const gpuHashRate = legacyGpuHashRate + v2GpuHashRate;

  const totalHashRate = machineHashRate + gameHashRate + ytHashRate + gpuHashRate;

  return {
    ...profile,
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

export async function persistMinerProfile(miner) {
  if (!miner?.userId) return;

  // Usa delta para n\u00e3o sobrescrever saldo creditado diretamente no banco
  // (dep\u00f3sitos, tickets, offerwall que s\u00f3 atualizam o DB sem passar pelo engine)
  const delta = miner.balance - (miner.lastPersistedBalance ?? miner.balance);
  if (Math.abs(delta) < 0.0000001) return; // nada a persistir

  await prisma.user.update({
    where: { id: miner.userId },
    data: {
      polBalance: delta > 0 ? { increment: delta } : { decrement: -delta }
    }
  });

  miner.lastPersistedBalance = miner.balance;
}

export async function syncUserBaseHashRate(userId) {
  const now = new Date();
  const [activeMiners, gamePowers, ytPowers, gpuPowers, autoMiningV2Grants] = await Promise.all([
    prisma.userMiner.findMany({ where: { userId, isActive: true } }),
    prisma.userPowerGame.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.youtubeWatchPower.findMany({ where: { userId, expiresAt: { gt: now } } }),
    prisma.autoMiningGpu.findMany({ where: { userId, isClaimed: true, expiresAt: { gt: now } } }),
    prisma.autoMiningV2PowerGrant.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: { hashRate: true }
    })
  ]);

  const machineHashRate = activeMiners.reduce((sum, m) => {
    // If we ever allow Pulse GPU to be installed in rack, we must not count its hashRate here
    // because it's already counted in gpuHashRate via autoMiningGpu table
    return sum + (m.hashRate || 0);
  }, 0);
  const gameHashRate = gamePowers.reduce((sum, g) => sum + (g.hashRate || 0), 0);
  const ytHashRate = ytPowers.reduce((sum, y) => sum + (y.hashRate || 0), 0);
  const legacyGpuHashRate = gpuPowers.reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);
  const v2GpuHashRate = autoMiningV2Grants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);
  const gpuHashRate = legacyGpuHashRate + v2GpuHashRate;

  return machineHashRate + gameHashRate + ytHashRate + gpuHashRate;
}
