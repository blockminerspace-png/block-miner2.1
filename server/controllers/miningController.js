import { getBlkCyclePublicSnapshot, runBlkRewardCycle } from "../services/blkRewardDistributionService.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import prisma from "../src/db/prisma.js";

function floor8(n) {
  const x = Number(n);
  if (!(x > 0)) return 0;
  return Math.floor(x * 1e8 + 1e-12) / 1e8;
}

/** Public: current BLK emission window + last cycle */
export async function getCycle(req, res) {
  try {
    const snap = await getBlkCyclePublicSnapshot();
    res.json({ ok: true, ...snap });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Failed" });
  }
}

/**
 * Authenticated: user's hashrate (DB snapshot) + estimated BLK/cycle using last pool totals.
 */
export async function getRewardRate(req, res) {
  try {
    const userId = req.user.id;
    const [userHr, snap, lastLog] = await Promise.all([
      syncUserBaseHashRate(userId),
      getBlkCyclePublicSnapshot(),
      prisma.blkRewardLog.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { amount: true, createdAt: true, cycleId: true }
      })
    ]);

    const hr = Number(userHr) || 0;
    const totalHr = snap.lastCycle?.totalHashrate;
    const rewardPerCycle = snap.rewardPerCycle;
    let estimatedBlkPerCycle = 0;
    if (totalHr > 0 && hr > 0 && rewardPerCycle > 0) {
      estimatedBlkPerCycle = floor8(rewardPerCycle * (hr / totalHr));
    }

    res.json({
      ok: true,
      userHashrate: hr,
      rewardPerCycle,
      lastCycleTotalHashrate: totalHr ?? null,
      estimatedBlkPerCycle,
      estimateNote:
        totalHr > 0
          ? "Estimativa usa o total de hashrate do último ciclo distribuído; a rede pode variar."
          : "Ainda não há ciclo anterior; estimativa será preenchida após o primeiro ciclo.",
      lastUserPayout: lastLog
        ? {
            amount: Number(lastLog.amount),
            cycleId: lastLog.cycleId,
            createdAt: lastLog.createdAt
          }
        : null,
      emissionPaused: snap.paused
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Failed" });
  }
}

/** Admin manual trigger (same idempotency as cron) */
export async function adminTriggerBlkCycle(req, res) {
  try {
    const result = await runBlkRewardCycle();
    res.json({ ok: true, result });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || "Failed" });
  }
}
