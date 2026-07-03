import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";

export const REWARD_PER_CLAIM = 10.0;
export const DURATION_HOURS = Number(process.env.YOUTUBE_REWARD_DURATION_HOURS || 24);
/** Rolling 24h cap: 480 claims × REWARD_PER_CLAIM (same watch-time allowance as before at 3 H/s). */
export const DAILY_LIMIT_HASH = 4800.0;
/** Minimum ytSecondsBalance required to claim (grace: 50 instead of 60 to tolerate last heartbeat in-flight). */
export const MIN_SECONDS_TO_CLAIM = 50;

export async function findActivePowers(userId: number, now: Date) {
  return prisma.youtubeWatchPower.findMany({
    where: { userId, expiresAt: { gt: now } },
  });
}

export async function getYtSecondsBalance(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { ytSecondsBalance: true },
  });
}

export async function getClaims24h(userId: number, since: Date) {
  return prisma.youtubeWatchHistory.findMany({
    where: { userId, createdAt: { gt: since } },
  });
}

export async function getAggregateStats(userId: number) {
  return prisma.youtubeWatchHistory.aggregate({
    where: { userId },
    _count: true,
    _sum: { hashRate: true },
  });
}

export async function claimRewardTx(
  tx: Prisma.TransactionClient,
  userId: number,
  videoId: string,
  now: Date,
  expiresAt: Date,
) {
  await tx.youtubeWatchPower.create({
    data: { userId, sourceVideoId: videoId, hashRate: REWARD_PER_CLAIM, claimedAt: now, expiresAt },
  });

  await tx.user.update({
    where: { id: userId },
    data: { ytSecondsBalance: { decrement: 60 } },
  });

  const hist = await tx.youtubeWatchHistory.create({
    data: {
      userId,
      sourceVideoId: videoId,
      hashRate: REWARD_PER_CLAIM,
      claimedAt: now,
      expiresAt,
      status: "granted",
    },
  });

  await tx.auditLog.create({
    data: {
      userId,
      action: "youtube_claim",
      detailsJson: JSON.stringify({ videoId, hashRate: REWARD_PER_CLAIM, expiresAt }),
    },
  });

  return hist;
}
