/**
 * BTCPay Server (Greenfield API) client + webhook signature verification.
 * Payment flow: user requests POL credit → invoice priced in USD → user pays BTC on-chain and/or Lightning →
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

/** Env keys required for Bitcoin (BTCPay) deposits (names only — no values). */
export const BTCPAY_REQUIRED_ENV_KEYS = Object.freeze([
  "BTCPAY_URL",
  "BTCPAY_API_KEY",
  "BTCPAY_STORE_ID",
  "BTCPAY_WEBHOOK_SECRET"
]);

/** Returns which required BTCPay env vars are missing or blank (stable order). */
export function listBtcpayMissingEnvKeys() {
  const missing = [];
  for (const k of BTCPAY_REQUIRED_ENV_KEYS) {
    if (!String(process.env[k] || "").trim()) missing.push(k);
  }
  return missing;
}

export function isBtcpayConfigured() {
  return listBtcpayMissingEnvKeys().length === 0;
}

/** True when BTCPAY_COMING_SOON is set — UI shows "Coming soon" and invoice API is off (e.g. BTCPay stack stopped). */
export function isBtcpayComingSoon() {
  const v = String(process.env.BTCPAY_COMING_SOON || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Greenfield invoice flow allowed (configured and not in coming-soon mode). */
export function isBtcpayInvoiceFlowEnabled() {
  if (isBtcpayComingSoon()) return false;
  return isBtcpayConfigured();
}

export function getBtcpayBaseUrl() {
  const raw = String(process.env.BTCPAY_URL || "").trim().replace(/\/+$/, "");
  return raw;
}

/**
 * Resolves Greenfield `checkout.paymentMethods` from env.
 * @param {string|undefined} rawEnv value of BTCPAY_INVOICE_PAYMENT_METHODS
 * @returns {string[]|undefined} list to send, or undefined to omit (BTCPay uses store-enabled methods only)
 */
export function resolveBtcpayCheckoutPaymentMethodsFromRaw(rawEnv) {
  const raw = String(rawEnv ?? "").trim();
  if (!raw) return undefined;
  if (/^(STORE_DEFAULT|\*)$/i.test(raw)) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

export function resolveBtcpayCheckoutPaymentMethods() {
  return resolveBtcpayCheckoutPaymentMethodsFromRaw(process.env.BTCPAY_INVOICE_PAYMENT_METHODS);
}

function looksLikeLightningDestination(s) {
  const t = String(s).trim().toLowerCase();
  if (t.length < 10) return false;
  return (
    t.startsWith("lnbc") ||
    t.startsWith("lntb") ||
    t.startsWith("lnbcrt") ||
    t.startsWith("lightning:") ||
    t.startsWith("lnurl")
  );
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
  const checkout = { speedPolicy: "MediumSpeed" };
  const paymentMethods = resolveBtcpayCheckoutPaymentMethods();
  if (paymentMethods?.length) checkout.paymentMethods = paymentMethods;
  const body = {
    amount: amountUsd,
    currency: "USD",
    metadata: metadata || {},
    checkout
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
 * Extracts a BTC on-chain address from the invoice payload (excludes Lightning BOLT11 / LNURL).
 */
export function extractBtcAddressFromInvoice(invoice) {
  const addresses = invoice?.addresses;
  if (addresses && typeof addresses === "object") {
    const btc = addresses.BTC || addresses.btc;
    if (typeof btc === "string" && btc.length > 10 && !looksLikeLightningDestination(btc)) return btc;
  }
  const pm = invoice?.availablePaymentMethods;
  if (Array.isArray(pm)) {
    for (const p of pm) {
      const id = String(p?.paymentMethodId || "");
      if (/lightning/i.test(id)) continue;
      const dest = p?.destination;
      if (typeof dest !== "string" || dest.length < 10) continue;
      if (looksLikeLightningDestination(dest)) continue;
      return dest;
    }
  }
  return null;
}

/**
 * BOLT11 / Lightning payment link from the invoice when BTCPay exposes Lightning as a payment method.
 */
export function extractLightningInvoiceFromInvoice(invoice) {
  const pm = invoice?.availablePaymentMethods;
  if (!Array.isArray(pm)) return null;
  for (const p of pm) {
    const id = String(p?.paymentMethodId || "");
    if (!/lightning/i.test(id)) continue;
    const dest = p?.destination;
    if (typeof dest === "string" && dest.length > 10) return dest;
    const link = p?.paymentLink;
    if (typeof link === "string" && link.length > 10) return link;
  }
  return null;
}
