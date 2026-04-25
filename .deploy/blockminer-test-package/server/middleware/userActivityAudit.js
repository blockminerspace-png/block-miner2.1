import { logUserActivity } from "../utils/logger.js";

const DEFAULT_IGNORED_PREFIXES = ["/api/admin"];
const DEFAULT_IGNORED_PATHS = new Set([
  "/api/session/heartbeat",
  "/api/auth/mark-adblock",
]);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizePath(path) {
  const p = String(path || "").split("?")[0].trim();
  if (!p) return "/";
  return p.replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
}

function sanitizePathSegment(segment) {
  const s = String(segment || "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return "ID";
  if (/^[0-9a-f]{16,}$/i.test(s)) return "HASH";
  return s
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function buildUserApiActivityAction(method, path) {
  const safeMethod = String(method || "GET").toUpperCase().replace(/[^A-Z]/g, "") || "GET";
  const normalized = normalizePath(path);
  const parts = normalized
    .replace(/^\/api\/?/, "")
    .split("/")
    .map(sanitizePathSegment)
    .filter(Boolean);
  const suffix = parts.length ? parts.slice(0, 5).join("_") : "ROOT";
  return `USER_API_${safeMethod}_${suffix}`;
}

export function shouldAuditUserRequest(req, res, options = {}) {
  if (!req?.user?.id) return false;
  const method = String(req.method || "GET").toUpperCase();
  const auditReads = options.auditReads ?? process.env.USER_ACTIVITY_LOG_READS !== "0";
  if (!auditReads && !MUTATING_METHODS.has(method)) return false;

  const status = Number(res?.statusCode || 0);
  if (status >= 500 && options.includeServerErrors !== true) return false;

  const path = normalizePath(req.originalUrl || req.url || "");
  const ignoredPaths = options.ignoredPaths || DEFAULT_IGNORED_PATHS;
  if (ignoredPaths.has(path)) return false;

  const ignoredPrefixes = options.ignoredPrefixes || DEFAULT_IGNORED_PREFIXES;
  if (ignoredPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return false;

  return true;
}

export function createUserActivityAuditMiddleware(options = {}) {
  return function userActivityAuditMiddleware(req, res, next) {
    const startedAt = Date.now();
    res.on("finish", () => {
      if (!shouldAuditUserRequest(req, res, options)) return;
      const path = normalizePath(req.originalUrl || req.url || "");
      logUserActivity(buildUserApiActivityAction(req.method, path), req, {
        method: String(req.method || "GET").toUpperCase(),
        path,
        statusCode: res.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    });
    next();
  };
}
