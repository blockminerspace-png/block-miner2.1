import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import { Prisma } from "@prisma/client";
import type { DailyCheckin } from "@prisma/client";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import {
  addDaysToBrazilDateKey,
  getBrazilCheckinDateKey,
  getBrazilDateKeyAliases,
  normalizeBrazilDateKey,
} from "../../utils/checkinDate.js";
import { computeCheckinStreak, computeStreakAfterCheckin } from "../../utils/checkinStreak.js";
import { getCheckinPeriodKey, getGraceEndsAt, getNextResetAt } from "../../utils/checkinPeriod.js";
import {
  allowsOffchainCheckin,
  allowsWalletCheckin,
  getCheckinGraceHours,
  getCheckinMaxFreezeUsesPerMonth,
  getCheckinMaxGraceUsesPerMonth,
  getCheckinMode,
  isCheckinStreakFreezeEnabled,
  requiresWalletForOffchainCheckin,
} from "./checkin.config.js";
import {
  countFreezeUsesInMonth,
  countGraceUsesInMonth,
} from "./checkin.repository.js";
import {
  assertValidTxHash,
  normalizeAddr,
  parseCheckinAmountWei,
  parseCheckinBalanceAmountWei
} from "../../services/checkinChain.js";
import {
  assertValidWalletAddress,
  evaluateCheckinPayment,
  getExpectedCheckinChainId,
  parseOptionalChainIdFromBody,
  resolveCheckinContractAddress
} from "./checkin.contract.js";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import { lockUserRowForUpdate } from "../../utils/transactionLocks.js";
import {
  applyStreakMilestoneRewards,
  buildMilestoneStatusForUser,
  buildUpcomingMilestones,
} from "./checkin.rewards.js";
import { notifyMiniPassLoginDay } from "../../services/miniPass/miniPassMissionHookService.js";
import { notifyDailyTaskLoginDay } from "../../services/dailyTasks/dailyTaskHookService.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { logSecurityEvent, logSecurityWarn } from "../../utils/securityLogger.js";
import loggerLib, { logUserActivity } from "../../utils/logger.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import { respondPrismaAwareError } from "../../utils/prismaHttpErrors.js";

const checkinLog = loggerLib.child("Checkin");

type AuthedRequest = Request & { user: { id: number } };

function requireUserId(req: Request): number {
  const id = (req as AuthedRequest).user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new Error("UNAUTHENTICATED");
  }
  return id;
}

function logCheckinSideEffectFailure(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  checkinLog.warn(label, { error: msg });
}

const ZERO = "0x0000000000000000000000000000000000000000";
const CHAIN_INTERNAL_CHECKIN = 0;

function getWalletCheckinWei(): bigint {
  return parseCheckinAmountWei();
}

function getBalanceCheckinWei(): bigint {
  return parseCheckinBalanceAmountWei();
}

function polDecimalFromWei(wei: bigint): Prisma.Decimal {
  return new Prisma.Decimal(wei.toString()).div(new Prisma.Decimal("1000000000000000000"));
}

/** Deterministic placeholder tx hash for balance check-ins (satisfies unique `tx_hash`). */
export function balanceCheckinSyntheticTxHash(userId: number, checkinDate: string): string {
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
export function resolveCheckinReceiverFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  for (const key of ["CHECKIN_RECEIVER", "DEPOSIT_WALLET_ADDRESS"] as const) {
    const r = String(env[key] ?? "").trim();
    if (r && r.toLowerCase() !== ZERO) return r;
  }
  return "";
}

function getReceiver(): string {
  return resolveCheckinReceiverFromEnv();
}

/** Treasury or CHECKIN_CONTRACT_ADDRESS must exist to verify on-chain payments. */
function hasCheckinTreasury(): boolean {
  return Boolean(getReceiver()) || Boolean(resolveCheckinContractAddress());
}

/**
 * Policy: daily check-in requires either an on-chain wallet payment (default 0.01 POL) or
 * an in-game POL debit (default 0.03 POL). There is no free claim path.
 */
export function isCheckinPaymentRequired(): boolean {
  return true;
}

function jsonCheckinError(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, code, message });
}

function parseCadenceFromBody(body: unknown): "daily" | null {
  const b = body as Record<string, unknown> | null | undefined;
  const raw = typeof b?.cadence === "string" ? b.cadence.trim().toLowerCase() : "daily";
  if (raw === "daily") return "daily";
  return null;
}

function periodKeyForCadence(_cadence: "daily", now: Date = new Date()): string {
  return getCheckinPeriodKey(now);
}

async function resolveStreakFlags(userId: number, periodKey: string) {
  return computeStreakAfterCheckin(
    { userId, periodKey },
    {
      countGraceUsesInMonth: countGraceUsesInMonth,
      countFreezeUsesInMonth: countFreezeUsesInMonth,
      maxGracePerMonth: getCheckinMaxGraceUsesPerMonth(),
      maxFreezePerMonth: getCheckinMaxFreezeUsesPerMonth(),
      freezeEnabled: isCheckinStreakFreezeEnabled(),
    },
  );
}

function buildDailyCheckinDayWhere(userId: number, dateOrKey: Date | string = new Date()) {
  return {
    userId,
    checkinDate: {
      in: getBrazilDateKeyAliases(dateOrKey)
    }
  };
}

type DbClient = Pick<typeof prisma, "dailyCheckin" | "user" | "periodicCheckin">;

async function findDailyCheckinForBrazilDay(
  db: DbClient,
  userId: number,
  dateOrKey: Date | string = new Date(),
  extra: Record<string, unknown> = {}
) {
  return db.dailyCheckin.findFirst({
    where: buildDailyCheckinDayWhere(userId, dateOrKey),
    orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    ...extra
  });
}

async function writeDailyCheckinForBrazilDay(
  tx: DbClient,
  userId: number,
  normalizedDateKey: string,
  existingRow: { id: number } | null | undefined,
  data: Record<string, unknown>
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
        ...data
      } as Prisma.DailyCheckinUpdateInput
    });
  }
  return tx.dailyCheckin.create({
    data: {
      userId,
      checkinDate: normalized,
      ...data
    } as Prisma.DailyCheckinUncheckedCreateInput
  });
}

async function getDailyRowForToday(userId: number) {
  return findDailyCheckinForBrazilDay(prisma, userId);
}

async function loadRecentHistory(userId: number, take = 21) {
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

function rowToCadenceSlice(row: { status: string; txHash: string | null } | null) {
  return {
    checkedIn: row?.status === "confirmed",
    pending: row?.status === "pending",
    failed: row?.status === "failed",
    status: row?.status || null,
    txHash: row?.txHash || null
  };
}

type DailyCheckinPendingRow = {
  id: number;
  userId: number;
  status: string;
  paymentMethod?: string | null;
  txHash: string | null;
  user?: { walletAddress: string | null } | null;
};

/**
 * Confirms or fails a pending row using on-chain data (legacy payment check-ins only).
 */
export async function tryFinalizeCheckinRow(row: DailyCheckinPendingRow | null) {
  if (!row || row.status !== "pending") return row;
  if (row.paymentMethod === "balance") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  const contractAddr = resolveCheckinContractAddress();
  if ((!receiver || receiver.toLowerCase() === ZERO) && !contractAddr) return row;

  const minWei = getWalletCheckinWei();
  let ev: Awaited<ReturnType<typeof evaluateCheckinPayment>>;
  try {
    ev = await evaluateCheckinPayment({
      txHash: row.txHash as string,
      userWalletLower: normalizeAddr(wallet),
      receiverLower: normalizeAddr(receiver || contractAddr),
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
        chainId: getExpectedCheckinChainId(),
        paymentMethod: "wallet"
      }
    });
    applyStreakMilestoneRewards(updated.userId).catch((e: unknown) =>
      logCheckinSideEffectFailure("applyStreakMilestoneRewards after finalize", e)
    );
    notifyMiniPassLoginDay(updated.userId, updated.checkinDate).catch((e: unknown) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after finalize", e)
    );
    notifyDailyTaskLoginDay(updated.userId, updated.checkinDate).catch((e: unknown) =>
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

type PeriodicPendingRow = {
  id: number;
  userId: number;
  status: string;
  txHash: string | null;
  user?: { walletAddress: string | null } | null;
};

export async function tryFinalizePeriodicCheckinRow(row: PeriodicPendingRow | null) {
  if (!row || row.status !== "pending") return row;

  const wallet =
    row.user?.walletAddress ||
    (await prisma.user.findUnique({ where: { id: row.userId }, select: { walletAddress: true } }))?.walletAddress;
  if (!wallet) return row;

  const receiver = getReceiver();
  if (!receiver || receiver.toLowerCase() === ZERO) return row;

  const minWei = getWalletCheckinWei();
  let ev: Awaited<ReturnType<typeof evaluateCheckinPayment>>;
  try {
    ev = await evaluateCheckinPayment({
      txHash: row.txHash as string,
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
        chainId: getExpectedCheckinChainId()
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

export async function tryFinalizeTodayCheckin(userId: number, walletAddress: string | null | undefined) {
  const row = await getDailyRowForToday(userId);
  if (!row || row.status !== "pending" || !walletAddress) return row;
  return tryFinalizeCheckinRow({ ...row, user: { walletAddress } });
}

export async function processStalePendingCheckins({ batchSize = 40 }: { batchSize?: number } = {}) {
  const since = new Date(Date.now() - 72 * 3600000);
  const pending = await prisma.dailyCheckin.findMany({
    where: { status: "pending", createdAt: { gte: since } },
    take: batchSize,
    orderBy: { createdAt: "asc" },
    include: { user: { select: { walletAddress: true } } }
  });

  for (const row of pending) {
    await tryFinalizeCheckinRow(row as DailyCheckinPendingRow).catch((e: unknown) =>
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
    await tryFinalizePeriodicCheckinRow(row as PeriodicPendingRow).catch((e: unknown) =>
      logCheckinSideEffectFailure("tryFinalizePeriodicCheckinRow stale pending", e)
    );
  }
}

async function buildCadenceStatusBundle(userId: number, wallet: string | null, treasuryOk: boolean) {
  const todayKey = periodKeyForCadence("daily");
  let dailyRow: DailyCheckin | null = null;

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

export async function getStatus(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
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
    let recentCheckins: Awaited<ReturnType<typeof loadRecentHistory>> = [];
    let totalConfirmed = 0;
    let milestones: Awaited<ReturnType<typeof buildMilestoneStatusForUser>> = [];
    let statusDegraded = false;
    let cadenceStatus: Awaited<ReturnType<typeof buildCadenceStatusBundle>>["cadenceStatus"] | null = null;

    try {
      const bundle = await buildCadenceStatusBundle(userId, wallet, treasuryOk);
      cadenceStatus = bundle.cadenceStatus;

      streak = await computeCheckinStreak(userId);
      const results = await Promise.all([
        loadRecentHistory(userId, 21),
        prisma.dailyCheckin.count({ where: { userId, status: "confirmed" } }),
        buildMilestoneStatusForUser(userId, streak).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          checkinLog.warn("checkin getStatus: milestones unavailable", { error: msg });
          return [];
        })
      ]);
      recentCheckins = results[0];
      totalConfirmed = results[1];
      milestones = results[2];
    } catch (dbErr: unknown) {
      statusDegraded = true;
      checkinLog.error("checkin getStatus: daily_checkins / milestones DB error", prismaSafeErrorMeta(dbErr));
    }

    const dailyFromBundle = cadenceStatus?.daily;

    const todayCheckedIn = statusDegraded ? false : dailyFromBundle?.checkedIn ?? false;
    const todayPending = statusDegraded ? false : dailyFromBundle?.pending ?? false;
    const yesterdayKey = addDaysToBrazilDateKey(periodKeyForCadence("daily"), -1);
    const graceEndsAt =
      !statusDegraded && getCheckinGraceHours() > 0 && !todayCheckedIn
        ? getGraceEndsAt(yesterdayKey).toISOString()
        : null;

    res.json({
      ok: true,
      statusDegraded,
      cadenceStatus: statusDegraded ? null : cadenceStatus,
      checkedIn: todayCheckedIn,
      todayCheckedIn,
      canCheckin: !todayCheckedIn && !todayPending,
      pending: todayPending,
      failed: statusDegraded ? false : dailyFromBundle?.failed ?? false,
      status: statusDegraded ? null : dailyFromBundle?.status ?? null,
      txHash: statusDegraded ? null : dailyFromBundle?.txHash ?? null,
      streak: statusDegraded ? 0 : streak,
      totalConfirmed: statusDegraded ? 0 : totalConfirmed,
      recentCheckins: statusDegraded ? [] : recentCheckins,
      recentWeekly: [],
      recentMonthly: [],
      walletLinked: Boolean(wallet),
      savedWallet: wallet,
      paymentRequired: isCheckinPaymentRequired(),
      checkinMode: getCheckinMode(),
      allowsWalletCheckin: allowsWalletCheckin(),
      allowsOffchainCheckin: allowsOffchainCheckin(),
      nextResetAt: getNextResetAt().toISOString(),
      graceEndsAt,
      checkinReceiver: getReceiver() || null,
      checkinContractAddress: resolveCheckinContractAddress() || null,
      checkinAmountWei: walletWei.toString(),
      checkinBalanceAmountWei: balanceWei.toString(),
      chainId: getExpectedCheckinChainId(),
      checkinChainId: getExpectedCheckinChainId(),
      rpcConfigured:
        treasuryOk && Boolean(process.env.AETHER_RPC_URL?.trim() || process.env.POLYGON_RPC_URL?.trim()),
      milestones: statusDegraded ? [] : milestones,
      upcomingMilestones: statusDegraded ? [] : buildUpcomingMilestones(milestones),
      polBalance: statusDegraded ? 0 : polBalance,
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      const message = "Sessão expirada ou ausente.";
      res.status(401).json({
        ok: false,
        code: "UNAUTHENTICATED",
        message,
        error: message,
      });
      return;
    }
    checkinLog.error("Checkin getStatus:", prismaSafeErrorMeta(e));
    respondPrismaAwareError(res, e, "Não foi possível carregar o status do check-in agora.");
  }
}

export async function claimCheckin(req: Request, res: Response) {
  try {
    const userId = (req as AuthedRequest).user?.id ?? null;
    if (!userId) {
      return jsonCheckinError(res, 401, "UNAUTHORIZED", "Authentication required.");
    }
    if (!allowsOffchainCheckin()) {
      return jsonCheckinError(
        res,
        400,
        "ONCHAIN_ONLY",
        "Check-in is on-chain only. Use wallet payment with a valid transaction hash.",
      );
    }
    return checkinBalance(req, res);
  } catch (e: unknown) {
    checkinLog.error("claimCheckin", prismaSafeErrorMeta(e));
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}

/** POST /api/checkin/claim/onchain — alias for wallet tx confirmation. */
export async function claimCheckinOnchain(req: Request, res: Response) {
  return confirmCheckin(req, res);
}

export async function getCheckinRewards(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
    const streak = await computeCheckinStreak(userId);
    const milestones = await buildMilestoneStatusForUser(userId, streak);
    res.json({ ok: true, streak, milestones, upcomingMilestones: buildUpcomingMilestones(milestones) });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return jsonCheckinError(res, 401, "UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }
    checkinLog.error("getCheckinRewards", prismaSafeErrorMeta(e));
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to load rewards." });
  }
}

export async function getCheckinHistory(req: Request, res: Response) {
  try {
    const userId = requireUserId(req);
    const history = await loadRecentHistory(userId, 60);
    res.json({ ok: true, history });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED") {
      return jsonCheckinError(res, 401, "UNAUTHENTICATED", "Sessão expirada ou ausente.");
    }
    checkinLog.error("getCheckinHistory", prismaSafeErrorMeta(e));
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to load history." });
  }
}

type ParsedTxBody = { error: { code: string; message: string }; txHash?: undefined } | { txHash: string; error?: undefined };

function parseTxHashFromBody(body: unknown): ParsedTxBody {
  const b = body as Record<string, unknown> | null | undefined;
  const txHashRaw = typeof b?.txHash === "string" ? b.txHash.trim() : "";
  if (!txHashRaw) {
    return { error: { code: "INVALID_BODY", message: "Transaction hash is required." } };
  }
  try {
    return { txHash: assertValidTxHash(txHashRaw) };
  } catch {
    return { error: { code: "INVALID_TX_HASH", message: "Invalid transaction hash format." } };
  }
}

async function jsonSuccessWithStreak(res: Response, userId: number, extra: Record<string, unknown> = {}) {
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
export async function confirmCheckin(req: Request, res: Response) {
  try {
    const cadence = parseCadenceFromBody(req.body);
    if (cadence !== "daily") {
      return jsonCheckinError(
        res,
        400,
        "INVALID_CADENCE",
        'Only daily check-in is available. Send cadence: "daily" with your transaction hash.'
      );
    }
    return await confirmDailyCheckin(req, res);
  } catch (error: unknown) {
    checkinLog.error("Checkin confirm error:", prismaSafeErrorMeta(error));
    res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to confirm check-in." });
  }
}

type ConfirmTxOutcome =
  | { type: "already" }
  | { type: "pending" }
  | { type: "failed"; reason: string }
  | { type: "confirmed" };

async function findConflictingCheckinTxHash(
  db: Pick<typeof prisma, "dailyCheckin">,
  txHash: string,
  userId: number,
  todayKey: string
): Promise<"TX_ALREADY_USED" | null> {
  const row = await db.dailyCheckin.findUnique({ where: { txHash } });
  if (!row) return null;
  if (row.userId !== userId) return "TX_ALREADY_USED";
  const day = normalizeBrazilDateKey(row.checkinDate);
  if (row.status === "confirmed" && day && day !== todayKey) {
    return "TX_ALREADY_USED";
  }
  return null;
}

async function confirmDailyCheckin(req: Request, res: Response) {
  if (!allowsWalletCheckin()) {
    return jsonCheckinError(
      res,
      400,
      "OFFCHAIN_ONLY",
      "Wallet check-in is disabled. Use in-game balance check-in instead.",
    );
  }
  const userId = requireUserId(req);
  const today = getCheckinPeriodKey();
  const body = parseTxHashFromBody(req.body);
  if ("error" in body && body.error) {
    return jsonCheckinError(res, 400, body.error.code, body.error.message);
  }
  const txHash = body.txHash;

  const expectedChainId = getExpectedCheckinChainId();
  const chainFromBody = parseOptionalChainIdFromBody(req.body);
  if (chainFromBody !== null && chainFromBody !== expectedChainId) {
    return jsonCheckinError(res, 400, "INVALID_CHAIN", "Transaction chain does not match the required network.");
  }

  const reqBody = req.body as Record<string, unknown> | null | undefined;
  const bodyWalletRaw = typeof reqBody?.walletAddress === "string" ? reqBody.walletAddress.trim() : "";
  if (bodyWalletRaw) {
    try {
      assertValidWalletAddress(bodyWalletRaw);
    } catch {
      return jsonCheckinError(res, 400, "INVALID_WALLET_ADDRESS", "Invalid wallet address.");
    }
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

  if (bodyWalletRaw && normalizeAddr(bodyWalletRaw) !== normalizeAddr(walletAddress)) {
    return jsonCheckinError(
      res,
      400,
      "INVALID_WALLET_ADDRESS",
      "Wallet address does not match your linked wallet."
    );
  }

  const receiver = getReceiver();
  const contractAddr = resolveCheckinContractAddress();
  if (!receiver && !contractAddr) {
    return jsonCheckinError(
      res,
      503,
      "CHECKIN_RECEIVER_NOT_CONFIGURED",
      "Check-in payment destination is not configured on the server."
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

  const txConflict = await findConflictingCheckinTxHash(prisma, txHash, userId, today);
  if (txConflict) {
    return jsonCheckinError(
      res,
      409,
      "TX_ALREADY_USED",
      "This transaction hash was already used for check-in."
    );
  }

  const minWei = getWalletCheckinWei();
  let evalResult: Awaited<ReturnType<typeof evaluateCheckinPayment>>;
  try {
    evalResult = await evaluateCheckinPayment({
      txHash,
      userWalletLower: normalizeAddr(walletAddress),
      receiverLower: normalizeAddr(receiver || contractAddr),
      minValueWei: minWei
    });
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : "unknown_error";
    logSecurityWarn("checkin_confirm_blockchain_unavailable", { userId, reason }, req);
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
    chainId: expectedChainId,
    paymentMethod: "wallet"
  };

  try {
    const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await advisoryXactTryLockOrThrow(tx, `checkin:${userId}`);
      await lockUserRowForUpdate(tx, userId);

      const existing = await findDailyCheckinForBrazilDay(tx, userId, today);
      if (existing?.status === "confirmed") {
        return { type: "already" } as ConfirmTxOutcome;
      }

      if (evalResult.state === "pending") {
        await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
          ...baseRow,
          status: "pending",
          confirmedAt: null
        });
        return { type: "pending" } as ConfirmTxOutcome;
      }

      if (evalResult.state === "failed") {
        await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
          ...baseRow,
          status: "failed",
          confirmedAt: null
        });
        return {
          type: "failed",
          reason: evalResult.reason || "This transaction cannot be used for check-in."
        } as ConfirmTxOutcome;
      }

      const streakFlags = await resolveStreakFlags(userId, today);
      await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
        ...baseRow,
        status: "confirmed",
        confirmedAt: new Date(),
        streak: streakFlags.streakAfter,
        usedGrace: streakFlags.usedGrace,
        usedFreeze: streakFlags.usedFreeze,
      });
      return { type: "confirmed" } as ConfirmTxOutcome;
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
      return jsonCheckinError(res, 400, "INVALID_CHECKIN_TRANSACTION", outcome.reason);
    }

    await applyStreakMilestoneRewards(userId);
    notifyMiniPassLoginDay(userId, today).catch((e: unknown) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after wallet confirm", e)
    );
    notifyDailyTaskLoginDay(userId, today).catch((e: unknown) =>
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
      txHash
    });

    return jsonSuccessWithStreak(res, userId, {
      status: "confirmed",
      cadence: "daily"
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "DISTRIBUTED_LOCK_BUSY" || e?.code === "P2034") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_BUSY",
        "Another check-in request is in progress. Wait a moment and try again."
      );
    }
    if (e?.code === "P2002") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_CONFLICT",
        "Check-in was already recorded. Refresh the page."
      );
    }
    checkinLog.error("confirmDailyCheckin transaction:", prismaSafeErrorMeta(err));
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to confirm check-in." });
  }
}

/**
 * Wallet-based check-in: same verification path as POST /checkin/confirm (single source of truth).
 */
export async function checkinWallet(req: Request, res: Response) {
  return confirmCheckin(req, res);
}

type BalanceOutcome =
  | { kind: "already" }
  | { kind: "ok"; polBalance: number; debit: number };

class CheckinHttpError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CheckinHttpError";
  }
}

/**
 * Deduct in-game POL (pool balance) for daily check-in — no on-chain tx, no treasury/RPC required.
 */
export async function checkinBalance(req: Request, res: Response) {
  const userId = (req as AuthedRequest).user?.id ?? null;
  if (!userId) {
    return jsonCheckinError(res, 401, "UNAUTHORIZED", "Authentication required.");
  }
  const cadence = parseCadenceFromBody(req.body);
  if (cadence !== "daily") {
    return jsonCheckinError(
      res,
      400,
      "INVALID_CADENCE",
      'Only daily check-in is available. Send cadence: "daily".'
    );
  }
  const today = getCheckinPeriodKey();
  const balanceWei = getBalanceCheckinWei();
  const cost = polDecimalFromWei(balanceWei);
  const synthTx = balanceCheckinSyntheticTxHash(userId, today);

  try {
    const outcome = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<BalanceOutcome> => {
      await advisoryXactTryLockOrThrow(tx, `checkin:${userId}`);
      await lockUserRowForUpdate(tx, userId);

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { walletAddress: true, polBalance: true, isBanned: true }
      });
      if (!user || user.isBanned) {
        throw new CheckinHttpError("FORBIDDEN", "forbidden");
      }
      if (requiresWalletForOffchainCheckin() && !user.walletAddress?.trim()) {
        throw new CheckinHttpError("WALLET_REQUIRED", "wallet");
      }

      const existing = await findDailyCheckinForBrazilDay(tx, userId, today);
      if (existing?.status === "confirmed") {
        return { kind: "already" };
      }
      if (existing?.status === "pending") {
        throw new CheckinHttpError("CHECKIN_PENDING_PAYMENT", "pending");
      }

      const bal = new Prisma.Decimal(user.polBalance != null ? user.polBalance.toString() : "0");
      if (bal.lt(cost)) {
        throw new CheckinHttpError("INSUFFICIENT_BALANCE", "balance");
      }

      await tx.user.update({
        where: { id: userId },
        data: { polBalance: { decrement: cost } }
      });

      const updatedUser = await tx.user.findUnique({
        where: { id: userId },
        select: { polBalance: true }
      });

      const streakFlags = await resolveStreakFlags(userId, today);
      await writeDailyCheckinForBrazilDay(tx, userId, today, existing, {
        txHash: synthTx,
        status: "confirmed",
        confirmedAt: new Date(),
        amount: Number(balanceWei) / 1e18,
        chainId: CHAIN_INTERNAL_CHECKIN,
        paymentMethod: "balance",
        streak: streakFlags.streakAfter,
        usedGrace: streakFlags.usedGrace,
        usedFreeze: streakFlags.usedFreeze,
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
    getMiningEngine()?.reloadMinerProfile(userId, { forceBalanceSync: true }).catch((e: unknown) =>
      logCheckinSideEffectFailure("reloadMinerProfile after balance checkin", e)
    );

    await applyStreakMilestoneRewards(userId);
    notifyMiniPassLoginDay(userId, today).catch((e: unknown) =>
      logCheckinSideEffectFailure("notifyMiniPassLoginDay after balance checkin", e)
    );
    notifyDailyTaskLoginDay(userId, today).catch((e: unknown) =>
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
      amountPol: Number(balanceWei) / 1e18
    });

    return jsonSuccessWithStreak(res, userId, {
      status: "confirmed",
      cadence: "daily",
      paymentMethod: "balance",
      polBalance: outcome.polBalance
    });
  } catch (err: unknown) {
    if (err instanceof CheckinHttpError) {
      const code = err.code;
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
    }
    const e = err as { code?: string };
    if (e?.code === "DISTRIBUTED_LOCK_BUSY" || e?.code === "P2034") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_BUSY",
        "Another check-in request is in progress. Wait a moment and try again."
      );
    }
    if (e?.code === "P2002") {
      return jsonCheckinError(
        res,
        409,
        "CHECKIN_CONFLICT",
        "Check-in was already recorded. Refresh the page."
      );
    }
    checkinLog.error("checkinBalance:", prismaSafeErrorMeta(err));
    return res.status(500).json({ ok: false, code: "CHECKIN_SERVER_ERROR", message: "Unable to complete check-in." });
  }
}
