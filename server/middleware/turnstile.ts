import type { NextFunction, Request, RequestHandler, Response } from "express";
import loggerLib from "../utils/logger.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

const logger = loggerLib.child("Turnstile");

const CLOUDFLARE_TURNSTILE_DUMMY_SECRET = "1x0000000000000000000000000000000AA";

export type TurnstilePurpose = "login" | "register" | undefined;

function envFlag(name: string): boolean {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function useCloudflareDummyTurnstileKeys(): boolean {
  return envFlag("TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS");
}

export function resolveTurnstileSecret(purpose?: TurnstilePurpose): string {
  if (useCloudflareDummyTurnstileKeys()) {
    return CLOUDFLARE_TURNSTILE_DUMMY_SECRET;
  }
  const fallback = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (purpose === "login") {
    return String(process.env.TURNSTILE_SECRET_KEY_LOGIN || "").trim() || fallback;
  }
  if (purpose === "register") {
    return String(process.env.TURNSTILE_SECRET_KEY_REGISTER || "").trim() || fallback;
  }
  return fallback;
}

export function isTurnstileEnforced(): boolean {
  return resolveTurnstileSecret(undefined).length > 0;
}

function isNodeProduction(): boolean {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

export function getTurnstileBootFatalError(): string {
  if (!isNodeProduction()) return "";
  if (!useCloudflareDummyTurnstileKeys()) return "";
  if (envFlag("ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION")) return "";
  return (
    "Refusing to start: NODE_ENV=production with TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS enabled uses Cloudflare test " +
    "secrets only (pink test banner, not real security). Unset TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS and " +
    "VITE_TURNSTILE_DUMMY_FALLBACK, set TURNSTILE_SECRET_KEY_LOGIN + VITE_TURNSTILE_SITE_KEY_LOGIN, rebuild the app image. " +
    "Emergency only: ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION=1."
  );
}

export function runTurnstileStartupChecks(): void {
  const fatal = getTurnstileBootFatalError();
  if (fatal) {
    logger.error(fatal);
    process.exit(1);
  }
  if (!useCloudflareDummyTurnstileKeys()) return;
  if (isNodeProduction() && envFlag("ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION")) {
    logger.warn(
      "ALLOW_TURNSTILE_DUMMY_IN_PRODUCTION is set: Turnstile still uses Cloudflare dummy keys (test-only banner).",
    );
    return;
  }
  logger.warn(
    "TURNSTILE_USE_CLOUDFLARE_DUMMY_KEYS is enabled: Cloudflare shows the test-only banner in the widget. " +
      "Unset it and set real TURNSTILE_SECRET_KEY_LOGIN + VITE_TURNSTILE_SITE_KEY_LOGIN for production-like hosts, then rebuild the app image.",
  );
}

type TurnstileVerifyResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false }
  | { ok: false; code: string };

type TurnstileSiteverifyJson = {
  success?: boolean;
  "error-codes"?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  remoteIp: string | undefined,
  options: { secret?: string } = {},
): Promise<TurnstileVerifyResult> {
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
    const jsonUnknown: unknown = await res.json().catch(() => ({}));
    const json = isRecord(jsonUnknown) ? (jsonUnknown as TurnstileSiteverifyJson) : {};
    if (json.success === true) {
      return { ok: true, skipped: false };
    }
    logger.warn("Turnstile verification failed", { errorCodes: json["error-codes"] });
    return { ok: false, code: SecurityErrorCodes.CAPTCHA_FAILED };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error("Turnstile request error", { message });
    if (envFlag("TURNSTILE_FAIL_OPEN")) {
      return { ok: true, skipped: true };
    }
    return { ok: false, code: SecurityErrorCodes.CAPTCHA_FAILED };
  }
}

function normalizeTurnstilePurpose(arg: unknown): TurnstilePurpose {
  if (arg === "login" || arg === "register") return arg;
  if (arg && typeof arg === "object") {
    const p = (arg as { purpose?: unknown }).purpose;
    if (p === "login" || p === "register") return p;
  }
  return undefined;
}

type RequireTurnstileArg = { purpose?: "login" | "register" } | "login" | "register" | undefined;

export function requireTurnstileWhenConfigured(arg?: RequireTurnstileArg): RequestHandler {
  const purpose = normalizeTurnstilePurpose(arg);
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      res.status(400).json(buildSecurityErrorJson(code));
      return;
    }
    next();
  };
}
