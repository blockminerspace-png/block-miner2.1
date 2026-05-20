import prisma from "../src/db/prisma.js";
import {
  addDaysToBrazilDateKey,
  getBrazilCheckinDateKey,
  normalizeBrazilDateKey,
} from "./checkinDate.js";
import { getCheckinPeriodKey, isWithinGraceForPeriod } from "./checkinPeriod.js";

export function computeCheckinStreakFromDateKeys(dateKeys: string[], now = new Date()) {
  const normalizedDates = new Set<string>();
  for (const rawKey of dateKeys || []) {
    const key = normalizeBrazilDateKey(rawKey);
    if (key) normalizedDates.add(key);
  }

  const today = getCheckinPeriodKey(now);
  let cursor = today;
  if (!normalizedDates.has(today)) {
    cursor = addDaysToBrazilDateKey(today, -1);
    if (!normalizedDates.has(cursor)) {
      const graceDay = addDaysToBrazilDateKey(today, -1);
      if (isWithinGraceForPeriod(graceDay, now) && normalizedDates.has(addDaysToBrazilDateKey(today, -2))) {
        cursor = addDaysToBrazilDateKey(today, -2);
      } else {
        return 0;
      }
    }
  }

  let streak = 0;
  while (normalizedDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToBrazilDateKey(cursor, -1);
  }
  return streak;
}

/** Consecutive confirmed check-in days ending today (or yesterday / grace window). */
export async function computeCheckinStreak(userId: number, now = new Date()) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true },
  });
  return computeCheckinStreakFromDateKeys(
    rows.map((row) => row.checkinDate),
    now,
  );
}

export type StreakAdvanceInput = {
  userId: number;
  periodKey: string;
  now?: Date;
};

export type StreakAdvanceResult = {
  streakAfter: number;
  usedGrace: boolean;
  usedFreeze: boolean;
};

/**
 * Computes streak after a new confirmation for periodKey (does not persist).
 */
export async function computeStreakAfterCheckin(
  input: StreakAdvanceInput,
  deps: {
    countGraceUsesInMonth: (userId: number, monthKey: string) => Promise<number>;
    countFreezeUsesInMonth: (userId: number, monthKey: string) => Promise<number>;
    maxGracePerMonth: number;
    maxFreezePerMonth: number;
    freezeEnabled: boolean;
  },
): Promise<StreakAdvanceResult> {
  const now = input.now ?? new Date();
  const periodKey = normalizeBrazilDateKey(input.periodKey) || getCheckinPeriodKey(now);
  const monthKey = periodKey.slice(0, 7);

  const rows = await prisma.dailyCheckin.findMany({
    where: { userId: input.userId, status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
    select: { checkinDate: true, streak: true },
    take: 30,
  });

  const confirmedKeys = rows
    .map((r) => normalizeBrazilDateKey(r.checkinDate))
    .filter((k): k is string => Boolean(k));

  const lastKey = confirmedKeys[0] ?? null;
  const lastStreak = rows[0]?.streak ?? 0;

  if (lastKey === periodKey) {
    return { streakAfter: Math.max(lastStreak, 1), usedGrace: false, usedFreeze: false };
  }

  const yesterday = addDaysToBrazilDateKey(periodKey, -1);
  if (lastKey === yesterday) {
    return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: false };
  }

  const dayBefore = addDaysToBrazilDateKey(periodKey, -2);
  if (lastKey === dayBefore && isWithinGraceForPeriod(yesterday, now)) {
    const graceUses = await deps.countGraceUsesInMonth(input.userId, monthKey);
    if (graceUses < deps.maxGracePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: true, usedFreeze: false };
    }
  }

  if (
    deps.freezeEnabled &&
    lastKey &&
    lastKey === dayBefore &&
    addDaysToBrazilDateKey(lastKey, 1) === yesterday
  ) {
    const freezeUses = await deps.countFreezeUsesInMonth(input.userId, monthKey);
    if (freezeUses < deps.maxFreezePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: true };
    }
  }

  return { streakAfter: 1, usedGrace: false, usedFreeze: false };
}
