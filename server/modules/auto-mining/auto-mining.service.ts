/**
 * V1 Auto Mining — business logic layer.
 */

import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { getBoostTtlMs } from "../../services/powerBoostService.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import { V1_DAILY_LIMIT, V1_CLAIM_COST_SECONDS } from "./auto-mining.config.js";
import * as repo from "./auto-mining.repository.js";

const logger = loggerLib.child("AutoMiningService");

const GPU_AUTO_RELEASE_INTERVAL_MS = 5 * 60 * 1000;

export async function getAvailableGPUs(userId: number) {
  let gpus = await repo.findAvailableGPUs(userId);

  if (gpus.length === 0) {
    const lastGpu = await repo.findLastReleasedGPU(userId);
    const now = new Date();
    const nextReleaseAt = lastGpu
      ? new Date(lastGpu.releasedAt.getTime() + GPU_AUTO_RELEASE_INTERVAL_MS)
      : now;

    if (now >= nextReleaseAt) {
      const user = await repo.findUserSecondsBalance(userId);
      if (user && user.autoMiningSecondsBalance >= V1_CLAIM_COST_SECONDS) {
        const reward = await repo.findActiveReward();
        if (reward) {
          const newGpu = await repo.createGPU(userId, reward.id, reward.gpuHashRate, now);
          gpus = [newGpu];
        }
      }
    }
  }

  return gpus;
}

export async function claimGPU(
  userId: number,
  gpuId: number
): Promise<{ gpu: Awaited<ReturnType<typeof repo.claimGPUTx>>; expiresAt: Date }> {
  const now = new Date();
  const gpu = await repo.findGPUForClaim(gpuId, userId);
  if (!gpu) {
    const err = new Error("GPU not available") as Error & { code: string };
    err.code = "GPU_NOT_FOUND";
    throw err;
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const claims24h = await repo.countClaimsLast24h(userId, yesterday);
  if (claims24h >= V1_DAILY_LIMIT) {
    const err = new Error("Limite diário de resgates alcançado. Volte mais tarde!") as Error & { code: string };
    err.code = "DAILY_LIMIT_REACHED";
    throw err;
  }

  const user = await repo.findUserSecondsBalance(userId);
  if (!user || user.autoMiningSecondsBalance < V1_CLAIM_COST_SECONDS) {
    const err = new Error("Tempo de atividade focado insuficiente.") as Error & { code: string };
    err.code = "INSUFFICIENT_SECONDS";
    throw err;
  }

  const gpuWithReward = await repo.findGPUWithReward(gpu.id);
  const durationMs = await getBoostTtlMs(userId);
  const expiresAt = new Date(now.getTime() + durationMs);

  const updatedGpu = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const u = await repo.claimGPUTx(tx, gpu.id, now, expiresAt);
    await repo.decrementSecondsBalanceTx(tx, userId, V1_CLAIM_COST_SECONDS);

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

    await repo.createGPULogTx(tx, {
      userId,
      gpuId: gpu.id,
      rewardId: gpu.rewardId,
      gpuHashRate: gpu.gpuHashRate,
      action: "claim",
      source: "auto_mining",
      claimedAt: now,
      expiresAt,
    });

    return u;
  });

  return { gpu: updatedGpu, expiresAt };
}

export async function getGPUHistory(userId: number) {
  return repo.findGPUHistory(userId, 20);
}

export async function getActiveRewardWithStats(userId: number) {
  const reward = await repo.findActiveReward();

  if (!reward) {
    const anyReward = await repo.findAnyReward();
    if (anyReward) {
      logger.info(`Found reward (ID: ${anyReward.id}) but isActive is ${anyReward.isActive}`);
    } else {
      logger.error("DATABASE IS EMPTY! auto_mining_rewards table has 0 rows.");
    }
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [claims24h, hash24hAggr, totalStats] = await Promise.all([
    repo.countClaimsLast24h(userId, yesterday),
    repo.sumHashRateLast24h(userId, yesterday),
    repo.aggregateTotalStats(userId),
  ]);

  return {
    reward,
    stats: {
      claims24h,
      hash24h: Number(hash24hAggr._sum.gpuHashRate || 0),
      claimsTotal: totalStats._count,
      hashTotal: Number(totalStats._sum.gpuHashRate || 0),
      dailyLimit: V1_DAILY_LIMIT,
    },
  };
}
