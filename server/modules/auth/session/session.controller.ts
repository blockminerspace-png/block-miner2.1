import type { Request, Response } from "express";
import prisma from "../../../src/db/prisma.js";
import { getTokenFromRequest } from "../../../utils/token.js";
import { verifyAccessToken } from "../../../utils/authTokens.js";
import { enqueueAuditEvent, buildAuditEventFromHttpRequest } from "../../../src/audit/service.js";
import { AuditEventType, AuditEventStatus } from "../../../src/audit/constants.js";
import loggerLib, { logUserActivity } from "../../../utils/logger.js";
import { clearAuthCookies, unknownErrorMessage } from "../shared/auth.security.js";
import { toAuthPublicUserDto } from "../auth.dto.js";
import { buildAuthFailureJson } from "../auth.errors.js";

const logger = loggerLib.child("AuthSessionController");

function sendUnauthenticated(res: Response): void {
  res.status(401).json(
    buildAuthFailureJson(
      "UNAUTHENTICATED",
      "Sessão expirada ou ausente.",
    ),
  );
}

export async function getSession(req: Request, res: Response): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      sendUnauthenticated(res);
      return;
    }

    let payload: ReturnType<typeof verifyAccessToken>;
    try {
      payload = verifyAccessToken(token);
    } catch (error: unknown) {
      logger.warn("auth.session.invalid_token", {
        message: unknownErrorMessage(error),
      });
      res.setHeader("Set-Cookie", clearAuthCookies());
      sendUnauthenticated(res);
      return;
    }

    if (!payload?.sub) {
      sendUnauthenticated(res);
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: Number(payload.sub) } });
    if (!user || user.isBanned) {
      sendUnauthenticated(res);
      return;
    }

    const hasReferral = !!(await prisma.referral.findUnique({ where: { referredId: user.id } }));

    res.json({ ok: true, user: toAuthPublicUserDto(user, { hasReferral }) });
  } catch (error: unknown) {
    logger.error("auth.session.unexpected", {
      message: unknownErrorMessage(error),
    });
    res
      .status(500)
      .json(buildAuthFailureJson("INTERNAL_ERROR", "Não foi possível processar a autenticação agora."));
  }
}

export async function logoutPost(req: Request, res: Response): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    let userId: number | null = null;
    if (token) {
      const payload = verifyAccessToken(token);
      if (payload?.sub) userId = Number(payload.sub);
    }

    await enqueueAuditEvent({
      prismaOrTx: prisma,
      event: buildAuditEventFromHttpRequest({
        req,
        event: {
          userId,
          eventType: AuditEventType.AUTH_LOGOUT,
          status: AuditEventStatus.SUCCESS,
          resultCode: "LOGOUT_SUCCESS",
          payload: {},
        },
      }),
    });
    logUserActivity("AUTH_LOGOUT", req, { userId });
  } catch {
    // Audit failure should not prevent logout flow
  }

  res.setHeader("Set-Cookie", clearAuthCookies());
  res.json({ ok: true });
}

export async function markAdblockPost(req: Request, res: Response): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { hasAdblock: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
}
