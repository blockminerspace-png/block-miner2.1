import loggerLib from "../utils/logger.js";
import { createCronActionRunner } from "./cronActionRunner.js";
import { runBlkRewardCycle } from "../services/blkRewardDistributionService.js";
import { getBlkEconomyConfig } from "../models/blkEconomyModel.js";

const logger = loggerLib.child("BlkRewardCycleCron");

const TICK_MS = Number(process.env.BLK_REWARD_TICK_MS || 60_000);

export async function processBlkRewardCycleTick() {
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
      details: sanitizeResult(executionResult)
    })
  });
}

function sanitizeResult(r) {
  if (!r || typeof r !== "object") return {};
  const { cycleId, distributed, minerCount, skipped, emptyPool, roundingSkip } = r;
  return { cycleId, distributed, minerCount, skipped, emptyPool, roundingSkip };
}

/**
 * Poll every minute; runBlkRewardCycle uses epoch buckets sized by config.blkCycleIntervalSec
 * so any interval (≥60s) works without redeploying cron expressions.
 */
export function startBlkRewardCycleCron() {
  const handle = setInterval(() => {
    processBlkRewardCycleTick().catch((err) => {
      logger.error("BLK reward tick error", { error: err.message });
    });
  }, TICK_MS);

  processBlkRewardCycleTick().catch((err) => {
    logger.warn("BLK reward startup tick failed", { error: err.message });
  });

  if (typeof handle.unref === "function") handle.unref();
  logger.info(`BLK reward scheduler started (tick every ${TICK_MS}ms, interval from DB)`);
  return { blkRewardCycleTimer: handle };
}
