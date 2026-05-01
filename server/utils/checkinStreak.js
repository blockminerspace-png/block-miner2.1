import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey, addDaysToBrazilDateKey, normalizeBrazilDateKey } from "./checkinDate.js";

export function computeCheckinStreakFromDateKeys(dateKeys, now = new Date()) {
  const normalizedDates = new Set();
  for (const rawKey of dateKeys || []) {
    const key = normalizeBrazilDateKey(rawKey);
    if (key) normalizedDates.add(key);
  }

  const today = getBrazilCheckinDateKey(now);
  let cursor = today;
  if (!normalizedDates.has(today)) {
    cursor = addDaysToBrazilDateKey(today, -1);
    if (!normalizedDates.has(cursor)) return 0;
  }

  let streak = 0;
  while (normalizedDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToBrazilDateKey(cursor, -1);
  }
  return streak;
}

/** Consecutive confirmed check-in days ending today (or yesterday if not checked in today). */
export async function computeCheckinStreak(userId, now = new Date()) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true }
  });
  return computeCheckinStreakFromDateKeys(
    rows.map((row) => row.checkinDate),
    now
  );
}
