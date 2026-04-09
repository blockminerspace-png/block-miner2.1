/**
 * Auto Mining GPU v2 — persistence and transactional grants.
 * Server-side scheduling prevents client time manipulation for claim eligibility.
 */

import prisma from "../../src/db/prisma.js";
import {
  MINING_MODES,
  DAILY_LIMIT_HASH,
  CYCLE_SECONDS,
  computeExpiresAt,
  isClaimDue,
  canGrantDaily,
  validateImpressionForTurboClaim,
  assertValidMiningMode,
  nextClaimAfterSuccess,
  hashRateForMode,
  startOfUtcDay,
  MIN_CLICK_DELAY_MS,
  CLICK_GRACE_MS
} from "./autoMiningV2Domain.js";

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {Date} serverNow
 * @returns {Promise<number>}
 */
export async function sumDailyGrantedHash(userId, serverNow, tx = prisma) {
  const dayStart = startOfUtcDay(serverNow);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const agg = await tx.autoMiningV2PowerGrant.aggregate({
    where: {
      userId,
      earnedAt: { gte: dayStart, lt: dayEnd }
    },
    _sum: { hashRate: true }
  });
  return Number(agg._sum.hashRate || 0);
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} tx
 * @param {number} userId
 */
export async function deactivateUserSessions(userId, tx = prisma) {
  await tx.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false }
  });
}

/**
 * Starts a new session; ends any previous active session for the user.
 * @param {number} userId
 * @param {string} mode
 */
export async function startSession(userId, mode) {
  const m = assertValidMiningMode(mode);
  const now = new Date();
  const nextClaimAt = new Date(now.getTime() + CYCLE_SECONDS * 1000);

  return prisma.$transaction(async (tx) => {
    await deactivateUserSessions(userId, tx);
    return tx.autoMiningV2Session.create({
      data: {
        userId,
        mode: m,
        nextClaimAt,
        isActive: true
      }
    });
  });
}

/**
 * @param {number} userId
 */
export async function stopSession(userId) {
  return prisma.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false }
  });
}

/**
 * @param {number} userId
 */
export async function getActiveSession(userId) {
  return prisma.autoMiningV2Session.findFirst({
    where: { userId, isActive: true }
  });
}

/**
 * @param {import('@prisma/client').PrismaClient | import('@prisma/client').Prisma.TransactionClient} tx
 */
export async function pickPartnerBanner(tx = prisma) {
  const banners = await tx.dashboardBanner.findMany({
    where: {
      isActive: true,
      link: { not: null }
    },
    take: 40,
    orderBy: { createdAt: "desc" }
  });
  const withLink = banners.filter((b) => String(b.link || "").trim().length > 0);
  if (withLink.length === 0) {
    const fallbackUrl = String(process.env.AUTO_MINING_V2_FALLBACK_URL || "https://blockminer.space/").trim();
    return {
      bannerKey: "fallback",
      targetUrl: fallbackUrl,
      title: "Partner",
      imageUrl: null
    };
  }
  const b = withLink[Math.floor(Math.random() * withLink.length)];
  return {
    bannerKey: `db:${b.id}`,
    targetUrl: String(b.link).trim(),
    title: b.title || "",
    imageUrl: b.imageUrl || null
  };
}

/**
 * @param {number} userId
 */
export async function getStatusPayload(userId) {
  const now = new Date();
  const session = await getActiveSession(userId);
  const dailyUsed = await sumDailyGrantedHash(userId, now);
  const activeGrants = await prisma.autoMiningV2PowerGrant.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    take: 80
  });

  let sessionEarningsHash = 0;
  if (session) {
    const s = await prisma.autoMiningV2PowerGrant.aggregate({
      where: { userId, sessionId: session.id },
      _sum: { hashRate: true }
    });
    sessionEarningsHash = Number(s._sum.hashRate || 0);
  }

  const dayStart = startOfUtcDay(now);
  const [impToday, clickToday, recentGrants] = await Promise.all([
    prisma.autoMiningV2BannerImpression.count({
      where: { userId, createdAt: { gte: dayStart } }
    }),
    prisma.autoMiningV2BannerImpression.count({
      where: {
        userId,
        clickedAt: { not: null, gte: dayStart }
      }
    }),
    prisma.autoMiningV2PowerGrant.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      take: 25,
      select: {
        id: true,
        hashRate: true,
        mode: true,
        earnedAt: true,
        expiresAt: true,
        sessionId: true
      }
    })
  ]);

  return {
    session,
    serverNow: now.toISOString(),
    dailyUsedHash: dailyUsed,
    dailyLimitHash: DAILY_LIMIT_HASH,
    dailyRemainingHash: Math.max(0, DAILY_LIMIT_HASH - dailyUsed),
    cycleSeconds: CYCLE_SECONDS,
    activeGrants,
    sessionEarningsHash,
    bannerStatsToday: { impressions: impToday, clicks: clickToday },
    recentGrants
  };
}

/**
 * Normal mode: grant fixed H/s when the server cycle is due (anti-cheat).
 * @param {number} userId
 */
export async function claimNormal(userId) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({
      where: { userId, isActive: true }
    });
    if (!session) {
      const err = new Error("NO_SESSION");
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.NORMAL) {
      const err = new Error("WRONG_MODE");
      err.code = "WRONG_MODE";
      throw err;
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE");
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.NORMAL);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT");
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: {
        id: session.id,
        nextClaimAt: session.nextClaimAt,
        isActive: true
      },
      data: { nextClaimAt: nextAt }
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM");
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.NORMAL,
        earnedAt: now,
        expiresAt: computeExpiresAt(now)
      }
    });

    return { grant, nextClaimAt: nextAt };
  });
}

/**
 * Turbo: returns an existing open impression or creates one when the cycle is due.
 * @param {number} userId
 */
export async function getOrCreateBannerImpression(userId) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({
      where: { userId, isActive: true }
    });
    if (!session) {
      const err = new Error("NO_SESSION");
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE");
      err.code = "WRONG_MODE";
      throw err;
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE");
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const turboAmount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, turboAmount)) {
      const err = new Error("DAILY_LIMIT");
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const graceStart = new Date(now.getTime() - CLICK_GRACE_MS);
    const existing = await tx.autoMiningV2BannerImpression.findFirst({
      where: {
        userId,
        sessionId: session.id,
        grantId: null,
        createdAt: { gte: graceStart }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) {
      return { impression: existing, reused: true };
    }

    const picked = await pickPartnerBanner(tx);
    const impression = await tx.autoMiningV2BannerImpression.create({
      data: {
        userId,
        sessionId: session.id,
        bannerKey: picked.bannerKey,
        targetUrl: picked.targetUrl,
        title: picked.title,
        imageUrl: picked.imageUrl
      }
    });
    return { impression, reused: false };
  });
}

/**
 * Records a user click on the partner banner (must open target in a new tab client-side).
 * @param {number} userId
 * @param {string} impressionId
 */
export async function registerBannerClick(userId, impressionId) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const imp = await tx.autoMiningV2BannerImpression.findFirst({
      where: { id: impressionId, userId }
    });
    if (!imp) {
      const err = new Error("NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (imp.grantId != null) {
      const err = new Error("ALREADY_CLAIMED");
      err.code = "ALREADY_CLAIMED";
      throw err;
    }
    if (imp.clickedAt) {
      return imp;
    }
    if (now.getTime() - imp.createdAt.getTime() < MIN_CLICK_DELAY_MS) {
      const err = new Error("CLICK_TOO_FAST");
      err.code = "CLICK_TOO_FAST";
      throw err;
    }
    if (now.getTime() - imp.createdAt.getTime() > CLICK_GRACE_MS) {
      const err = new Error("IMPRESSION_EXPIRED");
      err.code = "IMPRESSION_EXPIRED";
      throw err;
    }

    return tx.autoMiningV2BannerImpression.update({
      where: { id: imp.id },
      data: { clickedAt: now }
    });
  });
}

/**
 * Turbo: finalize cycle after banner click validation.
 * @param {number} userId
 * @param {string} impressionId
 */
export async function claimTurbo(userId, impressionId) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({
      where: { userId, isActive: true }
    });
    if (!session) {
      const err = new Error("NO_SESSION");
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE");
      err.code = "WRONG_MODE";
      throw err;
    }

    const impression = await tx.autoMiningV2BannerImpression.findFirst({
      where: { id: impressionId, userId, sessionId: session.id }
    });
    if (!impression) {
      const err = new Error("NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }

    const v = validateImpressionForTurboClaim(impression, now);
    if (!v.ok) {
      const err = new Error(v.code);
      err.code = v.code;
      throw err;
    }

    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE");
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT");
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: {
        id: session.id,
        nextClaimAt: session.nextClaimAt,
        isActive: true
      },
      data: { nextClaimAt: nextAt }
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM");
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.TURBO,
        earnedAt: now,
        expiresAt: computeExpiresAt(now)
      }
    });

    await tx.autoMiningV2BannerImpression.update({
      where: { id: impression.id },
      data: { grantId: grant.id }
    });

    return { grant, nextClaimAt: nextAt };
  });
}

/**
 * Removes abandoned turbo impressions (no grant linked) to keep the table bounded.
 * @returns {Promise<number>}
 */
export async function cleanupStaleAutoMiningV2Impressions() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const r = await prisma.autoMiningV2BannerImpression.deleteMany({
    where: {
      grantId: null,
      createdAt: { lt: cutoff }
    }
  });
  return r.count;
}
