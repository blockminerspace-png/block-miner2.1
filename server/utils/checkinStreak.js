import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey, addDaysToBrazilDateKey } from "./checkinDate.js";

/** Consecutive confirmed check-in days ending today (or yesterday if not checked in today). */
export async function computeCheckinStreak(userId) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true }
  });
  const dates = new Set(rows.map((r) => r.checkinDate));
  const today = getBrazilCheckinDateKey();
  let cursor = today;
  if (!dates.has(today)) {
    cursor = addDaysToBrazilDateKey(today, -1);
    if (!dates.has(cursor)) return 0;
  }
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDaysToBrazilDateKey(cursor, -1);
  }
  return streak;
}
