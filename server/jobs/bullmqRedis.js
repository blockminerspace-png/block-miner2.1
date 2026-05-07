/**
 * Dedicated Redis connections for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` (differs from server/services/redisClient.js).
 */

import IORedis from "ioredis";

/**
 * @returns {import("ioredis").default}
 */
export function createBullmqConnection() {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
