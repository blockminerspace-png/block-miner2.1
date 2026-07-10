import prisma from "../src/db/prisma.js";
import {
  addDaysToBrazilDateKey,
  getBrazilCheckinDateKey,
  normalizeBrazilDateKey,
} from "./checkinDate.js";
import {
  getCheckinPeriodKey,
  isPreviousPeriodEndKey,
  isSameCheckinPeriod,
  isWithinGraceForPeriod,
  periodHasConfirmedKey,
} from "./checkinPeriod.js";

export function computeCheckinStreakFromDateKeys(dateKeys: string[], now = new Date()) {
  const normalizedDates = new Set<string>();
  for (const rawKey of dateKeys || []) {
    const key = normalizeBrazilDateKey(rawKey);
    if (key) normalizedDates.add(key);
  }

  const today = getCheckinPeriodKey(now);
  let cursor = today;
  if (!periodHasConfirmedKey(normalizedDates, today)) {
    cursor = addDaysToBrazilDateKey(today, -1);
    if (!periodHasConfirmedKey(normalizedDates, cursor)) {
      const graceDay = addDaysToBrazilDateKey(today, -1);
      if (
        isWithinGraceForPeriod(graceDay, now) &&
        periodHasConfirmedKey(normalizedDates, addDaysToBrazilDateKey(today, -2))
      ) {
        cursor = addDaysToBrazilDateKey(today, -2);
      } else {
        return 0;
      }
    }
  }

  let streak = 0;
  while (periodHasConfirmedKey(normalizedDates, cursor)) {
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
  });

  const confirmedKeys = rows
    .map((r) => normalizeBrazilDateKey(r.checkinDate))
    .filter((k): k is string => Boolean(k));

  // Use the most recent period key by date comparison, not by DB row order.
  // DB ordering (confirmedAt DESC, id DESC) can put an older recovery row first
  // when multiple rows share the same confirmedAt (e.g. after streak recovery).
  const lastKey = confirmedKeys.reduce<string | null>((max, k) => (!max || k > max ? k : max), null);
  let lastStreak = 0;
  if (lastKey) {
    let cursor = lastKey;
    const confirmedSet = new Set(confirmedKeys);
    while (confirmedSet.has(cursor)) {
      lastStreak += 1;
      cursor = addDaysToBrazilDateKey(cursor, -1);
    }
  }

  const lastKeyStr = lastKey ?? "";

  if (isSameCheckinPeriod(lastKeyStr, periodKey)) {
    return { streakAfter: Math.max(lastStreak, 1), usedGrace: false, usedFreeze: false };
  }

  const yesterday = addDaysToBrazilDateKey(periodKey, -1);
  if (isPreviousPeriodEndKey(lastKeyStr, periodKey)) {
    return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: false };
  }

  if (isPreviousPeriodEndKey(lastKeyStr, yesterday) && isWithinGraceForPeriod(yesterday, now)) {
    const graceUses = await deps.countGraceUsesInMonth(input.userId, monthKey);
    if (graceUses < deps.maxGracePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: true, usedFreeze: false };
    }
  }

  if (deps.freezeEnabled && lastKey && isPreviousPeriodEndKey(lastKey, yesterday)) {
    const freezeUses = await deps.countFreezeUsesInMonth(input.userId, monthKey);
    if (freezeUses < deps.maxFreezePerMonth) {
      return { streakAfter: lastStreak + 1, usedGrace: false, usedFreeze: true };
    }
  }

  return { streakAfter: 1, usedGrace: false, usedFreeze: false };
}
