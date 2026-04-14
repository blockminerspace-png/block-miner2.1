/**
 * Replay-safe idempotency: Postgres-backed lease + completed payload (TTL via periodic cleanup).
 * Uses advisory locks + CallbackQueue rows — no Redis. In-memory mode for unit tests only.
 */

import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { advisoryXactTryLockOrThrow } from "../utils/pgAdvisoryLocks.js";
import { useMemorySecurityStores } from "../utils/securityStoreMode.js";

const memLeases = new Map();
const memResults = new Map();

function logicalHash(scope, userId, idempotencyKey) {
  return crypto.createHash("sha256").update(`${scope}|${userId}|${idempotencyKey}`, "utf8").digest("hex");
}

function advisoryResourceForIdem(scope, userId, idempotencyKey) {
  return `idem:${logicalHash(scope, userId, idempotencyKey)}`;
}

function memPrune(now) {
  for (const [k, v] of memLeases) {
    if (v.expiresAt <= now) memLeases.delete(k);
  }
  for (const [k, v] of memResults) {
    if (v.expiresAt <= now) memResults.delete(k);
  }
}

function resKey(scope, userId, idempotencyKey) {
  return `idem:res:v1:${scope}:${userId}:${idempotencyKey}`;
}

function leaseKey(scope, userId, idempotencyKey) {
  return `idem:lease:v1:${scope}:${userId}:${idempotencyKey}`;
}

/**
 * @typedef {{ type: "replay"; responseJson: object }} Replay
 * @typedef {{ type: "mismatch" }} Mismatch
 * @typedef {{ type: "busy" }} Busy
 * @typedef {{ type: "lease"; leaseToken: string }} Lease
 */

/**
 * @param {{ scope: string; userId: number; idempotencyKey: string; requestHash: string; claimTtlSec?: number; resultTtlSec?: number }} p
 * @returns {Promise<Replay | Mismatch | Busy | Lease>}
 */
export async function beginIdempotencyLease(p) {
  const claimTtlSec = Math.min(Math.max(Number(p.claimTtlSec ?? 120) || 120, 10), 600);
  const resultTtlSec = Math.min(Math.max(Number(p.resultTtlSec ?? 86_400) || 86_400, 60), 604_800);
  const rk = resKey(p.scope, p.userId, p.idempotencyKey);
  const lk = leaseKey(p.scope, p.userId, p.idempotencyKey);
  const now = Date.now();

  if (useMemorySecurityStores()) {
    memPrune(now);
    const existing = memResults.get(rk);
    if (existing && existing.expiresAt > now) {
      if (existing.requestHash !== p.requestHash) return { type: "mismatch" };
      return { type: "replay", responseJson: existing.responseJson };
    }
    const lease = memLeases.get(lk);
    if (lease && lease.expiresAt > now) {
      const again = memResults.get(rk);
      if (again && again.expiresAt > now && again.requestHash === p.requestHash) {
        return { type: "replay", responseJson: again.responseJson };
      }
      return { type: "busy" };
    }
    const token = crypto.randomBytes(16).toString("hex");
    memLeases.set(lk, { token, expiresAt: now + claimTtlSec * 1000 });
    return { type: "lease", leaseToken: token, _mem: { rk, lk, resultTtlSec } };
  }

  const h = logicalHash(p.scope, p.userId, p.idempotencyKey);
  const resource = advisoryResourceForIdem(p.scope, p.userId, p.idempotencyKey);

  return prisma.$transaction(
    async (tx) => {
      await advisoryXactTryLockOrThrow(tx, resource);

      const row = await tx.callbackQueue.findFirst({
        where: { callbackType: "SEC_IDEM", callbackHash: h },
      });

      const data = /** @type {any} */ (row?.data && typeof row.data === "object" ? row.data : {});

      if (data.phase === "done" && data.responseJson) {
        if (data.requestHash !== p.requestHash) return { type: "mismatch" };
        return { type: "replay", responseJson: data.responseJson };
      }

      if (data.phase === "lease" && Number(data.leaseUntilMs || 0) > now) {
        if (data.requestHash && data.requestHash !== p.requestHash) return { type: "mismatch" };
        return { type: "busy" };
      }

      const token = crypto.randomBytes(16).toString("hex");
      const leaseUntilMs = now + claimTtlSec * 1000;
      const nextPayload = {
        v: 1,
        phase: "lease",
        requestHash: p.requestHash,
        leaseToken: token,
        leaseUntilMs,
      };

      if (row?.id) {
        await tx.callbackQueue.update({
          where: { id: row.id },
          data: { data: nextPayload, processedAt: new Date() },
        });
      } else {
        await tx.callbackQueue.create({
          data: {
            callbackType: "SEC_IDEM",
            callbackHash: h,
            userId: p.userId,
            data: nextPayload,
            status: "processed",
            processedAt: new Date(),
          },
        });
      }

      return {
        type: "lease",
        leaseToken: token,
        _pg: { h, resource, resultTtlSec, requestHash: p.requestHash },
      };
    },
    { timeout: 12_000 },
  );
}

/**
 * @param {Lease & { _mem?: any; _pg?: any }} lease
 * @param {{ requestHash: string; responseJson: object }} body
 * @returns {Promise<void>}
 */
export async function commitIdempotencyResult(lease, body) {
  if (lease.type !== "lease") return;
  if (lease._mem) {
    const now = Date.now();
    memLeases.delete(lease._mem.lk);
    memResults.set(lease._mem.rk, {
      requestHash: body.requestHash,
      responseJson: body.responseJson,
      expiresAt: now + lease._mem.resultTtlSec * 1000,
    });
    return;
  }

  if (!lease._pg?.resource || !lease._pg?.h) return;
  const { h, resource } = lease._pg;
  const leaseToken = lease.leaseToken;

  await prisma.$transaction(
    async (tx) => {
      await advisoryXactTryLockOrThrow(tx, resource);
      const row = await tx.callbackQueue.findFirst({
        where: { callbackType: "SEC_IDEM", callbackHash: h },
      });
      const data = /** @type {any} */ (row?.data || {});
      if (data.leaseToken !== leaseToken) return;
      const donePayload = {
        v: 1,
        phase: "done",
        requestHash: body.requestHash,
        responseJson: body.responseJson,
        leaseToken: null,
        leaseUntilMs: 0,
      };
      if (row?.id) {
        await tx.callbackQueue.update({
          where: { id: row.id },
          data: { data: donePayload, processedAt: new Date() },
        });
      }
    },
    { timeout: 12_000 },
  );
}

/**
 * @param {Lease & { _mem?: any; _pg?: any }} lease
 * @returns {Promise<void>}
 */
export async function abortIdempotencyLease(lease) {
  if (lease.type !== "lease") return;
  if (lease._mem) {
    memLeases.delete(lease._mem.lk);
    return;
  }
  if (!lease._pg?.resource || !lease._pg?.h) return;
  const { h, resource } = lease._pg;
  const leaseToken = lease.leaseToken;

  await prisma.$transaction(
    async (tx) => {
      await advisoryXactTryLockOrThrow(tx, resource);
      const row = await tx.callbackQueue.findFirst({
        where: { callbackType: "SEC_IDEM", callbackHash: h },
      });
      const data = /** @type {any} */ (row?.data || {});
      if (data.leaseToken !== leaseToken) return;
      const cleared = {
        v: 1,
        phase: "idle",
        requestHash: null,
        leaseToken: null,
        leaseUntilMs: 0,
        responseJson: null,
      };
      if (row?.id) {
        await tx.callbackQueue.update({
          where: { id: row.id },
          data: { data: cleared, processedAt: new Date() },
        });
      }
    },
    { timeout: 12_000 },
  );
}

/** @internal */
export function __resetIdempotencyMemoryForTests() {
  memLeases.clear();
  memResults.clear();
}
