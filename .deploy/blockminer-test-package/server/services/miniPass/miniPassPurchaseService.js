import { Prisma } from "../../src/db/prismaNamespace.js";
import prisma from "../../src/db/prisma.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import { PURCHASE_BUY_LEVEL, PURCHASE_COMPLETE_PASS, XP_SOURCE_PURCHASE } from "./miniPassConstants.js";
import { xpCapForSeason, xpRemainingToCap } from "./miniPassLevelMath.js";
import { isMiniPassSeasonLive } from "./miniPassSeasonLive.js";
import { applyMiniPassXp } from "./miniPassXpService.js";

function polBalanceOf(user) {
  return user?.polBalance != null ? Number(user.polBalance) : 0;
}

/**
 * Spend POL for one or more level steps of XP (bounded by season cap).
 */
export async function purchaseMiniPassLevels(userId, seasonId, quantity = 1) {
  const q = Math.min(50, Math.max(1, Math.floor(Number(quantity) || 1)));
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.id || user.isBanned) {
        const err = new Error("USER_BLOCKED");
        err.code = "FORBIDDEN";
        throw err;
      }

      const season = await tx.miniPassSeason.findFirst({
        where: { id: seasonId, deletedAt: null, isActive: true }
      });
      if (!season) {
        const err = new Error("SEASON_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (!isMiniPassSeasonLive(season, now)) {
        const err = new Error("SEASON_NOT_LIVE");
        err.code = "NOT_LIVE";
        throw err;
      }

      const priceEach = Number(new Prisma.Decimal(season.buyLevelPricePol.toString()));
      if (!Number.isFinite(priceEach) || priceEach <= 0) {
        const err = new Error("PRICE_NOT_CONFIGURED");
        err.code = "BAD_CONFIG";
        throw err;
      }

      const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
      const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));
      const cap = xpCapForSeason(maxLevel, xpPerLevel);

      await tx.userMiniPassEnrollment.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, totalXp: 0 },
        update: {}
      });

      const enr = await tx.userMiniPassEnrollment.findUnique({
        where: { userId_seasonId: { userId, seasonId } }
      });
      const currentXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
      const remaining = xpRemainingToCap(currentXp, maxLevel, xpPerLevel);
      if (remaining <= 0) {
        const err = new Error("ALREADY_MAX");
        err.code = "ALREADY_MAX";
        throw err;
      }

      const xpIntent = q * xpPerLevel;
      const xpGrant = Math.min(xpIntent, remaining);
      const levelsEffective = Math.ceil(xpGrant / xpPerLevel);
      const price = new Prisma.Decimal(String(priceEach * levelsEffective));

      if (polBalanceOf(user) < Number(price)) {
        const err = new Error("INSUFFICIENT_POL");
        err.code = "INSUFFICIENT";
        throw err;
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: price } }
      });

      const purchase = await tx.userMiniPassPurchase.create({
        data: {
          userId,
          seasonId,
          kind: PURCHASE_BUY_LEVEL,
          levelsAdded: levelsEffective,
          xpAdded: xpGrant,
          pricePaid: price,
          currency: "POL"
        }
      });

      await applyMiniPassXp({
        userId,
        seasonId,
        amount: xpGrant,
        source: XP_SOURCE_PURCHASE,
        idempotencyKey: `mini-pass-buy-level-${purchase.id}`,
        metadataJson: { purchaseId: purchase.id, quantityRequested: q },
        tx
      });

      const fresh = await tx.user.findUnique({ where: { id: userId } });
      return { purchase, polBalance: polBalanceOf(fresh) };
    });

    applyUserBalanceDelta(userId, -Number(result.purchase.pricePaid));

    await prisma.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_PURCHASE",
        detailsJson: JSON.stringify({
          seasonId,
          kind: PURCHASE_BUY_LEVEL,
          purchaseId: result.purchase.id,
          pricePaid: result.purchase.pricePaid.toString()
        })
      }
    });

    return { ok: true, purchaseId: result.purchase.id, polBalance: result.polBalance };
  } catch (e) {
    const code = e.code || e.message;
    if (code === "INSUFFICIENT" || e.message === "INSUFFICIENT_POL") {
      return { ok: false, code: "insufficient_balance", status: 400 };
    }
    if (code === "NOT_FOUND" || e.message === "SEASON_NOT_FOUND") {
      return { ok: false, code: "not_found", status: 404 };
    }
    if (code === "NOT_LIVE" || e.message === "SEASON_NOT_LIVE") {
      return { ok: false, code: "season_not_live", status: 400 };
    }
    if (code === "ALREADY_MAX" || e.message === "ALREADY_MAX") {
      return { ok: false, code: "already_max_level", status: 400 };
    }
    if (code === "BAD_CONFIG" || e.message === "PRICE_NOT_CONFIGURED") {
      return { ok: false, code: "misconfigured", status: 503 };
    }
    if (code === "FORBIDDEN" || e.message === "USER_BLOCKED") {
      return { ok: false, code: "forbidden", status: 403 };
    }
    console.error("purchaseMiniPassLevels", e);
    return { ok: false, code: "error", status: 500 };
  }
}

/**
 * Spend fixed POL to fill remaining XP up to the season cap.
 */
export async function purchaseMiniPassComplete(userId, seasonId) {
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user?.id || user.isBanned) {
        const err = new Error("USER_BLOCKED");
        err.code = "FORBIDDEN";
        throw err;
      }

      const season = await tx.miniPassSeason.findFirst({
        where: { id: seasonId, deletedAt: null, isActive: true }
      });
      if (!season) {
        const err = new Error("SEASON_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (!isMiniPassSeasonLive(season, now)) {
        const err = new Error("SEASON_NOT_LIVE");
        err.code = "NOT_LIVE";
        throw err;
      }

      const price = new Prisma.Decimal(season.completePassPricePol.toString());
      if (price.lte(0)) {
        const err = new Error("PRICE_NOT_CONFIGURED");
        err.code = "BAD_CONFIG";
        throw err;
      }

      const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
      const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));
      const cap = xpCapForSeason(maxLevel, xpPerLevel);

      await tx.userMiniPassEnrollment.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, totalXp: 0 },
        update: {}
      });

      const enr = await tx.userMiniPassEnrollment.findUnique({
        where: { userId_seasonId: { userId, seasonId } }
      });
      const currentXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
      const need = xpRemainingToCap(currentXp, maxLevel, xpPerLevel);
      if (need <= 0) {
        const err = new Error("ALREADY_MAX");
        err.code = "ALREADY_MAX";
        throw err;
      }

      if (polBalanceOf(user) < Number(price)) {
        const err = new Error("INSUFFICIENT_POL");
        err.code = "INSUFFICIENT";
        throw err;
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: price } }
      });

      const purchase = await tx.userMiniPassPurchase.create({
        data: {
          userId,
          seasonId,
          kind: PURCHASE_COMPLETE_PASS,
          levelsAdded: 0,
          xpAdded: need,
          pricePaid: price,
          currency: "POL"
        }
      });

      await applyMiniPassXp({
        userId,
        seasonId,
        amount: need,
        source: XP_SOURCE_PURCHASE,
        idempotencyKey: `mini-pass-complete-${purchase.id}`,
        metadataJson: { purchaseId: purchase.id },
        tx
      });

      const fresh = await tx.user.findUnique({ where: { id: userId } });
      return { purchase, polBalance: polBalanceOf(fresh) };
    });

    applyUserBalanceDelta(userId, -Number(result.purchase.pricePaid));

    await prisma.auditLog.create({
      data: {
        userId,
        action: "MINI_PASS_PURCHASE",
        detailsJson: JSON.stringify({
          seasonId,
          kind: PURCHASE_COMPLETE_PASS,
          purchaseId: result.purchase.id,
          pricePaid: result.purchase.pricePaid.toString()
        })
      }
    });

    return { ok: true, purchaseId: result.purchase.id, polBalance: result.polBalance };
  } catch (e) {
    const code = e.code || e.message;
    if (code === "INSUFFICIENT" || e.message === "INSUFFICIENT_POL") {
      return { ok: false, code: "insufficient_balance", status: 400 };
    }
    if (code === "NOT_FOUND" || e.message === "SEASON_NOT_FOUND") {
      return { ok: false, code: "not_found", status: 404 };
    }
    if (code === "NOT_LIVE" || e.message === "SEASON_NOT_LIVE") {
      return { ok: false, code: "season_not_live", status: 400 };
    }
    if (code === "ALREADY_MAX" || e.message === "ALREADY_MAX") {
      return { ok: false, code: "already_max_level", status: 400 };
    }
    if (code === "BAD_CONFIG" || e.message === "PRICE_NOT_CONFIGURED") {
      return { ok: false, code: "misconfigured", status: 503 };
    }
    if (code === "FORBIDDEN" || e.message === "USER_BLOCKED") {
      return { ok: false, code: "forbidden", status: 403 };
    }
    console.error("purchaseMiniPassComplete", e);
    return { ok: false, code: "error", status: 500 };
  }
}
