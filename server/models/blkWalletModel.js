import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { getBlkEconomyConfig } from "./blkEconomyModel.js";

const TX_CONVERT = "blk_convert";

function round8(n) {
  return Math.round(Number(n) * 1e8) / 1e8;
}

function startUtcDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function estimatePolToBlk(config, polGross) {
  const pol = Number(polGross);
  if (!(pol > 0) || !Number.isFinite(pol)) return null;
  const bps = config.convertFeeBps;
  const feePol = round8((pol * bps) / 10000);
  const netPol = round8(pol - feePol);
  const polPerBlk = Number(config.polPerBlk);
  const blkOut = round8(netPol / polPerBlk);
  return { polGross: pol, feePol, netPol, blkOut, polPerBlk };
}

async function assertConvertRules(tx, userId, config, polGross, blkOut) {
  if (polGross < Number(config.minConvertPol)) {
    throw new Error(`Minimum conversion is ${Number(config.minConvertPol)} POL`);
  }
  if (blkOut <= 0) throw new Error("Converted BLK amount rounds to zero; increase POL amount");

  const last = await tx.transaction.findFirst({
    where: { userId, type: TX_CONVERT, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true }
  });
  if (last?.createdAt && config.convertCooldownSec > 0) {
    const elapsed = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
    if (elapsed < config.convertCooldownSec) {
      const wait = Math.ceil(config.convertCooldownSec - elapsed);
      throw new Error(`Conversion cooldown: wait ${wait}s`);
    }
  }

  if (config.dailyConvertLimitBlk != null) {
    const cap = Number(config.dailyConvertLimitBlk);
    const agg = await tx.transaction.aggregate({
      where: {
        userId,
        type: TX_CONVERT,
        status: "completed",
        createdAt: { gte: startUtcDay() }
      },
      _sum: { amount: true }
    });
    const used = Number(agg._sum.amount || 0);
    if (used + blkOut > cap + 1e-12) {
      throw new Error(`Daily BLK conversion limit exceeded (cap ${cap} BLK)`);
    }
  }
}

/**
 * Convert POL → BLK (server-side). BLK is not withdrawable — in-app balance only.
 */
export async function convertPolToBlk(userId, polAmountInput) {
  const polGross = round8(Number(polAmountInput));
  const config = await getBlkEconomyConfig();
  const est = estimatePolToBlk(config, polGross);
  if (!est) throw new Error("Invalid POL amount");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");
    if (user.isBanned) throw new Error("Account restricted");

    await assertConvertRules(tx, userId, config, polGross, est.blkOut);

    if (user.polBalance.lt(polGross)) throw new Error("Insufficient POL balance");

    await tx.user.update({
      where: { id: userId },
      data: {
        polBalance: { decrement: String(polGross) },
        blkBalance: { increment: String(est.blkOut) }
      }
    });

    applyUserBalanceDelta(userId, -polGross);

    const meta = JSON.stringify({
      polGross: est.polGross,
      polFee: est.feePol,
      polNet: est.netPol,
      blkOut: est.blkOut,
      polPerBlk: est.polPerBlk
    });

    const row = await tx.transaction.create({
      data: {
        userId,
        type: TX_CONVERT,
        amount: String(est.blkOut),
        fee: String(est.feePol),
        status: "completed",
        completedAt: new Date(),
        rawTx: meta
      }
    });

    return { transaction: row, ...est };
  });
}
