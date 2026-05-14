/**
 * Dedicated Redis connections for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` (differs from server/services/redisClient.js).
 */

import { Redis } from "ioredis";

export function createBullmqConnection(): Redis {
  const url = String(process.env.REDIS_URL || "").trim();
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
