import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../../models/db.js";
import loggerLib from "../../utils/logger.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";

const logger = loggerLib.child("ZeradsController");

const SITE_ID = "10776";
const ZERADS_PTC_BASE = "https://zerads.com/ptc.php";

// 1 ZER = EXCHANGE_RATE POL
const EXCHANGE_RATE = Number(process.env.ZERADS_EXCHANGE_RATE ?? "0.07");

// Hard cap per callback: amount of ZER we'll ever credit in one call.
// Zerads docs: callbacks are ~5 min intervals. 5 ZER = 0.35 POL max per window.
const MAX_ZER_PER_CALLBACK = Number(process.env.ZERADS_MAX_ZER_PER_CALLBACK ?? "5");

// Official Zerads callback server IP from their docs.
const ZERADS_SERVER_IP = (process.env.ZERADS_SERVER_IP ?? "162.0.208.108").trim();

function getClientIp(req: Request): string {
  // req.ip already has trust-proxy applied by Express
  return String(req.ip ?? "").replace("::ffff:", "");
}

/**
 * GET /zeradsptc.php
 * Called by the Zerads server every ~5 minutes.
 * Query: pwd, user, amount, clicks
 * Returns "1" on success, "0" on failure (matches their PHP example).
 */
export async function zeradsCallbackHandler(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);

  // --- IP guard ---
  if (clientIp !== ZERADS_SERVER_IP) {
    logger.warn("zerads.callback.ip_rejected", { ip: clientIp });
    res.status(403).send("0");
    return;
  }

  // --- Password guard ---
  const secret = (process.env.ZERADS_CALLBACK_SECRET ?? "").trim();
  if (!secret) {
    logger.error("zerads.callback.no_secret_configured");
    res.status(500).send("0");
    return;
  }
  const { pwd, user: username, amount: rawAmount, clicks: rawClicks } = req.query as Record<string, string | undefined>;

  if (!pwd || pwd !== secret) {
    logger.warn("zerads.callback.bad_password", { ip: clientIp });
    res.status(403).send("0");
    return;
  }

  // --- Parameter validation ---
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

  // Hard cap: never credit more than MAX_ZER_PER_CALLBACK ZER in one call.
  const cappedZer = Math.min(amountZer, MAX_ZER_PER_CALLBACK);
  if (cappedZer < amountZer) {
    logger.warn("zerads.callback.amount_capped", {
      username,
      requested: amountZer,
      capped: cappedZer,
    });
  }

  const polToCredit = new Prisma.Decimal(String(cappedZer * EXCHANGE_RATE));
  const clicks = parseInt(rawClicks ?? "0", 10) || 0;

  // --- User lookup ---
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

  // --- Credit ---
  await prisma.user.update({
    where: { id: user.id },
    data: { polBalance: { increment: polToCredit } },
  });

  void createAuditLogBestEffort({
    userId: user.id,
    action: "zerads_ptc_reward",
    source: "system",
    severity: "info",
    ip: clientIp,
    details: {
      amountZer: cappedZer,
      polCredited: polToCredit.toFixed(8),
      clicks,
      exchangeRate: EXCHANGE_RATE,
    },
  });

  logger.info("zerads.callback.credited", {
    userId: user.id,
    username,
    amountZer: cappedZer,
    polCredited: polToCredit.toFixed(8),
    clicks,
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
    exchangeRate: EXCHANGE_RATE,
    siteId: SITE_ID,
  });
}
