import type { NextFunction, Request, RequestHandler, Response } from "express";
import { buildAuditContextFromRequest } from "../src/audit/utils.js";

declare global {
  namespace Express {
    interface Request {
      auditContext?: {
        correlationId: string;
        requestIp: string;
        ipHash: string;
        userAgent: string | null;
      };
    }
  }
}

/**
 * Ensures every HTTP request has correlation + request IDs for structured logs.
 */
export function createRequestContextMiddleware(): RequestHandler {
  return function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (!req.auditContext) {
      req.auditContext = buildAuditContextFromRequest(req);
    }
    const ctx = req.auditContext!;
    const incomingRequestId =
      typeof req.headers["x-request-id"] === "string" ? req.headers["x-request-id"].trim() : "";
    const requestId = incomingRequestId || ctx.correlationId;
    req.headers["x-request-id"] = requestId;
    if (!res.getHeader("X-Request-Id")) res.setHeader("X-Request-Id", requestId);
    if (!res.getHeader("X-Correlation-Id")) res.setHeader("X-Correlation-Id", ctx.correlationId);
    next();
  };
}
