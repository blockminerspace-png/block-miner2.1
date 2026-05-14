/**
 * Brute-force protection: progressive lockout after repeated failed logins per IP and per user.
 * Stored in Postgres (CallbackQueue + advisory locks). In-memory fallback for unit tests only.
 */

import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { advisoryXactTryLockOrThrow } from "../utils/pgAdvisoryLocks.js";
import { useMemorySecurityStores } from "../utils/securityStoreMode.js";

const mem = new Map();

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const TIER_FIRST = 5;
const TIER_SECOND = 10;
const LOCK_MS_FIRST = 15 * 60 * 1000;
const LOCK_MS_SECOND = 60 * 60 * 1000;

function envInt(name, def) {
  const n = Number(process.env[name] ?? def);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

/** @deprecated env names kept for backward compatibility */
export function lockoutMaxAttempts() {
  return envInt("AUTH_LOCKOUT_MAX_ATTEMPTS", TIER_FIRST);
}

/** @deprecated */
export function lockoutDurationMs() {
  return envInt("AUTH_LOCKOUT_DURATION_MS", LOCK_MS_FIRST);
}

function ipHashKey(ip) {
  const h = crypto.createHash("sha256").update(`ip:${String(ip || "0.0.0.0")}`).digest("hex");
  return { h, resource: `lockout:ip:${h}` };
}

function userHashKey(userId) {
  const h = crypto.createHash("sha256").update(`user:${userId}`).digest("hex");
  return { h, resource: `lockout:user:${h}` };
}

/**
 * @typedef {{ locked: false } | { locked: true; until: number }} LockStatus
 */

/**
 * @param {{ ip: string; userId?: number | null }} p
 * @returns {Promise<LockStatus>}
 */
export async function getAuthLockStatus(p) {
  const now = Date.now();

  if (useMemorySecurityStores()) {
    const checkMem = (key) => {
      const rec = mem.get(key);
      if (!rec) return { locked: false };
      if (rec.lockUntil > now) return { locked: true, until: rec.lockUntil };
      if (rec.failedAttempts > 0 && now - rec.windowStartedAt > LOCK_MS_SECOND) {
        mem.delete(key);
      }
      return { locked: false };
    };
    const ipS = checkMem(ipHashKey(p.ip).h);
    if (ipS.locked) return ipS;
    if (p.userId != null && Number.isFinite(p.userId)) {
      const uS = checkMem(userHashKey(p.userId).h);
      if (uS.locked) return uS;
    }
    return { locked: false };
  }

  const checkRow = async (meta) => {
    return prisma.$transaction(
      async (tx) => {
        await advisoryXactTryLockOrThrow(tx, meta.resource);
        const row = await tx.callbackQueue.findFirst({
          where: { callbackType: "SEC_LOCK", callbackHash: meta.h },
        });
        const d: Record<string, unknown> = isPlainRecord(row?.data) ? row.data : {};
        const lockUntil = Number(d.lockUntilMs ?? 0);
        if (lockUntil > now) return { locked: true, until: lockUntil };
        return { locked: false };
      },
      { timeout: 8000 },
    );
  };

  const ipS = await checkRow(ipHashKey(p.ip));
  if (ipS.locked) return ipS;
  if (p.userId != null && Number.isFinite(p.userId)) {
    const uS = await checkRow(userHashKey(p.userId));
    if (uS.locked) return uS;
  }
  return { locked: false };
}

/**
 * @param {{ ip: string; userId?: number | null }} p
 * @returns {Promise<void>}
 */
export async function recordAuthLoginSuccess(p) {
  if (useMemorySecurityStores()) {
    mem.delete(ipHashKey(p.ip).h);
    if (p.userId != null && Number.isFinite(p.userId)) mem.delete(userHashKey(p.userId).h);
    return;
  }

  const keys = [ipHashKey(p.ip)];
  if (p.userId != null && Number.isFinite(p.userId)) keys.push(userHashKey(p.userId));
  for (const k of keys) {
    await prisma.callbackQueue.deleteMany({
      where: { callbackType: "SEC_LOCK", callbackHash: k.h },
    });
  }
}

/**
 * @param {{ ip: string; userId?: number | null }} p
 * @returns {Promise<void>}
 */
export async function recordAuthLoginFailure(p) {
  const now = Date.now();

  if (useMemorySecurityStores()) {
    const bump = (key) => {
      let rec = mem.get(key) || { failedAttempts: 0, windowStartedAt: now, lockUntil: 0 };
      if (rec.lockUntil > now) return;
      if (now - rec.windowStartedAt > LOCK_MS_SECOND) {
        rec = { failedAttempts: 0, windowStartedAt: now, lockUntil: 0 };
      }
      rec.failedAttempts += 1;
      if (rec.failedAttempts >= TIER_SECOND) rec.lockUntil = now + LOCK_MS_SECOND;
      else if (rec.failedAttempts >= TIER_FIRST) rec.lockUntil = now + LOCK_MS_FIRST;
      mem.set(key, rec);
    };
    bump(ipHashKey(p.ip).h);
    if (p.userId != null && Number.isFinite(p.userId)) bump(userHashKey(p.userId).h);
    return;
  }

  const bumpDb = async (meta) => {
    await prisma.$transaction(
      async (tx) => {
        await advisoryXactTryLockOrThrow(tx, meta.resource);
        const row = await tx.callbackQueue.findFirst({
          where: { callbackType: "SEC_LOCK", callbackHash: meta.h },
        });
        const prev: Record<string, unknown> = isPlainRecord(row?.data) ? row.data : {};
        let failCount = Number(prev.failCount ?? 0);
        if (Number(prev.lockUntilMs ?? 0) > now) {
          return;
        }
        failCount += 1;
        let lockUntilMs = 0;
        if (failCount >= TIER_SECOND) lockUntilMs = now + LOCK_MS_SECOND;
        else if (failCount >= TIER_FIRST) lockUntilMs = now + LOCK_MS_FIRST;
        const payload = { v: 1, failCount, lockUntilMs, lastFailAtMs: now };
        if (row?.id) {
          await tx.callbackQueue.update({
            where: { id: row.id },
            data: { data: payload, processedAt: new Date() },
          });
        } else {
          await tx.callbackQueue.create({
            data: {
              callbackType: "SEC_LOCK",
              callbackHash: meta.h,
              userId: p.userId != null && Number.isFinite(p.userId) ? p.userId : null,
              data: payload,
              status: "processed",
              processedAt: new Date(),
            },
          });
        }
      },
      { timeout: 8000 },
    );
  };

  await bumpDb(ipHashKey(p.ip));
  if (p.userId != null && Number.isFinite(p.userId)) await bumpDb(userHashKey(p.userId));
}

/** @internal */
export function __resetAccountLockoutMemoryForTests() {
  mem.clear();
}
