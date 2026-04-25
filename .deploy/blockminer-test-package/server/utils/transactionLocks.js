/**
 * PostgreSQL row-level locks inside Prisma interactive transactions.
 * Lock order: always acquire the user row first, then the resource row, to reduce deadlock risk.
 */

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 */
export async function lockUserRowForUpdate(tx, userId) {
  await tx.$queryRaw`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {number} inventoryId
 * @returns {Promise<boolean>} true if a row was locked
 */
export async function lockUserInventoryRowForUpdate(tx, userId, inventoryId) {
  const rows = await tx.$queryRaw`
    SELECT id FROM user_inventory WHERE id = ${inventoryId} AND user_id = ${userId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {number} vaultId
 * @returns {Promise<boolean>}
 */
export async function lockUserVaultRowForUpdate(tx, userId, vaultId) {
  const rows = await tx.$queryRaw`
    SELECT id FROM user_vault WHERE id = ${vaultId} AND user_id = ${userId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {number} userMinerId user_miners.id
 * @returns {Promise<boolean>}
 */
export async function lockUserMinerRowForUpdate(tx, userId, userMinerId) {
  const rows = await tx.$queryRaw`
    SELECT id FROM user_miners WHERE id = ${userMinerId} AND user_id = ${userId} FOR UPDATE
  `;
  return Array.isArray(rows) && rows.length > 0;
}
