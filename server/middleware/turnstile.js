/**
 * Cloudflare Turnstile server-side verification. Optional when TURNSTILE_SECRET_KEY is unset.
 */

import loggerLib from "../utils/logger.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

const logger = loggerLib.child("Turnstile");

function envFlag(name) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function isTurnstileEnforced() {
  return String(process.env.TURNSTILE_SECRET_KEY || "").trim().length > 0;
}

/**
 * @param {string | undefined | null} token
 * @param {string | undefined} remoteIp
 */
export async function verifyTurnstileToken(token, remoteIp) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
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
 * Reads token from body.cfTurnstileToken or X-Turnstile-Token header.
 * @returns {import("express").RequestHandler}
 */
export function requireTurnstileWhenConfigured() {
  return async (req, res, next) => {
    if (!isTurnstileEnforced()) {
      next();
      return;
    }
    const token = req.body?.cfTurnstileToken ?? req.headers["x-turnstile-token"];
    const ip = String(req.ip || req.socket?.remoteAddress || "");
    const result = await verifyTurnstileToken(token, ip);
    if (!result.ok) {
      const code = result.code || SecurityErrorCodes.CAPTCHA_FAILED;
      return res.status(400).json(buildSecurityErrorJson(code));
    }
    next();
  };
}
