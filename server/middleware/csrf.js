import crypto from "crypto";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { logSecurityEvent } from "../utils/securityLogger.js";

export const CSRF_COOKIE_NAME = "blockminer_csrf";

function parseCookie(headerValue) {
  if (!headerValue) return {};
  return headerValue.split(";").reduce((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function sameSiteMode() {
  const raw = String(process.env.CSRF_COOKIE_SAMESITE || "").trim().toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;
  return process.env.NODE_ENV === "production" ? "strict" : "lax";
}

export function buildCsrfCookie(token) {
  const parts = [`${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`, "Path=/", `SameSite=${sameSiteMode()}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookieValue) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [existing];
  res.setHeader("Set-Cookie", [...cookies, cookieValue]);
}

/** @param {import("express").Response} res */
export function rotateCsrfCookie(res) {
  const token = crypto.randomBytes(24).toString("base64url");
  appendSetCookie(res, buildCsrfCookie(token));
  res.locals.csrfToken = token;
  return token;
}

export function createCsrfMiddleware() {
  return (req, res, next) => {
    const cookies = parseCookie(req.headers.cookie || "");

    let csrfToken = cookies[CSRF_COOKIE_NAME];
    if (!csrfToken || csrfToken.length < 16) {
      csrfToken = crypto.randomBytes(24).toString("base64url");
      appendSetCookie(res, buildCsrfCookie(csrfToken));
    }

    res.locals.csrfToken = csrfToken;

    const method = req.method.toUpperCase();
    const url = req.originalUrl || req.url;

    // Third-party server-to-server callbacks and Socket.IO (no browser CSRF token)
    if (url.includes("/socket.io/") || url.includes("/api/payments/btcpay/webhook")) {
      return next();
    }

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const headerToken = req.headers["x-csrf-token"];

      if (!headerToken || headerToken !== csrfToken) {
        logSecurityEvent(
          "INVALID_CSRF_TOKEN",
          { method, path: url, hasHeader: Boolean(headerToken) },
          req,
        );
        return res.status(403).json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_CSRF_TOKEN));
      }
    }

    next();
  };
}
