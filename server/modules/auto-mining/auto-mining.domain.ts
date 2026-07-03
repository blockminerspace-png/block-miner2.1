/**
 * Pure domain logic for Auto Mining GPU v2 (no I/O).
 * Used for server-side validation — no side effects.
 */

import type { MiningMode } from "./auto-mining.types.js";
import {
  V2_NORMAL_HASH_PER_CYCLE,
  V2_TURBO_HASH_PER_CYCLE,
  V2_CYCLE_SECONDS,
  V2_DAILY_LIMIT_HASH,
  V2_GRANT_TTL_MS,
  V2_CLICK_GRACE_MS,
  V2_MIN_CLICK_DELAY_MS,
} from "./auto-mining.config.js";

export const MINING_MODES = Object.freeze({
  NORMAL: "NORMAL" as MiningMode,
  TURBO: "TURBO" as MiningMode,
});

export const NORMAL_HASH_PER_CYCLE = V2_NORMAL_HASH_PER_CYCLE;
export const TURBO_HASH_PER_CYCLE = V2_TURBO_HASH_PER_CYCLE;
export const CYCLE_SECONDS = V2_CYCLE_SECONDS;
export const DAILY_LIMIT_HASH = V2_DAILY_LIMIT_HASH;
export const GRANT_TTL_MS = V2_GRANT_TTL_MS;
export const CLICK_GRACE_MS = V2_CLICK_GRACE_MS;
export const MIN_CLICK_DELAY_MS = V2_MIN_CLICK_DELAY_MS;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

export function isClaimDue(nextClaimAt: Date, serverNow: Date, skewMs = 5000): boolean {
  return serverNow.getTime() >= nextClaimAt.getTime() - skewMs;
}

export function canGrantDaily(currentDayTotalHash: number, grantAmount: number, limit = DAILY_LIMIT_HASH): boolean {
  return currentDayTotalHash + grantAmount <= limit;
}

export function computeExpiresAt(earnedAt: Date, ttlMs = GRANT_TTL_MS): Date {
  return new Date(earnedAt.getTime() + ttlMs);
}

export function validateImpressionForTurboClaim(
  impression: { clickedAt: Date | null; grantId: number | null; createdAt: Date },
  serverNow: Date
): { ok: true } | { ok: false; code: string } {
  if (!impression.clickedAt) return { ok: false, code: "NOT_CLICKED" };
  if (impression.grantId != null) return { ok: false, code: "ALREADY_CLAIMED" };
  const clickDelay = impression.clickedAt.getTime() - impression.createdAt.getTime();
  if (clickDelay < MIN_CLICK_DELAY_MS) return { ok: false, code: "CLICK_TOO_FAST" };
  if (serverNow.getTime() - impression.createdAt.getTime() > CLICK_GRACE_MS) return { ok: false, code: "IMPRESSION_EXPIRED" };
  return { ok: true };
}

export function assertValidMiningMode(mode: string): MiningMode {
  if (mode === MINING_MODES.NORMAL || mode === MINING_MODES.TURBO) return mode as MiningMode;
  const err = new Error("Invalid mining mode") as Error & { code: string };
  err.code = "INVALID_MODE";
  throw err;
}

export function nextClaimAfterSuccess(serverNow: Date, cycleSeconds = CYCLE_SECONDS): Date {
  return new Date(serverNow.getTime() + cycleSeconds * 1000);
}

export function hashRateForMode(mode: MiningMode): number {
  return mode === MINING_MODES.TURBO ? TURBO_HASH_PER_CYCLE : NORMAL_HASH_PER_CYCLE;
}
