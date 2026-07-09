import { getBrazilCheckinDateKey } from "./checkinDate.js";
import { getNextDailyTaskResetAt } from "../services/dailyTasks/dailyTaskPeriod.js";

const MS_PER_DAY = 86_400_000;

/** Start of the current calendar day in America/Sao_Paulo. */
export function startOfBrazilDay(now = new Date()): Date {
  const next = getNextDailyTaskResetAt(now);
  return new Date(next.getTime() - MS_PER_DAY);
}

/** Next midnight in America/Sao_Paulo after `now`. */
export function endOfBrazilDay(now = new Date()): Date {
  return getNextDailyTaskResetAt(now);
}

export function msUntilBrazilDayReset(now = new Date()): number {
  return Math.max(0, endOfBrazilDay(now).getTime() - now.getTime());
}

export function isInstantBeforeBrazilDay(instant: Date, now = new Date()): boolean {
  return instant.getTime() < startOfBrazilDay(now).getTime();
}

export function isEarnedInBrazilDay(earnedAt: Date, now = new Date()): boolean {
  const t = earnedAt.getTime();
  return t >= startOfBrazilDay(now).getTime() && t < endOfBrazilDay(now).getTime();
}

export function brazilDayDailyResetMeta(now = new Date()) {
  return {
    timezone: "America/Sao_Paulo",
    localDate: getBrazilCheckinDateKey(now),
    nextResetAt: endOfBrazilDay(now).toISOString(),
    nextResetInMs: msUntilBrazilDayReset(now),
  };
}
