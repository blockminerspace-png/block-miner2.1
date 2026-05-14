import type { NextFunction, Request, RequestHandler, Response } from "express";
import loggerLib from "../utils/logger.js";

const log = loggerLib.child("HttpRequest");

export function createHttpRequestLogger(): RequestHandler {
  return function httpRequestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1e6;
      log.info(
        "http_request",
        {
          method: req.method,
          route: req.route?.path || req.path,
          path: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 1000) / 1000,
        },
        req,
      );
    });
    next();
  };
}
