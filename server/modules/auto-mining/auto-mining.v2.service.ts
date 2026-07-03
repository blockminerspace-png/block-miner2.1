/**
 * Auto Mining GPU v2 — persistence and transactional grants.
 * Server-side scheduling prevents client time manipulation for claim eligibility.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import {
  resolveRewardExpiresAtForGrant,
} from "../../services/powerBoostService.js";
import { isAutoMiningV2SchemaAvailable } from "./auto-mining.db-availability.js";
import {
  MINING_MODES,
  DAILY_LIMIT_HASH,
  CYCLE_SECONDS,
  isClaimDue,
  canGrantDaily,
  validateImpressionForTurboClaim,
  assertValidMiningMode,
  nextClaimAfterSuccess,
  hashRateForMode,
  startOfUtcDay,
  CLICK_GRACE_MS,
  MIN_CLICK_DELAY_MS,
} from "./auto-mining.domain.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

async function assertV2SchemaOrThrow() {
  if (!(await isAutoMiningV2SchemaAvailable())) {
    const err = new Error("Auto Mining v2 is not available yet (database migrations may be pending).") as Error & { code: string };
    err.code = "SCHEMA_UNAVAILABLE";
    throw err;
  }
}

function degradedStatusPayload() {
  const now = new Date();
  return {
    session: null,
    schemaUnavailable: true,
    serverNow: now.toISOString(),
    dailyUsedHash: 0,
    dailyLimitHash: DAILY_LIMIT_HASH,
    dailyRemainingHash: DAILY_LIMIT_HASH,
    cycleSeconds: CYCLE_SECONDS,
    activeGrants: [],
    sessionEarningsHash: 0,
    bannerStatsToday: { impressions: 0, clicks: 0 },
    recentGrants: [],
  };
}

export async function sumDailyGrantedHash(userId: number, serverNow: Date, tx: DbClient = prisma): Promise<number> {
  const dayStart = startOfUtcDay(serverNow);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const agg = await tx.autoMiningV2PowerGrant.aggregate({
    where: { userId, earnedAt: { gte: dayStart, lt: dayEnd } },
    _sum: { hashRate: true },
  });
  return Number(agg._sum.hashRate || 0);
}

export async function deactivateUserSessions(userId: number, tx: DbClient = prisma): Promise<void> {
  await tx.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
}

export async function startSession(userId: number, mode: string) {
  await assertV2SchemaOrThrow();
  const m = assertValidMiningMode(mode);
  const now = new Date();
  const nextClaimAt = new Date(now.getTime() + CYCLE_SECONDS * 1000);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await deactivateUserSessions(userId, tx);
    return tx.autoMiningV2Session.create({
      data: { userId, mode: m, nextClaimAt, isActive: true },
    });
  });
}

export async function stopSession(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return { count: 0 };
  return prisma.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
}

export async function getActiveSession(userId: number) {
  return prisma.autoMiningV2Session.findFirst({
    where: { userId, isActive: true },
  });
}

export async function pickPartnerBanner(tx: DbClient = prisma) {
  const banners = await tx.dashboardBanner.findMany({
    where: { isActive: true, link: { not: null } },
    take: 40,
    orderBy: { createdAt: "desc" },
  });
  const withLink = banners.filter((b) => String(b.link || "").trim().length > 0);
  if (withLink.length === 0) {
    const fallbackUrl = String(process.env.AUTO_MINING_V2_FALLBACK_URL || "https://blockminer.space/").trim();
    return { bannerKey: "fallback", targetUrl: fallbackUrl, title: "Partner", imageUrl: null };
  }
  const b = withLink[Math.floor(Math.random() * withLink.length)];
  return {
    bannerKey: `db:${b.id}`,
    targetUrl: String(b.link).trim(),
    title: b.title || "",
    imageUrl: b.imageUrl || null,
  };
}

export async function getStatusPayload(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return degradedStatusPayload();

  const now = new Date();
  const session = await getActiveSession(userId);
  const dailyUsed = await sumDailyGrantedHash(userId, now);
  const activeGrants = await prisma.autoMiningV2PowerGrant.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    take: 80,
  });

  let sessionEarningsHash = 0;
  if (session) {
    const s = await prisma.autoMiningV2PowerGrant.aggregate({
      where: { userId, sessionId: session.id },
      _sum: { hashRate: true },
    });
    sessionEarningsHash = Number(s._sum.hashRate || 0);
  }

  const dayStart = startOfUtcDay(now);
  const [impToday, clickToday, recentGrants] = await Promise.all([
    prisma.autoMiningV2BannerImpression.count({ where: { userId, createdAt: { gte: dayStart } } }),
    prisma.autoMiningV2BannerImpression.count({ where: { userId, clickedAt: { not: null, gte: dayStart } } }),
    prisma.autoMiningV2PowerGrant.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      take: 25,
      select: { id: true, hashRate: true, mode: true, earnedAt: true, expiresAt: true, sessionId: true },
    }),
  ]);

  return {
    session,
    serverNow: now.toISOString(),
    dailyUsedHash: dailyUsed,
    dailyLimitHash: DAILY_LIMIT_HASH,
    dailyRemainingHash: Math.max(0, DAILY_LIMIT_HASH - dailyUsed),
    dailyLimitReached: dailyUsed >= DAILY_LIMIT_HASH,
    cycleSeconds: CYCLE_SECONDS,
    activeGrants,
    sessionEarningsHash,
    bannerStatsToday: { impressions: impToday, clicks: clickToday },
    recentGrants,
  };
}

export async function claimNormal(userId: number) {
  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.NORMAL) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.NORMAL);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: { id: session.id, nextClaimAt: session.nextClaimAt, isActive: true },
      data: { nextClaimAt: nextAt },
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM") as Error & { code: string };
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const { expiresAt } = await resolveRewardExpiresAtForGrant(tx, userId, now, "autoMining");
    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.NORMAL,
        earnedAt: now,
        expiresAt,
      },
    });

    return { grant, nextClaimAt: nextAt };
  });
}

export async function getOrCreateBannerImpression(userId: number) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const turboAmount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, turboAmount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const graceStart = new Date(now.getTime() - CLICK_GRACE_MS);
    const existing = await tx.autoMiningV2BannerImpression.findFirst({
      where: { userId, sessionId: session.id, grantId: null, createdAt: { gte: graceStart } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { impression: existing, reused: true };

    const picked = await pickPartnerBanner(tx);
    const impression = await tx.autoMiningV2BannerImpression.create({
      data: {
        userId,
        sessionId: session.id,
        bannerKey: picked.bannerKey,
        targetUrl: picked.targetUrl,
        title: picked.title,
        imageUrl: picked.imageUrl,
      },
    });
    return { impression, reused: false };
  });
}

export async function registerBannerClick(userId: number, impressionId: string) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const imp = await tx.autoMiningV2BannerImpression.findFirst({ where: { id: impressionId, userId } });
    if (!imp) {
      const err = new Error("NOT_FOUND") as Error & { code: string };
      err.code = "NOT_FOUND";
      throw err;
    }
    if (imp.grantId != null) {
      const err = new Error("ALREADY_CLAIMED") as Error & { code: string };
      err.code = "ALREADY_CLAIMED";
      throw err;
    }
    if (imp.clickedAt) return imp;
    if (now.getTime() - imp.createdAt.getTime() < MIN_CLICK_DELAY_MS) {
      const err = new Error("CLICK_TOO_FAST") as Error & { code: string };
      err.code = "CLICK_TOO_FAST";
      throw err;
    }
    if (now.getTime() - imp.createdAt.getTime() > CLICK_GRACE_MS) {
      const err = new Error("IMPRESSION_EXPIRED") as Error & { code: string };
      err.code = "IMPRESSION_EXPIRED";
      throw err;
    }

    return tx.autoMiningV2BannerImpression.update({
      where: { id: imp.id },
      data: { clickedAt: now },
    });
  });
}

export async function claimTurbo(userId: number, impressionId: string) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }

    const impression = await tx.autoMiningV2BannerImpression.findFirst({
      where: { id: impressionId, userId, sessionId: session.id },
    });
    if (!impression) {
      const err = new Error("NOT_FOUND") as Error & { code: string };
      err.code = "NOT_FOUND";
      throw err;
    }

    const v = validateImpressionForTurboClaim(impression, now);
    if (!v.ok) {
      const err = new Error(v.code) as Error & { code: string };
      err.code = v.code;
      throw err;
    }

    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: { id: session.id, nextClaimAt: session.nextClaimAt, isActive: true },
      data: { nextClaimAt: nextAt },
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM") as Error & { code: string };
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const { expiresAt } = await resolveRewardExpiresAtForGrant(tx, userId, now, "autoMining");
    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.TURBO,
        earnedAt: now,
        expiresAt,
      },
    });

    await tx.autoMiningV2BannerImpression.update({
      where: { id: impression.id },
      data: { grantId: grant.id },
    });

    return { grant, nextClaimAt: nextAt };
  });
}

export async function cleanupStaleAutoMiningV2Impressions(): Promise<number> {
  if (!(await isAutoMiningV2SchemaAvailable())) return 0;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const r = await prisma.autoMiningV2BannerImpression.deleteMany({
    where: { grantId: null, createdAt: { lt: cutoff } },
  });
  return r.count;
}
