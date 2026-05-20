import type { NextFunction, Request, Response } from "express";
import { getUserById } from "../models/userModel.js";
import { verifyAccessToken } from "../utils/authTokens.js";
import { getTokenFromRequest } from "../utils/token.js";
import loggerNamespace from "../utils/logger.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import { buildPrismaAwareErrorBody, isPrismaConnectionError, prismaAwareHttpStatus, unknownErrorMessage } from "../utils/prismaHttpErrors.js";

const logger = loggerNamespace.child("AuthMiddleware");

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug("Token verification failed", { error: msg });
      }
      payload = null;
    }

    const userId = Number(payload?.sub);

    if (!userId) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      logSecurityEvent("AUTHZ_USER_NOT_FOUND", { userId }, req);
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }

    if (user.isBanned) {
      logSecurityEvent("AUTHZ_BANNED_USER", { userId: user.id }, req);
      res.status(403).json({ ok: false, message: "Account disabled." });
      return;
    }

    req.user = user;
    next();
  } catch (error: unknown) {
    const msg = unknownErrorMessage(error);
    logger.error("Auth middleware error", { error: msg });
    if (isPrismaConnectionError(error)) {
      const fallback = "Serviço temporariamente indisponível. Tente novamente em instantes.";
      res.status(prismaAwareHttpStatus(error)).json(buildPrismaAwareErrorBody(error, fallback));
      return;
    }
    res.status(500).json({
      ok: false,
      code: "INTERNAL_ERROR",
      message: "Unable to authenticate.",
      error: "Unable to authenticate.",
    });
  }
}

/** Backward-compatible alias used by a few older routes. */
export const authenticateToken = requireAuth;

export async function requirePageAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      res.redirect(302, "/login");
      return;
    }

    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch {
      payload = null;
    }

    const userId = Number(payload?.sub);
    if (!userId) {
      res.redirect(302, "/login");
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.redirect(302, "/login");
      return;
    }

    if (user.isBanned) {
      res.redirect(302, "/login");
      return;
    }

    req.user = user;
    next();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Page auth middleware error", { error: msg });
    res.redirect(302, "/login");
  }
}

export async function authenticateTokenOptional(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      req.user = null;
      next();
      return;
    }

    let payload: ReturnType<typeof verifyAccessToken> | null = null;
    try {
      payload = verifyAccessToken(token);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.debug("Optional token verification failed", { error: msg });
      req.user = null;
      next();
      return;
    }

    const userId = Number(payload?.sub);

    if (!userId) {
      req.user = null;
      next();
      return;
    }

    const user = await getUserById(userId);

    if (!user) {
      req.user = null;
      next();
      return;
    }

    if (user.isBanned) {
      req.user = null;
      next();
      return;
    }

    req.user = user;
    next();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Optional auth middleware error", { error: msg });
    req.user = null;
    next();
  }
}
