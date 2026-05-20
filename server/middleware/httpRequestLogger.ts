import type { NextFunction, Request, RequestHandler, Response } from "express";
import loggerLib from "../utils/logger.js";

const log = loggerLib.child("HttpRequest");

export function createHttpRequestLogger(): RequestHandler {
  return function httpRequestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      const roundedMs = Math.round(durationMs * 1000) / 1000;
      const details = {
        method: req.method,
        route: req.route?.path || req.path,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: roundedMs,
      };
      if (roundedMs >= 1000 || res.statusCode >= 500) {
        log.warn("http_request_slow", details, req);
      } else {
        log.info("http_request", details, req);
      }
    });
    next();
  };
}
