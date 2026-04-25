import prisma from "../../src/db/prisma.js";
import { SIDEBAR_ITEM_REGISTRY } from "../sidebarNavRegistry.js";
import { getVisibleSidebarPaths } from "../sidebarNavService.js";
import { REWARD_POL } from "../miniPass/miniPassConstants.js";
import {
  applyPolDeltaInEngine,
  fulfillMiniPassLevelReward,
  syncMiningAfterMiniPassReward
} from "../miniPass/miniPassRewardFulfillmentService.js";
import { TASK_LOGIN_DAY } from "./dailyTaskConstants.js";
import { getDailyTaskPeriodKey, normalizeDailyTaskResetCadence } from "./dailyTaskPeriod.js";

const CHECKIN_APP_PATH = SIDEBAR_ITEM_REGISTRY.checkin.path;

/**
 * Maps a daily task definition row to the reward shape expected by `fulfillMiniPassLevelReward`.
 * @param {import("@prisma/client").DailyTaskDefinition} def
 */
function rewardPayloadFromDefinition(def) {
  return {
    rewardKind: def.rewardKind,
    minerId: def.rewardMinerId,
    eventMinerId: def.rewardEventMinerId,
    hashRate: def.rewardHashRate,
    hashRateDays: def.rewardHashRateDays,
    blkAmount: def.rewardBlkAmount,
    polAmount: def.rewardPolAmount
  };
}

/**
 * @param {number} userId
 * @param {number} taskDefinitionId
 */
export async function claimDailyTaskReward(userId, taskDefinitionId) {
  try {
    const visiblePaths = await getVisibleSidebarPaths();
    const checkinEnabled = visiblePaths.has(CHECKIN_APP_PATH);
    const out = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.isBanned) {
        const err = new Error("FORBIDDEN");
        err.code = "FORBIDDEN";
        throw err;
      }

      const def = await tx.dailyTaskDefinition.findFirst({
        where: { id: taskDefinitionId, isActive: true }
      });
      if (!def) {
        const err = new Error("TASK_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }
      if (def.taskType === TASK_LOGIN_DAY && !checkinEnabled) {
        const err = new Error("TASK_NOT_FOUND");
        err.code = "NOT_FOUND";
        throw err;
      }
      const cadence = normalizeDailyTaskResetCadence(def.resetCadence);
      const periodKey = getDailyTaskPeriodKey(new Date(), cadence);

      const progress = await tx.userDailyTaskProgress.findUnique({
        where: {
          userId_taskDefinitionId_periodKey: {
            userId,
            taskDefinitionId,
            periodKey
          }
        }
      });

      if (!progress?.completedAt) {
        const err = new Error("NOT_COMPLETED");
        err.code = "NOT_COMPLETED";
        throw err;
      }
      if (progress.rewardClaimedAt) {
        const err = new Error("ALREADY_CLAIMED");
        err.code = "ALREADY_CLAIMED";
        throw err;
      }

      const locked = await tx.userDailyTaskProgress.updateMany({
        where: {
          id: progress.id,
          rewardClaimedAt: null,
          completedAt: { not: null }
        },
        data: { rewardClaimedAt: new Date() }
      });
      if (locked.count !== 1) {
        const err = new Error("ALREADY_CLAIMED");
        err.code = "ALREADY_CLAIMED";
        throw err;
      }

      const summary = await fulfillMiniPassLevelReward(tx, {
        userId,
        reward: rewardPayloadFromDefinition(def)
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "DAILY_TASK_CLAIM",
          detailsJson: JSON.stringify({
            taskDefinitionId,
            periodKey,
            slug: def.slug,
            rewardKind: def.rewardKind
          })
        }
      });

      return { summary };
    });

    if (out.summary?.kind === REWARD_POL && out.summary.amount) {
      applyPolDeltaInEngine(userId, Number(out.summary.amount));
    }
    await syncMiningAfterMiniPassReward(userId);

    return { ok: true, summary: out.summary };
  } catch (e) {
    if (e.message === "NOT_COMPLETED") return { ok: false, code: "not_completed", status: 400 };
    if (e.message === "ALREADY_CLAIMED") return { ok: false, code: "already_claimed", status: 409 };
    if (e.message === "TASK_NOT_FOUND") return { ok: false, code: "not_found", status: 404 };
    if (e.message === "FORBIDDEN") return { ok: false, code: "forbidden", status: 403 };
    console.error("claimDailyTaskReward", e);
    return { ok: false, code: "error", status: 500 };
  }
}
