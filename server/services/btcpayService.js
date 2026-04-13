/**
 * BTCPay Server (Greenfield API) client + webhook signature verification.
 * Payment flow: user requests POL credit → invoice priced in USD → user pays BTC/LN →
 * BTCPay marks invoice Settled → webhook → we verify + credit POL once (idempotent).
 */
/* global fetch */
import crypto from "crypto";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("BtcpayService");

const BTCPAY_TX_PREFIX = "btcpay:";

export const BTCPAY_DEPOSIT_STATUS_PENDING = "btcpay_pending";

/** Webhook types that warrant re-fetching the invoice from BTCPay (server truth). */
export const BTCPAY_WEBHOOK_SETTLE_TYPES = new Set(["InvoiceSettled"]);

export function isBtcpayConfigured() {
  const url = String(process.env.BTCPAY_URL || "").trim();
  const key = String(process.env.BTCPAY_API_KEY || "").trim();
  const store = String(process.env.BTCPAY_STORE_ID || "").trim();
  const wh = String(process.env.BTCPAY_WEBHOOK_SECRET || "").trim();
  return Boolean(url && key && store && wh);
}

export function getBtcpayBaseUrl() {
  const raw = String(process.env.BTCPAY_URL || "").trim().replace(/\/+$/, "");
  return raw;
}

export function buildBtcpayTxHash(invoiceId) {
  return `${BTCPAY_TX_PREFIX}${String(invoiceId).trim()}`;
}

export function parseInvoiceIdFromTxHash(txHash) {
  if (!txHash || typeof txHash !== "string") return null;
  const t = txHash.trim();
  if (!t.toLowerCase().startsWith(BTCPAY_TX_PREFIX)) return null;
  const id = t.slice(BTCPAY_TX_PREFIX.length).trim();
  return id || null;
}

/**
 * Verifies BTCPay-Sig: sha256=<hex> against the raw webhook body (must be unparsed bytes).
 */
export function verifyBtcpayWebhookSignature(rawBody, btcpaySigHeader, secret) {
  if (!Buffer.isBuffer(rawBody) || !secret || typeof btcpaySigHeader !== "string") {
    return false;
  }
  const m = /^sha256=(.+)$/i.exec(btcpaySigHeader.trim());
  if (!m) return false;
  const expectedHex = m[1].toLowerCase();
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expectedHex, "hex"));
  } catch {
    return false;
  }
}

function greenfieldHeaders() {
  const key = String(process.env.BTCPAY_API_KEY || "").trim();
  return {
    Authorization: `token ${key}`,
    "Content-Type": "application/json"
  };
}

/**
 * Creates a BTCPay invoice. Amount is fiat (USD) for checkout; POL credit is stored separately in DB metadata.
 */
export async function createBtcpayInvoice({ amountUsd, metadata }) {
  const base = getBtcpayBaseUrl();
  const storeId = String(process.env.BTCPAY_STORE_ID || "").trim();
  const url = `${base}/api/v1/stores/${encodeURIComponent(storeId)}/invoices`;
  const body = {
    amount: amountUsd,
    currency: "USD",
    metadata: metadata || {},
    checkout: { speedPolicy: "MediumSpeed" }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: greenfieldHeaders(),
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    logger.warn("BTCPay create invoice failed", { status: res.status, bodySnippet: text.slice(0, 200) });
    const err = new Error("BTCPAY_INVOICE_CREATE_FAILED");
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

/**
 * Fetches invoice JSON from BTCPay (authoritative state for credits).
 */
export async function fetchBtcpayInvoice(invoiceId) {
  const base = getBtcpayBaseUrl();
  const storeId = String(process.env.BTCPAY_STORE_ID || "").trim();
  const url = `${base}/api/v1/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}`;
  const res = await fetch(url, { headers: greenfieldHeaders() });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const err = new Error("BTCPAY_INVOICE_FETCH_FAILED");
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

/**
 * Extracts a BTC on-chain address from the invoice payload when BTCPay exposes it (varies by version / payment method).
 */
export function extractBtcAddressFromInvoice(invoice) {
  const addresses = invoice?.addresses;
  if (addresses && typeof addresses === "object") {
    const btc = addresses.BTC || addresses.btc;
    if (typeof btc === "string" && btc.length > 10) return btc;
  }
  const pm = invoice?.availablePaymentMethods;
  if (Array.isArray(pm)) {
    for (const p of pm) {
      const dest = p?.destination;
      if (typeof dest === "string" && dest.length > 10) return dest;
    }
  }
  return null;
}
