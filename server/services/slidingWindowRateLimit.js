/**
 * Sliding-window rate limiting backed by Postgres (CallbackQueue state rows + advisory locks).
 * In-memory fallback is test-only (see securityStoreMode.js). Redis is intentionally not used.
 */

import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { advisoryXactTryLockOrThrow } from "../utils/pgAdvisoryLocks.js";
import { useMemoryRateLimitStore } from "../utils/securityStoreMode.js";

/** @type {Map<string, number[]>} */
const memHits = new Map();

function pruneMemoryTimestamps(timestamps, windowMs, now) {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

function bucketHash(prefix, dedupeKey) {
  return crypto.createHash("sha256").update(`${prefix}:${dedupeKey}`, "utf8").digest("hex");
}

/**
 * @param {{ dedupeKey: string; windowMs: number; max: number; redisPrefix?: string }} opts
 * @returns {Promise<{ ok: boolean; remaining: number; retryAfterSec: number }>}
 */
export async function slidingWindowAllow(opts) {
  const windowMs = Math.max(1000, Number(opts.windowMs) || 60_000);
  const max = Math.max(1, Math.floor(Number(opts.max) || 1));
  const now = Date.now();
  const prefix = String(opts.redisPrefix || "rl:v1");
  const dedupeKey = String(opts.dedupeKey || "anon");

  if (useMemoryRateLimitStore()) {
    const k = `${prefix}:${dedupeKey}`;
    let arr = memHits.get(k) || [];
    arr = pruneMemoryTimestamps(arr, windowMs, now);
    arr.push(now);
    memHits.set(k, arr);
    const count = arr.length;
    const oldest = arr[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    if (count > max) {
      return { ok: false, remaining: 0, retryAfterSec };
    }
    return { ok: true, remaining: Math.max(max - count, 0), retryAfterSec: 0 };
  }

  const h = bucketHash(prefix, dedupeKey);
  const lockName = `swrl:${h}`;

  try {
    return await prisma.$transaction(
      async (tx) => {
        await advisoryXactTryLockOrThrow(tx, lockName);

        const row = await tx.callbackQueue.findFirst({
          where: { callbackType: "SEC_SW_RL", callbackHash: h },
        });

        /** @type {number[]} */
        let hits = [];
        if (row?.data && typeof row.data === "object" && Array.isArray(/** @type {any} */ (row.data).hits)) {
          hits = /** @type {number[]} */ (
            /** @type {any} */ (row.data).hits.filter((t) => typeof t === "number" && t > now - windowMs)
          );
        }

        if (hits.length >= max) {
          const oldest = hits[0] || now;
          const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
          return { ok: false, remaining: 0, retryAfterSec };
        }

        hits.push(now);
        const payload = { hits, v: 1 };
        if (row?.id) {
          await tx.callbackQueue.update({
            where: { id: row.id },
            data: { data: payload, processedAt: new Date() },
          });
        } else {
          await tx.callbackQueue.create({
            data: {
              callbackType: "SEC_SW_RL",
              callbackHash: h,
              data: payload,
              status: "processed",
              processedAt: new Date(),
            },
          });
        }
        return { ok: true, remaining: Math.max(max - hits.length, 0), retryAfterSec: 0 };
      },
      { timeout: Math.min(10_000, windowMs + 2000) },
    );
  } catch {
    const memK = `${prefix}:${dedupeKey}`;
    let arr = memHits.get(memK) || [];
    arr = pruneMemoryTimestamps(arr, windowMs, now);
    arr.push(now);
    memHits.set(memK, arr);
    const count = arr.length;
    const oldest = arr[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    if (count > max) {
      return { ok: false, remaining: 0, retryAfterSec };
    }
    return { ok: true, remaining: Math.max(max - count, 0), retryAfterSec: 0 };
  }
}

/** @internal */
export function __resetSlidingWindowMemoryForTests() {
  memHits.clear();
}
