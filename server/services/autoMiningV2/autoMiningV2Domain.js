/**
 * Pure domain logic for Auto Mining GPU v2 (no I/O).
 * Used for server-side validation and unit tests.
 */

/** @typedef {'NORMAL' | 'TURBO'} MiningMode */

export const MINING_MODES = Object.freeze({
  NORMAL: "NORMAL",
  TURBO: "TURBO"
});

/** Hashrate granted per successful 60s cycle in Normal mode (H/s). */
export const NORMAL_HASH_PER_CYCLE = 10;

/** Hashrate granted per successful 60s cycle in Turbo mode after banner click (H/s). */
export const TURBO_HASH_PER_CYCLE = 20;

/** Seconds between eligible server-side claims. */
export const CYCLE_SECONDS = 60;

/** Maximum total H/s that may be granted per UTC calendar day (all modes). */
export const DAILY_LIMIT_HASH = 1000;

/** Power slice lifetime after grant (24 hours). */
export const GRANT_TTL_MS = 24 * 60 * 60 * 1000;

/** Impression must be consumed (turbo claim) within this window. */
export const CLICK_GRACE_MS = 3 * 60 * 1000;

/** Minimum delay between impression creation and click registration (anti-bot). */
export const MIN_CLICK_DELAY_MS = 400;

/**
 * @param {Date} d
 * @returns {Date} UTC midnight for the calendar day of `d` in UTC.
 */
export function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

/**
 * @param {Date} nextClaimAt
 * @param {Date} serverNow
 * @param {number} [skewMs]
 * @returns {boolean}
 */
export function isClaimDue(nextClaimAt, serverNow, skewMs = 5000) {
  return serverNow.getTime() >= nextClaimAt.getTime() - skewMs;
}

/**
 * @param {number} currentDayTotalHash Already granted H/s for the current UTC day.
 * @param {number} grantAmount H/s for this claim.
 * @param {number} [limit]
 * @returns {boolean}
 */
export function canGrantDaily(currentDayTotalHash, grantAmount, limit = DAILY_LIMIT_HASH) {
  return currentDayTotalHash + grantAmount <= limit;
}

/**
 * @param {Date} earnedAt
 * @param {number} [ttlMs]
 * @returns {Date}
 */
export function computeExpiresAt(earnedAt, ttlMs = GRANT_TTL_MS) {
  return new Date(earnedAt.getTime() + ttlMs);
}

/**
 * Validates turbo banner impression before creating a power grant.
 * @param {{ clickedAt: Date | null, grantId: number | null, createdAt: Date }} impression
 * @param {Date} serverNow
 * @returns {{ ok: true } | { ok: false, code: string }}
 */
export function validateImpressionForTurboClaim(impression, serverNow) {
  if (!impression.clickedAt) {
    return { ok: false, code: "NOT_CLICKED" };
  }
  if (impression.grantId != null) {
    return { ok: false, code: "ALREADY_CLAIMED" };
  }
  const clickDelay = impression.clickedAt.getTime() - impression.createdAt.getTime();
  if (clickDelay < MIN_CLICK_DELAY_MS) {
    return { ok: false, code: "CLICK_TOO_FAST" };
  }
  if (serverNow.getTime() - impression.createdAt.getTime() > CLICK_GRACE_MS) {
    return { ok: false, code: "IMPRESSION_EXPIRED" };
  }
  return { ok: true };
}

/**
 * @param {string} mode
 * @returns {MiningMode}
 */
export function assertValidMiningMode(mode) {
  if (mode === MINING_MODES.NORMAL || mode === MINING_MODES.TURBO) {
    return mode;
  }
  const err = new Error("Invalid mining mode");
  err.code = "INVALID_MODE";
  throw err;
}

/**
 * @param {Date} serverNow
 * @param {number} [cycleSeconds]
 * @returns {Date}
 */
export function nextClaimAfterSuccess(serverNow, cycleSeconds = CYCLE_SECONDS) {
  return new Date(serverNow.getTime() + cycleSeconds * 1000);
}

/**
 * @param {MiningMode} mode
 * @returns {number}
 */
export function hashRateForMode(mode) {
  return mode === MINING_MODES.TURBO ? TURBO_HASH_PER_CYCLE : NORMAL_HASH_PER_CYCLE;
}
