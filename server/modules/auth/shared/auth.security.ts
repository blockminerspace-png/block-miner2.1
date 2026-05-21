import crypto from "crypto";
import type { JwtPayload } from "jsonwebtoken";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../../../utils/token.js";
import { verifyAccessToken } from "../../../utils/authTokens.js";

export function unknownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function prismaClientErrorFields(error: unknown): { code?: string; meta?: unknown } {
  if (typeof error !== "object" || error === null) return {};
  const rec = error as { code?: unknown; meta?: unknown };
  return {
    code: typeof rec.code === "string" ? rec.code : undefined,
    meta: rec.meta,
  };
}

/**
 * Constant-time comparison for admin shared secrets (fixed-width SHA-256 digests).
 */
export function timingSafeAdminSecretEqual(supplied: unknown, expectedFromEnv: string | undefined): boolean {
  const exp = String(expectedFromEnv ?? "");
  if (!exp) return false;
  const left = crypto.createHash("sha256").update(String(supplied ?? ""), "utf8").digest();
  const right = crypto.createHash("sha256").update(exp, "utf8").digest();
  return crypto.timingSafeEqual(left, right);
}

function authCookieSameSite(): "Lax" | "Strict" | "None" {
  const raw = String(process.env.AUTH_COOKIE_SAMESITE || "").trim().toLowerCase();
  if (raw === "lax") return "Lax";
  if (raw === "strict") return "Strict";
  if (raw === "none") return "None";
  return "Lax";
}

export function buildCookie(name: string, value: string, maxAgeSeconds: number): string {
  const sameSite = authCookieSameSite();
  const parts = [`${name}=${encodeURIComponent(value)}`, `Max-Age=${maxAgeSeconds}`, "Path=/", "HttpOnly", `SameSite=${sameSite}`];
  if (process.env.NODE_ENV === "production" || sameSite === "None") parts.push("Secure");
  return parts.join("; ");
}

export function buildAccessCookie(accessToken: string): string {
  const decoded = verifyAccessToken(accessToken) as JwtPayload | string;
  const payload = typeof decoded === "string" ? null : decoded;
  const expSeconds = Number(payload?.exp ?? 0);
  const maxAgeSeconds = Math.max(0, expSeconds - Math.floor(Date.now() / 1000));
  return buildCookie(ACCESS_COOKIE_NAME, accessToken, maxAgeSeconds);
}

export function buildRefreshCookie(refreshToken: string, expiresAt: number): string {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return buildCookie(REFRESH_COOKIE_NAME, refreshToken, maxAgeSeconds);
}

export function clearAuthCookies(): string[] {
  return [buildCookie(ACCESS_COOKIE_NAME, "", 0), buildCookie(REFRESH_COOKIE_NAME, "", 0)];
}
