/**
 * Stable API codes and i18n keys for security-sensitive flows (client maps messageKey → locale string).
 */

export const SecurityErrorCodes = {
  RACE_CONDITION_DETECTED: "RACE_CONDITION_DETECTED",
  IDEMPOTENT_REPLAY: "IDEMPOTENT_REPLAY",
  INVALID_STATE: "INVALID_STATE",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  TOO_MANY_ATTEMPTS: "TOO_MANY_ATTEMPTS",
  INVALID_CSRF_TOKEN: "INVALID_CSRF_TOKEN",
  INVALID_REQUEST_SIGNATURE: "INVALID_REQUEST_SIGNATURE",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  CAPTCHA_FAILED: "CAPTCHA_FAILED",
};

const EN_FALLBACK: Record<string, string> = {
  RACE_CONDITION_DETECTED:
    "This action conflicted with another request. Refresh the page and try again.",
  IDEMPOTENT_REPLAY: "This purchase was already processed; returning the previous result.",
  INVALID_STATE: "The resource is not in a valid state for this action.",
  ACCOUNT_LOCKED: "This account is temporarily locked after too many failed sign-in attempts. Try again later.",
  TOO_MANY_REQUESTS: "Too many requests. Please slow down and try again.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please slow down and try again.",
  TOO_MANY_ATTEMPTS: "Too many attempts for this action. Please wait before trying again.",
  INVALID_CSRF_TOKEN: "This action was blocked for security (CSRF). Please reload the page and try again.",
  INVALID_REQUEST_SIGNATURE:
    "The idempotency key does not match this request payload. Use a new key for a different action.",
  CAPTCHA_REQUIRED: "Human verification is required for this action.",
  CAPTCHA_FAILED: "Human verification failed. Please try again.",
};

/**
 * @param {string} code
 * @param {string} [messageKey] i18n path under client locales
 */
export function securityMessageKeyForCode(code: string): string {
  return `errors.security.${code}`;
}

export type BuildSecurityErrorOpts = {
  extra?: Record<string, unknown>;
};

export function buildSecurityErrorJson(code: string, opts: BuildSecurityErrorOpts = {}) {
  const message = EN_FALLBACK[code] || "Request could not be completed.";
  return {
    ok: false,
    code,
    messageKey: securityMessageKeyForCode(code),
    message,
    ...(opts.extra && typeof opts.extra === "object" ? { details: opts.extra } : {}),
  };
}
