import type { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import { createInventoryWithOwnedMachineTx } from "../services/userOwnedMachineService.js";

const DAILY_LIMIT = 24;
const CLAIM_DURATION_MS = 24 * 60 * 60 * 1000;
const CLAIM_COST_SECONDS = 300;

/** Active reward templates (legacy name kept for callers). */
export async function listActiveGpuRewards() {
  return prisma.autoMiningReward.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Legacy helper: grant a GPU row from a reward template (24h duration from reward metadata not in schema — use fixed window).
 */
export async function claimGpuReward(userId: number, rewardId: number) {
  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const reward = await tx.autoMiningReward.findUnique({ where: { id: rewardId } });
    if (!reward || !reward.isActive) throw new Error("Reward not found or inactive");

    return tx.autoMiningGpu.create({
      data: {
        userId,
        rewardId: reward.id,
        gpuHashRate: reward.gpuHashRate,
        isAvailable: true,
        isClaimed: false,
        releasedAt: now,
      },
    });
  });
}

export async function releaseNewGPU(userId: number, rewardId: number, _reserved: number) {
  const reward = await prisma.autoMiningReward.findFirst({
    where: { id: rewardId, isActive: true },
  });
  if (!reward) throw new Error("Reward not found");
  const now = new Date();
  return prisma.autoMiningGpu.create({
    data: {
      userId,
      rewardId: reward.id,
      gpuHashRate: reward.gpuHashRate,
      isAvailable: true,
      isClaimed: false,
      releasedAt: now,
    },
    include: { reward: true },
  });
}

export async function getAvailableGPUs(userId: number) {
  return prisma.autoMiningGpu.findMany({
    where: { userId, isClaimed: false, isAvailable: true },
    include: { reward: true },
  });
}

export async function claimGPU(gpuId: number, userId: number) {
  const now = new Date();
  const gpu = await prisma.autoMiningGpu.findFirst({
    where: { id: gpuId, userId, isClaimed: false },
  });
  if (!gpu) throw new Error("GPU not available");

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const claims24h = await prisma.autoMiningGpu.count({
    where: { userId, isClaimed: true, claimedAt: { gt: yesterday } },
  });
  if (claims24h >= DAILY_LIMIT) {
    throw new Error("Daily claim limit reached");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoMiningSecondsBalance: true },
  });
  if (!user || user.autoMiningSecondsBalance < CLAIM_COST_SECONDS) {
    throw new Error("Insufficient focused activity time");
  }

  const gpuWithReward = await prisma.autoMiningGpu.findUnique({
    where: { id: gpu.id },
    include: { reward: true },
  });

  const expiresAt = new Date(now.getTime() + CLAIM_DURATION_MS);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const u = await tx.autoMiningGpu.update({
      where: { id: gpu.id },
      data: {
        isClaimed: true,
        claimedAt: now,
        expiresAt,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { autoMiningSecondsBalance: { decrement: CLAIM_COST_SECONDS } },
    });

    const reward = gpuWithReward?.reward;
    await createInventoryWithOwnedMachineTx(tx, {
      userId,
      minerId: null,
      minerName: reward?.name || "Pulse GPU v1",
      level: 1,
      hashRate: gpu.gpuHashRate,
      slotSize: 1,
      imageUrl: reward?.imageUrl || "/machines/reward2.png",
      acquiredAt: now,
      updatedAt: now,
      expiresAt,
    });

    await tx.autoMiningGpuLog.create({
      data: {
        userId,
        gpuId: gpu.id,
        rewardId: gpu.rewardId,
        gpuHashRate: gpu.gpuHashRate,
        action: "claim",
        source: "auto_mining",
        claimedAt: now,
        expiresAt,
      },
    });

    return u;
  });
}

export async function getUserGPUHistory(userId: number, limit = 20) {
  return prisma.autoMiningGpuLog.findMany({
    where: { userId },
    orderBy: { claimedAt: "desc" },
    take: limit,
    include: { reward: true },
  });
}

export async function getUserGPUStats(userId: number) {
  const [pending, claimed] = await Promise.all([
    prisma.autoMiningGpu.aggregate({
      where: { userId, isClaimed: false, isAvailable: true },
      _count: true,
      _sum: { gpuHashRate: true },
    }),
    prisma.autoMiningGpu.aggregate({
      where: { userId, isClaimed: true },
      _count: true,
      _sum: { gpuHashRate: true },
    }),
  ]);

  const totalClaimedEver = claimed._count;

  return {
    pending_gpus: pending._count,
    pending_hash_rate: Number(pending._sum.gpuHashRate || 0),
    claimed_gpus: claimed._count,
    claimed_hash_rate: Number(claimed._sum.gpuHashRate || 0),
    total_claimed_ever: totalClaimedEver,
    total_hash_rate_earned: Number(claimed._sum.gpuHashRate || 0),
  };
}

export async function revokeGPU(gpuId: number, reason: string) {
  void reason;
  const exists = await prisma.autoMiningGpu.findUnique({ where: { id: gpuId }, select: { id: true } });
  if (!exists) return;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.autoMiningGpuLog.deleteMany({ where: { gpuId } });
    await tx.autoMiningGpu.delete({ where: { id: gpuId } });
  });
}

export async function removeExpiredGPUs() {
  const now = new Date();
  const expired = await prisma.autoMiningGpu.findMany({
    where: { isClaimed: true, expiresAt: { lt: now } },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((e) => e.id);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.autoMiningGpuLog.deleteMany({ where: { gpuId: { in: ids } } });
    await tx.autoMiningGpu.deleteMany({ where: { id: { in: ids } } });
  });
  return ids.length;
}

export type ReleasedGpuAdminRow = {
  id: number;
  username: string | null;
  name: string | null;
  gpu_hash_rate: number;
  is_available: number;
  is_claimed: number;
};

export async function getAllReleasedGPUs(limit = 50, offset = 0): Promise<ReleasedGpuAdminRow[]> {
  const rows = await prisma.autoMiningGpu.findMany({
    take: limit,
    skip: offset,
    orderBy: { releasedAt: "desc" },
    include: {
      user: { select: { username: true } },
      reward: { select: { name: true } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    username: g.user.username,
    name: g.reward?.name ?? null,
    gpu_hash_rate: g.gpuHashRate,
    is_available: g.isAvailable ? 1 : 0,
    is_claimed: g.isClaimed ? 1 : 0,
  }));
}

export type GpuSystemReport = {
  total_released: number;
  total_hash_rate_released: number;
  total_claimed: number;
  total_claimed_hash_rate: number;
  total_pending: number;
  total_pending_hash_rate: number;
  users_with_gpu: number;
};

export async function getGPUReport(): Promise<GpuSystemReport> {
  const [releasedAgg, claimedAgg, pendingAgg, usersWith] = await Promise.all([
    prisma.autoMiningGpu.aggregate({
      _count: true,
      _sum: { gpuHashRate: true },
    }),
    prisma.autoMiningGpu.aggregate({
      where: { isClaimed: true },
      _count: true,
      _sum: { gpuHashRate: true },
    }),
    prisma.autoMiningGpu.aggregate({
      where: { isClaimed: false, isAvailable: true },
      _count: true,
      _sum: { gpuHashRate: true },
    }),
    prisma.autoMiningGpu.groupBy({
      by: ["userId"],
      _count: true,
    }),
  ]);

  return {
    total_released: releasedAgg._count,
    total_hash_rate_released: Number(releasedAgg._sum.gpuHashRate || 0),
    total_claimed: claimedAgg._count,
    total_claimed_hash_rate: Number(claimedAgg._sum.gpuHashRate || 0),
    total_pending: pendingAgg._count,
    total_pending_hash_rate: Number(pendingAgg._sum.gpuHashRate || 0),
    users_with_gpu: usersWith.length,
  };
}
