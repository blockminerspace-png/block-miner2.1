/**
 * Shared Redis connection for distributed rate limits, idempotency, locks, and lockout.
 * When REDIS_URL is unset, callers fall back to in-process structures (single-instance only).
 */

import Redis from "ioredis";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("Redis");

/** @type {import("ioredis").default | null} */
let client = null;

/** @type {boolean} */
let intentionallyDisabled = false;

export function getRedisUrl() {
  return String(process.env.REDIS_URL || "").trim();
}

/**
 * @returns {import("ioredis").default | null}
 */
export function getRedis() {
  if (intentionallyDisabled) return null;
  const url = getRedisUrl();
  if (!url) return null;
  if (client) return client;
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  client.on("error", (err) => {
    logger.error("Redis client error", { message: err.message });
  });
  return client;
}

/**
 * Ensures a TCP connection exists before time-sensitive operations.
 * @returns {Promise<import("ioredis").default | null>}
 */
export async function ensureRedisConnected() {
  const r = getRedis();
  if (!r) return null;
  if (r.status === "wait" || r.status === "end") {
    try {
      await r.connect();
    } catch (e) {
      logger.error("Redis connect failed", { message: /** @type {Error} */ (e).message });
      return null;
    }
  }
  return r;
}

export async function shutdownRedis() {
  if (client) {
    try {
      await client.quit();
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
    client = null;
  }
}

/** @internal Tests only — forces all distributed helpers to use memory backends. */
export function __disableRedisForTests() {
  intentionallyDisabled = true;
  client = null;
}

/** @internal Tests only */
export function __enableRedisForTests() {
  intentionallyDisabled = false;
}
