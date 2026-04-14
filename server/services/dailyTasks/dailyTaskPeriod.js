import { getBrazilCheckinDateKey } from "../../utils/checkinDate.js";

/**
 * Calendar bucket for daily tasks (aligned with check-in / Brazil day).
 * @param {Date} [now]
 * @returns {string} YYYY-MM-DD
 */
export function getDailyTaskPeriodKey(now = new Date()) {
  return getBrazilCheckinDateKey(now);
}

/**
 * Next instant when the Brazil calendar day advances (for UI countdown).
 * @param {Date} [now]
 * @returns {Date}
 */
export function getNextDailyTaskResetAt(now = new Date()) {
  const today = getBrazilCheckinDateKey(now);
  let lo = now.getTime();
  let hi = now.getTime() + 50 * 3600000;
  while (hi - lo > 2) {
    const mid = Math.floor((lo + hi) / 2);
    if (getBrazilCheckinDateKey(new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}
