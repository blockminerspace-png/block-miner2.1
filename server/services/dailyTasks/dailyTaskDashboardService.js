import { Prisma } from "../../src/db/prismaNamespace.js";
import prisma from "../../src/db/prisma.js";
import { SIDEBAR_ITEM_REGISTRY } from "../sidebarNavRegistry.js";
import { getVisibleSidebarPaths } from "../sidebarNavService.js";
import {
  STATUS_AVAILABLE,
  STATUS_CLAIMED,
  STATUS_COMPLETED,
  STATUS_IN_PROGRESS,
  TASK_INTERNAL_OFFERWALL,
  TASK_LOGIN_DAY
} from "./dailyTaskConstants.js";
import { getDailyTaskPeriodKey, getNextDailyTaskResetAt } from "./dailyTaskPeriod.js";

const CHECKIN_APP_PATH = SIDEBAR_ITEM_REGISTRY.checkin.path;
const INTERNAL_OFFERWALL_PATH = SIDEBAR_ITEM_REGISTRY.internal_offerwall.path;

/**
 * Hides login-day tasks when the check-in page is disabled in sidebar nav.
 * @param {Array<{ taskType: string }>} defs
 * @param {Set<string>} visiblePaths
 */
export function filterDailyTaskDefsForSidebar(defs, visiblePaths) {
  const checkinOn = visiblePaths.has(CHECKIN_APP_PATH);
  const offerwallOn = INTERNAL_OFFERWALL_PATH && visiblePaths.has(INTERNAL_OFFERWALL_PATH);
  return defs.filter((def) => {
    if (def.taskType === TASK_LOGIN_DAY) return checkinOn;
    if (def.taskType === TASK_INTERNAL_OFFERWALL) return offerwallOn;
    return true;
  });
}

/**
 * @param {import("@prisma/client").UserDailyTaskProgress | null | undefined} row
 */
function deriveStatus(row) {
  if (row?.rewardClaimedAt) return STATUS_CLAIMED;
  if (row?.completedAt) return STATUS_COMPLETED;
  const cur = row ? Number(new Prisma.Decimal(row.currentValue.toString())) : 0;
  if (cur > 0) return STATUS_IN_PROGRESS;
  return STATUS_AVAILABLE;
}

/**
 * @param {import("@prisma/client").DailyTaskDefinition} def
 */
function rewardSummary(def) {
  const kind = String(def.rewardKind || "").toUpperCase();
  if (kind === "BLK" && def.rewardBlkAmount) {
    return { kind, amount: def.rewardBlkAmount.toString() };
  }
  if (kind === "POL" && def.rewardPolAmount) {
    return { kind, amount: def.rewardPolAmount.toString() };
  }
  if (kind === "HASHRATE_TEMP") {
    return {
      kind,
      hashRate: def.rewardHashRate ?? 0,
      days: def.rewardHashRateDays ?? 1
    };
  }
  if (kind === "SHOP_MINER" || kind === "EVENT_MINER") {
    return { kind };
  }
  return { kind: kind || "NONE" };
}

/**
 * @param {number} userId
 */
export async function getDailyTasksDashboard(userId) {
  const now = new Date();
  const periodKey = getDailyTaskPeriodKey(now);
  const visiblePaths = await getVisibleSidebarPaths();
  const defsRaw = await prisma.dailyTaskDefinition.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }
      ]
    },
    orderBy: { sortOrder: "asc" }
  });
  const defs = filterDailyTaskDefsForSidebar(defsRaw, visiblePaths);

  const progressRows = await prisma.userDailyTaskProgress.findMany({
    where: { userId, periodKey }
  });
  const byDef = new Map(progressRows.map((p) => [p.taskDefinitionId, p]));

  const tasks = defs.map((def) => {
    const row = byDef.get(def.id) || null;
    const target = Number(new Prisma.Decimal(def.targetValue.toString()));
    const current = row
      ? Number(new Prisma.Decimal(row.currentValue.toString()))
      : 0;
    return {
      id: def.id,
      slug: def.slug,
      taskType: def.taskType,
      translationKey: def.translationKey,
      targetValue: target,
      currentValue: current,
      status: deriveStatus(row),
      reward: rewardSummary(def),
      gameSlug: def.gameSlug
    };
  });

  return {
    periodKey,
    serverTime: now.toISOString(),
    nextResetAt: getNextDailyTaskResetAt(now).toISOString(),
    tasks
  };
}
