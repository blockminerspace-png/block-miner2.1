/**
 * Stable API codes and i18n keys for security-sensitive flows (client maps messageKey → locale string).
 */

export const SecurityErrorCodes = {
  RACE_CONDITION_DETECTED: "RACE_CONDITION_DETECTED",
  IDEMPOTENT_REPLAY: "IDEMPOTENT_REPLAY",
  INVALID_STATE: "INVALID_STATE",
};

/** @type {Record<string, string>} */
const EN_FALLBACK = {
  RACE_CONDITION_DETECTED:
    "This action conflicted with another request. Refresh the page and try again.",
  IDEMPOTENT_REPLAY: "This purchase was already processed; returning the previous result.",
  INVALID_STATE: "The resource is not in a valid state for this action.",
};

/**
 * @param {string} code
 * @param {string} [messageKey] i18n path under client locales
 */
export function securityMessageKeyForCode(code) {
  return `errors.security.${code}`;
}

/**
 * @param {string} code
 * @param {{ extra?: Record<string, unknown> }} [opts]
 */
export function buildSecurityErrorJson(code, opts = {}) {
  const message = EN_FALLBACK[code] || "Request could not be completed.";
  return {
    ok: false,
    code,
    messageKey: securityMessageKeyForCode(code),
    message,
    ...(opts.extra && typeof opts.extra === "object" ? { details: opts.extra } : {}),
  };
}
