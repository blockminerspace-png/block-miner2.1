import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createInventoryWithOwnedMachineTx } from "../services/userOwnedMachineService.js";

const logger = loggerLib.child("AutoMiningGpuController");

const DAILY_LIMIT = 24;

type AuthedRequest = Request & { user: { id: number } };

export async function getAvailableGPUsHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;

    let availableGpus = await prisma.autoMiningGpu.findMany({
      where: { userId, isClaimed: false, isAvailable: true },
      include: { reward: true }
    });

    if (availableGpus.length === 0) {
      const lastGpu = await prisma.autoMiningGpu.findFirst({
        where: { userId },
        orderBy: { releasedAt: "desc" }
      });

      const now = new Date();
      const nextReleaseAt = lastGpu ? new Date(lastGpu.releasedAt.getTime() + 5 * 60 * 1000) : now;

      if (now >= nextReleaseAt) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { autoMiningSecondsBalance: true }
        });

        if (user && user.autoMiningSecondsBalance >= 300) {
          const reward = await prisma.autoMiningReward.findFirst({ where: { isActive: true } });
          if (reward) {
            const newGpu = await prisma.autoMiningGpu.create({
              data: {
                userId,
                rewardId: reward.id,
                gpuHashRate: reward.gpuHashRate,
                isAvailable: true,
                isClaimed: false,
                releasedAt: now
              },
              include: { reward: true }
            });
            availableGpus = [newGpu];
          }
        }
      }
    }

    res.json({ success: true, data: availableGpus, count: availableGpus.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to get available GPUs", { error: msg });
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function claimGPUHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const { gpu_id } = req.body as { gpu_id?: unknown };
    const now = new Date();

    if (!gpu_id) return res.status(400).json({ success: false, error: "GPU ID is required" });

    const gpu = await prisma.autoMiningGpu.findFirst({
      where: { id: Number(gpu_id), userId, isClaimed: false }
    });

    if (!gpu) return res.status(404).json({ success: false, error: "GPU not available" });

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const claims24h = await prisma.autoMiningGpu.count({
      where: { userId, isClaimed: true, claimedAt: { gt: yesterday } }
    });

    if (claims24h >= DAILY_LIMIT) {
      return res.status(400).json({ success: false, error: "Limite diário de resgates alcançado. Volte mais tarde!" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { autoMiningSecondsBalance: true }
    });

    if (!user || user.autoMiningSecondsBalance < 300) {
      return res.status(400).json({ success: false, error: "Tempo de atividade focado insuficiente." });
    }

    const durationMs = 24 * 60 * 60 * 1000;
    const expiresAt = new Date(now.getTime() + durationMs);

    const gpuWithReward = await prisma.autoMiningGpu.findUnique({
      where: { id: gpu.id },
      include: { reward: true }
    });

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.autoMiningGpu.update({
        where: { id: gpu.id },
        data: {
          isClaimed: true,
          claimedAt: now,
          expiresAt
        }
      });

      await tx.user.update({
        where: { id: userId },
        data: { autoMiningSecondsBalance: { decrement: 300 } }
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
        expiresAt
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
          expiresAt
        }
      });

      return u;
    });

    const newTotal = await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(userId);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
    }

    res.json({ success: true, message: "GPU claimed successfully", data: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Failed to claim GPU", { error: msg });
    res.status(400).json({ success: false, error: "Unable to claim GPU" });
  }
}

export async function getGPUHistoryHandler(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const history = await prisma.autoMiningGpuLog.findMany({
      where: { userId },
      orderBy: { claimedAt: "desc" },
      take: 20,
      include: { reward: true }
    });
    res.json({ success: true, data: history });
  } catch {
    res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function getActiveRewardHandler(req: Request, res: Response) {
  try {
    const reward = await prisma.autoMiningReward.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" }
    });

    if (!reward) {
      logger.warn("Iron Dome: No active AutoMiningReward found in database. Checking for any reward...");
      const anyReward = await prisma.autoMiningReward.findFirst();
      if (anyReward) {
        logger.info(`Iron Dome: Found a reward (ID: ${anyReward.id}) but isActive is ${anyReward.isActive}`);
      } else {
        logger.error("Iron Dome: DATABASE IS EMPTY! auto_mining_rewards table has 0 rows.");
      }
    }

    const userId = (req as AuthedRequest).user.id;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const claims24h = await prisma.autoMiningGpu.count({
      where: { userId, isClaimed: true, claimedAt: { gt: yesterday } }
    });

    const hash24hAggr = await prisma.autoMiningGpu.aggregate({
      where: { userId, isClaimed: true, claimedAt: { gt: yesterday } },
      _sum: { gpuHashRate: true }
    });

    const totalStats = await prisma.autoMiningGpu.aggregate({
      where: { userId, isClaimed: true },
      _count: true,
      _sum: { gpuHashRate: true }
    });

    res.json({
      success: true,
      data: reward,
      stats: {
        claims24h,
        hash24h: Number(hash24hAggr._sum.gpuHashRate || 0),
        claimsTotal: totalStats._count,
        hashTotal: Number(totalStats._sum.gpuHashRate || 0),
        dailyLimit: DAILY_LIMIT
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error("Iron Dome: Error in getActiveRewardHandler", { error: msg, stack });
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
