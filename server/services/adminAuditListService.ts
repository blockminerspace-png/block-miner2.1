/**
 * Unified system / audit log list for the admin UI: merges `audit_logs` and `audit_events`.
 */
import prisma from "../src/db/prisma.js";

const MAX_WINDOW = 2000;

/** @typedef {'all'|'auth'|'admin'|'economy'|'games'|'user_activity'|'system'|'other'} AuditUiCategory */

export const AUDIT_UI_CATEGORY_KEYS = /** @type {const} */ ([
  "all",
  "auth",
  "admin",
  "economy",
  "games",
  "user_activity",
  "system",
  "other",
]);

const SOURCE_FILTER_KEYS = /** @type {const} */ (["all", "audit_log", "audit_event"]);

/**
 * Coarse bucket for admin log filters (legacy `audit_logs.action` + `audit_events.eventType`).
 * @param {string | null | undefined} action
 * @returns {Exclude<AuditUiCategory, 'all'>}
 */
export function inferAuditCategory(action) {
  const raw = String(action || "").trim();
  const u = raw.toUpperCase();
  if (!u) return "other";

  if (u.startsWith("ADMIN") || u.includes("ADMIN_") || u.startsWith("MOD_")) return "admin";
  if (u.startsWith("AUTH_")) return "auth";
  if (
    (u.includes("LOGIN") || u.includes("LOGOUT") || u.includes("PASSWORD") || u.includes("REGISTER")) &&
    !u.includes("ADMIN")
  ) {
    return "auth";
  }
  if (u.startsWith("USER_")) return "user_activity";
  if (u.startsWith("ECONOMY_")) return "economy";
  if (
    u.includes("WITHDRAW") ||
    u.includes("DEPOSIT") ||
    u.includes("FAUCET") ||
    u.includes("WALLET") ||
    u.includes("VAULT") ||
    u.includes("PAYOUT") ||
    u.includes("BALANCE") ||
    u.includes("STRIPE")
  ) {
    return "economy";
  }
  if (u.startsWith("SYSTEM_")) return "system";
  if (
    u.includes("GAME") ||
    u.includes("CHECKIN") ||
    u.includes("READ_EARN") ||
    u.includes("OFFERWALL") ||
    u.includes("YOUTUBE") ||
    u.includes("MINI_PASS") ||
    u.includes("POWERS") ||
    u.includes("2048")
  ) {
    return "games";
  }
  return "other";
}

function normalizeCategoryParam(v) {
  const s = String(v || "all").trim().toLowerCase();
  return /** @type {AuditUiCategory} */ (AUDIT_UI_CATEGORY_KEYS.includes(s) ? s : "all");
}

function normalizeSourceParam(v) {
  const s = String(v || "all").trim().toLowerCase();
  return SOURCE_FILTER_KEYS.includes(s) ? s : "all";
}

function clampInt(n, min, max, fallback) {
  const v = parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

type AuditListQuery = {
  limit?: unknown;
  offset?: unknown;
  category?: unknown;
  source?: unknown;
};

function mapAuditLogRow(r) {
  const action = r.action;
  const category = inferAuditCategory(action);
  let details = null;
  if (r.detailsJson) {
    try {
      details = JSON.parse(r.detailsJson);
    } catch {
      details = r.detailsJson;
    }
  }
  return {
    id: `log-${r.id}`,
    source: "audit_log",
    created_at: r.createdAt.toISOString(),
    action,
    category,
    user_id: r.userId,
    user_email: r.user?.email ?? null,
    username: r.user?.username ?? null,
    ip: r.ip,
    user_agent: r.userAgent,
    details_json: r.detailsJson,
    details,
    result_code: null,
    event_status: null,
  };
}

function mapAuditEventRow(r, userMap) {
  const u = r.userId ? userMap.get(r.userId) : null;
  const action = r.eventType;
  const category = inferAuditCategory(action);
  return {
    id: `evt-${r.id}`,
    source: "audit_event",
    created_at: r.createdAt.toISOString(),
    action,
    category,
    user_id: r.userId,
    user_email: u?.email ?? null,
    username: u?.username ?? null,
    ip: r.ipHash ? `(hashed) ${String(r.ipHash).slice(0, 14)}…` : null,
    user_agent: r.userAgent,
    details_json: r.payload != null ? JSON.stringify(r.payload) : null,
    details: r.payload ?? null,
    result_code: r.resultCode,
    event_status: r.status,
  };
}

/**
 * @param {AuditListQuery} query
 */
export async function listUnifiedAdminAuditLogs(query: AuditListQuery = {}) {
  const limit = clampInt(query.limit, 1, 500, 100);
  const offset = clampInt(query.offset, 0, MAX_WINDOW, 0);
  const category = normalizeCategoryParam(query.category);
  const source = normalizeSourceParam(query.source);
  const window = Math.min(MAX_WINDOW, offset + limit + 200);

  const [legacyRows, eventRows, legacyTotal, eventTotal] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: window,
      include: { user: { select: { email: true, username: true } } },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: window,
    }),
    prisma.auditLog.count(),
    prisma.auditEvent.count(),
  ]);

  const userIds = [...new Set(eventRows.map((e) => e.userId).filter((id) => id != null))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true, username: true },
        })
      : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  let merged = [...legacyRows.map(mapAuditLogRow), ...eventRows.map((e) => mapAuditEventRow(e, userMap))].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (source !== "all") {
    merged = merged.filter((row) => row.source === source);
  }
  if (category !== "all") {
    merged = merged.filter((row) => row.category === category);
  }

  const logs = merged.slice(offset, offset + limit);
  const totalApprox = legacyTotal + eventTotal;

  return {
    ok: true,
    logs,
    limit,
    offset,
    totalApprox,
    hasMore: merged.length > offset + limit,
    category,
    source,
    matchedInWindow: merged.length,
  };
}
