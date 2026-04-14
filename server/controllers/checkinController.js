import crypto from "crypto";
import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";
import { computeCheckinStreak } from "../utils/checkinStreak.js";
import { assertValidTxHash, evaluateCheckinTx, normalizeAddr, parseCheckinAmountWei } from "../services/checkinChain.js";
import {
  applyStreakMilestoneRewards,
  buildMilestoneStatusForUser
} from "../services/checkinMilestoneService.js";
import { notifyMiniPassLoginDay } from "../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskLoginDay } from "../services/dailyTasks/dailyTaskHookService.js";
import { logSecurityEvent, logSecurityWarn } from "../utils/securityLogger.js";

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

/**
 * Treasury address for on-chain check-in (Polygon). CHECKIN_RECEIVER wins;
 * if unset or zero, falls back to DEPOSIT_WALLET_ADDRESS so staging is not
 * stuck on free check-in when only the deposit treasury is configured.
 */
export function resolveCheckinReceiverFromEnv(env = process.env) {
  for (const key of ["CHECKIN_RECEIVER", "DEPOSIT_WALLET_ADDRESS"]) {
    const r = (env[key] || "").trim();
    if (r && r.toLowerCase() !== ZERO) return r;
  }
  return "";
}

function getReceiver() {
  return resolveCheckinReceiverFromEnv();
}

function paymentCheckinEnabled() {
  return Boolean(getReceiver());
}

/** Exported for tests: when true, free `/checkin/claim` must be rejected. */
export function isCheckinPaymentRequired() {
  return paymentCheckinEnabled();
}

function jsonCheckinError(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

async function getTodayRow(userId) {
  const today = getBrazilCheckinDateKey();
  return prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } }
  });
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
    const updated = await prisma.dailyCheckin.update({
      where: { id: row.id },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      }
    });
    applyStreakMilestoneRewards(updated.userId).catch(() => {});
    notifyMiniPassLoginDay(updated.userId, updated.checkinDate).catch(() => {});
    notifyDailyTaskLoginDay(updated.userId, updated.checkinDate).catch(() => {});
    return updated;
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
      select: { walletAddress: true, polBalance: true }
    });
    const wallet = user?.walletAddress || null;
    const polBalance = user?.polBalance != null ? Number(user.polBalance) : 0;
    const pay = paymentCheckinEnabled();
    const minWei = parseCheckinAmountWei();

    let row = null;
    let streak = 0;
    let recentCheckins = [];
    let totalConfirmed = 0;
    let milestones = [];
    let statusDegraded = false;

    try {
      if (pay) {
        await tryFinalizeTodayCheckin(userId, wallet);
      }
      row = await getTodayRow(userId);
      streak = await computeCheckinStreak(userId);
      [recentCheckins, totalConfirmed, milestones] = await Promise.all([
        loadRecentHistory(userId, 21),
        prisma.dailyCheckin.count({ where: { userId, status: "confirmed" } }),
        buildMilestoneStatusForUser(userId, streak).catch((err) => {
          console.error("checkin getStatus: milestones unavailable", err?.message);
          return [];
        })
      ]);
    } catch (dbErr) {
      statusDegraded = true;
      console.error("checkin getStatus: daily_checkins / milestones DB error", dbErr?.message || dbErr);
    }

    res.json({
      ok: true,
      statusDegraded,
      checkedIn: statusDegraded ? false : row?.status === "confirmed",
      pending: statusDegraded ? false : row?.status === "pending" && !isFreeSyntheticTx(row?.txHash, userId, row?.checkinDate),
      failed: statusDegraded ? false : row?.status === "failed",
      status: statusDegraded ? null : row?.status || null,
      txHash: statusDegraded ? null : row?.txHash || null,
      streak: statusDegraded ? 0 : streak,
      totalConfirmed: statusDegraded ? 0 : totalConfirmed,
      recentCheckins: statusDegraded ? [] : recentCheckins,
      walletLinked: Boolean(wallet),
      paymentRequired: pay,
      checkinReceiver: pay ? getReceiver() : null,
      checkinAmountWei: pay ? minWei.toString() : "0",
      chainId: POLYGON_CHAIN_ID,
      rpcConfigured: pay && Boolean(process.env.AETHER_RPC_URL?.trim() || process.env.POLYGON_RPC_URL?.trim()),
      milestones: statusDegraded ? [] : milestones,
      polBalance: statusDegraded ? 0 : polBalance
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

    if (paymentCheckinEnabled()) {
      logSecurityWarn(
        "checkin_free_claim_rejected_payment_required",
        { userId, path: req.path },
        req
      );
      return jsonCheckinError(
        res,
        400,
        "PAYMENT_REQUIRED",
        "On-chain POL payment is required. Use wallet check-in; the server verifies every transaction."
      );
    }

    const today = getBrazilCheckinDateKey();
    const txHash = syntheticFreeTxHash(userId, today);

    const existing = await prisma.dailyCheckin.findUnique({
      where: { userId_checkinDate: { userId, checkinDate: today } }
    });

    if (existing?.status === "confirmed") {
      const streak = await computeCheckinStreak(userId);
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

    await applyStreakMilestoneRewards(userId);
    notifyMiniPassLoginDay(userId, today).catch(() => {});
    notifyDailyTaskLoginDay(userId, today).catch(() => {});

    const streak = await computeCheckinStreak(userId);
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

/** On-chain POL check-in when a treasury address is configured (CHECKIN_RECEIVER or DEPOSIT_WALLET_ADDRESS). */
export async function confirmCheckin(req, res) {
  try {
    if (!paymentCheckinEnabled()) {
      return jsonCheckinError(
        res,
        400,
        "CHECKIN_PAYMENT_DISABLED",
        "On-chain check-in payment is disabled. Use the free daily check-in instead."
      );
    }

    const receiver = getReceiver();
    const minWei = parseCheckinAmountWei();
    let txHash;
    try {
      txHash = assertValidTxHash(req.body?.txHash);
    } catch (e) {
      logSecurityWarn(
        "checkin_invalid_tx_hash",
        { userId: req.user.id, code: e?.code },
        req
      );
      return jsonCheckinError(res, 400, "INVALID_TRANSACTION", e.message || "Invalid transaction hash.");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { walletAddress: true }
    });
    const wallet = user?.walletAddress?.trim();
    if (!wallet) {
      return jsonCheckinError(
        res,
        400,
        "PAYMENT_REQUIRED",
        "Link and verify your wallet on the Wallet page before check-in."
      );
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
      logSecurityWarn(
        "checkin_tx_reuse_other_user",
        { userId: req.user.id, txHash: `${txHash.slice(0, 10)}…` },
        req
      );
      return jsonCheckinError(
        res,
        400,
        "TRANSACTION_ALREADY_USED",
        "This transaction is already linked to another account."
      );
    }
    if (dup && dup.userId === req.user.id && dup.checkinDate !== today) {
      logSecurityWarn(
        "checkin_tx_reuse_previous_day",
        { userId: req.user.id, txHash: `${txHash.slice(0, 10)}…` },
        req
      );
      return jsonCheckinError(
        res,
        400,
        "TRANSACTION_ALREADY_USED",
        "This transaction was already used for a previous check-in day."
      );
    }

    if (dup && dup.userId === req.user.id && dup.checkinDate === today && dup.status === "confirmed") {
      return res.json({ ok: true, alreadyCheckedIn: true, status: "confirmed" });
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

    logSecurityEvent("checkin_payment_verify_attempt", { userId: req.user.id }, req);

    let ev;
    try {
      ev = await evaluateCheckinTx({
        txHash,
        userWalletLower,
        receiverLower: normalizeAddr(receiver),
        minValueWei: minWei,
        missingTxBehavior: "failed"
      });
    } catch (e) {
      console.error("Checkin RPC error:", e.message);
      logSecurityWarn(
        "checkin_blockchain_verify_unavailable",
        { userId: req.user.id, err: e.message },
        req
      );
      return jsonCheckinError(
        res,
        503,
        "BLOCKCHAIN_UNAVAILABLE",
        "Blockchain verification is temporarily unavailable. Try again in a few minutes."
      );
    }

    if (ev.state === "pending") {
      return res.status(200).json({
        ok: false,
        code: "TRANSACTION_NOT_CONFIRMED",
        pending: true,
        message:
          "Transaction found but not yet confirmed. Wait for block confirmations and open Check-in again — progress is saved."
      });
    }

    if (ev.state === "failed") {
      await prisma.dailyCheckin.updateMany({
        where: { userId: req.user.id, checkinDate: today },
        data: { status: "failed" }
      });
      logSecurityWarn(
        "checkin_payment_validation_failed",
        { userId: req.user.id, reason: ev.reason },
        req
      );
      return jsonCheckinError(
        res,
        400,
        "INVALID_TRANSACTION",
        ev.reason || "Payment validation failed."
      );
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

    logSecurityEvent("checkin_payment_confirmed", { userId: req.user.id }, req);

    await applyStreakMilestoneRewards(req.user.id);
    notifyMiniPassLoginDay(req.user.id, today).catch(() => {});
    notifyDailyTaskLoginDay(req.user.id, today).catch(() => {});

    return res.json({ ok: true, status: "confirmed", txHash: updated.txHash });
  } catch (error) {
    console.error("Checkin error:", error);
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to verify check-in." });
  }
}

/**
 * Wallet-based check-in: same verification path as POST /checkin/confirm (single source of truth).
 */
export async function checkinWallet(req, res) {
  return confirmCheckin(req, res);
}

/**
 * Balance-based check-in was removed; check-in is wallet-only (on-chain POL).
 */
export async function checkinBalance(_req, res) {
  return res.status(410).json({
    ok: false,
    code: "CHECKIN_BALANCE_DISABLED",
    message: "Balance check-in is disabled. Pay 0.01 POL from your wallet on Polygon; the server verifies on-chain."
  });
}
