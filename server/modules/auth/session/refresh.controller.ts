import type { Request, Response } from "express";
import prisma from "../../../src/db/prisma.js";
import { createRefreshTokenRecord, getRefreshTokenById, revokeRefreshToken } from "../../../models/refreshTokenModel.js";
import {
  createRefreshToken,
  parseRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from "../../../utils/authTokens.js";
import { getRefreshTokenFromRequest, getTokenFromRequest } from "../../../utils/token.js";
import { enqueueAuditEvent, buildAuditEventFromHttpRequest } from "../../../src/audit/service.js";
import { AuditEventType, AuditEventStatus } from "../../../src/audit/constants.js";
import loggerLib from "../../../utils/logger.js";
import { authDebug } from "../../../utils/authDebug.js";
import {
  buildAccessCookie,
  buildRefreshCookie,
  clearAuthCookies,
  unknownErrorMessage,
} from "../shared/auth.security.js";
import { toAuthPublicUserDto } from "../auth.dto.js";
import { AUTH_LOGIN_MESSAGES, buildAuthFailureJson } from "../auth.errors.js";
import { respondAuthPrismaError } from "../shared/auth.prisma.js";

const logger = loggerLib.child("AuthRefreshController");

function sendUnauthenticated(res: Response, code = "UNAUTHENTICATED"): void {
  res.setHeader("Set-Cookie", clearAuthCookies());
  res.status(401).json(
    buildAuthFailureJson(code, "Sessão expirada ou ausente."),
  );
}

/**
 * Rotate access (and optionally refresh) JWT cookies using the HttpOnly refresh token.
 * Keeps long earn sessions alive without forcing re-login when the access JWT expires.
 */
export async function refreshPost(req: Request, res: Response): Promise<void> {
  authDebug("AUTH_REFRESH_ATTEMPT", req);

  try {
    const rawRefresh = getRefreshTokenFromRequest(req);
    const parsed = parseRefreshToken(rawRefresh);
    if (!parsed) {
      authDebug("AUTH_REFRESH_REJECT", req, { reason: "REFRESH_COOKIE_MISSING_OR_MALFORMED" });
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }

    const row = await getRefreshTokenById(parsed.tokenId);
    if (!row || row.revokedAt) {
      authDebug("AUTH_REFRESH_REJECT", req, { reason: "REFRESH_REVOKED_OR_UNKNOWN", tokenId: parsed.tokenId });
      sendUnauthenticated(res, "REFRESH_REVOKED");
      return;
    }

    if (row.tokenHash !== parsed.tokenHash) {
      authDebug("AUTH_REFRESH_REJECT", req, { reason: "REFRESH_HASH_MISMATCH", tokenId: parsed.tokenId });
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      authDebug("AUTH_REFRESH_REJECT", req, { reason: "REFRESH_EXPIRED", tokenId: parsed.tokenId });
      sendUnauthenticated(res, "REFRESH_EXPIRED");
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: row.userId } });
    if (!user || user.isBanned) {
      authDebug("AUTH_REFRESH_REJECT", req, { reason: "USER_MISSING_OR_BANNED", userId: row.userId });
      sendUnauthenticated(res, "REFRESH_INVALID");
      return;
    }

    const accessToken = signAccessToken(user);
    const nextRefresh = createRefreshToken();
    await revokeRefreshToken({
      tokenId: parsed.tokenId,
      revokedAt: Date.now(),
      replacedBy: nextRefresh.tokenId,
    });
    await createRefreshTokenRecord({
      userId: user.id,
      ...nextRefresh,
      createdAt: Date.now(),
    });

    const cookies = [
      buildAccessCookie(accessToken),
      buildRefreshCookie(nextRefresh.token, nextRefresh.expiresAt),
    ];
    res.setHeader("Set-Cookie", cookies);

    void enqueueAuditEvent({
      prismaOrTx: prisma,
      event: buildAuditEventFromHttpRequest({
        req,
        event: {
          userId: user.id,
          eventType: AuditEventType.AUTH_REFRESH_TOKEN,
          status: AuditEventStatus.SUCCESS,
          resultCode: "REFRESH_SUCCESS",
          payload: {},
        },
      }),
    }).catch(() => {});

    authDebug("AUTH_REFRESH_OK", req, {
      userId: user.id,
      previousAccessPresent: Boolean(getTokenFromRequest(req)),
    });

    res.json({ ok: true, user: toAuthPublicUserDto(user) });
  } catch (error: unknown) {
    if (
      respondAuthPrismaError(
        res,
        error,
        AUTH_LOGIN_MESSAGES.SERVICE_UNAVAILABLE,
        "auth.refresh.db_unavailable",
      )
    ) {
      return;
    }
    logger.error("auth.refresh.unexpected", { message: unknownErrorMessage(error) });
    res.status(500).json(buildAuthFailureJson("INTERNAL_ERROR", AUTH_LOGIN_MESSAGES.INTERNAL));
  }
}

/** Extend access JWT Max-Age on successful authenticated activity (sliding session). */
export function maybeRenewAccessCookie(req: Request, res: Response): void {
  const user = req.user;
  if (!user) return;
  const token = getTokenFromRequest(req);
  if (!token) return;
  const payload = verifyAccessToken(token);
  if (!payload || typeof payload === "string" || !payload.sub) return;

  const expMs = Number(payload.exp ?? 0) * 1000;
  if (!expMs) return;

  const remainingMs = expMs - Date.now();
  const renewThresholdMs = Number(process.env.ACCESS_TOKEN_RENEW_THRESHOLD_MS ?? 6 * 60 * 60 * 1000);
  if (remainingMs > renewThresholdMs) return;

  const renewed = signAccessToken(user);
  const existing = res.getHeader("Set-Cookie");
  const accessCookie = buildAccessCookie(renewed);
  if (!existing) {
    res.setHeader("Set-Cookie", accessCookie);
    return;
  }
  const cookies = Array.isArray(existing) ? [...existing] : [String(existing)];
  cookies.push(accessCookie);
  res.setHeader("Set-Cookie", cookies);
  authDebug("AUTH_ACCESS_SLIDING_RENEW", req, { userId: user.id, remainingMs });
}
