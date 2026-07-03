import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { notifyDailyTaskYoutubeWatch } from "../services/dailyTasks/dailyTaskHookService.js";
import type { Prisma } from "@prisma/client";
import { getBoostTtlMs } from "../services/powerBoostService.js";

const logger = loggerLib.child("YouTubeController");

const REWARD_PER_CLAIM = 10.0;
const DURATION_HOURS = Number(process.env.YOUTUBE_REWARD_DURATION_HOURS || 24);
const MAX_DAILY_CLAIM_MINUTES = 100;
const DAILY_LIMIT_HASH = REWARD_PER_CLAIM * MAX_DAILY_CLAIM_MINUTES;

type AuthedRequest = Request & { user: { id: number } };

export async function getStatus(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const now = new Date();
    const activePowers = await prisma.youtubeWatchPower.findMany({
      where: { userId, expiresAt: { gt: now } }
    });

    const activeHashRate = activePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);

    res.json({
      ok: true,
      activeHashRate,
      count: activePowers.length,
      rewardGh: REWARD_PER_CLAIM,
      durationMin: DURATION_HOURS * 60
    });
  } catch {
    res.status(500).json({ ok: false, message: "Error fetching status." });
  }
}

export async function getStats(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [claims24h, claimsAll, historyRecent] = await Promise.all([
      prisma.youtubeWatchHistory.findMany({
        where: { userId, createdAt: { gt: yesterday } }
      }),
      prisma.youtubeWatchHistory.aggregate({
        where: { userId },
        _count: true,
        _sum: { hashRate: true }
      }),
      prisma.youtubeWatchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5
      })
    ]);

    const hash24h = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);

    res.json({
      ok: true,
      claims24h: claims24h.length,
      hashGranted24h: hash24h,
      claimsTotal: claimsAll._count,
      hashGrantedTotal: Number(claimsAll._sum.hashRate || 0),
      recent: historyRecent,
      dailyLimit: DAILY_LIMIT_HASH
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("YT stats error", { error: msg });
    res.status(500).json({ ok: false, message: "Error fetching stats." });
  }
}

export async function claimReward(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user.id;
    const { videoId } = req.body as { videoId?: string };
    if (!videoId) return res.status(400).json({ ok: false, message: "Missing videoId" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { ytSecondsBalance: true }
    });

    if (!user || user.ytSecondsBalance < 60) {
      return res.status(400).json({ ok: false, message: "Tempo de visualização insuficiente verificado pelo servidor." });
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const claims24h = await prisma.youtubeWatchHistory.findMany({
      where: { userId, createdAt: { gt: yesterday } }
    });
    const currentDailyHash = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);
    const minutesUsed24h = claims24h.length;

    if (minutesUsed24h >= MAX_DAILY_CLAIM_MINUTES || currentDailyHash + REWARD_PER_CLAIM > DAILY_LIMIT_HASH) {
      return res.status(400).json({ ok: false, message: "Daily reward limit reached. Try again later!" });
    }

    const ttlMs = await getBoostTtlMs(userId);
    const expiresAt = new Date(Date.now() + ttlMs);

    const historyRow = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.youtubeWatchPower.create({
        data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM, claimedAt: now, expiresAt }
      });
      const hist = await tx.youtubeWatchHistory.create({
        data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM, claimedAt: now, expiresAt, status: "granted" }
      });
      await tx.user.update({
        where: { id: userId },
        data: { ytSecondsBalance: { decrement: 60 } }
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "youtube_claim",
          detailsJson: JSON.stringify({ videoId, hashRate: REWARD_PER_CLAIM, expiresAt })
        }
      });
      return hist;
    });

    notifyDailyTaskYoutubeWatch(userId, historyRow.id).catch(() => {});

    try {
      const newTotal = await syncUserBaseHashRate(userId);
      const engine = getMiningEngine();
      if (engine) {
        const miner = engine.findMinerByUserId(userId);
        if (miner) miner.baseHashRate = newTotal;
        if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
      }
    } catch (syncErr: unknown) {
      const m = syncErr instanceof Error ? syncErr.message : String(syncErr);
      logger.warn("YT claim: engine sync failed (non-fatal)", { error: m });
    }

    res.json({
      ok: true,
      message: `+${REWARD_PER_CLAIM} H/s ativado por ${Number(process.env.YT_POWER_DAYS || 7)} dias!`,
      rewardGh: REWARD_PER_CLAIM
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("YT claim error", { error: msg });
    res.status(500).json({ ok: false, message: "Error claiming reward." });
  }
}
