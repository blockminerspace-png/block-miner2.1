import type { ErrorRequestHandler } from "express";
import { HttpError } from "../errors/httpErrors.js";
import { logUnhandledError } from "#server/utils/logger.js";

/**
 * Express error handler: maps HttpError to JSON; generic errors stay opaque in production.
 */
export const apiErrorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (!(err instanceof HttpError)) {
    logUnhandledError(err instanceof Error ? err : new Error(String(err)), req, { source: "express" });
  } else if (err.status >= 500) {
    logUnhandledError(err, req, { source: "express" });
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  const isApi = req.path && String(req.path).startsWith("/api");

  if (err instanceof HttpError) {
    if (isApi) {
      res.status(err.status).json({
        ok: false,
        code: err.code,
        message: err.message,
        ...(err.details && typeof err.details === "object" ? { details: err.details } : {}),
      });
      return;
    }
    res.status(err.status).send(err.message);
    return;
  }

  if (isApi) {
    const body: { ok: false; message: string } = { ok: false, message: "Internal server error." };
    if (process.env.NODE_ENV !== "production" && err instanceof Error && err.message) {
      body.message = err.message;
    }
    res.status(500).json(body);
    return;
  }

  res.status(500).send("Internal Server Error");
};
