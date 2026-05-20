import type { ErrorRequestHandler } from "express";
import { HttpError } from "../errors/httpErrors.js";
import { logUnhandledError } from "#server/utils/logger.js";

/**
 * Express error handler: maps HttpError to JSON; generic errors stay opaque in production.
 */
function isServeStaticNotFound(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("status" in err)) return false;
  return (err as { status?: unknown }).status === 404;
}

function isUploadsPath(reqPath: string): boolean {
  return reqPath === "/uploads" || reqPath.startsWith("/uploads/");
}

export const apiErrorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (!(err instanceof HttpError)) {
    if (!(isServeStaticNotFound(err) && isUploadsPath(String(req.path || "")))) {
      logUnhandledError(err instanceof Error ? err : new Error(String(err)), req, { source: "express" });
    }
  } else if (err.status >= 500) {
    logUnhandledError(err, req, { source: "express" });
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  const reqPath = String(req.path || "");
  const isApi = reqPath.startsWith("/api");

  if (isServeStaticNotFound(err) && isUploadsPath(reqPath)) {
    res.status(404).json({
      ok: false,
      code: "UPLOAD_NOT_FOUND",
      message: "Arquivo não encontrado.",
      error: "Arquivo não encontrado.",
    });
    return;
  }

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
