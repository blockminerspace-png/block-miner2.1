import { getBrazilCheckinDateKey } from "../../utils/checkinDate.js";
import { utcIsoWeekKey } from "../miniPass/miniPassPeriod.js";

export const DAILY_TASK_RESET_DAILY = "DAILY";
export const DAILY_TASK_RESET_WEEKLY = "WEEKLY";
export const DAILY_TASK_RESET_MONTHLY = "MONTHLY";

export const DAILY_TASK_RESET_CADENCES = [
  DAILY_TASK_RESET_DAILY,
  DAILY_TASK_RESET_WEEKLY,
  DAILY_TASK_RESET_MONTHLY
];

/**
 * @param {unknown} cadence
 * @returns {"DAILY"|"WEEKLY"|"MONTHLY"}
 */
export function normalizeDailyTaskResetCadence(cadence) {
  const v = typeof cadence === "string" ? cadence.trim().toUpperCase() : "";
  if (DAILY_TASK_RESET_CADENCES.includes(v)) return /** @type {"DAILY"|"WEEKLY"|"MONTHLY"} */ (v);
  return DAILY_TASK_RESET_DAILY;
}

function utcMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Calendar bucket for daily tasks (aligned with check-in / Brazil day).
 * @param {Date} [now]
 * @param {"DAILY"|"WEEKLY"|"MONTHLY"} [cadence]
 * @returns {string}
 */
export function getDailyTaskPeriodKey(now = new Date(), cadence = DAILY_TASK_RESET_DAILY) {
  const c = normalizeDailyTaskResetCadence(cadence);
  if (c === DAILY_TASK_RESET_WEEKLY) return utcIsoWeekKey(now);
  if (c === DAILY_TASK_RESET_MONTHLY) return utcMonthKey(now);
  return getBrazilCheckinDateKey(now);
}

/**
 * Next instant when the Brazil calendar day advances (for UI countdown).
 * @param {Date} [now]
 * @param {"DAILY"|"WEEKLY"|"MONTHLY"} [cadence]
 * @returns {Date}
 */
export function getNextDailyTaskResetAt(now = new Date(), cadence = DAILY_TASK_RESET_DAILY) {
  const c = normalizeDailyTaskResetCadence(cadence);
  if (c === DAILY_TASK_RESET_WEEKLY) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
    const daysUntilNextMonday = 8 - dayNum;
    d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
    return d;
  }
  if (c === DAILY_TASK_RESET_MONTHLY) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  }

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
