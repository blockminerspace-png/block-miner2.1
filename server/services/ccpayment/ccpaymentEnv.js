/**
 * Centralized CCPayment feature flag parsing.
 * Production often sets APP_ID / APP_SECRET but omits CCPAYMENT_ENABLED or uses "1"/"yes".
 */

/**
 * @param {string} appId
 * @param {string} appSecret
 * @returns {boolean}
 */
export function hasCcpaymentCredentials(appId, appSecret) {
  return Boolean(String(appId || "").trim() && String(appSecret || "").trim());
}

function readAppId() {
  return String(process.env.CCPAYMENT_APP_ID || process.env.CCPAYMENT_API_KEY || "").trim();
}

function readAppSecret() {
  return String(
    process.env.CCPAYMENT_APP_SECRET ||
      process.env.CCPAYMENT_SECRET_KEY ||
      process.env.CCPAYMENT_WEBHOOK_SECRET ||
      ""
  ).trim();
}

/**
 * Whether wallet UI and outbound CCPayment API should run.
 *
 * - Explicit false: false, 0, no, off, disabled
 * - Explicit true: true, 1, yes, on, enabled
 * - Unset / empty: enabled when both App ID and App Secret are non-empty (credentials imply intent)
 * - Any other string: false (avoid accidental enable)
 *
 * @returns {boolean}
 */
export function isCcpaymentIntegrationEnabled() {
  const raw = String(process.env.CCPAYMENT_ENABLED ?? "").trim().toLowerCase();
  const falsy = new Set(["false", "0", "no", "off", "disabled"]);
  const truthy = new Set(["true", "1", "yes", "on", "enabled"]);
  if (falsy.has(raw)) return false;
  if (truthy.has(raw)) return true;
  if (!raw) {
    return hasCcpaymentCredentials(readAppId(), readAppSecret());
  }
  return false;
}

/**
 * For status endpoints / support (no secrets).
 *
 * @returns {{ enabled: boolean, configured: boolean, mode: 'explicit_on' | 'explicit_off' | 'inferred_from_credentials' | 'unknown_flag' }}
 */
export function getCcpaymentIntegrationStatus() {
  const raw = String(process.env.CCPAYMENT_ENABLED ?? "").trim().toLowerCase();
  const falsy = new Set(["false", "0", "no", "off", "disabled"]);
  const truthy = new Set(["true", "1", "yes", "on", "enabled"]);
  const configured = hasCcpaymentCredentials(readAppId(), readAppSecret());

  if (falsy.has(raw)) {
    return { enabled: false, configured, mode: "explicit_off" };
  }
  if (truthy.has(raw)) {
    return { enabled: true, configured, mode: "explicit_on" };
  }
  if (!raw) {
    return {
      enabled: configured,
      configured,
      mode: configured ? "inferred_from_credentials" : "unset_no_credentials"
    };
  }
  return { enabled: false, configured, mode: "unknown_flag" };
}
