import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import { Prisma } from "@prisma/client";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import { lockUserRowForUpdate } from "../../utils/transactionLocks.js";
import { getBrazilCheckinDateKey, addDaysToBrazilDateKey, normalizeBrazilDateKey } from "../../utils/checkinDate.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import loggerLib from "../../utils/logger.js";

const log = loggerLib.child("StreakRecovery");

const RECOVERY_FEE_PER_STREAK_DAY = 0.07;
const MAX_MISSED_DAYS = 3;

type AuthedRequest = Request & { user: { id: number } };

function requireUserId(req: Request): number {
  const id = (req as AuthedRequest).user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
  return id;
}

type RecoveryStatus =
  | { eligible: false; reason: "streak_active" | "already_checked_in_today" | "too_many_missed_days" | "no_streak" | "already_recovered" }
  | { eligible: true; lastStreak: number; missedDays: number; missedDateKeys: string[]; feePol: number };

async function computeRecoveryStatus(userId: number, now = new Date()): Promise<RecoveryStatus> {
  const todayKey = getBrazilCheckinDateKey(now);

  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    select: { checkinDate: true },
  });

  const confirmedKeys = new Set(
    rows.map((r) => normalizeBrazilDateKey(r.checkinDate)).filter(Boolean)
  );

  if (confirmedKeys.has(todayKey)) {
    return { eligible: false, reason: "already_checked_in_today" };
  }

  const missedDateKeys: string[] = [];
  let cursor = addDaysToBrazilDateKey(todayKey, -1);
  while (!confirmedKeys.has(cursor) && missedDateKeys.length < MAX_MISSED_DAYS) {
    missedDateKeys.push(cursor);
    cursor = addDaysToBrazilDateKey(cursor, -1);
  }

  if (missedDateKeys.length === 0) {
    return { eligible: false, reason: "streak_active" };
  }

  if (!confirmedKeys.has(cursor)) {
    return { eligible: false, reason: "too_many_missed_days" };
  }

  // Count uninterrupted streak ending at cursor
  let lastStreak = 0;
  let sc = cursor;
  while (confirmedKeys.has(sc)) {
    lastStreak++;
    sc = addDaysToBrazilDateKey(sc, -1);
  }

  if (lastStreak === 0) {
    return { eligible: false, reason: "no_streak" };
  }

  // Check if any missed day already has a row (recovery already done or pending checkin)
  const existing = await prisma.dailyCheckin.findMany({
    where: { userId, checkinDate: { in: missedDateKeys } },
    select: { checkinDate: true },
  });
  if (existing.length > 0) {
    return { eligible: false, reason: "already_recovered" };
  }

  const feePol = Math.round(RECOVERY_FEE_PER_STREAK_DAY * lastStreak * 100) / 100;

  return { eligible: true, lastStreak, missedDays: missedDateKeys.length, missedDateKeys, feePol };
}

export async function getStreakRecoveryStatus(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
    const status = await computeRecoveryStatus(userId);
    res.json(status);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return res.status(401).json({ error: "Unauthenticated" });
    log.error("getStreakRecoveryStatus", { error: String(err) });
    res.status(500).json({ error: "internal_error" });
  }
}

export async function payStreakRecovery(req: Request, res: Response) {
  const userId = requireUserId(req);

  try {
    const status = await computeRecoveryStatus(userId);

    if (!status.eligible) {
      return res.status(400).json({ error: "not_eligible", reason: status.reason });
    }

    const { lastStreak, missedDays, missedDateKeys, feePol } = status;

    const result = await prisma.$transaction(async (tx) => {
      await advisoryXactTryLockOrThrow(tx, `streak-recovery:${userId}`);
      await lockUserRowForUpdate(tx, userId);

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true },
      });

      const bal = user?.polBalance != null ? Number(user.polBalance) : 0;
      if (bal < feePol) {
        throw Object.assign(new Error("INSUFFICIENT_BALANCE"), { code: "INSUFFICIENT_BALANCE" });
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: new Prisma.Decimal(feePol) } },
      });

      // Insert synthetic confirmed rows for each missed day
      // missedDateKeys[0] = yesterday, missedDateKeys[n-1] = oldest missed day
      // streak order: oldest (lastStreak+1) → newest (lastStreak+missedDays)
      for (let i = 0; i < missedDateKeys.length; i++) {
        const dateKey = missedDateKeys[i];
        // missedDateKeys is sorted most-recent-first; oldest = last index
        const streakForRow = lastStreak + (missedDays - i);
        await tx.dailyCheckin.create({
          data: {
            userId,
            checkinDate: dateKey,
            confirmedAt: new Date(),
            txHash: `streak-recovery-${userId}-${dateKey}`,
            status: "confirmed",
            amount: 0,
            chainId: 0,
            paymentMethod: "streak_recovery",
            streak: streakForRow,
            usedGrace: false,
            usedFreeze: false,
          },
        });
      }

      await tx.checkinStreakRecovery.create({
        data: { userId, recoveredStreak: lastStreak, missedDays, feePolPaid: feePol },
      });

      return { feePol };
    });

    applyUserBalanceDelta(userId, -result.feePol);
    getMiningEngine()?.reloadMinerProfile(userId, { forceBalanceSync: true }).catch(() => undefined);

    log.info("streak_recovery_paid", { userId, lastStreak, missedDays, feePol });

    res.json({ success: true, feePaid: result.feePol, missedDays, restoredStreak: lastStreak });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({ error: "insufficient_balance" });
    }
    log.error("payStreakRecovery", { userId, error: String(err) });
    res.status(500).json({ error: "internal_error" });
  }
}
