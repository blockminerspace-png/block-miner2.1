import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request } from "express";
import { getRequestIp } from "./clientIp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Lower weight = higher priority (always logged at stricter thresholds). */
const LEVEL_WEIGHT: Record<string, number> = {
  /** Same priority as ERROR so `LOG_LEVEL=error` still records security events. */
  ERROR: 0,
  SECURITY: 0,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

function parseLogLevel(): number {
  const raw = String(process.env.LOG_LEVEL || "INFO").trim().toUpperCase();
  if (raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw] ?? LEVEL_WEIGHT.INFO;
  return LEVEL_WEIGHT.INFO;
}

const CURRENT_THRESHOLD = parseLogLevel();
const logDir = path.join(__dirname, "..", "logs");

function shouldWriteFiles(): boolean {
  if (String(process.env.LOG_DISABLE_FILE || "").trim() === "1") return false;
  if (process.env.NODE_ENV === "test") return false;
  return true;
}

if (shouldWriteFiles() && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export function buildRequestLogContext(
  req: Request | null | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  if (!req || typeof req !== "object") {
    return { timestamp, ...extra };
  }
  const userId = req.user?.id != null ? String(req.user.id) : undefined;
  const ip = getRequestIp(req);
  const endpoint = String(req.originalUrl || req.url || "");
  const requestId =
    (req as Request & { auditContext?: { correlationId?: string } }).auditContext?.correlationId ||
    (typeof req.headers?.["x-request-id"] === "string" ? req.headers["x-request-id"] : undefined);
  return {
    timestamp,
    ...(userId ? { userId } : {}),
    ip,
    endpoint,
    ...(requestId ? { requestId } : {}),
    ...extra,
  };
}

function normalizeDetails(details: unknown): Record<string, unknown> {
  if (details == null) return {};
  if (typeof details !== "object" || Array.isArray(details)) return { value: details };
  return { ...(details as Record<string, unknown>) };
}

function fileNameForLevel(level: string): string {
  if (level === "SECURITY") return "security";
  return String(level).toLowerCase();
}

function writeLine(level: string, record: Record<string, unknown>): void {
  const line = `${JSON.stringify(record)}\n`;
  if (process.env.NODE_ENV !== "test") {
    console.info(line.trimEnd());
  }
  if (!shouldWriteFiles()) return;
  try {
    const date = new Date().toISOString().split("T")[0];
    const logFile = path.join(logDir, `${fileNameForLevel(level)}-${date}.log`);
    fs.appendFileSync(logFile, line);
  } catch {
    /* ignore disk errors */
  }
}

function levelAllowed(level: string): boolean {
  const w = LEVEL_WEIGHT[level];
  return typeof w === "number" && w <= CURRENT_THRESHOLD;
}

type LogLevel = "ERROR" | "SECURITY" | "WARN" | "INFO" | "DEBUG";

function emitStructured(
  level: LogLevel,
  category: string,
  message: string,
  details: Record<string, unknown>,
  req: Request | null | undefined,
): void {
  if (!levelAllowed(level)) return;
  const ctx = req ? buildRequestLogContext(req) : { timestamp: new Date().toISOString() };
  const { timestamp, ...restCtx } = ctx as { timestamp: string; [k: string]: unknown };
  const mergedDetails = normalizeDetails(details);
  const record: Record<string, unknown> = {
    level: level.toLowerCase(),
    message,
    category,
    timestamp,
    ...restCtx,
    ...(Object.keys(mergedDetails).length ? { details: mergedDetails } : {}),
  };
  writeLine(level, record);
}

class Logger {
  category: string;

  constructor(category = "App") {
    this.category = category;
  }

  child(subCategory: string): Logger {
    return new Logger(`${this.category}:${subCategory}`);
  }

  _emit(
    level: LogLevel,
    message: string,
    details: Record<string, unknown> | undefined,
    req: Request | null | undefined,
  ): void {
    emitStructured(level, this.category, message, normalizeDetails(details), req);
  }

  error(message: string, details?: unknown, req?: Request | null | undefined): void {
    this._emit("ERROR", message, details as Record<string, unknown> | undefined, req);
  }

  warn(message: string, details?: unknown, req?: Request | null | undefined): void {
    this._emit("WARN", message, details as Record<string, unknown> | undefined, req);
  }

  info(message: string, details?: unknown, req?: Request | null | undefined): void {
    this._emit("INFO", message, details as Record<string, unknown> | undefined, req);
  }

  debug(message: string, details?: unknown, req?: Request | null | undefined): void {
    this._emit("DEBUG", message, details as Record<string, unknown> | undefined, req);
  }

  /**
   * Security / audit trail (rate limits, CSRF, idempotency replay, etc.).
   */
  security(message: string, details?: Record<string, unknown>, req?: Request | null | undefined): void {
    this._emit("SECURITY", message, details, req);
  }
}

const defaultLogger = new Logger();

export function logUserActivity(
  activityType: string,
  req: Request | null | undefined,
  details: Record<string, unknown> = {},
): void {
  const ctx = buildRequestLogContext(req);
  const { timestamp, ...restCtx } = ctx as { timestamp: string; [k: string]: unknown };
  const normalizedDetails = normalizeDetails(details);
  const record: Record<string, unknown> = {
    level: "info",
    kind: "user_activity",
    activityType,
    message: activityType,
    category: "Activity",
    timestamp,
    ...restCtx,
    ...(Object.keys(normalizedDetails).length ? { details: normalizedDetails } : {}),
  };
  if (levelAllowed("INFO")) writeLine("INFO", record);

  const shouldPersist =
    process.env.NODE_ENV !== "test" &&
    activityType &&
    !(String(activityType).startsWith("AUTH_") && String(activityType) !== "AUTH_LOCKOUT_DENIED");
  if (!shouldPersist) return;

  const rawUserId = req?.user?.id ?? normalizedDetails.userId;
  const userId = Number(rawUserId);
  const safeUserId = Number.isInteger(userId) && userId > 0 ? userId : null;
  const ip = req ? getRequestIp(req) : null;
  const userAgent = req?.headers?.["user-agent"] || null;

  import("../models/auditLogModel.js")
    .then(({ createAuditLogBestEffort }) =>
      createAuditLogBestEffort({
        userId: safeUserId,
        action: activityType,
        ip,
        userAgent,
        details: normalizedDetails,
      }),
    )
    .catch(() => {});
}

export function logUnhandledError(
  err: unknown,
  req: Request | null | undefined,
  extra: Record<string, unknown> = {},
): void {
  const message = err instanceof Error ? err.message : "Error";
  const base = req ? buildRequestLogContext(req) : { timestamp: new Date().toISOString() };
  const { timestamp, ...rest } = base as { timestamp: string; [k: string]: unknown };
  const record: Record<string, unknown> = {
    level: "error",
    kind: "unhandled_error",
    message,
    category: "Process",
    timestamp,
    ...rest,
    details: {
      name: err instanceof Error ? err.name : undefined,
      stack: err instanceof Error && typeof err.stack === "string" ? err.stack : undefined,
      ...normalizeDetails(extra),
    },
  };
  writeLine("ERROR", record);
}

export default defaultLogger;
