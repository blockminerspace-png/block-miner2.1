import type { Request } from "express";
import loggerLib from "./logger.js";

const log = loggerLib.child("AuthDebug");

function enabled(): boolean {
  const raw = String(process.env.AUTH_DEBUG_LOG ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function authDebug(event: string, req: Request, details: Record<string, unknown> = {}): void {
  if (!enabled()) return;
  const cookies = String(req.headers.cookie ?? "");
  log.info(event, {
    path: req.originalUrl || req.url,
    method: req.method,
    userId: req.user?.id ?? null,
    hasAccessCookie: cookies.includes("blockminer_access=") || cookies.includes("blockminer_session="),
    hasRefreshCookie: cookies.includes("blockminer_refresh="),
    hasCsrfCookie: cookies.includes("blockminer_csrf="),
    hasCsrfHeader: Boolean(req.headers["x-csrf-token"]),
    ...details,
  });
}
