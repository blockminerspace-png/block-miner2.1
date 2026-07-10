import type { Request, Response } from "express";
import type { AuthSessionUser } from "../../types/express.js";

/** Thrown inside transactions/handlers to map to HTTP status in catch blocks. */
export class HttpStatusError extends Error {
  readonly http: number;
  readonly code?: string;
  readonly vaultSlot?: number;

  constructor(http: number, message: string, options?: { code?: string; vaultSlot?: number }) {
    super(message);
    this.name = "HttpStatusError";
    this.http = http;
    this.code = options?.code;
    this.vaultSlot = options?.vaultSlot;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function readHttpStatus(err: unknown): number | undefined {
  if (err instanceof HttpStatusError) return err.http;
  if (typeof err === "object" && err !== null && "http" in err) {
    const h = (err as { http: unknown }).http;
    return typeof h === "number" ? h : undefined;
  }
  return undefined;
}

export function readErrorCode(err: unknown): string | undefined {
  if (err instanceof HttpStatusError && err.code) return err.code;
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

export function readErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unexpected error";
}

export function readVaultSlot(err: unknown): number | undefined {
  if (err instanceof HttpStatusError && typeof err.vaultSlot === "number") return err.vaultSlot;
  if (typeof err === "object" && err !== null && "vaultSlot" in err) {
    const v = (err as { vaultSlot: unknown }).vaultSlot;
    return typeof v === "number" ? v : undefined;
  }
  return undefined;
}

export function requireSessionUser(req: Request, res: Response): AuthSessionUser | null {
  const u = req.user;
  if (u == null) {
    res.status(401).json({ ok: false, message: "Unauthorized." });
    return null;
  }
  return u;
}

export function jsonClientError(
  res: Response,
  status: number,
  code: string,
  i18nKey: string,
  message: string
): void {
  res.status(status).json({
    ok: false,
    code,
    i18nKey,
    message: message || code
  });
}
