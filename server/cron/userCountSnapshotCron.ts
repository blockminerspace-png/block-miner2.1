import loggerLib from "../utils/logger.js";
import prisma from "../src/db/prisma.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("UserCountSnapshotCron");

/**
 * Daily snapshot of user metrics — written to audit_logs so we have a real
 * historical series of `total / banned / active7d / active30d / max_id`.
 *
 * Combined with the audit_user_delete DB trigger, this catches both planned
 * (admin actions) and unplanned (silent SQL) shrinkage of the user base.
 *
 * action: "user_count_snapshot"  | source: "system" | severity: "info"
 */
async function takeSnapshot(): Promise<void> {
  const now = new Date();
  const sevenDaysAgo  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, banned, neverLogged, active7d, active30d, maxIdRow] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isBanned: true } }),
    prisma.user.count({ where: { lastLoginAt: null } }),
    prisma.user.count({ where: { lastLoginAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).$queryRaw`SELECT COALESCE(MAX(id), 0)::int AS max_id FROM users`,
  ]);

  const maxId = Array.isArray(maxIdRow) && maxIdRow[0]?.max_id != null ? Number(maxIdRow[0].max_id) : 0;
  const deletedEver = Math.max(0, maxId - total);

  await prisma.auditLog.create({
    data: {
      action: "user_count_snapshot",
      source: "system",
      severity: "info",
      label: `Users: ${total} (banned ${banned} · 7d ${active7d} · gaps ${deletedEver})`,
      metadata: { total, banned, neverLogged, active7d, active30d, maxId, deletedEver },
    },
  });

  logger.info("snapshot written", { total, banned, active7d, active30d, deletedEver });
}

export function startUserCountSnapshotCron(): { userCountSnapshotTimer: ReturnType<typeof setInterval> } {
  const intervalMs = Number(process.env.USER_COUNT_SNAPSHOT_MS || 24 * 60 * 60 * 1000); // 24h default
  const handle = setInterval(() => {
    takeSnapshot().catch((err: unknown) => {
      logger.warn("snapshot failed", { error: errMsg(err) });
    });
  }, intervalMs);
  handle.unref?.();
  // Run one immediately on boot so we always have a baseline after deploys/restarts.
  takeSnapshot().catch((err: unknown) => {
    logger.warn("initial snapshot failed", { error: errMsg(err) });
  });
  return { userCountSnapshotTimer: handle };
}
