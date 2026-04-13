/**
 * BTCPay webhook: validates HMAC, re-fetches invoice from BTCPay, credits POL once (atomic + idempotent).
 * Mounted with express.raw so the HMAC matches the exact POST body.
 */
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import {
  BTCPAY_DEPOSIT_STATUS_PENDING,
  BTCPAY_WEBHOOK_SETTLE_TYPES,
  buildBtcpayTxHash,
  fetchBtcpayInvoice,
  isBtcpayComingSoon,
  verifyBtcpayWebhookSignature
} from "../services/btcpayService.js";

const logger = loggerLib.child("BtcpayWebhook");

function polAmountCloseEnough(expected, fromMeta) {
  const a = Number(expected);
  const b = Number(fromMeta);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-6 + Math.abs(a) * 1e-9;
}

async function creditIfSettled(invoiceId) {
  let invoice;
  try {
    invoice = await fetchBtcpayInvoice(invoiceId);
  } catch (e) {
    logger.warn("Invoice fetch failed after webhook", { invoiceId, message: e.message });
    return { ok: false, httpStatus: 502 };
  }

  const status = String(invoice?.status || "");
  if (status !== "Settled") {
    return { ok: true, httpStatus: 200, ignored: true, reason: "not_settled" };
  }

  const meta = invoice?.metadata && typeof invoice.metadata === "object" ? invoice.metadata : {};
  const metaUserId = meta.userId != null ? String(meta.userId) : "";
  const metaExpectedPol = meta.expectedPol != null ? String(meta.expectedPol) : "";

  const txHash = buildBtcpayTxHash(invoiceId);
  const row = await prisma.transaction.findFirst({
    where: { txHash, type: "deposit" }
  });

  if (!row) {
    logger.warn("No local deposit row for settled invoice", { invoiceId });
    return { ok: true, httpStatus: 200, ignored: true, reason: "invoice_not_tracked" };
  }

  if (row.status === "completed") {
    return { ok: true, httpStatus: 200, ignored: true, reason: "already_credited" };
  }

  if (row.status !== BTCPAY_DEPOSIT_STATUS_PENDING) {
    logger.warn("Unexpected row status for BTCPay deposit", { invoiceId, status: row.status });
    return { ok: true, httpStatus: 200, ignored: true, reason: "wrong_status" };
  }

  if (!metaUserId || String(row.userId) !== metaUserId) {
    logger.error("Metadata user mismatch — not crediting", { invoiceId, rowUserId: row.userId });
    return { ok: true, httpStatus: 200, ignored: true, reason: "user_mismatch" };
  }

  if (!polAmountCloseEnough(row.amount, metaExpectedPol)) {
    logger.error("Metadata POL amount mismatch — not crediting", {
      invoiceId,
      rowAmount: String(row.amount),
      metaExpectedPol
    });
    return { ok: true, httpStatus: 200, ignored: true, reason: "amount_mismatch" };
  }

  const creditAmount = Number(row.amount);
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    logger.error("Invalid credit amount on row", { invoiceId, amount: row.amount });
    return { ok: true, httpStatus: 200, ignored: true, reason: "bad_amount" };
  }

  const credited = await prisma.$transaction(async (tx) => {
    const locked = await tx.transaction.findFirst({
      where: { id: row.id, type: "deposit", status: BTCPAY_DEPOSIT_STATUS_PENDING }
    });
    if (!locked) {
      return false;
    }

    await tx.transaction.update({
      where: { id: row.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        rawTx: JSON.stringify({
          provider: "btcpay",
          invoiceId,
          invoiceStatus: status,
          settledAt: invoice?.settledDate || new Date().toISOString()
        })
      }
    });

    await tx.user.update({
      where: { id: row.userId },
      data: { polBalance: { increment: creditAmount } }
    });
    return true;
  });

  if (!credited) {
    return { ok: true, httpStatus: 200, ignored: true, reason: "race_or_already_done" };
  }

  try {
    const { applyUserBalanceDelta } = await import("../src/runtime/miningRuntime.js");
    applyUserBalanceDelta(row.userId, creditAmount);
  } catch {}

  try {
    const { getMiningEngine } = await import("../src/miningEngineInstance.js");
    const { createNotification } = await import("./notificationController.js");
    const engine = getMiningEngine();
    await createNotification({
      userId: row.userId,
      title: "Deposit confirmed",
      message: `Your BTCPay deposit of ${creditAmount.toFixed(4)} POL was credited.`,
      type: "success",
      io: engine?.io ?? null
    });
    if (engine?.io) {
      engine.io.to(`user:${row.userId}`).emit("wallet:deposit_confirmed", {
        amount: creditAmount,
        txHash,
        txId: row.id
      });
    }
  } catch {}

  logger.info("BTCPay deposit credited", { userId: row.userId, invoiceId, amount: creditAmount });
  return { ok: true, httpStatus: 200, credited: true };
}

export async function handleBtcpayWebhook(req, res) {
  const secret = String(process.env.BTCPAY_WEBHOOK_SECRET || "").trim();
  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return res.status(400).json({ ok: false, code: "INVALID_WEBHOOK" });
  }

  const sig = req.headers["btcpay-sig"] || req.headers["BTCPay-Sig"];
  if (!verifyBtcpayWebhookSignature(rawBody, String(sig || ""), secret)) {
    logger.warn("Invalid BTCPay webhook signature");
    return res.status(401).json({ ok: false, code: "INVALID_WEBHOOK" });
  }

  if (isBtcpayComingSoon()) {
    logger.info("BTCPay webhook acknowledged but skipped (BTCPAY_COMING_SOON)");
    return res.status(200).json({ ok: true, ignored: true, reason: "coming_soon" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ ok: false, code: "INVALID_WEBHOOK" });
  }

  const type = String(payload?.type || "");
  const invoiceId = payload?.invoiceId != null ? String(payload.invoiceId) : "";

  if (!invoiceId) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  if (!BTCPAY_WEBHOOK_SETTLE_TYPES.has(type)) {
    return res.status(200).json({ ok: true, ignored: true, type });
  }

  const result = await creditIfSettled(invoiceId);
  return res.status(result.httpStatus || 200).json({
    ok: result.ok,
    ...(result.credited ? { credited: true } : {}),
    ...(result.ignored ? { ignored: true, reason: result.reason } : {})
  });
}
