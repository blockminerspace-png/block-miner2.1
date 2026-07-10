import prisma from "../../src/db/prisma.js";
import type { Prisma } from "@prisma/client";
import { SIDEBAR_ITEM_REGISTRY } from "../sidebarNavRegistry.js";
import { getVisibleSidebarPaths } from "../sidebarNavService.js";
import { TASK_LOGIN_DAY } from "./dailyTaskConstants.js";
import { getDailyTaskPeriodKey, normalizeDailyTaskResetCadence } from "./dailyTaskPeriod.js";
import {
  createRewardInboxEntry,
  INBOX_SOURCE_DAILY_TASK,
  type InboxRewardPayload,
} from "../rewardInboxService.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("dailyTaskClaimService");

const CHECKIN_APP_PATH = SIDEBAR_ITEM_REGISTRY.checkin.path;

/**
 * @param {number} userId
 * @param {number} taskDefinitionId
 */
export async function claimDailyTaskReward(userId, taskDefinitionId) {
  try {
    const visiblePaths = await getVisibleSidebarPaths();
    const checkinEnabled = visiblePaths.has(CHECKIN_APP_PATH);
    const out = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      let inboxPayload: InboxRewardPayload | null = null;
      const kind = String(def.rewardKind || "").toUpperCase();

      if (kind === "POL" && def.rewardPolAmount && Number(def.rewardPolAmount) > 0) {
        inboxPayload = {
          userId,
          source: INBOX_SOURCE_DAILY_TASK,
          rewardType: "pol",
          rewardValue: Number(def.rewardPolAmount),
        };
      } else if (kind === "BLK" && def.rewardBlkAmount && Number(def.rewardBlkAmount) > 0) {
        inboxPayload = {
          userId,
          source: INBOX_SOURCE_DAILY_TASK,
          rewardType: "blk",
          rewardValue: Number(def.rewardBlkAmount),
        };
      } else if (kind === "HASHRATE_TEMP" && def.rewardHashRate && Number(def.rewardHashRate) > 0) {
        const days = Math.max(1, Number(def.rewardHashRateDays || 1));
        inboxPayload = {
          userId,
          source: INBOX_SOURCE_DAILY_TASK,
          rewardType: "temporary_power",
          rewardValue: Number(def.rewardHashRate),
          durationHours: days * 24,
        };
      } else if (kind === "SHOP_MINER" && def.rewardMinerId) {
        const miner = await tx.miner.findUnique({
          where: { id: def.rewardMinerId },
          select: { id: true, name: true, baseHashRate: true, imageUrl: true, slotSize: true },
        });
        if (miner) {
          inboxPayload = {
            userId,
            source: INBOX_SOURCE_DAILY_TASK,
            rewardType: "machine",
            rewardValue: Number(miner.baseHashRate ?? 0),
            minerId: miner.id,
            minerName: miner.name,
            minerImageUrl: miner.imageUrl,
            slotSize: miner.slotSize ?? 1,
          };
        }
      } else if (kind === "EVENT_MINER" && def.rewardEventMinerId) {
        const em = await tx.eventMiner.findUnique({
          where: { id: def.rewardEventMinerId },
          select: { name: true, imageUrl: true, hashRate: true, slotSize: true },
        });
        if (em) {
          inboxPayload = {
            userId,
            source: INBOX_SOURCE_DAILY_TASK,
            rewardType: "machine",
            rewardValue: Number(em.hashRate ?? 0),
            minerId: null,
            minerName: em.name,
            minerImageUrl: em.imageUrl,
            slotSize: em.slotSize ?? 1,
          };
        }
      }

      if (inboxPayload) await createRewardInboxEntry(tx, inboxPayload);

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

      return { summary: { kind: def.rewardKind } };
    });

    return { ok: true, summary: out.summary };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_COMPLETED") return { ok: false, code: "not_completed", status: 400 };
    if (msg === "ALREADY_CLAIMED") return { ok: false, code: "already_claimed", status: 409 };
    if (msg === "TASK_NOT_FOUND") return { ok: false, code: "not_found", status: 404 };
    if (msg === "FORBIDDEN") return { ok: false, code: "forbidden", status: 403 };
    logger.error("claimDailyTaskReward", { error: String(e) });
    return { ok: false, code: "error", status: 500 };
  }
}
