import prisma from "../../src/db/prisma.js";
import type { Prisma } from "@prisma/client";
import { computePassLevel } from "./miniPassLevelMath.js";
import {
  applyPolDeltaInEngine,
  fulfillMiniPassLevelReward,
  syncMiningAfterMiniPassReward
} from "./miniPassRewardFulfillmentService.js";
import { isMiniPassSeasonLive } from "./miniPassSeasonLive.js";
import { REWARD_POL } from "./miniPassConstants.js";
import { errMsg, prismaErrCode } from "../../types/tsNarrowing.js";

export async function claimMiniPassLevelReward(userId, seasonId, levelRewardId) {
  try {
    const out = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.isBanned) {
        const err = new Error("FORBIDDEN");
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
      if (!isMiniPassSeasonLive(season, new Date())) {
        const err = new Error("SEASON_NOT_LIVE");
        err.code = "NOT_LIVE";
        throw err;
      }

      const reward = await tx.miniPassLevelReward.findFirst({
        where: { id: levelRewardId, seasonId }
      });
      if (!reward) {
        const err = new Error("REWARD_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }

      await tx.userMiniPassEnrollment.upsert({
        where: { userId_seasonId: { userId, seasonId } },
        create: { userId, seasonId, totalXp: 0 },
        update: {}
      });

      const enr = await tx.userMiniPassEnrollment.findUnique({
        where: { userId_seasonId: { userId, seasonId } }
      });
      const totalXp = Math.max(0, Math.floor(enr?.totalXp ?? 0));
      const xpPerLevel = Math.max(1, Math.floor(Number(season.xpPerLevel) || 1));
      const maxLevel = Math.max(1, Math.floor(Number(season.maxLevel) || 1));
      const userLevel = computePassLevel(totalXp, xpPerLevel, maxLevel);

      if (userLevel < reward.level) {
        const err = new Error("NOT_ELIGIBLE");
        err.code = "NOT_ELIGIBLE";
        throw err;
      }

      try {
        await tx.userMiniPassRewardClaim.create({
          data: { userId, levelRewardId: reward.id }
        });
      } catch (e: unknown) {
        if (prismaErrCode(e) === "P2002") {
          return { duplicate: true, rewardKind: String(reward.rewardKind) };
        }
        throw e;
      }

      const summary = await fulfillMiniPassLevelReward(tx, { userId, reward });

      await tx.auditLog.create({
        data: {
          userId,
          action: "MINI_PASS_CLAIM",
          detailsJson: JSON.stringify({
            seasonId,
            levelRewardId: reward.id,
            level: reward.level,
            rewardKind: reward.rewardKind
          })
        }
      });

      return { duplicate: false, summary };
    });

    if (!out.duplicate && out.summary?.kind === REWARD_POL && out.summary.amount) {
      applyPolDeltaInEngine(userId, Number(out.summary.amount));
    }
    if (!out.duplicate) {
      await syncMiningAfterMiniPassReward(userId);
    }

    return { ok: true, duplicate: Boolean(out.duplicate), summary: out.summary };
  } catch (e: unknown) {
    const msg = errMsg(e);
    if (msg === "NOT_ELIGIBLE") return { ok: false, code: "not_eligible", status: 400 };
    if (msg === "SEASON_NOT_FOUND" || msg === "REWARD_NOT_FOUND") {
      return { ok: false, code: "not_found", status: 404 };
    }
    if (msg === "SEASON_NOT_LIVE") return { ok: false, code: "season_not_live", status: 400 };
    if (msg === "FORBIDDEN") return { ok: false, code: "forbidden", status: 403 };
    console.error("claimMiniPassLevelReward", e);
    return { ok: false, code: "error", status: 500 };
  }
}
