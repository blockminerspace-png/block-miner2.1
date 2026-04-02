import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey, addDaysToBrazilDateKey } from "../utils/checkinDate.js";
import { assertValidTxHash, evaluateCheckinTx, normalizeAddr, parseCheckinAmountWei } from "../services/checkinChain.js";

const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const ZERO = "0x0000000000000000000000000000000000000000";

function getReceiver() {
  return (process.env.CHECKIN_RECEIVER || "").trim();
}

function checkinConfigured(res) {
  const r = getReceiver();
  if (!r || r.toLowerCase() === ZERO) {
    res.status(503).json({ ok: false, message: "Check-in is not configured on the server." });
    return false;
  }
  return true;
}

async function getTodayRow(userId) {
  const today = getBrazilCheckinDateKey();
  return prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } }
  });
}

async function computeStreak(userId) {
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

function publicConfig() {
  const minWei = parseCheckinAmountWei();
  return {
    checkinReceiver: getReceiver(),
    checkinAmountWei: minWei.toString(),
    chainId: POLYGON_CHAIN_ID,
    rpcConfigured: Boolean(process.env.AETHER_RPC_URL?.trim() || process.env.POLYGON_RPC_URL?.trim())
  };
}

/**
 * Confirms or fails a pending row using on-chain data (any check-in date).
 */
export async function tryFinalizeCheckinRow(row) {
  if (!row || row.status !== "pending") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = parseCheckinAmountWei();
  let ev;
  try {
    ev = await evaluateCheckinTx({
      txHash: row.txHash,
      userWalletLower: normalizeAddr(wallet),
      receiverLower: normalizeAddr(receiver),
      minValueWei: minWei
    });
  } catch {
    return row;
  }

  if (ev.state === "confirmed") {
    return prisma.dailyCheckin.update({
      where: { id: row.id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      }
    });
  }

  if (ev.state === "failed") {
    return prisma.dailyCheckin.update({
      where: { id: row.id },
      data: { status: "failed" }
    });
  }

  return row;
}

export async function tryFinalizeTodayCheckin(userId, walletAddress) {
  const row = await getTodayRow(userId);
  if (!row || row.status !== "pending" || !walletAddress) return row;
  return tryFinalizeCheckinRow({ ...row, user: { walletAddress: walletAddress } });
}

export async function processStalePendingCheckins({ batchSize = 40 } = {}) {
  const since = new Date(Date.now() - 72 * 3600000);
  const pending = await prisma.dailyCheckin.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { walletAddress: true } } }
  });

  for (const row of pending) {
    await tryFinalizeCheckinRow(row).catch(() => {});
  }
}

export async function getStatus(req, res) {
  try {
    if (!checkinConfigured(res)) return;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletAddress: true }
    });
    const wallet = user?.walletAddress || null;

    await tryFinalizeTodayCheckin(req.user.id, wallet);

    const row = await getTodayRow(req.user.id);
    const streak = await computeStreak(req.user.id);
    const cfg = publicConfig();

    res.json({
      ok: true,
      checkedIn: row?.status === "confirmed",
      pending: row?.status === "pending",
      failed: row?.status === "failed",
      status: row?.status || null,
      txHash: row?.txHash || null,
      streak,
      walletLinked: Boolean(wallet),
      ...cfg
    });
  } catch (e) {
    console.error("Checkin getStatus:", e);
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

export async function confirmCheckin(req, res) {
  try {
    if (!checkinConfigured(res)) return;

    const receiver = getReceiver();
    const minWei = parseCheckinAmountWei();
    let txHash;
    try {
      txHash = assertValidTxHash(req.body?.txHash);
    } catch (e) {
      return res.status(400).json({ ok: false, message: e.message || "Invalid transaction hash." });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletAddress: true }
    });
    const wallet = user?.walletAddress?.trim();
    if (!wallet) {
      return res.status(400).json({
        ok: false,
        message: "Link and verify your wallet in the Wallet page before check-in."
      });
    }
    const userWalletLower = normalizeAddr(wallet);

    const today = getBrazilCheckinDateKey();
    const existing = await prisma.dailyCheckin.findUnique({
      where: { userId_checkinDate: { userId: req.user.id, checkinDate: today } }
    });

    if (existing?.status === "confirmed") {
      return res.json({ ok: true, alreadyCheckedIn: true, status: "confirmed" });
    }

    const dup = await prisma.dailyCheckin.findUnique({ where: { txHash } });
    if (dup && dup.userId !== req.user.id) {
      return res.status(400).json({ ok: false, message: "This transaction is already used by another account." });
    }
    if (dup && dup.userId === req.user.id && dup.checkinDate !== today) {
      return res.status(400).json({
        ok: false,
        message: "This transaction was already used for a previous check-in day."
      });
    }

    if (existing?.status === "pending" || existing?.status === "failed") {
      await prisma.dailyCheckin.update({
        where: { id: existing.id },
        data: { txHash, status: "pending", confirmedAt: null }
      });
    } else if (!existing) {
      await prisma.dailyCheckin.create({
        data: {
          userId: req.user.id,
          checkinDate: today,
          txHash,
          status: "pending",
          chainId: POLYGON_CHAIN_ID,
          amount: Number(minWei) / 1e18
        }
      });
    }

    let ev;
    try {
      ev = await evaluateCheckinTx({
        txHash,
        userWalletLower,
        receiverLower: normalizeAddr(receiver),
        minValueWei: minWei
      });
    } catch (e) {
      console.error("Checkin RPC error:", e.message);
      return res.status(502).json({
        ok: false,
        pending: true,
        message: "Blockchain temporarily unavailable. Your check-in is saved; refresh in a moment."
      });
    }

    if (ev.state === "pending") {
      return res.json({
        ok: true,
        pending: true,
        message: "Transaction received. Waiting for blockchain confirmation — you can leave this page; open Check-in again later."
      });
    }

    if (ev.state === "failed") {
      await prisma.dailyCheckin.updateMany({
        where: { userId: req.user.id, checkinDate: today },
        data: { status: "failed" }
      });
      return res.status(400).json({ ok: false, message: ev.reason || "Invalid transaction." });
    }

    const updated = await prisma.dailyCheckin.update({
      where: { userId_checkinDate: { userId: req.user.id, checkinDate: today } },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      }
    });

    return res.json({ ok: true, status: "confirmed", txHash: updated.txHash });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ ok: false, message: "Unable to verify check-in." });
  }
}
