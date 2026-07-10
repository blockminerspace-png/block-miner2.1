import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { getAdminTokenFromRequest } from "../utils/token.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("AdminPageAuth");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function adminPageAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error("Admin page auth unavailable: JWT secret missing");
      res.redirect(302, "/admin/login");
      return;
    }

    const token = getAdminTokenFromRequest(req);

    if (!token) {
      res.redirect(302, "/admin/login");
      return;
    }

    let payload: JwtPayload | string;
    try {
      payload = jwt.verify(token, jwtSecret, {
        issuer: "blockminer-admin",
        algorithms: ["HS256"],
      });
    } catch {
      res.redirect(302, "/admin/login");
      return;
    }

    if (typeof payload === "string" || !isRecord(payload)) {
      res.redirect(302, "/admin/login");
      return;
    }

    if (payload.role !== "admin" || payload.type !== "admin_session") {
      res.redirect(302, "/admin/login");
      return;
    }

    req.admin = { role: "admin", permissions: ["*"] };
    next();
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("Admin page auth error", { error: msg });
    res.redirect(302, "/admin/login");
  }
}
