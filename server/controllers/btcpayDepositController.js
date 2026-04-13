/**
 * Authenticated BTCPay deposit endpoints: create USD-priced invoice, poll status.
 */
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { getPolUsdPrice } from "../utils/cryptoPrice.js";
import { getMinDepositPol } from "../services/polygonDepositConfig.js";
import {
  BTCPAY_DEPOSIT_STATUS_PENDING,
  buildBtcpayTxHash,
  createBtcpayInvoice,
  extractBtcAddressFromInvoice,
  fetchBtcpayInvoice,
  isBtcpayConfigured
} from "../services/btcpayService.js";

const logger = loggerLib.child("BtcpayDeposit");

function clientError(res, status, code, i18nKey, message) {
  return res.status(status).json({
    ok: false,
    code,
    i18nKey,
    message: message || code
  });
}

export async function postBtcpayInvoice(req, res) {
  try {
    if (!isBtcpayConfigured()) {
      return clientError(
        res,
        503,
        "BTCPAY_DISABLED",
        "errors.btcpay.BTCPAY_DISABLED",
        "BTCPay deposits are disabled (missing server configuration)."
      );
    }

    const rawAmount = req.body?.amountPol;
    const amountPol = typeof rawAmount === "string" ? parseFloat(rawAmount) : Number(rawAmount);
    if (!Number.isFinite(amountPol) || amountPol <= 0) {
      return clientError(
        res,
        400,
        "INVALID_AMOUNT",
        "errors.btcpay.INVALID_AMOUNT",
        "Enter a valid POL amount above the minimum."
      );
    }

    const minD = getMinDepositPol();
    if (amountPol < minD) {
      return clientError(
        res,
        400,
        "INVALID_AMOUNT",
        "errors.btcpay.INVALID_AMOUNT",
        "Enter a valid POL amount above the minimum."
      );
    }

    let priceUsd;
    try {
      priceUsd = await getPolUsdPrice();
    } catch (e) {
      logger.warn("POL/USD price unavailable for BTCPay invoice", { message: e.message });
      return clientError(
        res,
        503,
        "PRICE_UNAVAILABLE",
        "errors.btcpay.PRICE_UNAVAILABLE",
        "Could not load the POL price. Try again later."
      );
    }

    const amountUsd = (amountPol * priceUsd).toFixed(2);
    if (!amountUsd || Number(amountUsd) <= 0) {
      return clientError(
        res,
        400,
        "INVALID_AMOUNT",
        "errors.btcpay.INVALID_AMOUNT",
        "Enter a valid POL amount above the minimum."
      );
    }

    const userId = req.user.id;
    const metadata = {
      userId: String(userId),
      expectedPol: String(amountPol),
      app: "blockminer"
    };

    let invoice;
    try {
      invoice = await createBtcpayInvoice({ amountUsd, metadata });
    } catch (e) {
      logger.error("createBtcpayInvoice failed", { message: e.message });
      return clientError(
        res,
        502,
        "INVOICE_CREATE_FAILED",
        "errors.btcpay.INVOICE_CREATE_FAILED",
        "Could not create the BTCPay invoice."
      );
    }

    const invoiceId = invoice?.id != null ? String(invoice.id) : "";
    const checkoutLink = invoice?.checkoutLink != null ? String(invoice.checkoutLink) : "";
    if (!invoiceId || !checkoutLink) {
      logger.error("BTCPay invoice missing id or checkoutLink");
      return clientError(
        res,
        502,
        "INVOICE_CREATE_FAILED",
        "errors.btcpay.INVOICE_CREATE_FAILED",
        "Could not create the BTCPay invoice."
      );
    }

    const txHash = buildBtcpayTxHash(invoiceId);
    const existing = await prisma.transaction.findFirst({ where: { txHash, type: "deposit" } });
    if (existing) {
      let priorCheckout = checkoutLink;
      try {
        const j = JSON.parse(existing.rawTx || "{}");
        if (typeof j.checkoutLink === "string") priorCheckout = j.checkoutLink;
      } catch {
        /* ignore */
      }
      return res.status(200).json({
        ok: true,
        reused: true,
        invoiceId,
        checkoutLink: priorCheckout,
        amountPol: Number(existing.amount),
        amountUsd,
        polUsdRate: priceUsd,
        btcAddress: extractBtcAddressFromInvoice(invoice),
        status: existing.status
      });
    }

    await prisma.transaction.create({
      data: {
        userId,
        type: "deposit",
        amount: String(amountPol),
        txHash,
        status: BTCPAY_DEPOSIT_STATUS_PENDING,
        verifyAttempts: 0,
        rawTx: JSON.stringify({
          provider: "btcpay",
          invoiceId,
          amountUsd,
          polUsdRateSnapshot: priceUsd,
          checkoutLink
        })
      }
    });

    return res.json({
      ok: true,
      invoiceId,
      checkoutLink,
      amountPol,
      amountUsd,
      polUsdRate: priceUsd,
      btcAddress: extractBtcAddressFromInvoice(invoice),
      status: BTCPAY_DEPOSIT_STATUS_PENDING
    });
  } catch (err) {
    logger.error("postBtcpayInvoice error", { error: err.message });
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      i18nKey: "errors.btcpay.SERVER_ERROR",
      message: "Unexpected server error."
    });
  }
}

export async function getBtcpayInvoiceStatus(req, res) {
  try {
    if (!isBtcpayConfigured()) {
      return clientError(
        res,
        503,
        "BTCPAY_DISABLED",
        "errors.btcpay.BTCPAY_DISABLED",
        "BTCPay deposits are disabled (missing server configuration)."
      );
    }

    const invoiceId = String(req.params?.invoiceId || "").trim();
    if (!invoiceId) {
      return clientError(
        res,
        400,
        "INVALID_INVOICE_ID",
        "errors.btcpay.INVALID_INVOICE_ID",
        "Invalid invoice identifier."
      );
    }

    const txHash = buildBtcpayTxHash(invoiceId);
    const row = await prisma.transaction.findFirst({
      where: { userId: req.user.id, txHash, type: "deposit" }
    });

    if (!row) {
      return clientError(
        res,
        404,
        "INVOICE_NOT_FOUND",
        "errors.btcpay.INVOICE_NOT_FOUND",
        "Invoice not found for your account."
      );
    }

    let remote = null;
    try {
      remote = await fetchBtcpayInvoice(invoiceId);
    } catch (e) {
      logger.warn("fetchBtcpayInvoice in status poll failed", { invoiceId, message: e.message });
    }

    const parsedRaw = (() => {
      try {
        return row.rawTx ? JSON.parse(row.rawTx) : {};
      } catch {
        return {};
      }
    })();

    return res.json({
      ok: true,
      invoiceId,
      localStatus: row.status,
      remoteStatus: remote?.status != null ? String(remote.status) : null,
      amountPol: Number(row.amount),
      checkoutLink: parsedRaw.checkoutLink || remote?.checkoutLink || null,
      btcAddress: remote ? extractBtcAddressFromInvoice(remote) : null,
      paymentNotConfirmed:
        row.status === BTCPAY_DEPOSIT_STATUS_PENDING && String(remote?.status || "") !== "Settled"
    });
  } catch (err) {
    logger.error("getBtcpayInvoiceStatus error", { error: err.message });
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      i18nKey: "errors.btcpay.SERVER_ERROR",
      message: "Unexpected server error."
    });
  }
}
