import loggerLib from "../utils/logger.js";

const log = loggerLib.child("HttpRequest");

/**
 * Logs method, route, status, and duration after the response is sent.
 * Expects `auditContextMiddleware` (or equivalent) earlier in the chain for `requestId`.
 *
 * @returns {import("express").RequestHandler}
 */
export function createHttpRequestLogger() {
  return function httpRequestLogger(req, res, next) {
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
