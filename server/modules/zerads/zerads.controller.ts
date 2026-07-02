import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../models/db.js";
import loggerLib from "../../utils/logger.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";
import {
  ZERADS_MAX_CLICKS_PER_UTC_DAY,
  utcDayBounds,
  utcDayKey,
} from "./zeradsClickLimits.js";
import {
  recordTournamentAction,
  TOURNAMENT_ACTION_PROVIDER,
} from "../tournaments/application/tournament-action-dispatch.js";

const logger = loggerLib.child("ZeradsController");

const SITE_ID = "10776";
const ZERADS_PTC_BASE = "https://zerads.com/ptc.php";

// Support both env var naming conventions (ZERADS_PTC_EXCHANGE_RATE = nome legado do .env.production)
const _rawRate = process.env.ZERADS_PTC_EXCHANGE_RATE || process.env.ZERADS_EXCHANGE_RATE || "0.07";
const EXCHANGE_RATE = Number(_rawRate) || 0.07; // fallback 0.07 se vier 0 ou inválido

const MAX_ZER_PER_CALLBACK = Number(process.env.ZERADS_MAX_ZER_PER_CALLBACK ?? "5");

// Platform keeps 20%; user receives 80% of the gross ZER → POL conversion.
const PAYOUT_MULTIPLIER = 0.80;

// Suporta ZERADS_ALLOWED_IPS (legado) ou ZERADS_SERVER_IP, separado por vírgula
const _allowedIpsRaw = (process.env.ZERADS_ALLOWED_IPS || process.env.ZERADS_SERVER_IP || "162.0.208.108").trim();
const ZERADS_ALLOWED_IPS = new Set(
  _allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean).length
    ? _allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["162.0.208.108"]
);

const HISTORY_PAGE_SIZE = 50;

function getClientIp(req: Request): string {
  // Site sits behind Cloudflare; real origin IP is in CF-Connecting-IP
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();
  return String(req.ip ?? "").replace("::ffff:", "");
}

/**
 * Idempotency key: prevents crediting the same 5-min window twice.
 * Hash covers username + amount + clicks + 5-min bucket so replays are rejected.
 */
function buildCallbackHash(username: string, amountZer: number, clicks: number): string {
  const bucket = Math.floor(Date.now() / 300_000); // 5-min window
  const payload = `${username}|${amountZer}|${clicks}|${bucket}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * GET /zeradsptc.php
 * Zerads server callback — every ~5 minutes per user.
 * Returns "1" on success, "0" on any failure (matches their PHP pattern).
 */
export async function zeradsCallbackHandler(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);

  if (!ZERADS_ALLOWED_IPS.has(clientIp)) {
    logger.warn("zerads.callback.ip_rejected", { ip: clientIp, allowed: [...ZERADS_ALLOWED_IPS] });
    res.status(403).send("0");
    return;
  }

  // Suporta ZERADS_CALLBACK_PASSWORD (nome legado no .env.production) ou ZERADS_CALLBACK_SECRET
  const secret = (process.env.ZERADS_CALLBACK_PASSWORD ?? process.env.ZERADS_CALLBACK_SECRET ?? "").trim();
  if (!secret) {
    logger.error("zerads.callback.no_secret_configured");
    res.status(500).send("0");
    return;
  }

  const { pwd, user: username, amount: rawAmount, clicks: rawClicks } =
    req.query as Record<string, string | undefined>;

  if (!pwd || pwd !== secret) {
    logger.warn("zerads.callback.bad_password", { ip: clientIp });
    res.status(403).send("0");
    return;
  }

  if (!username || typeof username !== "string" || username.trim() === "") {
    res.status(400).send("0");
    return;
  }

  const amountZer = parseFloat(rawAmount ?? "");
  if (!Number.isFinite(amountZer) || amountZer <= 0) {
    logger.warn("zerads.callback.invalid_amount", { rawAmount, username });
    res.status(400).send("0");
    return;
  }

  const cappedZer = Math.min(amountZer, MAX_ZER_PER_CALLBACK);
  if (cappedZer < amountZer) {
    logger.warn("zerads.callback.amount_capped", {
      username,
      requested: amountZer,
      capped: cappedZer,
    });
  }

  const clicks = parseInt(rawClicks ?? "0", 10) || 0;
  if (clicks <= 0) {
    logger.warn("zerads.callback.no_clicks", { username, rawClicks });
    res.status(400).send("0");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { username: username.trim() },
    select: { id: true, isBanned: true, username: true },
  });

  if (!user) {
    logger.warn("zerads.callback.user_not_found", { username });
    res.status(404).send("0");
    return;
  }

  if (user.isBanned) {
    logger.warn("zerads.callback.user_banned", { userId: user.id, username });
    res.status(403).send("0");
    return;
  }

  const callbackHash = buildCallbackHash(username.trim(), cappedZer, clicks);
  const now = new Date();
  const { start: utcDayStartBound, end: utcDayEndBound } = utcDayBounds(utcDayKey(now));

  const dayAgg = await prisma.zeradsCallback.aggregate({
    where: { userId: user.id, callbackAt: { gte: utcDayStartBound, lt: utcDayEndBound } },
    _sum: { clicks: true },
  });
  const clicksToday = Number(dayAgg._sum.clicks ?? 0);
  const remaining = Math.max(0, ZERADS_MAX_CLICKS_PER_UTC_DAY - clicksToday);
  if (remaining <= 0) {
    logger.warn("zerads.callback.daily_click_cap", {
      username,
      userId: user.id,
      clicksToday,
      max: ZERADS_MAX_CLICKS_PER_UTC_DAY,
    });
    res.send("1");
    return;
  }

  const creditedClicks = Math.min(clicks, remaining);
  const clickRatio = creditedClicks / clicks;
  const polToCredit = new Prisma.Decimal(String(cappedZer * EXCHANGE_RATE * PAYOUT_MULTIPLIER * clickRatio));
  const creditedZer = cappedZer * clickRatio;

  if (creditedClicks < clicks) {
    logger.warn("zerads.callback.clicks_trimmed", {
      username,
      userId: user.id,
      requested: clicks,
      credited: creditedClicks,
      clicksToday,
    });
  }

  try {
    await prisma.$transaction([
      prisma.zeradsCallback.create({
        data: {
          userId: user.id,
          username: user.username!,
          amountZer: creditedZer,
          exchangeRate: EXCHANGE_RATE,
          payoutAmount: Number(polToCredit),
          clicks: creditedClicks,
          requestIp: clientIp,
          callbackHash,
          callbackAt: now,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { polBalance: { increment: polToCredit } },
      }),
    ]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("callback_hash")) {
      // Duplicate callback for this 5-min window — already credited, safe to ack
      logger.warn("zerads.callback.duplicate_ignored", { username, callbackHash });
      res.send("1");
      return;
    }
    logger.error("zerads.callback.transaction_failed", { username, error: msg });
    res.status(500).send("0");
    return;
  }

  void createAuditLogBestEffort({
    userId: user.id,
    action: "zerads_ptc_reward",
    source: "system",
    severity: "info",
    ip: clientIp,
    details: {
      amountZer: creditedZer,
      polCredited: polToCredit.toFixed(8),
      clicks: creditedClicks,
      clicksRequested: clicks,
      exchangeRate: EXCHANGE_RATE,
    },
  });

  logger.info("zerads.callback.credited", {
    userId: user.id,
    username,
    amountZer: creditedZer,
    polCredited: polToCredit.toFixed(8),
    clicks: creditedClicks,
    clicksRequested: clicks,
  });

  void recordTournamentAction({
    userId: user.id,
    provider: TOURNAMENT_ACTION_PROVIDER.ZERADS,
    actionCount: creditedClicks,
    executedAtUTC: now,
    providerEventId: callbackHash,
    metadata: {
      clicksRequested: clicks,
      timestampSource: "callback_at",
    },
  });

  res.send("1");
}

/**
 * GET /api/zerads/link
 * Returns the PTC URL for the authenticated user.
 */
export async function getUserZeradsLink(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false, reason: "unauthenticated" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user?.username) {
    res.json({ ok: false, reason: "no_username" });
    return;
  }

  const url = `${ZERADS_PTC_BASE}?ref=${SITE_ID}&user=${encodeURIComponent(user.username)}`;
  res.json({
    ok: true,
    url,
    username: user.username,
    exchangeRate: EXCHANGE_RATE * PAYOUT_MULTIPLIER,
    siteId: SITE_ID,
  });
}

/**
 * GET /api/zerads/history?page=1
 * Returns paginated PTC callback history for the authenticated user.
 */
export async function getZeradsHistory(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const skip = (page - 1) * HISTORY_PAGE_SIZE;

  const [entries, total] = await Promise.all([
    prisma.zeradsCallback.findMany({
      where: { userId },
      orderBy: { callbackAt: "desc" },
      skip,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        amountZer: true,
        payoutAmount: true,
        clicks: true,
        callbackAt: true,
      },
    }),
    prisma.zeradsCallback.count({ where: { userId } }),
  ]);

  res.json({
    ok: true,
    entries,
    total,
    page,
    pageSize: HISTORY_PAGE_SIZE,
    totalPages: Math.ceil(total / HISTORY_PAGE_SIZE),
  });
}

/**
 * GET /api/zerads/stats
 * Total ZER earned and POL credited for the authenticated user.
 */
export async function getZeradsStats(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }

  const agg = await prisma.zeradsCallback.aggregate({
    where: { userId },
    _sum: { amountZer: true, payoutAmount: true, clicks: true },
    _count: { id: true },
  });

  res.json({
    ok: true,
    totalZer: agg._sum.amountZer ?? 0,
    totalPol: agg._sum.payoutAmount ?? 0,
    totalClicks: agg._sum.clicks ?? 0,
    totalCallbacks: agg._count.id,
  });
}
