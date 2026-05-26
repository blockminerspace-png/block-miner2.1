import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import _prisma from "../../src/db/prisma.js";
const prisma = _prisma as any;
import { getPolUsdPrice } from "../../utils/cryptoPrice.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";
import loggerLib from "../../utils/logger.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";

const logger = loggerLib.child("OfferwallMeController");

export const OFFERWALLME_API_KEY =
  (process.env.OFFERWALLME_API_KEY ?? "yyu8i3jt58by9do1fbdr0fyn60yn5u").trim();

const SECRET_KEY =
  (process.env.OFFERWALLME_SECRET ?? "53ef7ec6bf3dac68f4c5528e057059e5").trim();

const PAYOUT_MULTIPLIER = 0.80;
const FALLBACK_POL_PRICE = 0.20;
const MAX_PAYOUT_USD_PER_CALLBACK = Number(process.env.OFFERWALLME_MAX_PAYOUT_USD ?? "50");

const HISTORY_PAGE_SIZE = 50;

const _allowedIpsRaw = (process.env.OFFERWALLME_ALLOWED_IPS ?? "95.216.65.163,2a01:4f9:2b:1dc::2").trim();
const ALLOWED_IPS = new Set(
  _allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean).length
    ? _allowedIpsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : ["95.216.65.163", "2a01:4f9:2b:1dc::2"]
);

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string") return cfIp.trim();
  return String(req.ip ?? "").replace("::ffff:", "");
}

function verifySignature(subId: string, transId: string, reward: string, signature: string): boolean {
  const expected = crypto
    .createHash("md5")
    .update(subId + transId + reward + SECRET_KEY)
    .digest("hex");
  return expected === signature;
}

/**
 * POST /api/offerwallme/postback
 * Called by offerwall.me servers when a user completes an offer.
 * Must respond "ok" on success.
 */
export async function offerwallMePostback(req: Request, res: Response): Promise<void> {
  const clientIp = getClientIp(req);

  // IP whitelist — offerwall.me sends from known IPs
  if (!ALLOWED_IPS.has(clientIp)) {
    logger.warn("offerwallme.postback.ip_rejected", { ip: clientIp, allowed: [...ALLOWED_IPS] });
    res.status(403).send("ERROR: Invalid source");
    return;
  }
  logger.info("offerwallme.postback.ip_accepted", { ip: clientIp });

  const body = req.method === "POST" ? req.body : req.query;
  const subId     = String(body.subId     ?? "").trim();
  const transId   = String(body.transId   ?? "").trim();
  const reward    = String(body.reward    ?? "").trim();
  const payout    = String(body.payout    ?? "0").trim();
  const offerName = String(body.offer_name ?? "").trim();
  const offerType = String(body.offer_type ?? "").trim();
  const status    = parseInt(String(body.status ?? "1"), 10);
  const debug     = String(body.debug     ?? "0").trim();
  const signature = String(body.signature ?? "").trim();

  if (!subId || !transId || !reward || !signature) {
    logger.warn("offerwallme.postback.missing_params", { subId, transId });
    res.status(400).send("ERROR: Missing parameters");
    return;
  }

  if (!verifySignature(subId, transId, reward, signature)) {
    logger.warn("offerwallme.postback.bad_signature", { subId, transId, ip: clientIp });
    res.status(403).send("ERROR: Signature doesn't match");
    return;
  }

  const userId = parseInt(subId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    logger.warn("offerwallme.postback.invalid_user_id", { subId });
    res.status(400).send("ERROR: Invalid user");
    return;
  }

  const rawPayoutUsd = parseFloat(payout) || 0;
  const payoutUsd = Math.min(rawPayoutUsd, MAX_PAYOUT_USD_PER_CALLBACK);
  if (payoutUsd < rawPayoutUsd) {
    logger.warn("offerwallme.postback.payout_capped", { userId, transId, requested: rawPayoutUsd, capped: payoutUsd });
  }

  // Debug/test postbacks — acknowledge but don't credit
  if (debug === "1") {
    logger.info("offerwallme.postback.test_ignored", { subId, transId, payoutUsd });
    res.send("ok");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true },
  });

  if (!user) {
    logger.warn("offerwallme.postback.user_not_found", { userId });
    res.status(404).send("ERROR: User not found");
    return;
  }

  if (user.isBanned) {
    logger.warn("offerwallme.postback.user_banned", { userId });
    res.send("ok"); // Acknowledge to avoid retries but don't credit
    return;
  }

  let polPrice: number;
  try {
    polPrice = await getPolUsdPrice();
    if (!polPrice || polPrice <= 0) polPrice = FALLBACK_POL_PRICE;
  } catch {
    polPrice = FALLBACK_POL_PRICE;
  }

  const userShare = payoutUsd * PAYOUT_MULTIPLIER;
  const polToCredit = status === 2
    ? -(userShare / polPrice)
    : userShare / polPrice;

  const polDecimal = new Prisma.Decimal(String(Math.max(0, polToCredit).toFixed(8)));
  const polDebit   = new Prisma.Decimal(String(Math.abs(polToCredit).toFixed(8)));

  try {
    if (status === 2) {
      // Chargeback: deduct but don't go negative
      await prisma.$transaction([
        prisma.offerwallMeCallback.create({
          data: {
            userId,
            transId,
            offerName: offerName || null,
            offerType: offerType || null,
            payoutUsd,
            polCredited: -Math.abs(polToCredit),
            polPrice,
            status,
            requestIp: clientIp,
          },
        }),
        prisma.$executeRaw`
          UPDATE users
          SET pol_balance = GREATEST(pol_balance - ${polDebit}, 0)
          WHERE id = ${userId}
        `,
      ]);
    } else {
      await prisma.$transaction([
        prisma.offerwallMeCallback.create({
          data: {
            userId,
            transId,
            offerName: offerName || null,
            offerType: offerType || null,
            payoutUsd,
            polCredited: Number(polDecimal),
            polPrice,
            status,
            requestIp: clientIp,
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { polBalance: { increment: polDecimal } },
        }),
      ]);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") && msg.includes("trans_id")) {
      logger.warn("offerwallme.postback.duplicate_ignored", { transId, userId });
      res.send("ok");
      return;
    }
    logger.error("offerwallme.postback.transaction_failed", { transId, userId, error: msg });
    res.status(500).send("ERROR: Internal");
    return;
  }

  // Sync in-memory mining engine so real-time balance display updates immediately
  applyUserBalanceDelta(userId, polToCredit);

  void createAuditLogBestEffort({
    userId,
    action: "OFFERWALLME_REWARD",
    source: "system",
    severity: "info",
    ip: clientIp,
    details: { transId, offerName, offerType, payoutUsd, polCredited: polToCredit.toFixed(8), polPrice, status },
  });

  logger.info("offerwallme.postback.credited", { userId, transId, payoutUsd, polCredited: polToCredit.toFixed(8), status });
  res.send("ok");
}

/**
 * GET /api/offerwallme/history?page=1
 * Paginated postback history for the authenticated user.
 */
export async function getOfferwallMeHistory(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const skip = (page - 1) * HISTORY_PAGE_SIZE;

  const [entries, total] = await Promise.all([
    prisma.offerwallMeCallback.findMany({
      where: { userId, status: 1 },
      orderBy: { createdAt: "desc" },
      skip,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        offerName: true,
        offerType: true,
        payoutUsd: true,
        polCredited: true,
        polPrice: true,
        createdAt: true,
      },
    }),
    prisma.offerwallMeCallback.count({ where: { userId, status: 1 } }),
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
 * GET /api/offerwallme/stats
 * Aggregate totals for the authenticated user.
 */
export async function getOfferwallMeStats(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ ok: false });
    return;
  }

  const agg = await prisma.offerwallMeCallback.aggregate({
    where: { userId, status: 1 },
    _sum: { payoutUsd: true, polCredited: true },
    _count: { id: true },
  });

  res.json({
    ok: true,
    totalUsd: agg._sum.payoutUsd ?? 0,
    totalPol: agg._sum.polCredited ?? 0,
    totalOffers: agg._count.id,
  });
}
