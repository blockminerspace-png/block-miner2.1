import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { verifyCcPaymentWebhookSignature } from "./ccpaymentSignature.js";
import {
  parseUserIdFromMerchantOrderId,
  isAllowedChainAndCrypto,
  normalizePayStatus,
  extractPolAmount
} from "./ccpaymentDepositDomain.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { normalizeEnvString } from "./ccpaymentEnv.js";
const logger = loggerLib.child("CcpaymentDepositWebhook");

export class CcpaymentWebhookError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [httpStatus]
   */
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function getAppId() {
  return normalizeEnvString(process.env.CCPAYMENT_APP_ID || process.env.CCPAYMENT_API_KEY || "");
}

function getAppSecret() {
  return normalizeEnvString(
    process.env.CCPAYMENT_WEBHOOK_SECRET ||
      process.env.CCPAYMENT_APP_SECRET ||
      process.env.CCPAYMENT_SECRET_KEY ||
      ""
  );
}

function parseChainList() {
  const raw = process.env.CCPAYMENT_ALLOWED_CHAINS || "Polygon,MATIC,polygon";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCryptoList() {
  const raw = process.env.CCPAYMENT_ALLOWED_CRYPTOS || "POL,MATIC,WPOL";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getMinDeposit() {
  const ccp = parseFloat(String(process.env.CCPAYMENT_MIN_DEPOSIT_POL ?? "").trim());
  if (Number.isFinite(ccp) && ccp > 0) {
    return ccp;
  }
  return 0.01;
}

function getMaxDeposit() {
  const v = parseFloat(String(process.env.MAX_DEPOSIT_AMOUNT || "100000"));
  return Number.isFinite(v) && v > 0 ? v : 100000;
}

/**
 * Verifies headers, timestamp freshness, and signature.
 *
 * @param {string} rawBody
 * @param {import('http').IncomingHttpHeaders} headers
 */
export function verifyCcpaymentWebhookRequest(rawBody, headers) {
  const appIdHeader = String(headers["appid"] || headers["app-id"] || "").trim();
  const timestamp = String(headers["timestamp"] || "").trim();
  const sign = String(headers["sign"] || "").trim();

  const expectedAppId = getAppId();
  const appSecret = getAppSecret();

  if (!expectedAppId || !appSecret) {
    throw new CcpaymentWebhookError("NOT_CONFIGURED", "CCPayment credentials not configured", 503);
  }

  if (!appIdHeader || !timestamp || !sign) {
    throw new CcpaymentWebhookError("MISSING_HEADERS", "Missing Appid, Timestamp, or Sign", 401);
  }

  if (appIdHeader !== expectedAppId) {
    throw new CcpaymentWebhookError("APPID_MISMATCH", "Appid mismatch", 401);
  }

  const tsNum = parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum)) {
    throw new CcpaymentWebhookError("BAD_TIMESTAMP", "Invalid timestamp", 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > 120) {
    throw new CcpaymentWebhookError("TIMESTAMP_EXPIRED", "Timestamp outside allowed window", 401);
  }

  const ok = verifyCcPaymentWebhookSignature({
    appId: appIdHeader,
    appSecret,
    timestamp,
    rawBody,
    signHeader: sign
  });

  if (!ok) {
    throw new CcpaymentWebhookError("INVALID_SIGNATURE", "Invalid signature", 401);
  }
}

/**
 * Map CCPayment v2 wrapped webhooks (UserDeposit / DirectDeposit) to the flat shape expected by {@link processCcpaymentDepositBody}.
 *
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function unwrapCcpaymentV2WebhookPayload(body) {
  if (!body || typeof body !== "object") return body;
  const type = String(body.type || "");
  const msg = body.msg && typeof body.msg === "object" ? body.msg : null;
  if (!msg) return body;

  const mapPayStatus = (s) => {
    const x = String(s || "").toLowerCase();
    if (x === "success") return "success";
    if (x === "processing") return "pending";
    if (x === "failed" || x === "fail") return "failed";
    return String(s || "");
  };

  if (type === "UserDeposit") {
    return {
      pay_status: mapPayStatus(msg.status),
      record_id: msg.recordId,
      extend: { merchant_order_id: String(msg.userId != null ? msg.userId : "") },
      chain: msg.chain != null ? String(msg.chain) : "",
      crypto: msg.coinSymbol != null ? String(msg.coinSymbol) : "",
      paid_amount: msg.amount,
      order_id: null,
      txid: msg.txId ?? msg.txid,
      order_type: type
    };
  }

  if (type === "DirectDeposit") {
    return {
      pay_status: mapPayStatus(msg.status),
      record_id: msg.recordId,
      extend: { merchant_order_id: String(msg.referenceId != null ? msg.referenceId : "") },
      chain: msg.chain != null ? String(msg.chain) : "",
      crypto: msg.coinSymbol != null ? String(msg.coinSymbol) : "",
      paid_amount: msg.amount,
      order_id: null,
      txid: msg.txId ?? msg.txid,
      order_type: type
    };
  }

  return body;
}

/**
 * Processes a verified JSON body. Idempotent on CCPayment record_id.
 *
 * @param {Record<string, unknown>} body
 * @param {{ clientIp?: string | null }} [meta]
 * @returns {Promise<{ outcome: string, userId?: number }>}
 */
export async function processCcpaymentDepositBody(body, meta = {}) {
  body = unwrapCcpaymentV2WebhookPayload(body);

  if (!String(body.chain || "").trim() && body.crypto) {
    const sym = String(body.crypto).trim().toUpperCase();
    if (sym === "MATIC" || sym === "POL" || sym === "WPOL") {
      body = { ...body, chain: "Polygon" };
    }
  }

  const payStatusRaw = String(body.pay_status || "");
  const normalized = normalizePayStatus(payStatusRaw);

  if (normalized !== "completed") {
    logger.info("CCPayment webhook acknowledged (non-success status)", {
      pay_status: payStatusRaw,
      record_id: body.record_id
    });
    return { outcome: "ack_non_success" };
  }

  const recordId = String(body.record_id || "").trim();
  if (!recordId) {
    logger.warn("CCPayment success webhook missing record_id");
    return { outcome: "ack_missing_record" };
  }

  const existing = await prisma.ccpaymentDepositEvent.findUnique({
    where: { recordId }
  });
  if (existing) {
    return { outcome: "duplicate", userId: existing.userId ?? undefined };
  }

  const extend = body.extend && typeof body.extend === "object" ? body.extend : {};
  const merchantOrderId = extend.merchant_order_id != null ? String(extend.merchant_order_id) : "";
  const parsedUserId = parseUserIdFromMerchantOrderId(merchantOrderId);

  const chain = String(body.chain || "");
  const cryptoSym = String(body.crypto || "");
  const orderId = body.order_id != null ? String(body.order_id) : null;
  const txHash = body.txid ? String(body.txid).trim() : null;
  const amount = extractPolAmount(body);
  const minD = getMinDeposit();
  const maxD = getMaxDeposit();

  const summaryJson = JSON.stringify({
    order_type: body.order_type,
    chain,
    crypto: cryptoSym,
    paid_amount: body.paid_amount,
    order_id: orderId,
    merchant_order_id: merchantOrderId || undefined
  });

  /** @type {{ kind: 'tombstone', reason: string, userId: number | null, amount: number | null } | { kind: 'credit', userId: number, amount: number }} */
  let decision;

  if (!parsedUserId) {
    decision = { kind: "tombstone", reason: "NO_USER", userId: null, amount: amount ?? null };
    logger.error("CCPayment webhook could not resolve user from merchant_order_id", {
      merchant_order_id: merchantOrderId,
      record_id: recordId
    });
  } else if (!isAllowedChainAndCrypto(chain, cryptoSym, parseChainList(), parseCryptoList())) {
    decision = { kind: "tombstone", reason: "INVALID_CHAIN", userId: parsedUserId, amount: amount ?? null };
    logger.error("CCPayment webhook rejected chain/crypto", { chain, crypto: cryptoSym, record_id: recordId });
  } else if (amount == null) {
    decision = { kind: "tombstone", reason: "BAD_AMOUNT", userId: parsedUserId, amount: null };
    logger.error("CCPayment webhook missing amount", { record_id: recordId, userId: parsedUserId });
  } else if (amount < minD || amount > maxD) {
    decision = { kind: "tombstone", reason: "LIMITS", userId: parsedUserId, amount };
    logger.error("CCPayment amount outside limits", { amount, minD, maxD, record_id: recordId });
  } else {
    decision = { kind: "credit", userId: parsedUserId, amount };
  }

  let creditedDepositTxId = null;

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.ccpaymentDepositEvent.findUnique({ where: { recordId } });
      if (row) return;

      if (decision.kind === "tombstone") {
        await tx.ccpaymentDepositEvent.create({
          data: {
            recordId,
            orderId,
            userId: decision.userId,
            amountPol: decision.amount,
            txHash,
            payStatus: payStatusRaw,
            credited: false,
            rejectReason: decision.reason,
            rawPayloadJson: summaryJson
          }
        });
        return;
      }

      const user = await tx.user.findUnique({ where: { id: decision.userId } });
      if (!user || user.isBanned) {
        await tx.ccpaymentDepositEvent.create({
          data: {
            recordId,
            orderId,
            userId: decision.userId,
            amountPol: decision.amount,
            txHash,
            payStatus: payStatusRaw,
            credited: false,
            rejectReason: "USER_INVALID",
            rawPayloadJson: summaryJson
          }
        });
        return;
      }

      if (txHash) {
        const dupOnChain = await tx.transaction.findFirst({
          where: {
            txHash,
            type: "deposit",
            status: "completed"
          }
        });
        if (dupOnChain) {
          await tx.ccpaymentDepositEvent.create({
            data: {
              recordId,
              orderId,
              userId: decision.userId,
              amountPol: decision.amount,
              txHash,
              payStatus: payStatusRaw,
              credited: false,
              rejectReason: "DUPLICATE_TXHASH",
              rawPayloadJson: summaryJson
            }
          });
          return;
        }
      }

      await tx.ccpaymentDepositEvent.create({
        data: {
          recordId,
          orderId,
          userId: decision.userId,
          amountPol: decision.amount,
          txHash,
          payStatus: payStatusRaw,
          credited: true,
          rejectReason: null,
          rawPayloadJson: summaryJson
        }
      });

      const depositRow = await tx.transaction.create({
        data: {
          userId: decision.userId,
          type: "deposit",
          amount: String(decision.amount),
          txHash: txHash || null,
          status: "completed",
          completedAt: new Date(),
          rawTx: JSON.stringify({
            source: "ccpayment",
            record_id: recordId,
            order_id: orderId,
            chain,
            crypto: cryptoSym
          })
        }
      });
      creditedDepositTxId = depositRow.id;

      await tx.user.update({
        where: { id: decision.userId },
        data: { polBalance: { increment: decision.amount } }
      });

      await tx.auditLog.create({
        data: {
          userId: decision.userId,
          action: "CCPAYMENT_DEPOSIT",
          ip: meta.clientIp || null,
          detailsJson: JSON.stringify({
            recordId,
            orderId,
            amount: decision.amount,
            txHash
          })
        }
      });
    });
  } catch (e) {
    if (e?.code === "P2002") {
      logger.info("CCPayment duplicate webhook (idempotent)", { record_id: recordId });
      return { outcome: "duplicate", userId: parsedUserId ?? undefined };
    }
    throw e;
  }

  const after = await prisma.ccpaymentDepositEvent.findUnique({ where: { recordId } });
  if (!after) {
    return { outcome: "duplicate" };
  }
  if (!after.credited) {
    const r = after.rejectReason || "rejected";
    if (r === "USER_INVALID") return { outcome: "ack_user_invalid", userId: after.userId ?? undefined };
    if (r === "DUPLICATE_TXHASH") return { outcome: "ack_duplicate_tx", userId: after.userId ?? undefined };
    if (r === "NO_USER") return { outcome: "ack_no_user" };
    if (r === "INVALID_CHAIN") return { outcome: "ack_invalid_chain", userId: after.userId ?? undefined };
    if (r === "BAD_AMOUNT") return { outcome: "ack_bad_amount", userId: after.userId ?? undefined };
    if (r === "LIMITS") return { outcome: "ack_limits", userId: after.userId ?? undefined };
    return { outcome: "ack_rejected", userId: after.userId ?? undefined };
  }

  const userId = after.userId;
  const creditedAmount = Number(after.amountPol || 0);

  try {
    applyUserBalanceDelta(userId, creditedAmount);
  } catch {
    /* non-fatal */
  }

  try {
    const { createNotification } = await import("../../controllers/notificationController.js");
    const engine = getMiningEngine();
    await createNotification({
      userId,
      title: "Deposit credited (CCPayment)",
      message: `Your account was credited with ${creditedAmount.toFixed(8)} POL via CCPayment.`,
      type: "success",
      io: engine?.io
    });
    if (engine?.io && creditedDepositTxId != null) {
      engine.io.to(`user:${userId}`).emit("wallet:deposit_confirmed", {
        amount: creditedAmount,
        txHash: after.txHash || "",
        txId: creditedDepositTxId
      });
    }
    await engine?.reloadMinerProfile(userId).catch(() => {});
  } catch (notifyErr) {
    logger.warn("Post-deposit notify failed", { message: notifyErr?.message });
  }

  logger.info("CCPayment deposit credited", { userId, amount: creditedAmount, record_id: recordId });
  return { outcome: "credited", userId };
}
