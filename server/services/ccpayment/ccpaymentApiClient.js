/**
 * Outbound CCPayment REST calls (merchant → CCPayment).
 * Signature: lowercase hex SHA-256 of UTF-8 (appId + appSecret + timestamp + rawJsonBody).
 *
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/to-get-started/signature
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/wallet-api-ccpayment/get-permanent-deposit-address-for-users
 */

import { computeCcPaymentSign } from "./ccpaymentSignature.js";

function getAppId() {
  return String(process.env.CCPAYMENT_APP_ID || process.env.CCPAYMENT_API_KEY || "").trim();
}

function getAppSecret() {
  return String(
    process.env.CCPAYMENT_APP_SECRET ||
      process.env.CCPAYMENT_SECRET_KEY ||
      process.env.CCPAYMENT_WEBHOOK_SECRET ||
      ""
  ).trim();
}

function baseUrl() {
  return String(
    process.env.CCPAYMENT_API_BASE_URL || "https://admin.ccpayment.com/ccpayment/v1"
  ).replace(/\/+$/, "");
}

function timeoutMs() {
  const n = Number(process.env.CCPAYMENT_TIMEOUT_MS || 15000);
  return Number.isFinite(n) && n > 0 ? n : 15000;
}

function addressPath() {
  const p = String(process.env.CCPAYMENT_PAYMENT_ADDRESS_PATH || "/payment/address/get").trim();
  return p.startsWith("/") ? p : `/${p}`;
}

/**
 * @returns {boolean}
 */
export function isCcpaymentClientConfigured() {
  return Boolean(getAppId() && getAppSecret());
}

/**
 * @param {string} pathname
 * @param {Record<string, unknown>} bodyObj
 * @returns {Promise<unknown>}
 */
export async function ccpaymentPostSignedJson(pathname, bodyObj) {
  const appId = getAppId();
  const appSecret = getAppSecret();
  if (!appId || !appSecret) {
    throw new Error("CCPayment credentials not configured");
  }

  const body = JSON.stringify(bodyObj ?? {});
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = computeCcPaymentSign(appId, appSecret, timestamp, body);
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const url = `${baseUrl()}${path}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Appid: appId,
      Timestamp: timestamp,
      Sign: sign
    },
    body,
    signal: AbortSignal.timeout(timeoutMs())
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`CCPayment invalid JSON (HTTP ${res.status})`);
  }

  if (Number(parsed.code) !== 10000) {
    const msg = String(parsed.msg || "CCPayment request failed");
    throw new Error(msg);
  }

  return parsed.data;
}

/**
 * Stable per-user id for CCPayment permanent address API (must match webhook merchant_order_id parsing).
 *
 * @param {number} userId
 * @returns {string}
 */
export function ccpaymentMerchantUserId(userId) {
  return `BM${userId}-bm`;
}

/**
 * @param {{ userId: number }} params
 * @returns {Promise<{ address: string, memo?: string }>}
 */
export async function getPermanentDepositAddress({ userId }) {
  const chain = String(process.env.CCPAYMENT_CHAIN || "POLYGON").trim();
  const notifyUrl = String(process.env.CCPAYMENT_NOTIFY_URL || process.env.CCPAYMENT_WEBHOOK_URL || "").trim();

  const payload = {
    user_id: ccpaymentMerchantUserId(userId),
    chain
  };
  if (notifyUrl) {
    payload.notify_url = notifyUrl;
  }

  const data = await ccpaymentPostSignedJson(addressPath(), payload);
  if (!data || typeof data !== "object") {
    throw new Error("CCPayment empty data");
  }
  const address = String(data.address || "").trim();
  if (!address) {
    throw new Error("CCPayment response missing address");
  }
  return {
    address,
    memo: data.memo != null ? String(data.memo).trim() : ""
  };
}
