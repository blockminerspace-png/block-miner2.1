/**
 * Production may run code before Auto Mining v2 migrations are applied.
 * Probes Prisma v2 models; retries periodically after failure so deploy + migrate self-heals without restart.
 */

import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("AutoMiningV2Db");

/** Confirmed OK — stays true until process restart. */
let schemaConfirmed = false;
/** After a failed probe, do not re-hit DB until this time (ms). */
let probeQuietUntil = 0;

const NEGATIVE_CACHE_MS = 45_000;

export function resetAutoMiningV2AvailabilityCache() {
  schemaConfirmed = false;
  probeQuietUntil = 0;
}

/**
 * @returns {Promise<boolean>}
 */
export async function isAutoMiningV2SchemaAvailable() {
  const now = Date.now();
  if (schemaConfirmed) return true;
  if (now < probeQuietUntil) return false;

  try {
    await prisma.autoMiningV2PowerGrant.findFirst({ select: { id: true } });
    schemaConfirmed = true;
    return true;
  } catch (e: unknown) {
    logger.warn("Auto Mining v2 tables unavailable; will retry probe later.", {
      message: e instanceof Error ? e.message : String(e)
    });
    probeQuietUntil = now + NEGATIVE_CACHE_MS;
    return false;
  }
}
