/**
 * Cross-instance mutual exclusion uses PostgreSQL transaction advisory locks.
 * Call `advisoryXactTryLockOrThrow(tx, resourceName)` as the first statement inside the same
 * `prisma.$transaction` that performs balance / vault / machine mutations.
 *
 * Redis-based locks were removed to avoid extra infrastructure; row-level FOR UPDATE remains
 * complementary inside the same transaction.
 */

export { advisoryXactTryLockOrThrow, advisoryIntPairFromString } from "../utils/pgAdvisoryLocks.js";
