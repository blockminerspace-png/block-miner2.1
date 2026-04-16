import prisma from "../src/db/prisma.js";
import { getBrazilCheckinDateKey } from "../utils/checkinDate.js";
import { computeCheckinStreak } from "../utils/checkinStreak.js";
import {
  assertValidTxHash,
  evaluateCheckinTx,
  normalizeAddr
} from "../services/checkinChain.js";
import {
  applyStreakMilestoneRewards,
  buildMilestoneStatusForUser
} from "../services/checkinMilestoneService.js";
import { notifyMiniPassLoginDay } from "../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskLoginDay } from "../services/dailyTasks/dailyTaskHookService.js";
import { logSecurityEvent, logSecurityWarn } from "../utils/securityLogger.js";

const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID || 137);
const ZERO = "0x0000000000000000000000000000000000000000";
const CHECKIN_REQUIRED_WEI = 10_000_000_000_000_000n; // 0.01 POL

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
 * Policy: check-in always uses a wallet on-chain payment (0.01 POL). There is no server-side “free” claim.
 * When no treasury is configured, the UI shows a configuration error — users cannot bypass with /checkin/claim.
 */
export function isCheckinPaymentRequired() {
  return true;
}

function getCheckinAmountWei() {
  return CHECKIN_REQUIRED_WEI;
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

async function getDailyRowForToday(userId) {
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

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = getCheckinAmountWei();
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

export async function tryFinalizePeriodicCheckinRow(row) {
  if (!row || row.status !== "pending") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = getCheckinAmountWei();
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
    await tryFinalizeCheckinRow(row).catch(() => {});
  }

  const pendingPeriodic = await prisma.periodicCheckin.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { walletAddress: true } } }
  });

  for (const row of pendingPeriodic) {
    await tryFinalizePeriodicCheckinRow(row).catch(() => {});
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
    const minWei = getCheckinAmountWei();

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
      checkinAmountWei: minWei.toString(),
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
      "Daily check-in requires a 0.01 POL Polygon payment from your linked wallet. Use the Check-in page wallet button; the server verifies every transaction."
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

  const existing = await prisma.dailyCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } }
  });
  if (existing?.status === "confirmed") {
    return jsonSuccessWithStreak(res, userId, {
      alreadyCheckedIn: true,
      status: "confirmed",
      cadence: "daily"
    });
  }

  const txHash = body.txHash;
  const minWei = getCheckinAmountWei();
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

  if (evalResult.state === "pending") {
    await prisma.dailyCheckin.upsert({
      where: { userId_checkinDate: { userId, checkinDate: today } },
      create: {
        userId,
        checkinDate: today,
        txHash,
        status: "pending",
        confirmedAt: null,
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      },
      update: {
        txHash,
        status: "pending",
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      }
    });
    return res.json({
      ok: false,
      pending: true,
      cadence: "daily",
      code: "TRANSACTION_NOT_CONFIRMED",
      message: "Transaction was sent but is still waiting for confirmation."
    });
  }

  if (evalResult.state === "failed") {
    await prisma.dailyCheckin.upsert({
      where: { userId_checkinDate: { userId, checkinDate: today } },
      create: {
        userId,
        checkinDate: today,
        txHash,
        status: "failed",
        confirmedAt: null,
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      },
      update: {
        txHash,
        status: "failed",
        amount: Number(minWei) / 1e18,
        chainId: POLYGON_CHAIN_ID
      }
    });
    return jsonCheckinError(
      res,
      400,
      "INVALID_TRANSACTION",
      evalResult.reason || "This transaction cannot be used for check-in."
    );
  }

  await prisma.dailyCheckin.upsert({
    where: { userId_checkinDate: { userId, checkinDate: today } },
    create: {
      userId,
      checkinDate: today,
      txHash,
      status: "confirmed",
      confirmedAt: new Date(),
      amount: Number(minWei) / 1e18,
      chainId: POLYGON_CHAIN_ID
    },
    update: {
      txHash,
      status: "confirmed",
      confirmedAt: new Date(),
      amount: Number(minWei) / 1e18,
      chainId: POLYGON_CHAIN_ID
    }
  });

  await applyStreakMilestoneRewards(userId);
  notifyMiniPassLoginDay(userId, today).catch(() => {});
  notifyDailyTaskLoginDay(userId, today).catch(() => {});

  logSecurityEvent(
    "checkin_wallet_confirm_success",
    { userId, walletLinked: true, checkinDate: today, txHash, cadence: "daily" },
    req
  );

  return jsonSuccessWithStreak(res, userId, {
    status: "confirmed",
    cadence: "daily"
  });
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
    message: "Balance check-in is disabled. Use the daily wallet check-in on the Check-in page (0.01 POL on Polygon)."
  });
}
