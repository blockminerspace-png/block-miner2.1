import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";

export const REWARD_PER_CLAIM = 10.0;
export const DURATION_HOURS = Number(process.env.YOUTUBE_REWARD_DURATION_HOURS || 24);
/** Daily hash cap (resets at midnight Brasília). */
export const DAILY_LIMIT_HASH = 1000;
/** Max claims per Brazil calendar day (1 claim ≈ 1 minute watched). */
export const MAX_DAILY_CLAIM_MINUTES = Math.floor(DAILY_LIMIT_HASH / REWARD_PER_CLAIM);
/** Minimum ytSecondsBalance required to claim (grace: 50 instead of 60 to tolerate last heartbeat in-flight). */
export const MIN_SECONDS_TO_CLAIM = 50;
const SECONDS_DEBITED_PER_CLAIM = 60;

export class YoutubeClaimError extends Error {
  constructor(public readonly code: "INSUFFICIENT_BALANCE") {
    super(code);
    this.name = "YoutubeClaimError";
  }
}

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

export async function getClaimsBetween(userId: number, start: Date, end: Date) {
  return prisma.youtubeWatchHistory.findMany({
    where: { userId, createdAt: { gte: start, lt: end } },
  });
}

/** @deprecated Use getClaimsBetween with Brazil day bounds. */
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

  const debited = await tx.user.updateMany({
    where: { id: userId, ytSecondsBalance: { gte: SECONDS_DEBITED_PER_CLAIM } },
    data: { ytSecondsBalance: { decrement: SECONDS_DEBITED_PER_CLAIM } },
  });
  if (debited.count === 0) {
    throw new YoutubeClaimError("INSUFFICIENT_BALANCE");
  }

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
