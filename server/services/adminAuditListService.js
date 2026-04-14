/**
 * Unified system / audit log list for the admin UI: merges `audit_logs` and `audit_events`.
 */
import prisma from "../src/db/prisma.js";

const MAX_WINDOW = 2000;

function clampInt(n, min, max, fallback) {
  const v = parseInt(String(n), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function mapAuditLogRow(r) {
  return {
    id: `log-${r.id}`,
    source: "audit_log",
    created_at: r.createdAt.toISOString(),
    action: r.action,
    user_id: r.userId,
    user_email: r.user?.email ?? null,
    username: r.user?.username ?? null,
    ip: r.ip,
    user_agent: r.userAgent,
    details_json: r.detailsJson,
    result_code: null,
    event_status: null,
  };
}

function mapAuditEventRow(r, userMap) {
  const u = r.userId ? userMap.get(r.userId) : null;
  return {
    id: `evt-${r.id}`,
    source: "audit_event",
    created_at: r.createdAt.toISOString(),
    action: r.eventType,
    user_id: r.userId,
    user_email: u?.email ?? null,
    username: u?.username ?? null,
    ip: r.ipHash ? `(hashed) ${String(r.ipHash).slice(0, 14)}…` : null,
    user_agent: r.userAgent,
    details_json: r.payload != null ? JSON.stringify(r.payload) : null,
    result_code: r.resultCode,
    event_status: r.status,
  };
}

/**
 * @param {{ limit?: number, offset?: number }} query
 */
export async function listUnifiedAdminAuditLogs(query = {}) {
  const limit = clampInt(query.limit, 1, 500, 100);
  const offset = clampInt(query.offset, 0, MAX_WINDOW, 0);
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

  const merged = [...legacyRows.map(mapAuditLogRow), ...eventRows.map((e) => mapAuditEventRow(e, userMap))].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const logs = merged.slice(offset, offset + limit);
  const totalApprox = legacyTotal + eventTotal;

  return {
    ok: true,
    logs,
    limit,
    offset,
    totalApprox,
    hasMore: merged.length > offset + limit,
  };
}
