import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { authDebug } from "../../utils/authDebug.js";
import { maybeRenewAccessCookie } from "../../modules/auth/session/refresh.controller.js";
import { buildAccessCookie } from "../../modules/auth/shared/auth.security.js";
import { signAccessToken } from "../../utils/authTokens.js";

const logger = loggerLib.child("SessionController");

/** Max fingerprint age — background tabs may delay timers; must exceed throttle interval. */
const HEARTBEAT_FINGERPRINT_MAX_AGE_MS = Number(process.env.HEARTBEAT_FINGERPRINT_MAX_AGE_MS ?? 10 * 60 * 1000);
const HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS = Number(process.env.HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS ?? 30_000);

type HeartbeatBody = {
  type?: string;
  security?: {
    isBot?: boolean;
    fingerprint?: string;
    sk?: string;
  };
};

type FingerprintPayload = {
  ts?: number;
  b?: boolean;
};

function decodeFingerprint(raw: string | undefined): { ok: true; data: FingerprintPayload } | { ok: false; code: string } {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, code: "FINGERPRINT_MISSING" };
  }
  try {
    const normalized = raw.trim();
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const data = JSON.parse(json) as FingerprintPayload;
    if (!data || typeof data !== "object") {
      return { ok: false, code: "FINGERPRINT_INVALID_JSON" };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, code: "FINGERPRINT_DECODE_FAILED" };
  }
}

function fingerprintTimestampValid(ts: unknown): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    // Legacy clients omitted ts — allow when JWT auth already passed.
    return true;
  }
  const nowTs = Date.now();
  if (ts > nowTs + HEARTBEAT_FINGERPRINT_FUTURE_SKEW_MS) return false;
  if (ts < nowTs - HEARTBEAT_FINGERPRINT_MAX_AGE_MS) return false;
  return true;
}

export async function processHeartbeat(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    if (req.user == null) {
      authDebug("HEARTBEAT_REJECT", req, { reason: "NO_USER" });
      res.status(401).json({ ok: false, code: "UNAUTHENTICATED", message: "Unauthorized" });
      return;
    }
    const userId = req.user.id;
    const { type, security } = req.body as HeartbeatBody;

    if (!type || !["youtube", "auto-mining"].includes(type)) {
      authDebug("HEARTBEAT_REJECT", req, { reason: "INVALID_TYPE", type });
      res.status(400).json({ ok: false, code: "INVALID_TYPE", message: "Invalid type" });
      return;
    }

    const botFlag = security?.isBot === true;
    const decoded = decodeFingerprint(security?.fingerprint);
    if (!decoded.ok) {
      authDebug("HEARTBEAT_REJECT", req, { reason: decoded.code, userId, type });
      res.status(400).json({
        ok: false,
        code: decoded.code,
        message: "Security check failed",
      });
      return;
    }

    if (botFlag || decoded.data.b === true) {
      logger.warn(`Bot signature detected for user ${userId} on ${type}`);
      authDebug("HEARTBEAT_REJECT", req, { reason: "BOT_DETECTED", userId, type });
      res.status(403).json({
        ok: false,
        code: "BOT_DETECTED",
        message: "Automation detected. Access denied.",
      });
      return;
    }

    if (!fingerprintTimestampValid(decoded.data.ts)) {
      authDebug("HEARTBEAT_REJECT", req, {
        reason: "FINGERPRINT_STALE",
        userId,
        type,
        ts: decoded.data.ts,
      });
      res.status(400).json({
        ok: false,
        code: "FINGERPRINT_STALE",
        message: "Invalid session token",
      });
      return;
    }

    const now = new Date();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastHeartbeatAt: true },
    });

    if (user?.lastHeartbeatAt) {
      const diff = (now.getTime() - new Date(user.lastHeartbeatAt).getTime()) / 1000;
      if (diff < 8) {
        maybeRenewAccessCookie(req, res);
        res.json({ ok: true, message: "Too fast, heartbeat throttled", buffered: true });
        return;
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastHeartbeatAt: now,
        [type === "youtube" ? "ytSecondsBalance" : "autoMiningSecondsBalance"]: {
          increment: 10,
        },
      },
    });

    maybeRenewAccessCookie(req, res);
    authDebug("HEARTBEAT_OK", req, { userId, type });
    res.json({ ok: true });
  } catch (e: unknown) {
    logger.error("Heartbeat error", {
      message: e instanceof Error ? e.message : String(e),
    });
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
  }
}

/** Explicit sliding renewal for earn pages after successful mutations (claim, etc.). */
export function attachSlidingAccessCookie(req: Request, res: Response): void {
  if (!req.user) return;
  const renewed = signAccessToken(req.user);
  const cookie = buildAccessCookie(renewed);
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }
  const cookies = Array.isArray(existing) ? [...existing] : [String(existing)];
  cookies.push(cookie);
  res.setHeader("Set-Cookie", cookies);
}
