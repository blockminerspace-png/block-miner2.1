import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { getAdminTokenFromRequest } from "../utils/token.js";
import loggerNamespace from "../utils/logger.js";

const logger = loggerNamespace.child("AdminAuthMiddleware");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error("Admin JWT secret is missing");
      res.status(503).json({ ok: false, message: "Admin auth unavailable." });
      return;
    }

    const token = getAdminTokenFromRequest(req);

    if (!token) {
      res.status(401).json({
        ok: false,
        code: "ADMIN_SESSION_INVALID",
        message: "Admin session invalid.",
      });
      return;
    }

    let payload: JwtPayload | string | null = null;
    try {
      payload = jwt.verify(token, jwtSecret, {
        issuer: "blockminer-admin",
        algorithms: ["HS256"],
      });
    } catch (err: unknown) {
      if (process.env.NODE_ENV !== "production") {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug("Admin token verification failed", { error: msg });
      }
      res.status(401).json({
        ok: false,
        code: "ADMIN_SESSION_INVALID",
        message: "Admin session invalid.",
      });
      return;
    }

    if (typeof payload === "string" || !isRecord(payload)) {
      res.status(401).json({
        ok: false,
        code: "ADMIN_SESSION_INVALID",
        message: "Admin session invalid.",
      });
      return;
    }

    if (payload.role !== "admin" || payload.type !== "admin_session") {
      logger.warn("Attempted to access admin with invalid token type");
      res.status(403).json({ ok: false, message: "Forbidden" });
      return;
    }

    req.admin = { role: "admin" };
    next();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Admin auth middleware error", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to authenticate." });
  }
}

export function verifyAdminJwtToken(token: string | null | undefined): JwtPayload | null {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || !token) return null;
    const payload = jwt.verify(String(token).trim(), jwtSecret, {
      issuer: "blockminer-admin",
      algorithms: ["HS256"],
    });
    if (typeof payload === "string" || !isRecord(payload)) return null;
    if (payload.role !== "admin" || payload.type !== "admin_session") return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}
