import crypto from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import { authDebug } from "../utils/authDebug.js";

export const CSRF_COOKIE_NAME = "blockminer_csrf";

function parseCookie(headerValue: string | undefined): Record<string, string> {
  if (!headerValue) return {};
  return headerValue.split(";").reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function sameSiteMode(): "lax" | "strict" | "none" {
  const raw = String(process.env.CSRF_COOKIE_SAMESITE || "").trim().toLowerCase();
  if (raw === "lax" || raw === "strict" || raw === "none") return raw;
  return process.env.NODE_ENV === "production" ? "strict" : "lax";
}

export function buildCsrfCookie(token: string): string {
  const parts = [`${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`, "Path=/", `SameSite=${sameSiteMode()}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res: Response, cookieValue: string): void {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  const cookies = Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, cookieValue]);
}

export function rotateCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(24).toString("base64url");
  appendSetCookie(res, buildCsrfCookie(token));
  res.locals.csrfToken = token;
  return token;
}

export function createCsrfMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookie(req.headers.cookie);

    let csrfToken = cookies[CSRF_COOKIE_NAME];
    if (!csrfToken || csrfToken.length < 16) {
      csrfToken = crypto.randomBytes(24).toString("base64url");
      appendSetCookie(res, buildCsrfCookie(csrfToken));
    }

    res.locals.csrfToken = csrfToken;

    const method = req.method.toUpperCase();
    const url = req.originalUrl || req.url;

    if (url.includes("/socket.io/")) {
      next();
      return;
    }

    // S2S callbacks from external providers — no browser session, no CSRF token
    const S2S_PATHS = ["/api/offerwallme/postback", "/zeradsptc.php"];
    if (S2S_PATHS.some((p) => url.startsWith(p))) {
      next();
      return;
    }

    // Best-effort telemetry endpoints (rate-limited, no side effects).
    // CSRF protection here would just silence error reports / page-hit metrics.
    if (url.startsWith("/api/track/")) {
      next();
      return;
    }

    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const headerToken = req.headers["x-csrf-token"];
      const headerStr = Array.isArray(headerToken) ? headerToken[0] : headerToken;

      if (!headerStr || headerStr !== csrfToken) {
        logSecurityEvent(
          "INVALID_CSRF_TOKEN",
          { method, path: url, hasHeader: Boolean(headerStr) },
          req,
        );
        authDebug("CSRF_REJECT", req, {
          reason: "INVALID_CSRF_TOKEN",
          hasHeader: Boolean(headerStr),
          path: url,
        });
        res.status(403).json(buildSecurityErrorJson(SecurityErrorCodes.INVALID_CSRF_TOKEN));
        return;
      }
    }

    next();
  };
}
