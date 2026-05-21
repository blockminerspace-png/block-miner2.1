import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { notifyDailyTaskYoutubeWatch } from "../../services/dailyTasks/dailyTaskHookService.js";
import type { YoutubeClaimResult, YoutubeStatsResult, YoutubeStatusResult } from "./youtube.types.js";
import {
  DAILY_LIMIT_HASH,
  DURATION_HOURS,
  MIN_SECONDS_TO_CLAIM,
  REWARD_PER_CLAIM,
  claimRewardTx,
  findActivePowers,
  getAggregateStats,
  getClaims24h,
  getYtSecondsBalance,
} from "./youtube.repository.js";

const logger = loggerLib.child("YoutubeService");

export async function getStatusForUser(userId: number): Promise<YoutubeStatusResult> {
  const now = new Date();
  const activePowers = await findActivePowers(userId, now);
  const activeHashRate = activePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
  return {
    ok: true,
    activeHashRate,
    count: activePowers.length,
    rewardGh: REWARD_PER_CLAIM,
    durationMin: DURATION_HOURS * 60,
  };
}

export async function getStatsForUser(userId: number): Promise<YoutubeStatsResult> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [claims24h, aggregate] = await Promise.all([
    getClaims24h(userId, yesterday),
    getAggregateStats(userId),
  ]);

  const hash24h = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);

  return {
    ok: true,
    claims24h: claims24h.length,
    hashGranted24h: hash24h,
    claimsTotal: aggregate._count,
    hashGrantedTotal: Number(aggregate._sum.hashRate || 0),
    dailyLimit: DAILY_LIMIT_HASH,
  };
}

export async function claimForUser(userId: number, videoId: string): Promise<YoutubeClaimResult> {
  const user = await getYtSecondsBalance(userId);

  if (!user || user.ytSecondsBalance < MIN_SECONDS_TO_CLAIM) {
    const currentBalance = user?.ytSecondsBalance ?? 0;
    const needed = MIN_SECONDS_TO_CLAIM - currentBalance;
    // Estimate how many more heartbeats are needed (each adds 10s, sent every 10s)
    const retryAfterMs = Math.max(5000, needed * 1000 + 3000);
    return {
      ok: false,
      status: 400,
      message: "Tempo de visualização insuficiente. Aguarde alguns segundos.",
      retryAfterMs,
    };
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const claims24h = await getClaims24h(userId, yesterday);
  const currentDailyHash = claims24h.reduce((sum, c) => sum + (c.hashRate || 0), 0);

  if (currentDailyHash + REWARD_PER_CLAIM > DAILY_LIMIT_HASH) {
    return { ok: false, status: 400, message: "Limite diário atingido. Tente novamente amanhã!" };
  }

  const expiresAt = new Date(Date.now() + DURATION_HOURS * 60 * 60 * 1000);

  let historyId: number;
  try {
    const hist = await prisma.$transaction((tx) =>
      claimRewardTx(tx, userId, videoId, now, expiresAt),
    );
    historyId = hist.id;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("YT claim transaction failed", { error: msg, userId });
    return { ok: false, status: 500, message: "Erro interno ao processar recompensa." };
  }

  notifyDailyTaskYoutubeWatch(userId, historyId).catch(() => {});

  try {
    const newTotal = await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      const miner = engine.findMinerByUserId(userId);
      if (miner) miner.baseHashRate = newTotal;
      if (engine.io) engine.io.to(`user:${userId}`).emit("machines:update");
    }
  } catch (syncErr: unknown) {
    logger.warn("YT claim: engine sync failed (non-fatal)", {
      error: syncErr instanceof Error ? syncErr.message : String(syncErr),
    });
  }

  return {
    ok: true,
    rewardGh: REWARD_PER_CLAIM,
    message: `+${REWARD_PER_CLAIM} H/s ativado por ${DURATION_HOURS / 24} dia(s)!`,
  };
}
