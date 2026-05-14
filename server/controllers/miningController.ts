import type { Request, Response } from "express";
import { getBlkCyclePublicSnapshot, runBlkRewardCycle } from "../services/blkRewardDistributionService.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import prisma from "../src/db/prisma.js";

function floor8(n: unknown): number {
  const x = Number(n);
  if (!(x > 0)) return 0;
  return Math.floor(x * 1e8 + 1e-12) / 1e8;
}

/** Public: current BLK emission window + last cycle */
export async function getCycle(_req: Request, res: Response): Promise<void> {
  try {
    const snap = await getBlkCyclePublicSnapshot();
    res.json({ ok: true, ...snap });
  } catch (e: unknown) {
    res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : String(e) || "Failed",
    });
  }
}

/**
 * Authenticated: user's hashrate (DB snapshot) + estimated BLK/cycle using last pool totals.
 */
export async function getRewardRate(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const userId = req.user.id;
    const [userHr, snap, lastLog] = await Promise.all([
      syncUserBaseHashRate(userId),
      getBlkCyclePublicSnapshot(),
      prisma.blkRewardLog.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { amount: true, createdAt: true, cycleId: true },
      }),
    ]);

    const hr = Number(userHr) || 0;
    const totalHrSnap = snap.lastCycle?.totalHashrate;
    const rewardPerCycle = snap.rewardPerCycle;
    let estimatedBlkPerCycle = 0;
    if (totalHrSnap !== undefined && totalHrSnap > 0 && hr > 0 && rewardPerCycle > 0) {
      estimatedBlkPerCycle = floor8(rewardPerCycle * (hr / totalHrSnap));
    }

    res.json({
      ok: true,
      userHashrate: hr,
      rewardPerCycle,
      lastCycleTotalHashrate: totalHrSnap ?? null,
      estimatedBlkPerCycle,
      estimateNote:
        totalHrSnap !== undefined && totalHrSnap > 0
          ? "Estimativa usa o total de hashrate do último ciclo distribuído; a rede pode variar."
          : "Ainda não há ciclo anterior; estimativa será preenchida após o primeiro ciclo.",
      lastUserPayout: lastLog
        ? {
            amount: Number(lastLog.amount),
            cycleId: lastLog.cycleId,
            createdAt: lastLog.createdAt,
          }
        : null,
      emissionPaused: snap.paused,
    });
  } catch (e: unknown) {
    res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : String(e) || "Failed",
    });
  }
}

/** Admin manual trigger (same idempotency as cron) */
export async function adminTriggerBlkCycle(_req: Request, res: Response): Promise<void> {
  try {
    const result = await runBlkRewardCycle();
    res.json({ ok: true, result });
  } catch (e: unknown) {
    res.status(500).json({
      ok: false,
      message: e instanceof Error ? e.message : String(e) || "Failed",
    });
  }
}
