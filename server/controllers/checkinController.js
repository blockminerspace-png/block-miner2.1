import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey, addDaysToBrazilDateKey } from "../utils/checkinDate.js";
import { assertValidTxHash, evaluateCheckinTx, normalizeAddr, parseCheckinAmountWei } from "../services/checkinChain.js";

const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const ZERO = "0x0000000000000000000000000000000000000000";

/** Deterministic placeholder tx hash for payment-free check-ins (unique per user + calendar day). */
export function syntheticFreeTxHash(userId, checkinDate) {
  const h = crypto.createHash("sha256").update(`bm-free-checkin|${userId}|${checkinDate}`).digest("hex");
  return `0x${h}`;
}

function isFreeSyntheticTx(txHash, userId, checkinDate) {
  if (!txHash || typeof txHash !== "string") return false;
  return txHash === syntheticFreeTxHash(userId, checkinDate);
}

function getReceiver() {
  return (process.env.CHECKIN_RECEIVER || "").trim();
}

function paymentCheckinEnabled() {
  const r = getReceiver();
  return Boolean(r && r.toLowerCase() !== ZERO);
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

async function loadRecentHistory(userId, take = 21) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    orderBy: { checkinDate: "desc" },
    take,
    select: { checkinDate: true, confirmedAt: true }
  });
  return rows.map((r) => ({
    date: r.checkinDate,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null
  }));
}

/**
 * Confirms or fails a pending row using on-chain data (legacy payment check-ins only).
 */
export async function tryFinalizeCheckinRow(row) {
  if (!row || row.status !== "pending") return row;
  if (isFreeSyntheticTx(row.txHash, row.userId, row.checkinDate)) return row;

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
    if (isFreeSyntheticTx(row.txHash, row.userId, row.checkinDate)) continue;
    await tryFinalizeCheckinRow(row).catch(() => {});
  }
}

export async function getStatus(req, res) {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true }
    });
    const wallet = user?.walletAddress || null;

    if (paymentCheckinEnabled()) {
      await tryFinalizeTodayCheckin(userId, wallet);
    }

    const row = await getTodayRow(userId);
    const [streak, recentCheckins, totalConfirmed] = await Promise.all([
      computeStreak(userId),
      loadRecentHistory(userId, 21),
      prisma.dailyCheckin.count({ where: { userId, status: "confirmed" } })
    ]);

    const pay = paymentCheckinEnabled();
    const minWei = parseCheckinAmountWei();

    res.json({
      ok: true,
      checkedIn: row?.status === "confirmed",
      pending: row?.status === "pending" && !isFreeSyntheticTx(row?.txHash, userId, row?.checkinDate),
      failed: row?.status === "failed",
      status: row?.status || null,
      txHash: row?.txHash || null,
      streak,
      totalConfirmed,
      recentCheckins,
      walletLinked: Boolean(wallet),
      paymentRequired: pay,
      checkinReceiver: pay ? getReceiver() : null,
      checkinAmountWei: pay ? minWei.toString() : "0",
      chainId: POLYGON_CHAIN_ID,
      rpcConfigured: pay && Boolean(process.env.AETHER_RPC_URL?.trim() || process.env.POLYGON_RPC_URL?.trim())
    });
  } catch (e) {
    console.error("Checkin getStatus:", e);
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

/**
 * Free daily check-in: one confirmed row per user per calendar day (America/Sao_Paulo).
 * Persists in DB — streak and history survive new days and new sessions.
 */
export async function claimCheckin(req, res) {
  try {
    const userId = req.user.id;
    const today = getBrazilCheckinDateKey();
    const txHash = syntheticFreeTxHash(userId, today);

    const existing = await prisma.dailyCheckin.findUnique({
      where: { userId_checkinDate: { userId, checkinDate: today } }
    });

    if (existing?.status === "confirmed") {
      const streak = await computeStreak(userId);
      const recentCheckins = await loadRecentHistory(userId, 21);
      return res.json({
        ok: true,
        alreadyCheckedIn: true,
        status: "confirmed",
        streak,
        recentCheckins
      });
    }

    await prisma.dailyCheckin.upsert({
      where: { userId_checkinDate: { userId, checkinDate: today } },
      create: {
        userId,
        checkinDate: today,
        txHash,
        status: "confirmed",
        confirmedAt: new Date(),
        amount: 0,
        chainId: POLYGON_CHAIN_ID
      },
      update: {
        txHash,
        status: "confirmed",
        confirmedAt: new Date(),
        amount: 0,
        chainId: POLYGON_CHAIN_ID
      }
    });

    const streak = await computeStreak(userId);
    const recentCheckins = await loadRecentHistory(userId, 21);

    return res.json({
      ok: true,
      status: "confirmed",
      streak,
      recentCheckins
    });
  } catch (error) {
    console.error("Checkin claim error:", error);
    res.status(500).json({ ok: false, message: "Unable to register check-in." });
  }
}

/** Legacy blockchain check-in (only if CHECKIN_RECEIVER is set). */
export async function confirmCheckin(req, res) {
  try {
    if (!paymentCheckinEnabled()) {
      return res.status(400).json({
        ok: false,
        message: "Pagamento on-chain desativado. Usa o botão de check-in diário (sem POL)."
      });
    }

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
      return res.json({
        ok: true,
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
