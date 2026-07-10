import loggerLib from "../utils/logger.js";
import { createCronActionRunner, type CronRunOutcome } from "./cronActionRunner.js";
import { runBlkRewardCycle } from "../services/blkRewardDistributionService.js";
import { getBlkEconomyConfig } from "../models/blkEconomyModel.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("BlkRewardCycleCron");

const TICK_MS = Number(process.env.BLK_REWARD_TICK_MS || 60_000);

export async function processBlkRewardCycleTick(): Promise<CronRunOutcome | { ok: false; skipped: string }> {
  if (process.env.NODE_ENV === "test" && !process.env.BLK_REWARD_CRON_TEST) {
    return { ok: false, skipped: "test_env" };
  }

  const runCronAction = createCronActionRunner({ logger, cronName: "BlkRewardCycleCron" });

  return runCronAction({
    action: "blk_reward_cycle",
    logStart: false,
    logSuccess: false,
    validate: async () => {
      const cfg = await getBlkEconomyConfig();
      if (cfg.blkCyclePaused) return { ok: false, reason: "paused" };
      return { ok: true };
    },
    validateFailureLogLevel: "debug",
    execute: async () => {
      const result = await runBlkRewardCycle();
      return result;
    },
    confirm: async ({ executionResult }) => ({
      ok: true,
      details: sanitizeResult(executionResult),
    }),
  });
}

function sanitizeResult(r: unknown): Record<string, unknown> {
  if (!r || typeof r !== "object") return {};
  const o = r as Record<string, unknown>;
  const { cycleId, distributed, minerCount, skipped, emptyPool, roundingSkip } = o;
  return { cycleId, distributed, minerCount, skipped, emptyPool, roundingSkip };
}

/**
 * Poll every minute; runBlkRewardCycle uses epoch buckets sized by config.blkCycleIntervalSec
 * so any interval (≥60s) works without redeploying cron expressions.
 */
export function startBlkRewardCycleCron(): { blkRewardCycleTimer: ReturnType<typeof setInterval> } {
  const handle = setInterval(() => {
    processBlkRewardCycleTick().catch((err: unknown) => {
      logger.error("BLK reward tick error", { error: errMsg(err) });
    });
  }, TICK_MS);

  processBlkRewardCycleTick().catch((err: unknown) => {
    logger.warn("BLK reward startup tick failed", { error: errMsg(err) });
  });

  if (typeof handle.unref === "function") handle.unref();
  logger.info(`BLK reward scheduler started (tick every ${TICK_MS}ms, { error: String(interval from DB) })`);
  return { blkRewardCycleTimer: handle };
}
