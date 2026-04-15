/**
 * Cloudflare Turnstile server-side verification.
 * Optional when no secret is configured for the route (see resolveTurnstileSecret).
 */

import loggerLib from "../utils/logger.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

const logger = loggerLib.child("Turnstile");

function envFlag(name) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** @typedef {'login' | 'register' | undefined} TurnstilePurpose */

/**
 * Resolves the secret for siteverify. Per-purpose keys override TURNSTILE_SECRET_KEY.
 * Non-auth routes use purpose undefined → TURNSTILE_SECRET_KEY only.
 *
 * @param {TurnstilePurpose} [purpose]
 * @returns {string}
 */
export function resolveTurnstileSecret(purpose) {
  const fallback = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (purpose === "login") {
    return String(process.env.TURNSTILE_SECRET_KEY_LOGIN || "").trim() || fallback;
  }
  if (purpose === "register") {
    return String(process.env.TURNSTILE_SECRET_KEY_REGISTER || "").trim() || fallback;
  }
  return fallback;
}

export function isTurnstileEnforced() {
  return resolveTurnstileSecret(undefined).length > 0;
}

/**
 * @param {string | undefined | null} token
 * @param {string | undefined} remoteIp
 * @param {{ secret?: string }} [options] If `secret` is omitted, uses TURNSTILE_SECRET_KEY (legacy callers).
 */
export async function verifyTurnstileToken(token, remoteIp, options = {}) {
  const secret = String(options.secret ?? process.env.TURNSTILE_SECRET_KEY ?? "").trim();
  if (!secret) {
    return { ok: true, skipped: true };
  }
  const t = String(token || "").trim();
  if (!t) {
    return { ok: false, code: SecurityErrorCodes.CAPTCHA_REQUIRED };
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", t);
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (json?.success === true) {
      return { ok: true, skipped: false };
    }
    logger.warn("Turnstile verification failed", { errorCodes: json?.["error-codes"] });
    return { ok: false, code: SecurityErrorCodes.CAPTCHA_FAILED };
  } catch (e) {
    logger.error("Turnstile request error", { message: /** @type {Error} */ (e).message });
    if (envFlag("TURNSTILE_FAIL_OPEN")) {
      return { ok: true, skipped: true };
    }
    return { ok: false, code: SecurityErrorCodes.CAPTCHA_FAILED };
  }
}

/**
 * @param {unknown} arg
 * @returns {TurnstilePurpose}
 */
function normalizeTurnstilePurpose(arg) {
  if (arg === "login" || arg === "register") return arg;
  if (arg && typeof arg === "object") {
    const p = /** @type {{ purpose?: unknown }} */ (arg).purpose;
    if (p === "login" || p === "register") return p;
  }
  return undefined;
}

/**
 * Reads token from body.cfTurnstileToken or X-Turnstile-Token header.
 * @param {{ purpose?: 'login' | 'register' } | 'login' | 'register' | undefined} [arg]
 * @returns {import("express").RequestHandler}
 */
export function requireTurnstileWhenConfigured(arg) {
  const purpose = normalizeTurnstilePurpose(arg);
  return async (req, res, next) => {
    const secret = resolveTurnstileSecret(purpose);
    if (!secret) {
      next();
      return;
    }
    const token = req.body?.cfTurnstileToken ?? req.headers["x-turnstile-token"];
    const ip = String(req.ip || req.socket?.remoteAddress || "");
    const result = await verifyTurnstileToken(token, ip, { secret });
    if (!result.ok) {
      const code = result.code || SecurityErrorCodes.CAPTCHA_FAILED;
      return res.status(400).json(buildSecurityErrorJson(code));
    }
    next();
  };
}
