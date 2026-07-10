import type { NextFunction, Request, RequestHandler, Response } from "express";
import { record5xxForAlerting, recordHttpRequest, normalizeRoute } from "../shared/observability/index.js";

function inferModule(path: string): string {
  const cleaned = String(path || "").split("?")[0];
  if (cleaned.startsWith("/api/admin")) return "admin";
  if (cleaned.startsWith("/api/")) return cleaned.split("/")[2] || "api";
  if (cleaned.startsWith("/health")) return "health";
  if (cleaned === "/metrics") return "metrics";
  if (cleaned.startsWith("/zerads")) return "callback";
  return "http";
}

/**
 * Records HTTP latency/status metrics for all routes (skips /metrics to avoid recursion noise).
 */
export function createObservabilityMetricsMiddleware(): RequestHandler {
  return function observabilityMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.path === "/metrics") {
      next();
      return;
    }
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const route = normalizeRoute(req.route?.path || req.path || req.originalUrl || "/");
      recordHttpRequest(req.method, route, res.statusCode, durationMs);
      if (res.statusCode >= 500) record5xxForAlerting();
      (req as Request & { observability?: { module: string; durationMs: number } }).observability = {
        module: inferModule(req.originalUrl || req.path),
        durationMs: Math.round(durationMs * 1000) / 1000,
      };
    });
    next();
  };
}
