/**
 * Domain helpers for CCPayment API deposit webhooks (no I/O).
 * @see https://docs.ccpayment.com/ccpayment-v1.0-api/webhook-notification/api-deposit-webhook-notification
 */

/**
 * Extract BlockMiner user id from merchant_order_id.
 * Supported: "BM{userId}-{nonce}" (case-insensitive prefix) or numeric string.
 *
 * @param {string | null | undefined} merchantOrderId
 * @returns {number | null}
 */
export function parseUserIdFromMerchantOrderId(merchantOrderId) {
  if (merchantOrderId == null || typeof merchantOrderId !== "string") return null;
  const trimmed = merchantOrderId.trim();
  const m = trimmed.match(/^BM(\d+)-/i);
  if (m) {
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * @param {string} chain
 * @param {string} cryptoSymbol
 * @param {string[]} allowedChains
 * @param {string[]} allowedCryptos
 */
export function isAllowedChainAndCrypto(chain, cryptoSymbol, allowedChains, allowedCryptos) {
  const c = String(chain || "").trim();
  const sym = String(cryptoSymbol || "").trim().toUpperCase();
  const chainOk = allowedChains.some((x) => String(x).toLowerCase() === c.toLowerCase());
  const cryptoOk = allowedCryptos.some((x) => String(x).toUpperCase() === sym);
  return chainOk && cryptoOk;
}

/**
 * Map CCPayment pay_status to internal lifecycle label.
 *
 * @param {string} payStatus
 * @returns {'completed' | 'pending' | 'failed' | 'unknown'}
 */
export function normalizePayStatus(payStatus) {
  const s = String(payStatus || "").toLowerCase();
  if (s === "success") return "completed";
  if (s === "pending" || s === "processing") return "pending";
  if (s === "failed" || s === "fail" || s === "cancelled" || s === "canceled") return "failed";
  return "unknown";
}

/**
 * Parse POL amount from webhook body (paid_amount is token units for API deposit).
 *
 * @param {Record<string, unknown>} body
 * @returns {number | null}
 */
export function extractPolAmount(body) {
  const raw = body.paid_amount ?? body.order_amount ?? body.product_price;
  if (raw === undefined || raw === null) return null;
  const n = parseFloat(String(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
