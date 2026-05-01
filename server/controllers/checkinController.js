import { createHash } from "crypto";
import prisma from "../src/db/prisma.js";
import { Prisma } from "../src/db/prismaNamespace.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { getBrazilCheckinDateKey, getBrazilDateKeyAliases, normalizeBrazilDateKey } from "../utils/checkinDate.js";
import { computeCheckinStreak } from "../utils/checkinStreak.js";
import {
  assertValidTxHash,
  evaluateCheckinTx,
  normalizeAddr,
  parseCheckinAmountWei,
  parseCheckinBalanceAmountWei
} from "../services/checkinChain.js";
import { advisoryXactTryLockOrThrow } from "../services/distributedLockService.js";
import { lockUserRowForUpdate } from "../utils/transactionLocks.js";
import {
  applyStreakMilestoneRewards,
  buildMilestoneStatusForUser
} from "../services/checkinMilestoneService.js";
import { notifyMiniPassLoginDay } from "../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskLoginDay } from "../services/dailyTasks/dailyTaskHookService.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { logSecurityEvent, logSecurityWarn } from "../utils/securityLogger.js";
import loggerLib, { logUserActivity } from "../utils/logger.js";

const checkinLog = loggerLib.child("Checkin");

function logCheckinSideEffectFailure(label, err) {
  checkinLog.warn(label, { error: err?.message || String(err) });
}

const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const ZERO = "0x0000000000000000000000000000000000000000";
const CHAIN_INTERNAL_CHECKIN = 0;

function getWalletCheckinWei() {
  return parseCheckinAmountWei();
}

function getBalanceCheckinWei() {
  return parseCheckinBalanceAmountWei();
}

function polDecimalFromWei(wei) {
  return new Prisma.Decimal(wei.toString()).div(new Prisma.Decimal("1000000000000000000"));
}

/** Deterministic placeholder tx hash for balance check-ins (satisfies unique `tx_hash`). */
export function balanceCheckinSyntheticTxHash(userId, checkinDate) {
  const h = createHash("sha256")
    .update(`bm:v2:daily-checkin:balance|${userId}|${checkinDate}`, "utf8")
    .digest("hex");
  return `0x${h}`;
}

/**
 * Treasury address for on-chain check-in (Polygon). CHECKIN_RECEIVER wins;
 * if unset or zero, falls back to DEPOSIT_WALLET_ADDRESS so staging is not
 * stuck when only the deposit treasury is configured.
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

/** Treasury (CHECKIN_RECEIVER / DEPOSIT_WALLET_ADDRESS) must exist to verify on-chain payments. */
function hasCheckinTreasury() {
  return Boolean(getReceiver());
}

/**
 * Policy: daily check-in requires either an on-chain wallet payment (default 0.01 POL) or
 * an in-game POL debit (default 0.03 POL). There is no free claim path.
 */
export function isCheckinPaymentRequired() {
  return true;
}

function jsonCheckinError(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

function parseCadenceFromBody(body) {
  const raw = typeof body?.cadence === "string" ? body.cadence.trim().toLowerCase() : "daily";
  if (raw === "daily") return "daily";
  return null;
}

function periodKeyForCadence(cadence, now = new Date()) {
  if (cadence === "daily") return getBrazilCheckinDateKey(now);
  return null;
}

function buildDailyCheckinDayWhere(userId, dateOrKey = new Date()) {
  return {
    userId,
    checkinDate: {
      in: getBrazilDateKeyAliases(dateOrKey)
    }
  };
}

async function findDailyCheckinForBrazilDay(db, userId, dateOrKey = new Date(), extra = {}) {
  return db.dailyCheckin.findFirst({
    where: buildDailyCheckinDayWhere(userId, dateOrKey),
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    ...extra
  });
}

async function writeDailyCheckinForBrazilDay(tx, userId, normalizedDateKey, existingRow, data) {
  const normalized = normalizeBrazilDateKey(normalizedDateKey);
  if (!normalized) {
    throw new Error(`Invalid daily check-in key: ${String(normalizedDateKey)}`);
  }
  if (existingRow?.id) {
    return tx.dailyCheckin.update({
      where: { id: existingRow.id },
      data: {
        checkinDate: normalized,
        ...data
      }
    });
  }
  return tx.dailyCheckin.create({
    data: {
      userId,
      checkinDate: normalized,
      ...data
    }
  });
}

async function getDailyRowForToday(userId) {
  return findDailyCheckinForBrazilDay(prisma, userId);
}

async function loadRecentHistory(userId, take = 21) {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, status: "confirmed" },
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take,
    select: { checkinDate: true, confirmedAt: true }
  });
  return rows.map((r) => ({
    date: normalizeBrazilDateKey(r.checkinDate) || r.checkinDate,
    confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null
  }));
}

function rowToCadenceSlice(row) {
  return {
    checkedIn: row?.status === "confirmed",
    pending: row?.status === "pending",
    failed: row?.status === "failed",
    status: row?.status || null,
    txHash: row?.txHash || null
  };
}

/**
 * Confirms or fails a pending row using on-chain data (legacy payment check-ins only).
 */
export async function tryFinalizeCheckinRow(row) {
  if (!row || row.status !== "pending") return row;
  if (row.paymentMethod === "balance") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = getWalletCheckinWei();
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
        chainId: POLYGON_CHAIN_ID,
        paymentMethod: "wallet"
      }
    });
    applyStreakMilestoneRewards(updated.userId).catch((e) =>
      logCheckinSideEffectFailure("applyStreakMilestoneRewards after finalize", e)
    );
    notifyMiniPassLoginDay(updated.userId, updated.checkinDate).catch((e) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after finalize", e)
    );
    notifyDailyTaskLoginDay(updated.userId, updated.checkinDate).catch((e) =>
      logCheckinSideEffectFailure("notifyDailyTaskLoginDay after finalize", e)
    );
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

export async function tryFinalizePeriodicCheckinRow(row) {
  if (!row || row.status !== "pending") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = getWalletCheckinWei();
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
    return prisma.periodicCheckin.update({
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
    return prisma.periodicCheckin.update({
      where: { id: row.id },
      data: { status: "failed" }
    });
  }

  return row;
}

export async function tryFinalizeTodayCheckin(userId, walletAddress) {
  const row = await getDailyRowForToday(userId);
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
    await tryFinalizeCheckinRow(row).catch((e) =>
      logCheckinSideEffectFailure("tryFinalizeCheckinRow stale pending", e)
    );
  }

  const pendingPeriodic = await prisma.periodicCheckin.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { walletAddress: true } } }
  });

  for (const row of pendingPeriodic) {
    await tryFinalizePeriodicCheckinRow(row).catch((e) =>
      logCheckinSideEffectFailure("tryFinalizePeriodicCheckinRow stale pending", e)
    );
  }
}

async function buildCadenceStatusBundle(userId, wallet, treasuryOk) {
  const todayKey = periodKeyForCadence("daily");
  let dailyRow = null;

  if (treasuryOk) {
    await tryFinalizeTodayCheckin(userId, wallet);
  }

  dailyRow = await prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: todayKey } }
  });

  const dailySlice = {
    ...rowToCadenceSlice(dailyRow),
    periodKey: todayKey
  };

  return {
    cadenceStatus: {
      daily: dailySlice
    }
  };
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
    const treasuryOk = hasCheckinTreasury();
    const walletWei = getWalletCheckinWei();
    const balanceWei = getBalanceCheckinWei();

    let streak = 0;
    let recentCheckins = [];
    let totalConfirmed = 0;
    let milestones = [];
    let statusDegraded = false;
    let cadenceStatus = null;

    try {
      const bundle = await buildCadenceStatusBundle(userId, wallet, treasuryOk);
      cadenceStatus = bundle.cadenceStatus;

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

    const dailyFromBundle = cadenceStatus?.daily;

    res.json({
      ok: true,
      statusDegraded,
      cadenceStatus: statusDegraded ? null : cadenceStatus,
      checkedIn: statusDegraded ? false : dailyFromBundle?.checkedIn ?? false,
      pending: statusDegraded ? false : dailyFromBundle?.pending ?? false,
      failed: statusDegraded ? false : dailyFromBundle?.failed ?? false,
      status: statusDegraded ? null : dailyFromBundle?.status ?? null,
      txHash: statusDegraded ? null : dailyFromBundle?.txHash ?? null,
      streak: statusDegraded ? 0 : streak,
      totalConfirmed: statusDegraded ? 0 : totalConfirmed,
      recentCheckins: statusDegraded ? [] : recentCheckins,
      recentWeekly: [],
      recentMonthly: [],
      walletLinked: Boolean(wallet),
      paymentRequired: true,
      checkinReceiver: getReceiver() || null,
      checkinAmountWei: walletWei.toString(),
      checkinBalanceAmountWei: balanceWei.toString(),
      chainId: POLYGON_CHAIN_ID,
      rpcConfigured:
        treasuryOk && Boolean(process.env.AETHER_RPC_URL?.trim() || process.env.POLYGON_RPC_URL?.trim()),
      milestones: statusDegraded ? [] : milestones,
      polBalance: statusDegraded ? 0 : polBalance
    });
  } catch (e) {
    console.error("Checkin getStatus:", e);
    res.status(500).json({ ok: false, message: "Unable to load check-in status." });
  }
}

export async function claimCheckin(req, res) {
  try {
    const userId = req.user?.id ?? null;
    if (!userId) {
      return jsonCheckinError(res, 401, "UNAUTHORIZED", "Authentication required.");
    }

    logSecurityWarn("checkin_claim_rejected_wallet_only", { userId, path: req.path }, req);
    return jsonCheckinError(
      res,
      400,
      "PAYMENT_REQUIRED",
      "Daily check-in requires payment: 0.01 POL from your linked wallet on Polygon (verified on-chain) or 0.03 POL debited from your in-game POL balance. Use the Check-in page."
    );
  } catch (e) {
    console.error("claimCheckin", e);
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}

function parseTxHashFromBody(body) {
  const txHashRaw = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  if (!txHashRaw) {
    return { error: { code: "INVALID_BODY", message: "Transaction hash is required." } };
  }
  try {
    return { txHash: assertValidTxHash(txHashRaw) };
  } catch {
    return { error: { code: "INVALID_TX_HASH", message: "Invalid transaction hash format." } };
  }
}

async function jsonSuccessWithStreak(res, userId, extra = {}) {
  const streak = await computeCheckinStreak(userId);
  const recentCheckins = await loadRecentHistory(userId, 21);
  return res.json({
    ok: true,
    streak,
    recentCheckins,
    ...extra
  });
}

/** On-chain POL daily check-in (CHECKIN_RECEIVER or DEPOSIT_WALLET_ADDRESS). */
export async function confirmCheckin(req, res) {
  try {
    const cadence = parseCadenceFromBody(req.body);
    if (cadence !== "daily") {
      return jsonCheckinError(
        res,
        400,
        "INVALID_CADENCE",
        "Only daily check-in is available. Send cadence: \"daily\" with your transaction hash."
      );
    }
    return await confirmDailyCheckin(req, res);
  } catch (error) {
    console.error("Checkin confirm error:", error);
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to confirm check-in." });
  }
}

async function confirmDailyCheckin(req, res) {
  const userId = req.user.id;
  const today = getBrazilCheckinDateKey();
  const body = parseTxHashFromBody(req.body);
  if (body.error) {
    return jsonCheckinError(res, 400, body.error.code, body.error.message);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { walletAddress: true }
  });
  const walletAddress = user?.walletAddress?.trim();
  if (!walletAddress) {
    logSecurityWarn("checkin_confirm_missing_wallet", { userId }, req);
    return jsonCheckinError(
      res,
      400,
      "WALLET_REQUIRED",
      "Link and verify your wallet on the Wallet page before check-in."
    );
  }

  const receiver = getReceiver();
  if (!receiver) {
    return jsonCheckinError(
      res,
      503,
      "CHECKIN_RECEIVER_NOT_CONFIGURED",
      "Check-in receiver is not configured on the server."
    );
  }

  const existingQuick = await findDailyCheckinForBrazilDay(prisma, userId, today);
  if (existingQuick?.status === "confirmed") {
    return jsonSuccessWithStreak(res, userId, {
      alreadyCheckedIn: true,
      status: "confirmed",
      cadence: "daily"
    });
  }

  const txHash = body.txHash;
  const minWei = getWalletCheckinWei();
  let evalResult;
  try {
    evalResult = await evaluateCheckinTx({
      txHash,
      userWalletLower: normalizeAddr(walletAddress),
      receiverLower: normalizeAddr(receiver),
      minValueWei: minWei
    });
  } catch (err) {
    logSecurityWarn(
      "checkin_confirm_blockchain_unavailable",
      { userId, reason: err?.message || "unknown_error" },
      req
    );
    return jsonCheckinError(
      res,
      503,
      "BLOCKCHAIN_UNAVAILABLE",
      "Could not reach blockchain providers to verify the check-in payment."
    );
  }

  const baseRow = {
    txHash,
    amount: Number(minWei) / 1e18,
    chainId: POLYGON_CHAIN_ID,
    paymentMethod: "wallet"
  };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await advisoryXactTryLockOrThrow(tx, `checkin:${userId}`);
      await lockUserRowForUpdate(tx, userId);

      const existing = await findDailyCheckinForBrazilDay(tx, userId, today);
      if (existing?.status === "confirmed") {
        return { type: "already" };
      }

      if (evalResult.state === "pending") {
        await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
          ...baseRow,
          status: "pending",
          confirmedAt: null
        });
        return { type: "pending" };
      }

      if (evalResult.state === "failed") {
        await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
          ...baseRow,
          status: "failed",
          confirmedAt: null
        });
        return { type: "failed", reason: evalResult.reason || "This transaction cannot be used for check-in." };
      }

      await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
        ...baseRow,
        status: "confirmed",
        confirmedAt: new Date()
      });
      return { type: "confirmed" };
    });

    if (outcome.type === "already") {
      return jsonSuccessWithStreak(res, userId, {
        alreadyCheckedIn: true,
        status: "confirmed",
        cadence: "daily"
      });
    }
    if (outcome.type === "pending") {
      return res.json({
        ok: false,
        pending: true,
        cadence: "daily",
        code: "TRANSACTION_NOT_CONFIRMED",
        message: "Transaction was sent but is still waiting for confirmation."
      });
    }
    if (outcome.type === "failed") {
      return jsonCheckinError(res, 400, "INVALID_TRANSACTION", outcome.reason);
    }

    await applyStreakMilestoneRewards(userId);
    notifyMiniPassLoginDay(userId, today).catch((e) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after wallet confirm", e)
    );
    notifyDailyTaskLoginDay(userId, today).catch((e) =>
      logCheckinSideEffectFailure("notifyDailyTaskLoginDay after wallet confirm", e)
    );

    logSecurityEvent(
      "checkin_wallet_confirm_success",
      { userId, walletLinked: true, checkinDate: today, txHash, cadence: "daily" },
      req
    );
    logUserActivity("CHECKIN_DAILY_CONFIRMED", req, {
      userId,
      checkinDate: today,
      cadence: "daily",
      paymentMethod: "wallet",
      txHash,
    });

    return jsonSuccessWithStreak(res, userId, {
      status: "confirmed",
      cadence: "daily"
    });
  } catch (err) {
    if (/** @type {any} */ (err)?.code === "DISTRIBUTED_LOCK_BUSY" || err?.code === "P2034") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_BUSY",
        "Another check-in request is in progress. Wait a moment and try again."
      );
    }
    console.error("confirmDailyCheckin transaction:", err);
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to confirm check-in." });
  }
}

/**
 * Wallet-based check-in: same verification path as POST /checkin/confirm (single source of truth).
 */
export async function checkinWallet(req, res) {
  return confirmCheckin(req, res);
}

/**
 * Deduct in-game POL (pool balance) for daily check-in — no on-chain tx, no treasury/RPC required.
 */
export async function checkinBalance(req, res) {
  const userId = req.user?.id ?? null;
  if (!userId) {
    return jsonCheckinError(res, 401, "UNAUTHORIZED", "Authentication required.");
  }
  const today = getBrazilCheckinDateKey();
  const balanceWei = getBalanceCheckinWei();
  const cost = polDecimalFromWei(balanceWei);
  const synthTx = balanceCheckinSyntheticTxHash(userId, today);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await advisoryXactTryLockOrThrow(tx, `checkin:${userId}`);
      await lockUserRowForUpdate(tx, userId);

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletAddress: true, polBalance: true, isBanned: true }
      });
      if (!user || user.isBanned) {
        const err = new Error("FORBIDDEN");
        /** @type {any} */ (err).code = "FORBIDDEN";
        throw err;
      }
      if (!user.walletAddress?.trim()) {
        const err = new Error("WALLET_REQUIRED");
        /** @type {any} */ (err).code = "WALLET_REQUIRED";
        throw err;
      }

      const existing = await findDailyCheckinForBrazilDay(tx, userId, today);
      if (existing?.status === "confirmed") {
        return { kind: "already" };
      }
      if (existing?.status === "pending") {
        const err = new Error("CHECKIN_PENDING_PAYMENT");
        /** @type {any} */ (err).code = "CHECKIN_PENDING_PAYMENT";
        throw err;
      }

      const bal = new Prisma.Decimal(user.polBalance != null ? user.polBalance.toString() : "0");
      if (bal.lt(cost)) {
        const err = new Error("INSUFFICIENT_BALANCE");
        /** @type {any} */ (err).code = "INSUFFICIENT_BALANCE";
        throw err;
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: cost } }
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true }
      });

      await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
        txHash: synthTx,
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(balanceWei) / 1e18,
        chainId: CHAIN_INTERNAL_CHECKIN,
        paymentMethod: "balance"
      });

      return { kind: "ok", polBalance: Number(updatedUser?.polBalance ?? 0), debit: Number(cost) };
    });

    if (outcome.kind === "already") {
      return jsonSuccessWithStreak(res, userId, {
        alreadyCheckedIn: true,
        status: "confirmed",
        cadence: "daily",
        paymentMethod: "balance"
      });
    }

    applyUserBalanceDelta(userId, -outcome.debit);
    getMiningEngine()?.reloadMinerProfile(userId, { forceBalanceSync: true }).catch((e) =>
      logCheckinSideEffectFailure("reloadMinerProfile after balance checkin", e)
    );

    await applyStreakMilestoneRewards(userId);
    notifyMiniPassLoginDay(userId, today).catch((e) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after balance checkin", e)
    );
    notifyDailyTaskLoginDay(userId, today).catch((e) =>
      logCheckinSideEffectFailure("notifyDailyTaskLoginDay after balance checkin", e)
    );

    logSecurityEvent(
      "checkin_balance_confirm_success",
      {
        userId,
        checkinDate: today,
        cadence: "daily",
        paymentMethod: "balance",
        amountPol: Number(balanceWei) / 1e18
      },
      req
    );
    logUserActivity("CHECKIN_DAILY_CONFIRMED", req, {
      userId,
      checkinDate: today,
      cadence: "daily",
      paymentMethod: "balance",
      amountPol: Number(balanceWei) / 1e18,
    });

    return jsonSuccessWithStreak(res, userId, {
      status: "confirmed",
      cadence: "daily",
      paymentMethod: "balance",
      polBalance: outcome.polBalance
    });
  } catch (err) {
    const code = /** @type {any} */ (err)?.code;
    if (code === "CHECKIN_PENDING_PAYMENT") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_PENDING_PAYMENT",
        "A wallet payment is already waiting for confirmation today. Wait for it to confirm or fail, then try again."
      );
    }
    if (code === "INSUFFICIENT_BALANCE") {
      return jsonCheckinError(
        res,
        400,
        "INSUFFICIENT_BALANCE",
        "Not enough in-game POL for balance check-in."
      );
    }
    if (code === "WALLET_REQUIRED") {
      return jsonCheckinError(
        res,
        400,
        "WALLET_REQUIRED",
        "Link and verify your wallet on the Wallet page before check-in."
      );
    }
    if (code === "FORBIDDEN") {
      return jsonCheckinError(res, 403, "FORBIDDEN", "Check-in is not available for this account.");
    }
    if (code === "DISTRIBUTED_LOCK_BUSY" || err?.code === "P2034") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_BUSY",
        "Another check-in request is in progress. Wait a moment and try again."
      );
    }
    console.error("checkinBalance:", err);
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}
