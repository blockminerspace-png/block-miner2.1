import jwt from "jsonwebtoken";
import crypto from "crypto";
import loggerLib from "../utils/logger.js";
import { getRequestIp } from "../utils/clientIp.js";
import { createAuditLogBestEffort } from "../models/auditLogModel.js";
import { ADMIN_SESSION_COOKIE, getAdminTokenFromRequest } from "../utils/token.js";

const logger = loggerLib.child("AdminAuthController");

function timingSafeStringEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_SECURITY_CODE = String(process.env.ADMIN_SECURITY_CODE || "").trim();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || "24h";

/** Use Secure cookie only over HTTPS (or when forced), so admin login works on http://IP:port in production. */
function adminCookieShouldBeSecure(req) {
  const flag = String(process.env.ADMIN_SESSION_COOKIE_SECURE || "").trim().toLowerCase();
  if (flag === "false") return false;
  if (flag === "true") return true;
  const proto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || proto === "https");
}

function buildAdminCookie(token, { secure } = {}) {
  const parts = [`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  const cookieDomain = String(
    process.env.ADMIN_SESSION_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN || ""
  ).trim();
  if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function pickFirstNonEmptyString(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export async function login(req, res) {
  try {
    if (!ADMIN_EMAIL || !ADMIN_SECURITY_CODE) {
      return res.status(503).json({
        ok: false,
        code: "ADMIN_AUTH_NOT_CONFIGURED",
        message: "Admin auth not configured (set ADMIN_EMAIL and ADMIN_SECURITY_CODE)."
      });
    }

    if (!JWT_SECRET) {
      return res.status(503).json({
        ok: false,
        code: "ADMIN_AUTH_NOT_CONFIGURED",
        message: "Admin auth not configured (JWT_SECRET missing)."
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const userEmailRaw = pickFirstNonEmptyString(body, ["email", "Email", "adminEmail", "admin_email"]);
    const rawCode = pickFirstNonEmptyString(body, [
      "securityCode",
      "password",
      "code",
      "adminCode",
      "security_code",
      "admin_password"
    ]);

    if (!userEmailRaw || !rawCode) {
      void createAuditLogBestEffort({
        userId: null,
        action: "ADMIN_LOGIN_FAILURE",
        ip: getRequestIp(req),
        userAgent: req.headers["user-agent"] || null,
        details: { reason: "MISSING_FIELDS" },
      });
      return res.status(400).json({ ok: false, message: "Email and code required" });
    }

    const userEmail = userEmailRaw.toLowerCase();
    const userCode = rawCode;

    const emailMatch = timingSafeStringEqual(userEmail, ADMIN_EMAIL);
    const codeMatch = timingSafeStringEqual(userCode, ADMIN_SECURITY_CODE);

    if (!emailMatch || !codeMatch) {
      void createAuditLogBestEffort({
        userId: null,
        action: "ADMIN_LOGIN_FAILURE",
        ip: getRequestIp(req),
        userAgent: req.headers["user-agent"] || null,
        details: { reason: "INVALID_CREDENTIALS" },
      });
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ role: "admin", type: "admin_session" }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: "blockminer-admin"
    });

    const cookieSecure = adminCookieShouldBeSecure(req);
    res.setHeader("Set-Cookie", buildAdminCookie(token, { secure: cookieSecure }));
    void createAuditLogBestEffort({
      userId: null,
      action: "ADMIN_LOGIN_SUCCESS",
      ip: getRequestIp(req),
      userAgent: req.headers["user-agent"] || null,
      details: { email: userEmail },
    });
    // Session is HttpOnly cookie only — do not return JWT in JSON (reduces XSS / log leakage).
    return res.json({ ok: true, message: "Authenticated" });
  } catch (error) {
    logger.error("Admin login error", { error: error.message });
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
}

export async function check(req, res) {
  try {
    if (!JWT_SECRET) {
      return res.status(503).json({
        ok: false,
        code: "ADMIN_AUTH_NOT_CONFIGURED",
        message: "Admin auth not configured (JWT_SECRET missing)."
      });
    }
    const token = getAdminTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        ok: false,
        code: "ADMIN_SESSION_INVALID",
        message: "Not authenticated"
      });
    }
    const payload = jwt.verify(token, JWT_SECRET, {
      issuer: "blockminer-admin",
      algorithms: ["HS256"]
    });
    if (payload.role !== "admin" || payload.type !== "admin_session") {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }
    return res.json({ ok: true });
  } catch {
    return res.status(401).json({
      ok: false,
      code: "ADMIN_SESSION_INVALID",
      message: "Not authenticated"
    });
  }
}
