import { getBrazilCheckinDateKey } from "../../utils/checkinDate.js";
import {
  getNextDailyTaskResetAt,
  getDailyTaskPeriodKey,
} from "../../services/dailyTasks/dailyTaskPeriod.js";
import { RESET_TYPE_DAILY } from "./internal-offerwall.config.js";
import type { CompletionRow } from "./internal-offerwall.types.js";

/** Daily offerwall limits reset at midnight America/Sao_Paulo (not 00:00 UTC). */
export function getInternalOfferwallPeriodKey(now = new Date()): string {
  return getDailyTaskPeriodKey(now);
}

export function getNextInternalOfferwallResetAt(now = new Date()): Date {
  return getNextDailyTaskResetAt(now);
}

export function msUntilInternalOfferwallReset(now = new Date()): number {
  return Math.max(0, getNextInternalOfferwallResetAt(now).getTime() - now.getTime());
}

export function getInternalOfferwallBrazilDate(now = new Date()): string {
  return getBrazilCheckinDateKey(now);
}

/** Count completions for the active Brazil calendar day (includes legacy UTC period keys). */
export function countDailyCompletions(
  completionRows: CompletionRow[],
  periodKey: string,
  resetType: string,
): number {
  if (resetType !== RESET_TYPE_DAILY) {
    return completionRows.filter((r) => r.periodKey === periodKey).length;
  }
  return completionRows.filter((r) => {
    if (r.periodKey === periodKey) return true;
    if (!r.completedAt) return false;
    return getBrazilCheckinDateKey(r.completedAt) === periodKey;
  }).length;
}
