/**
 * V1 Auto Mining — Prisma data access layer.
 * All queries live here; no business logic.
 */

import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import type { ReleasedGpuAdminRow, GpuSystemReport } from "./auto-mining.types.js";

export async function findAvailableGPUs(userId: number) {
  return prisma.autoMiningGpu.findMany({
    where: { userId, isClaimed: false, isAvailable: true },
    include: { reward: true },
  });
}

export async function findLastReleasedGPU(userId: number) {
  return prisma.autoMiningGpu.findFirst({
    where: { userId },
    orderBy: { releasedAt: "desc" },
  });
}

export async function findUserSecondsBalance(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { autoMiningSecondsBalance: true },
  });
}

export async function findActiveReward() {
  return prisma.autoMiningReward.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function findAnyReward() {
  return prisma.autoMiningReward.findFirst();
}

export async function createGPU(userId: number, rewardId: number, gpuHashRate: number, releasedAt: Date) {
  return prisma.autoMiningGpu.create({
    data: { userId, rewardId, gpuHashRate, isAvailable: true, isClaimed: false, releasedAt },
    include: { reward: true },
  });
}

export async function findGPUForClaim(gpuId: number, userId: number) {
  return prisma.autoMiningGpu.findFirst({
    where: { id: gpuId, userId, isClaimed: false },
  });
}

export async function findGPUWithReward(gpuId: number) {
  return prisma.autoMiningGpu.findUnique({
    where: { id: gpuId },
    include: { reward: true },
  });
}

export async function countClaimsLast24h(userId: number, since: Date) {
  return prisma.autoMiningGpu.count({
    where: { userId, isClaimed: true, claimedAt: { gt: since } },
  });
}

export async function sumHashRateLast24h(userId: number, since: Date) {
  return prisma.autoMiningGpu.aggregate({
    where: { userId, isClaimed: true, claimedAt: { gt: since } },
    _sum: { gpuHashRate: true },
  });
}

export async function aggregateTotalStats(userId: number) {
  return prisma.autoMiningGpu.aggregate({
    where: { userId, isClaimed: true },
    _count: true,
    _sum: { gpuHashRate: true },
  });
}

export async function claimGPUTx(
  tx: Prisma.TransactionClient,
  gpuId: number,
  claimedAt: Date,
  expiresAt: Date
) {
  return tx.autoMiningGpu.update({
    where: { id: gpuId },
    data: { isClaimed: true, claimedAt, expiresAt },
  });
}

export async function decrementSecondsBalanceTx(
  tx: Prisma.TransactionClient,
  userId: number,
  amount: number
) {
  return tx.user.update({
    where: { id: userId },
    data: { autoMiningSecondsBalance: { decrement: amount } },
  });
}

export async function createGPULogTx(
  tx: Prisma.TransactionClient,
  data: {
    userId: number;
    gpuId: number;
    rewardId: number;
    gpuHashRate: number;
    action: string;
    source: string;
    claimedAt: Date;
    expiresAt: Date;
  }
) {
  return tx.autoMiningGpuLog.create({ data });
}

export async function findGPUHistory(userId: number, limit = 20) {
  return prisma.autoMiningGpuLog.findMany({
    where: { userId },
    orderBy: { claimedAt: "desc" },
    take: limit,
    include: { reward: true },
  });
}

export async function removeExpiredGPUs(): Promise<number> {
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

// Admin queries

export async function adminFindAllRewards() {
  return prisma.autoMiningReward.findMany();
}

export async function adminFindActiveRewards() {
  return prisma.autoMiningReward.findMany({ where: { isActive: true } });
}

export async function adminFindRewardById(id: number) {
  return prisma.autoMiningReward.findUnique({ where: { id } });
}

export async function adminCreateReward(data: {
  name: string;
  slug: string;
  gpuHashRate: number;
  imageUrl: string | null;
  description?: string;
}) {
  return prisma.autoMiningReward.create({ data });
}

export async function adminUpdateReward(id: number, data: Prisma.AutoMiningRewardUpdateInput) {
  return prisma.autoMiningReward.update({ where: { id }, data });
}

export async function adminDeleteReward(id: number) {
  return prisma.autoMiningReward.delete({ where: { id } });
}

export async function adminCountRewards() {
  const [total, active] = await Promise.all([
    prisma.autoMiningReward.count(),
    prisma.autoMiningReward.count({ where: { isActive: true } }),
  ]);
  return { total, active };
}

export async function adminGetReleasedGPUs(limit = 50, offset = 0): Promise<ReleasedGpuAdminRow[]> {
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

export async function adminGetGPUReport(): Promise<GpuSystemReport> {
  const [releasedAgg, claimedAgg, pendingAgg, usersWith] = await Promise.all([
    prisma.autoMiningGpu.aggregate({ _count: true, _sum: { gpuHashRate: true } }),
    prisma.autoMiningGpu.aggregate({ where: { isClaimed: true }, _count: true, _sum: { gpuHashRate: true } }),
    prisma.autoMiningGpu.aggregate({ where: { isClaimed: false, isAvailable: true }, _count: true, _sum: { gpuHashRate: true } }),
    prisma.autoMiningGpu.groupBy({ by: ["userId"], _count: true }),
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
