import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { getBlkEconomyConfig } from "../models/blkEconomyModel.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { Prisma } from "@prisma/client";

const logger = loggerLib.child("BlkRewardDistribution");

const FLOOR_EPS = 1e-12;

/** Epoch-based time buckets (same boundaries as cron with timezone Etc/UTC). */
export function floorUtcEpochBucket(date, intervalSec) {
  const ms = intervalSec * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

export function nextWindowAfter(windowStart, intervalSec) {
  return new Date(windowStart.getTime() + intervalSec * 1000);
}

function floor8(n) {
  const x = Number(n);
  if (!(x > 0)) return 0;
  return Math.floor(x * 1e8 + FLOOR_EPS) / 1e8;
}

async function fetchActivityEligibleUserIds(activitySec) {
  const cutoff = new Date(Date.now() - activitySec * 1000);
  const rows = await prisma.user.findMany({
    where: {
      isBanned: false,
      miningPayoutMode: "blk",
      OR: [{ lastHeartbeatAt: { gte: cutoff } }, { lastLoginAt: { gte: cutoff } }]
    },
    select: { id: true }
  });
  return rows.map((r) => r.id);
}

async function snapshotHashrates(userIds: number[], concurrency: number) {
  const out: Array<{ userId: number; hashrate: number }> = [];
  for (let i = 0; i < userIds.length; i += concurrency) {
    const chunk = userIds.slice(i, i + concurrency);
    const part = await Promise.all(
      chunk.map(async (userId) => {
        try {
          const hashrate = await syncUserBaseHashRate(userId);
          return { userId, hashrate: Number(hashrate) || 0 };
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : String(e);
          logger.warn("snapshotHashrate failed", { userId, error: errMsg });
          return { userId, hashrate: 0 };
        }
      })
    );
    out.push(...part);
  }
  return out;
}

type BlkRewardCycleOptions = {
  now?: Date | string | number;
  windowStart?: Date | string | number;
  concurrency?: number;
};

/**
 * One emission cycle: idempotent per windowStart (UTC bucket).
 * @returns {{ ok: boolean, skipped?: string, cycleId?: number, distributed?: string }}
 */
export async function runBlkRewardCycle(options: BlkRewardCycleOptions = {}) {
  const config = await getBlkEconomyConfig();
  const intervalSec = Number(config.blkCycleIntervalSec) || 600;
  const activitySec = Number(config.blkCycleActivitySec) || 900;
  const minHr = Math.max(0, Number(config.blkCycleMinHashrate) || 0);
  const rewardBase = Number(config.blkCycleReward) || 0;
  const boost = Math.max(0, Number(config.blkCycleBoost) || 1);
  const totalRewardNum = floor8(rewardBase * boost);

  const now = options.now ? new Date(options.now) : new Date();
  const windowStart = options.windowStart
    ? new Date(options.windowStart)
    : floorUtcEpochBucket(now, intervalSec);

  if (config.blkCyclePaused) {
    return { ok: true, skipped: "paused" };
  }

  if (!(totalRewardNum > 0)) {
    return { ok: true, skipped: "zero_reward" };
  }

  const existing = await prisma.blkRewardCycle.findUnique({
    where: { windowStart }
  });
  if (existing) {
    return { ok: true, skipped: "already_distributed", cycleId: existing.id };
  }

  const userIds = await fetchActivityEligibleUserIds(activitySec);
  const snapshots = await snapshotHashrates(userIds, options.concurrency ?? 40);
  const entries: Array<{ userId: number; hashrate: number }> = snapshots
    .filter((s) => s.hashrate > minHr)
    .map((s) => ({ userId: s.userId, hashrate: s.hashrate }));

  const totalHr = entries.reduce((a, e) => a + e.hashrate, 0);

  if (totalHr <= 0 || entries.length === 0) {
    try {
      const cycle = await prisma.blkRewardCycle.create({
        data: {
          windowStart,
          totalHashrate: "0",
          totalReward: String(totalRewardNum),
          distributed: "0",
          minerCount: 0
        }
      });
      return { ok: true, cycleId: cycle.id, distributed: "0", emptyPool: true };
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true, skipped: "duplicate_window" };
      }
      throw e;
    }
  }

  entries.sort((a, b) => a.userId - b.userId);

  const planned: Array<{ userId: number; hashrate: number; shareBps: number; amount: number }> = [];
  let remaining = totalRewardNum;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isLast = i === entries.length - 1;
    let amount;
    if (isLast) {
      amount = floor8(remaining);
    } else {
      const ideal = totalRewardNum * (e.hashrate / totalHr);
      amount = floor8(ideal);
      remaining = floor8(remaining - amount);
    }
    if (amount <= 0) continue;
    const shareBps = Math.min(10000, Math.max(0, Math.round((e.hashrate / totalHr) * 10000)));
    planned.push({
      userId: e.userId,
      hashrate: e.hashrate,
      shareBps,
      amount
    });
  }

  const distributedSum = planned.reduce((a, p) => a + p.amount, 0);

  if (planned.length === 0) {
    try {
      const cycle = await prisma.blkRewardCycle.create({
        data: {
          windowStart,
          totalHashrate: String(totalHr),
          totalReward: String(totalRewardNum),
          distributed: "0",
          minerCount: 0
        }
      });
      return { ok: true, cycleId: cycle.id, distributed: "0", roundingSkip: true };
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { ok: true, skipped: "duplicate_window" };
      }
      throw e;
    }
  }

  let cycle;
  try {
    cycle = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const c = await tx.blkRewardCycle.create({
        data: {
          windowStart,
          totalHashrate: String(totalHr),
          totalReward: String(totalRewardNum),
          distributed: String(floor8(distributedSum)),
          minerCount: planned.length
        }
      });

      for (const p of planned) {
        await tx.blkRewardLog.create({
          data: {
            cycleId: c.id,
            userId: p.userId,
            hashrate: String(p.hashrate),
            shareBps: p.shareBps,
            amount: String(p.amount)
          }
        });
        await tx.user.update({
          where: { id: p.userId },
          data: { blkBalance: { increment: String(p.amount) } }
        });
      }

      return c;
    });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, skipped: "duplicate_window" };
    }
    throw e;
  }

  const rewardLogs = await prisma.blkRewardLog.findMany({
    where: { cycleId: cycle.id },
    select: { id: true, userId: true, amount: true }
  });
  const { notifyMiniPassBlkReward } = await import("./miniPass/miniPassMissionHookService.js");
  const { notifyDailyTaskBlkMined } = await import("./dailyTasks/dailyTaskHookService.js");
  for (const log of rewardLogs) {
    notifyMiniPassBlkReward(log.userId, log.id, log.amount).catch(() => {});
    notifyDailyTaskBlkMined(log.userId, log.id, log.amount).catch(() => {});
  }

  logger.info("BLK cycle distributed", {
    cycleId: cycle.id,
    windowStart: windowStart.toISOString(),
    miners: planned.length,
    totalHr,
    distributed: floor8(distributedSum)
  });

  return {
    ok: true,
    cycleId: cycle.id,
    distributed: String(floor8(distributedSum)),
    minerCount: planned.length
  };
}

export async function getLatestBlkRewardCycle() {
  return prisma.blkRewardCycle.findFirst({
    orderBy: { windowStart: "desc" }
  });
}

export async function getBlkCyclePublicSnapshot() {
  const [config, last] = await Promise.all([getBlkEconomyConfig(), getLatestBlkRewardCycle()]);
  const intervalSec = Number(config.blkCycleIntervalSec) || 600;
  const now = new Date();
  const currentWindow = floorUtcEpochBucket(now, intervalSec);
  const nextWindow = nextWindowAfter(currentWindow, intervalSec);
  const rewardPerCycle = floor8(Number(config.blkCycleReward) * Number(config.blkCycleBoost || 1));

  return {
    intervalSec,
    rewardPerCycle,
    paused: config.blkCyclePaused,
    activityWindowSec: Number(config.blkCycleActivitySec) || 900,
    minHashrate: Number(config.blkCycleMinHashrate) || 0,
    boost: Number(config.blkCycleBoost) || 1,
    lastCycle: last
      ? {
          id: last.id,
          windowStart: last.windowStart,
          totalHashrate: Number(last.totalHashrate),
          totalReward: Number(last.totalReward),
          distributed: Number(last.distributed),
          minerCount: last.minerCount
        }
      : null,
    serverTime: now.toISOString(),
    currentWindowStart: currentWindow.toISOString(),
    nextWindowStart: nextWindow.toISOString()
  };
}
