import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { getDailyTaskPeriodKey, normalizeDailyTaskResetCadence } from "./dailyTaskPeriod.js";
import { TASK_INTERNAL_OFFERWALL } from "./dailyTaskConstants.js";

type BumpDailyTasksOpts = {
  dedupeKey?: string;
  delta?: number;
  gameSlug?: string | null;
  internalOfferwallOfferId?: number | null;
};

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} taskDefinitionId
 * @param {string} dedupeKey
 * @returns {Promise<boolean>}
 */
async function tryConsumeDedupe(tx, taskDefinitionId, dedupeKey) {
  try {
    await tx.userDailyTaskDedupeTick.create({
      data: { taskDefinitionId, dedupeKey }
    });
    return true;
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

function activeDefinitionWhere(taskType, now) {
  return {
    isActive: true,
    taskType,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: now } }] }
    ]
  };
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {{ userId: number, definition: import("@prisma/client").DailyTaskDefinition, periodKey: string, delta: import("@prisma/client").Prisma.Decimal, now: Date }} args
 */
async function bumpOneTask(tx, { userId, definition, periodKey, delta, now }) {
  const target = Number(new Prisma.Decimal(definition.targetValue.toString()));
  if (!Number.isFinite(target) || target <= 0) return;

  await tx.userDailyTaskProgress.upsert({
    where: {
      userId_taskDefinitionId_periodKey: {
        userId,
        taskDefinitionId: definition.id,
        periodKey
      }
    },
    create: {
      userId,
      taskDefinitionId: definition.id,
      periodKey,
      currentValue: delta
    },
    update: {
      currentValue: { increment: delta }
    }
  });

  const row = await tx.userDailyTaskProgress.findUnique({
    where: {
      userId_taskDefinitionId_periodKey: {
        userId,
        taskDefinitionId: definition.id,
        periodKey
      }
    }
  });

  if (!row || row.rewardClaimedAt || row.completedAt) return;

  const cur = Number(new Prisma.Decimal(row.currentValue.toString()));
  if (cur < target) return;

  await tx.userDailyTaskProgress.updateMany({
    where: { id: row.id, completedAt: null, rewardClaimedAt: null },
    data: { completedAt: now }
  });
}

/**
 * Increments progress for all active definitions of a task type (idempotent per dedupeKey).
 * @param {number} userId
 * @param {string} taskType
 * @param {BumpDailyTasksOpts} opts
 */
export async function bumpDailyTasksForUser(userId: number, taskType: string, opts: BumpDailyTasksOpts = {}) {
  const { dedupeKey, delta, gameSlug, internalOfferwallOfferId } = opts;
  if (!userId || !dedupeKey) return;
  const d = Number(delta);
  if (!Number.isFinite(d) || d <= 0) return;

  const now = new Date();
  const defs = await prisma.dailyTaskDefinition.findMany({
    where: activeDefinitionWhere(taskType, now),
    orderBy: { sortOrder: "asc" }
  });

  const deltaDec = new Prisma.Decimal(String(d));

  for (const def of defs) {
    if (taskType === TASK_INTERNAL_OFFERWALL) {
      const scoped = def.internalOfferwallOfferId;
      if (scoped != null) {
        if (internalOfferwallOfferId == null || scoped !== internalOfferwallOfferId) continue;
      }
    }
    if (def.gameSlug) {
      if (!gameSlug || def.gameSlug !== gameSlug) continue;
    }
    const cadence = normalizeDailyTaskResetCadence(def.resetCadence);
    const periodKey = getDailyTaskPeriodKey(now, cadence);
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ok = await tryConsumeDedupe(tx, def.id, dedupeKey);
      if (!ok) return;
      await bumpOneTask(tx, {
        userId,
        definition: def,
        periodKey,
        delta: deltaDec,
        now
      });
    });
  }
}
