import { getNextDailyTaskResetAt } from "../dailyTasks/dailyTaskPeriod.js";
import { RESET_TYPE_COOLDOWN, RESET_TYPE_DAILY } from "./internalOfferwallConstants.js";

/**
 * @typedef {{ periodKey: string, completedAt: Date | null }} CompletionRow
 */

/**
 * @param {unknown} offer
 * @returns {{ resetType: string, maxPerPeriod: number, cooldownWindowSec: number | null }}
 */
export function getOfferLimitConfig(offer) {
  const meta = offer?.taskMetadata && typeof offer.taskMetadata === "object" ? offer.taskMetadata : {};
  const rt = String(meta.resetType || RESET_TYPE_DAILY).trim().toUpperCase();
  const resetType = rt === RESET_TYPE_COOLDOWN ? RESET_TYPE_COOLDOWN : RESET_TYPE_DAILY;
  const rawMax = Number(offer?.dailyLimitPerUser);
  const maxPerPeriod = Number.isFinite(rawMax) ? Math.min(50, Math.max(1, Math.floor(rawMax))) : 1;
  let cooldownWindowSec = null;
  if (resetType === RESET_TYPE_COOLDOWN) {
    const n = Math.floor(Number(meta.cooldownSeconds));
    cooldownWindowSec = Number.isFinite(n) ? Math.min(86400 * 7, Math.max(60, n)) : 3600;
  }
  return { resetType, maxPerPeriod, cooldownWindowSec };
}

/**
 * @param {object} args
 * @param {string} args.resetType
 * @param {number} args.maxPerPeriod
 * @param {number | null} args.cooldownWindowSec
 * @param {CompletionRow[]} args.completionRows
 * @param {string} args.periodKey
 * @param {Date} args.now
 * @param {boolean} args.hasOpenAttempt
 */
export function computeUsageSnapshot(args) {
  const { resetType, maxPerPeriod, cooldownWindowSec, completionRows, periodKey, now, hasOpenAttempt } = args;
  const nowMs = now.getTime();
  let completedCount = 0;
  let secondsUntilAvailable = null;

  if (resetType === RESET_TYPE_DAILY) {
    completedCount = completionRows.filter((r) => r.periodKey === periodKey).length;
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const next = getNextDailyTaskResetAt(now);
      secondsUntilAvailable = Math.max(0, Math.ceil((next.getTime() - nowMs) / 1000));
    }
  } else {
    const wMs = (cooldownWindowSec || 3600) * 1000;
    const threshold = nowMs - wMs;
    const inWindow = completionRows
      .filter((r) => r.completedAt && r.completedAt.getTime() >= threshold)
      .map((r) => /** @type {Date} */ (r.completedAt).getTime())
      .sort((a, b) => a - b);
    completedCount = inWindow.length;
    if (completedCount >= maxPerPeriod && !hasOpenAttempt) {
      const idx = Math.max(0, inWindow.length - maxPerPeriod);
      const boundary = inWindow[idx] + wMs;
      secondsUntilAvailable = Math.max(0, Math.ceil((boundary - nowMs) / 1000));
    }
  }

  const atLimit = completedCount >= maxPerPeriod;
  const canStartNew = !atLimit || Boolean(hasOpenAttempt);
  return {
    completedCount,
    maxPerPeriod,
    resetType,
    cooldownWindowSec,
    secondsUntilAvailable: canStartNew ? null : secondsUntilAvailable,
    canStartNew
  };
}

/** History lookback for completion queries (covers Brazil day + longest cooldown window). */
export const COMPLETION_HISTORY_LOOKBACK_MS = 8 * 86400000;
