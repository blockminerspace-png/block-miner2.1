/**
 * Outbound CCPayment REST calls (merchant → CCPayment).
 * Signature: lowercase hex SHA-256 of UTF-8 (appId + appSecret + timestamp + rawJsonBody).
 *
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/to-get-started/signature
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/wallet-api-ccpayment/get-permanent-deposit-address-for-users
 */

import { computeCcPaymentSign, computeCcPaymentOutboundSignV2 } from "./ccpaymentSignature.js";
import { normalizeEnvString } from "./ccpaymentEnv.js";

/**
 * Outbound wallet API:
 * - "1" (default): POST admin …/v1/payment/address/get, body user_id + chain, Sign = SHA-256(appId+appSecret+timestamp+body).
 * - "2": POST https://ccpayment.com/ccpayment/v2/getOrCreateUserDepositAddress (SDK-style v2 host), body userId + chain, Sign = HMAC-SHA256(appSecret, appId+timestamp+body).
 *   v2-only merchant accounts reject admin/v1 URLs with "only call api of version 2".
 */
function outboundWalletApiVersion() {
  return normalizeEnvString(process.env.CCPAYMENT_OUTBOUND_API_VERSION || "1").toLowerCase();
}

function getAppId() {
  return normalizeEnvString(process.env.CCPAYMENT_APP_ID || process.env.CCPAYMENT_API_KEY || "");
}

function getAppSecret() {
  return normalizeEnvString(
    process.env.CCPAYMENT_APP_SECRET ||
      process.env.CCPAYMENT_SECRET_KEY ||
      process.env.CCPAYMENT_WEBHOOK_SECRET ||
      ""
  );
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

/** Base URL for outbound API v2 (not admin.ccpayment.com). */
function outboundV2BaseUrl() {
  return String(process.env.CCPAYMENT_API_V2_BASE_URL || "https://ccpayment.com/ccpayment/v2").replace(
    /\/+$/,
    ""
  );
}

/** Path for Create or Get User Deposit Address on v2. */
function v2UserDepositAddressPath() {
  const p = String(
    process.env.CCPAYMENT_V2_USER_DEPOSIT_PATH || "/getOrCreateUserDepositAddress"
  ).trim();
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
  const referenceId = ccpaymentMerchantUserId(userId);

  const payload = {
    user_id: referenceId,
    chain
  };
  if (notifyUrl) {
    payload.notify_url = notifyUrl;
  }

  if (outboundWalletApiVersion() === "2") {
    const appId = getAppId();
    const appSecret = getAppSecret();
    if (!appId || !appSecret) {
      throw new Error("CCPayment credentials not configured");
    }
    /**
     * User Deposit API — Create or Get User Deposit Address (v2 host).
     * @see https://ccpayment.com/api/doc/?en#deposit-apis
     */
    const v2Payload = { userId: referenceId, chain };
    const body = JSON.stringify(v2Payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = computeCcPaymentOutboundSignV2(appId, appSecret, timestamp, body);
    const url = `${outboundV2BaseUrl()}${v2UserDepositAddressPath()}`;

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

    const data = parsed.data;
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
