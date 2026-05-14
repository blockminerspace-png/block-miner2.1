import { getBrazilCheckinDateKey } from "../../utils/checkinDate.js";
import {
  CADENCE_DAILY,
  CADENCE_EVENT,
  CADENCE_WEEKLY,
  EVENT_PERIOD_KEY,
  MISSION_LOGIN_DAY
} from "./miniPassConstants.js";

/**
 * ISO week key in UTC (e.g. 2026-W15) so weekly missions reset consistently on the server.
 */
export function utcIsoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function utcDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolves the progress bucket for a mission. Login missions align with Brazil check-in day
 * when cadence is DAILY so "today" matches the check-in calendar.
 */
export function resolveMissionPeriodKey(cadence, missionType, now = new Date()) {
  if (cadence === CADENCE_EVENT) return EVENT_PERIOD_KEY;

  if (missionType === MISSION_LOGIN_DAY) {
    if (cadence === CADENCE_EVENT) return EVENT_PERIOD_KEY;
    if (cadence === CADENCE_DAILY) return getBrazilCheckinDateKey(now);
    if (cadence === CADENCE_WEEKLY) return utcIsoWeekKey(now);
    return getBrazilCheckinDateKey(now);
  }

  if (cadence === CADENCE_DAILY) return utcDayKey(now);
  if (cadence === CADENCE_WEEKLY) return utcIsoWeekKey(now);
  return EVENT_PERIOD_KEY;
}
