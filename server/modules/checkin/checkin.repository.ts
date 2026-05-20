import { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import {
  addDaysToBrazilDateKey,
  normalizeBrazilDateKey,
} from "../../utils/checkinDate.js";
import { getCheckinPeriodKey, getCheckinPeriodLookupKeys, isSameCheckinPeriod } from "../../utils/checkinPeriod.js";

export { prisma };

export function todayPeriodKey(now: Date = new Date()): string {
  return getCheckinPeriodKey(now);
}

export function buildDailyCheckinDayWhere(userId: number, dateOrKey: Date | string = new Date()) {
  const periodEndKey =
    typeof dateOrKey === "string"
      ? normalizeBrazilDateKey(dateOrKey) || getCheckinPeriodKey()
      : getCheckinPeriodKey(dateOrKey);
  return {
    userId,
    checkinDate: {
      in: getCheckinPeriodLookupKeys(periodEndKey),
    },
  };
}

export async function findDailyCheckinForDay(
  db: Pick<typeof prisma, "dailyCheckin">,
  userId: number,
  dateOrKey: Date | string = new Date(),
  extra: Record<string, unknown> = {},
) {
  return db.dailyCheckin.findFirst({
    where: buildDailyCheckinDayWhere(userId, dateOrKey),
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    ...extra,
  });
}

export async function writeDailyCheckinForDay(
  tx: Pick<typeof prisma, "dailyCheckin">,
  userId: number,
  normalizedDateKey: string,
  existingRow: { id: number } | null | undefined,
  data: Record<string, unknown>,
) {
  const normalized = normalizeBrazilDateKey(normalizedDateKey);
  if (!normalized) {
    throw new Error(`Invalid daily check-in key: ${String(normalizedDateKey)}`);
  }
  if (existingRow?.id) {
    return tx.dailyCheckin.update({
      where: { id: existingRow.id },
      data: {
        checkinDate: normalized,
        ...data,
      } as Prisma.DailyCheckinUpdateInput,
    });
  }
  return tx.dailyCheckin.create({
    data: {
      userId,
      checkinDate: normalized,
      ...data,
    } as Prisma.DailyCheckinUncheckedCreateInput,
  });
}

export async function countGraceUsesInMonth(userId: number, monthKey: string): Promise<number> {
  return prisma.dailyCheckin.count({
    where: {
      userId,
      status: "confirmed",
      usedGrace: true,
      checkinDate: { startsWith: monthKey },
    },
  });
}

export async function countFreezeUsesInMonth(userId: number, monthKey: string): Promise<number> {
  return prisma.dailyCheckin.count({
    where: {
      userId,
      status: "confirmed",
      usedFreeze: true,
      checkinDate: { startsWith: monthKey },
    },
  });
}

export async function loadRecentHistory(userId: number, take = 21) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      checkinDate: true,
      confirmedAt: true,
      paymentMethod: true,
      usedGrace: true,
      usedFreeze: true,
      streak: true,
    },
  });
  return rows.map((r) => ({
    date: normalizeBrazilDateKey(r.checkinDate) || r.checkinDate,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
    paymentMethod: r.paymentMethod,
    usedGrace: r.usedGrace,
    usedFreeze: r.usedFreeze,
    streak: r.streak,
  }));
}

export async function findConflictingCheckinTxHash(
  db: Pick<typeof prisma, "dailyCheckin">,
  txHash: string,
  userId: number,
  todayKey: string,
): Promise<"TX_ALREADY_USED" | null> {
  const row = await db.dailyCheckin.findUnique({ where: { txHash } });
  if (!row) return null;
  if (row.userId !== userId) return "TX_ALREADY_USED";
  const day = normalizeBrazilDateKey(row.checkinDate);
  if (row.status === "confirmed" && day && !isSameCheckinPeriod(day, todayKey)) {
    return "TX_ALREADY_USED";
  }
  return null;
}

export async function getUserWallet(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true, polBalance: true, isBanned: true },
  });
}

export function yesterdayKey(periodKey: string): string {
  return addDaysToBrazilDateKey(periodKey, -1);
}
