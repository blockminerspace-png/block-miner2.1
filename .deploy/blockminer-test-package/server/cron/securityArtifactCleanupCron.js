/**
 * Deletes expired security helper rows from callback_queue (rate buckets, idempotency, lockout).
 * Keeps the table bounded without schema migrations.
 */

import loggerLib from "../utils/logger.js";
import prisma from "../src/db/prisma.js";

const logger = loggerLib.child("SecurityArtifactCleanup");

const CALLBACK_TYPES = ["SEC_SW_RL", "SEC_IDEM", "SEC_LOCK"];

export function startSecurityArtifactCleanupCron() {
  if (process.env.NODE_ENV === "test") {
    return [];
  }
  const intervalMs = Math.max(60_000, Number(process.env.SECURITY_ARTIFACT_CLEANUP_MS) || 3_600_000);
  const maxAgeHours = Math.max(1, Number(process.env.SECURITY_ARTIFACT_MAX_AGE_H) || 72);

  const timer = setInterval(() => {
    void (async () => {
      try {
        const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        const res = await prisma.callbackQueue.deleteMany({
          where: {
            callbackType: { in: CALLBACK_TYPES },
            createdAt: { lt: cutoff },
          },
        });
        if (res.count > 0) {
          logger.info("Security artifact cleanup", { deleted: res.count, maxAgeHours });
        }
      } catch (e) {
        logger.error("Security artifact cleanup failed", { message: /** @type {Error} */ (e).message });
      }
    })();
  }, intervalMs);

  return [{ timer, name: "securityArtifactCleanup" }];
}
