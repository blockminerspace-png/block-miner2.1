/**
 * PostgreSQL transaction-scoped advisory locks for cross-instance serialization.
 * Must run inside the same Prisma interactive transaction as the guarded mutations.
 */

import crypto from "crypto";

/**
 * Derives two int4 keys from a stable resource name (fits pg_try_advisory_xact_lock).
 * @param {string} resourceName
 * @returns {{ k1: number; k2: number }}
 */
export function advisoryIntPairFromString(resourceName) {
  const buf = crypto.createHash("sha256").update(String(resourceName || ""), "utf8").digest();
  return { k1: buf.readInt32BE(0), k2: buf.readInt32BE(4) };
}

/**
 * Non-blocking transaction advisory lock. Released automatically at transaction end.
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {string} resourceName
 */
export async function advisoryXactTryLockOrThrow(tx, resourceName) {
  const { k1, k2 } = advisoryIntPairFromString(resourceName);
  const rows = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${k1}::int, ${k2}::int) AS ok`;
  const ok = Array.isArray(rows) && rows[0] && Boolean(rows[0].ok);
  if (!ok) {
    const err = new Error("DISTRIBUTED_LOCK_BUSY");
    /** @type {any} */ (err).code = "DISTRIBUTED_LOCK_BUSY";
    throw err;
  }
}
