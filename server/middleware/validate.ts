import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodError, ZodTypeAny } from "zod";

function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function deriveCodeFromZodFirstMessage(message: string | undefined): string | undefined {
  if (typeof message !== "string") return undefined;
  const prefix = "auth.register.errors.";
  if (message.startsWith(prefix)) {
    const tail = message.slice(prefix.length).replace(/[^a-z0-9_]/gi, "_");
    if (!tail) return undefined;
    return tail.toUpperCase();
  }
  return undefined;
}

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const errors = formatZodError(result.error);
      const code = deriveCodeFromZodFirstMessage(errors[0]?.message);
      res.status(400).json({
        ok: false,
        message: "Invalid request data.",
        errors,
        ...(code ? { code } : {}),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      res.status(400).json({ ok: false, message: "Invalid query data.", errors: formatZodError(result.error) });
      return;
    }
    req.query = result.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params || {});
    if (!result.success) {
      res.status(400).json({
        ok: false,
        message: "Invalid route parameters.",
        errors: formatZodError(result.error),
      });
      return;
    }
    req.params = result.data;
    next();
  };
}
