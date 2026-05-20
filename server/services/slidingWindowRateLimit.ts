/**
 * Sliding-window rate limiting backed by Postgres (CallbackQueue state rows + advisory locks).
 * In-memory fallback is test-only (see securityStoreMode.js). Redis is intentionally not used.
 */

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import { advisoryXactTryLockOrThrow } from "../utils/pgAdvisoryLocks.js";
import { useMemoryRateLimitStore } from "../utils/securityStoreMode.js";

/** @type {Map<string, number[]>} */
const memHits = new Map<string, number[]>();

/**
 * Prune all timestamps older than `maxAgeMs` from every key in the in-memory
 * store and delete entries that become empty. Called on a slow interval to
 * prevent unbounded memory growth in long-running servers.
 */
function pruneMemHits(maxAgeMs: number, now: number): void {
  const cutoff = now - maxAgeMs;
  for (const [k, arr] of memHits) {
    const pruned = arr.filter((t) => t > cutoff);
    if (pruned.length === 0) {
      memHits.delete(k);
    } else {
      memHits.set(k, pruned);
    }
  }
}

// Run cleanup every 5 minutes using a 10-minute TTL (generous: the longest
// possible window in production is 60 s, so 10 min ensures no active window
// is ever pruned prematurely).
const MEM_HITS_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MEM_HITS_MAX_AGE_MS = 10 * 60 * 1000;

let _memHitsCleanupInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
  pruneMemHits(MEM_HITS_MAX_AGE_MS, Date.now());
}, MEM_HITS_CLEANUP_INTERVAL_MS);
// Allow Node to exit even if the interval is still pending.
if (_memHitsCleanupInterval?.unref) _memHitsCleanupInterval.unref();

function pruneMemoryTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

function bucketHash(prefix: string, dedupeKey: string): string {
  return crypto.createHash("sha256").update(`${prefix}:${dedupeKey}`, "utf8").digest("hex");
}

function readSlidingWindowHits(data: unknown, now: number, windowMs: number): number[] {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return [];
  const raw = Reflect.get(data, "hits");
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is number => typeof t === "number" && t > now - windowMs);
}

export async function slidingWindowAllow(opts: {
  dedupeKey?: unknown;
  windowMs?: unknown;
  max?: unknown;
  redisPrefix?: unknown;
}): Promise<{ ok: boolean; remaining: number; retryAfterSec: number }> {
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
      async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, lockName);

        const row = await tx.callbackQueue.findFirst({
          where: { callbackType: "SEC_SW_RL", callbackHash: h },
        });

        let hits: number[] = readSlidingWindowHits(row?.data, now, windowMs);

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
  if (_memHitsCleanupInterval !== null) {
    clearInterval(_memHitsCleanupInterval);
    _memHitsCleanupInterval = null;
  }
}
