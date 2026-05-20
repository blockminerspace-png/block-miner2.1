/**
 * Shared Redis connection for distributed rate limits, idempotency, locks, and lockout.
 * When REDIS_URL is unset, callers fall back to in-process structures (single-instance only).
 */

import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("Redis");

let client: Redis | null = null;

/** @type {boolean} */
let intentionallyDisabled = false;

export function getRedisUrl(): string {
  return String(process.env.REDIS_URL || "").trim();
}

export function getRedis(): Redis | null {
  if (intentionallyDisabled) return null;
  const url = getRedisUrl();
  if (!url) return null;
  if (client) return client;
  const connectTimeoutMs = Number.parseInt(String(process.env.REDIS_CONNECT_TIMEOUT_MS || "3000"), 10) || 3000;
  const commandTimeoutMs = Number.parseInt(String(process.env.REDIS_COMMAND_TIMEOUT_MS || "5000"), 10) || 5000;
  const options: RedisOptions = {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: connectTimeoutMs,
    commandTimeout: commandTimeoutMs,
  };
  client = new Redis(url, options);
  client.on("error", (err: Error) => {
    logger.error("Redis client error", { message: err.message });
  });
  return client;
}

export async function ensureRedisConnected(): Promise<Redis | null> {
  const r = getRedis();
  if (!r) return null;
  if (r.status === "wait" || r.status === "end") {
    try {
      await r.connect();
    } catch (e: unknown) {
      logger.error("Redis connect failed", { message: e instanceof Error ? e.message : String(e) });
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
