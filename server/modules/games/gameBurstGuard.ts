import prisma from "../../src/db/prisma.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";

/** At most one MINIGAME_BURST_SUSPECT audit per user+game per clock minute (per Node process). */
const burstAuditDedupeUntil = new Map<string, number>();

function burstAuditDedupeKey(userId: number, gameSlug: string, now: Date): string {
  const minute = Math.floor(now.getTime() / 60_000);
  return `${userId}:${gameSlug}:${minute}`;
}

function pruneBurstAuditDedupe(nowMs: number): void {
  if (burstAuditDedupeUntil.size < 500) return;
  for (const [key, until] of burstAuditDedupeUntil) {
    if (until <= nowMs) burstAuditDedupeUntil.delete(key);
  }
}

function shouldWriteBurstAudit(userId: number, gameSlug: string, now: Date): boolean {
  const nowMs = now.getTime();
  pruneBurstAuditDedupe(nowMs);
  const key = burstAuditDedupeKey(userId, gameSlug, now);
  const until = burstAuditDedupeUntil.get(key);
  if (until != null && until > nowMs) return false;
  burstAuditDedupeUntil.set(key, nowMs + 60_000);
  return true;
}

/** Test-only: whether a burst audit would be written (mutates dedupe state like production). */
export function __testBurstAuditDedupeWouldWrite(
  userId: number,
  gameSlug: string,
  now = new Date(),
): boolean {
  return shouldWriteBurstAudit(userId, gameSlug, now);
}

/** Test-only: reset in-memory dedupe state. */
export function _resetBurstAuditDedupeForTests(): void {
  burstAuditDedupeUntil.clear();
}

export type BurstCheckResult = {
  suspicious: boolean;
  reason: string | null;
  sameSecondCount: number;
  lastMinuteCount: number;
};

/** Flags parallel-finish patterns for admin review (does not block rewards). */
export async function checkMinigameBurstPattern(
  userId: number,
  gameSlug: string,
  now = new Date(),
): Promise<BurstCheckResult> {
  const minuteAgo = new Date(now.getTime() - 60_000);
  const secondStart = new Date(Math.floor(now.getTime() / 1000) * 1000);

  const [lastMinuteCount, sameSecondCount] = await Promise.all([
    prisma.gameSessionLog.count({
      where: {
        userId,
        gameSlug,
        success: true,
        rewardGranted: true,
        createdAt: { gte: minuteAgo, lt: now },
      },
    }),
    prisma.gameSessionLog.count({
      where: {
        userId,
        gameSlug,
        success: true,
        rewardGranted: true,
        createdAt: { gte: secondStart, lt: now },
      },
    }),
  ]);

  if (sameSecondCount >= 1) {
    return {
      suspicious: true,
      reason: "same_second_finish",
      sameSecondCount,
      lastMinuteCount,
    };
  }
  if (lastMinuteCount >= 3) {
    return {
      suspicious: true,
      reason: "minute_volume_high",
      sameSecondCount,
      lastMinuteCount,
    };
  }
  return { suspicious: false, reason: null, sameSecondCount, lastMinuteCount };
}

export async function flagMinigameBurstIfNeeded(
  userId: number,
  gameSlug: string,
  meta: { ip?: string | null; userAgent?: string | null; score?: number; playTimeMs?: number },
  now = new Date(),
): Promise<BurstCheckResult> {
  const burst = await checkMinigameBurstPattern(userId, gameSlug, now);
  if (!burst.suspicious) return burst;
  if (!shouldWriteBurstAudit(userId, gameSlug, now)) return burst;

  await createAuditLogBestEffort({
    userId,
    action: "MINIGAME_BURST_SUSPECT",
    ip: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    details: {
      gameSlug,
      reason: burst.reason,
      sameSecondCount: burst.sameSecondCount,
      lastMinuteCount: burst.lastMinuteCount,
      score: meta.score ?? null,
      playTimeMs: meta.playTimeMs ?? null,
    },
  }).catch(() => {});

  return burst;
}
