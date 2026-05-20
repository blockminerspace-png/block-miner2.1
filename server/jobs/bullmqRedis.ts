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
  const connectTimeoutMs = Number.parseInt(String(process.env.REDIS_CONNECT_TIMEOUT_MS || "5000"), 10) || 5000;
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: connectTimeoutMs,
  });
}
