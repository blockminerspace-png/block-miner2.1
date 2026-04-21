import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getRequestIp } from "./clientIp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Lower weight = higher priority (always logged at stricter thresholds). */
const LEVEL_WEIGHT = {
  /** Same priority as ERROR so `LOG_LEVEL=error` still records security events. */
  ERROR: 0,
  SECURITY: 0,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
};

function parseLogLevel() {
  const raw = String(process.env.LOG_LEVEL || "INFO").trim().toUpperCase();
  if (raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw];
  return LEVEL_WEIGHT.INFO;
}

const CURRENT_THRESHOLD = parseLogLevel();
const logDir = path.join(__dirname, "..", "logs");

function shouldWriteFiles() {
  if (String(process.env.LOG_DISABLE_FILE || "").trim() === "1") return false;
  if (process.env.NODE_ENV === "test") return false;
  return true;
}

if (shouldWriteFiles() && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * @param {import("express").Request | null | undefined} req
 * @param {Record<string, unknown>} [extra]
 */
export function buildRequestLogContext(req, extra = {}) {
  const timestamp = new Date().toISOString();
  if (!req || typeof req !== "object") {
    return { timestamp, ...extra };
  }
  const userId = req.user?.id != null ? String(req.user.id) : undefined;
  const ip = getRequestIp(req);
  const endpoint = String(req.originalUrl || req.url || "");
  const requestId =
    req.auditContext?.correlationId ||
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

function normalizeDetails(details) {
  if (details == null) return {};
  if (typeof details !== "object" || Array.isArray(details)) return { value: details };
  return { ...details };
}

function fileNameForLevel(level) {
  if (level === "SECURITY") return "security";
  return String(level).toLowerCase();
}

/**
 * @param {string} level
 * @param {Record<string, unknown>} record
 */
function writeLine(level, record) {
  const line = `${JSON.stringify(record)}\n`;
  if (process.env.NODE_ENV !== "test") {
    console.log(line.trimEnd());
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

function levelAllowed(level) {
  return LEVEL_WEIGHT[level] <= CURRENT_THRESHOLD;
}

/**
 * @param {string} level
 * @param {string} category
 * @param {string} message
 * @param {Record<string, unknown>} details
 * @param {import("express").Request | null | undefined} [req]
 */
function emitStructured(level, category, message, details, req) {
  if (!levelAllowed(level)) return;
  const ctx = req ? buildRequestLogContext(req) : { timestamp: new Date().toISOString() };
  const { timestamp, ...restCtx } = ctx;
  const mergedDetails = normalizeDetails(details);
  const record = {
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
  /**
   * @param {string} [category]
   */
  constructor(category = "App") {
    this.category = category;
  }

  /**
   * @param {string} subCategory
   */
  child(subCategory) {
    return new Logger(`${this.category}:${subCategory}`);
  }

  /**
   * @param {string} level
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  _emit(level, message, details, req) {
    emitStructured(level, this.category, message, normalizeDetails(details), req);
  }

  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  error(message, details, req) {
    this._emit("ERROR", message, details, req);
  }

  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  warn(message, details, req) {
    this._emit("WARN", message, details, req);
  }

  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  info(message, details, req) {
    this._emit("INFO", message, details, req);
  }

  /**
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  debug(message, details, req) {
    this._emit("DEBUG", message, details, req);
  }

  /**
   * Security / audit trail (rate limits, CSRF, idempotency replay, etc.).
   * @param {string} message
   * @param {Record<string, unknown>} [details]
   * @param {import("express").Request | null | undefined} [req]
   */
  security(message, details, req) {
    this._emit("SECURITY", message, details, req);
  }
}

const defaultLogger = new Logger();

/**
 * User-facing business events (auth, payments, gameplay mutations).
 * @param {string} activityType
 * @param {import("express").Request | null | undefined} req
 * @param {Record<string, unknown>} [details]
 */
export function logUserActivity(activityType, req, details = {}) {
  const ctx = buildRequestLogContext(req);
  const { timestamp, ...restCtx } = ctx;
  const normalizedDetails = normalizeDetails(details);
  const record = {
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

/**
 * @param {Error} err
 * @param {import("express").Request | null | undefined} req
 * @param {Record<string, unknown>} [extra]
 */
export function logUnhandledError(err, req, extra = {}) {
  const base = req ? buildRequestLogContext(req) : { timestamp: new Date().toISOString() };
  const { timestamp, ...rest } = base;
  const record = {
    level: "error",
    kind: "unhandled_error",
    message: err?.message || "Error",
    category: "Process",
    timestamp,
    ...rest,
    details: {
      name: err?.name,
      stack: typeof err?.stack === "string" ? err.stack : undefined,
      ...normalizeDetails(extra),
    },
  };
  writeLine("ERROR", record);
}

export default defaultLogger;
