/**
 * UserOwnedMachine: canonical row per physical machine instance (Option B).
 * Child rows (inventory / rack UserMiner / vault) hold optional ownedMachineId.
 */

/** @typedef {import("@prisma/client").Prisma.TransactionClient} Tx */

export const MachineLocation = /** @type {const} */ ({
  INVENTORY: "INVENTORY",
  RACK: "RACK",
  WAREHOUSE: "WAREHOUSE",
});

/**
 * @param {Tx} tx
 * @param {{ id: number, userId: number, ownedMachineId: number | null, minerId: number | null, minerName: string, level: number, hashRate: number, slotSize: number, imageUrl: string | null }} row
 * @returns {Promise<number>} owned machine id
 */
export async function ensureOwnedMachineForInventoryTx(tx, row) {
  if (row.ownedMachineId != null) return row.ownedMachineId;
  const om = await tx.userOwnedMachine.create({
    data: {
      userId: row.userId,
      location: MachineLocation.INVENTORY,
      minerId: row.minerId,
      minerName: row.minerName,
      snapshotSlug: row.snapshotSlug ?? null,
      level: row.level ?? 1,
      hashRate: row.hashRate ?? 0,
      slotSize: row.slotSize ?? 1,
      imageUrl: row.imageUrl,
      snapshotPrice: row.snapshotPrice ?? null,
      acquisitionSource: row.acquisitionSource ?? null,
    },
  });
  await tx.userInventory.update({
    where: { id: row.id },
    data: { ownedMachineId: om.id },
  });
  return om.id;
}

/**
 * @param {Tx} tx
 * @param {{ id: number, userId: number, ownedMachineId: number | null, minerId: number | null, level: number, hashRate: number, slotSize: number, imageUrl: string | null }} m
 * @param {string} minerDisplayName
 * @returns {Promise<number>}
 */
export async function ensureOwnedMachineForUserMinerTx(tx, m, minerDisplayName) {
  if (m.ownedMachineId != null) return m.ownedMachineId;
  const om = await tx.userOwnedMachine.create({
    data: {
      userId: m.userId,
      location: MachineLocation.RACK,
      minerId: m.minerId,
      minerName: minerDisplayName,
      snapshotSlug: m.snapshotSlug ?? null,
      level: m.level ?? 1,
      hashRate: m.hashRate ?? 0,
      slotSize: m.slotSize ?? 1,
      imageUrl: m.imageUrl,
      snapshotPrice: m.snapshotPrice ?? null,
      acquisitionSource: m.acquisitionSource ?? null,
    },
  });
  await tx.userMiner.update({
    where: { id: m.id },
    data: { ownedMachineId: om.id },
  });
  return om.id;
}

/**
 * @param {Tx} tx
 * @param {{ id: number, userId: number, ownedMachineId: number | null, minerId: number | null, minerName: string, level: number, hashRate: number, slotSize: number, imageUrl: string | null }} row
 * @returns {Promise<number>}
 */
export async function ensureOwnedMachineForVaultTx(tx, row) {
  if (row.ownedMachineId != null) return row.ownedMachineId;
  const om = await tx.userOwnedMachine.create({
    data: {
      userId: row.userId,
      location: MachineLocation.WAREHOUSE,
      minerId: row.minerId,
      minerName: row.minerName,
      snapshotSlug: row.snapshotSlug ?? null,
      level: row.level ?? 1,
      hashRate: row.hashRate ?? 0,
      slotSize: row.slotSize ?? 1,
      imageUrl: row.imageUrl,
      snapshotPrice: row.snapshotPrice ?? null,
      acquisitionSource: row.acquisitionSource ?? null,
    },
  });
  await tx.userVault.update({
    where: { id: row.id },
    data: { ownedMachineId: om.id },
  });
  return om.id;
}

/**
 * @param {Tx} tx
 * @param {{
 *   userId: number;
 *   minerId?: number | null;
 *   minerName: string;
 *   level?: number;
 *   hashRate: number;
 *   slotSize?: number;
 *   imageUrl?: string | null;
 *   snapshotSlug?: string | null;
 *   snapshotPrice?: number | string | null;
 *   acquisitionSource?: string | null;
 *   acquiredAt?: Date;
 *   updatedAt?: Date;
 *   expiresAt?: Date | null;
 * }} payload
 */
export async function createInventoryWithOwnedMachineTx(tx, payload) {
  const now = payload.acquiredAt ?? new Date();
  const updated = payload.updatedAt ?? now;
  const om = await tx.userOwnedMachine.create({
    data: {
      userId: payload.userId,
      location: MachineLocation.INVENTORY,
      minerId: payload.minerId ?? null,
      minerName: payload.minerName,
      snapshotSlug: payload.snapshotSlug ?? null,
      level: payload.level ?? 1,
      hashRate: payload.hashRate,
      slotSize: payload.slotSize ?? 1,
      imageUrl: payload.imageUrl ?? null,
      snapshotPrice: payload.snapshotPrice ?? null,
      acquisitionSource: payload.acquisitionSource ?? null,
    },
  });
  return tx.userInventory.create({
    data: {
      userId: payload.userId,
      minerId: payload.minerId ?? null,
      minerName: payload.minerName,
      level: payload.level ?? 1,
      hashRate: payload.hashRate,
      slotSize: payload.slotSize ?? 1,
      imageUrl: payload.imageUrl ?? null,
      acquiredAt: now,
      updatedAt: updated,
      expiresAt: payload.expiresAt ?? undefined,
      ownedMachineId: om.id,
    },
  });
}

/**
 * @param {Tx} tx
 * @param {number} userId
 * @param {object} template
 * @param {string} template.minerName
 * @param {number} template.hashRate
 * @param {number} [template.level]
 * @param {number} [template.slotSize]
 * @param {number | null} [template.minerId]
 * @param {string | null} [template.imageUrl]
 * @param {string | null} [template.snapshotSlug]
 * @param {number | string | null} [template.snapshotPrice]
 * @param {string | null} [template.acquisitionSource]
 * @param {number} quantity
 * @param {Date} [now]
 */
export async function bulkCreateInventoryWithOwnedMachinesTx(tx, userId, template, quantity, now = new Date()) {
  for (let i = 0; i < quantity; i++) {
    await createInventoryWithOwnedMachineTx(tx, {
      userId,
      minerName: template.minerName,
      hashRate: template.hashRate,
      level: template.level ?? 1,
      slotSize: template.slotSize ?? 1,
      minerId: template.minerId ?? null,
      imageUrl: template.imageUrl ?? null,
      snapshotSlug: template.snapshotSlug ?? null,
      snapshotPrice: template.snapshotPrice ?? null,
      acquisitionSource: template.acquisitionSource ?? null,
      acquiredAt: now,
      updatedAt: now,
    });
  }
}

/**
 * @param {Tx} tx
 * @param {number} ownedMachineId
 * @param {import("@prisma/client").MachineInstanceLocation} location
 * @param {{ minerId: number | null; minerName: string; level: number; hashRate: number; slotSize: number; imageUrl: string | null; snapshotSlug?: string | null; snapshotPrice?: number | string | null; acquisitionSource?: string | null }} snap
 */
export async function syncOwnedMachineSnapshotTx(tx, ownedMachineId, location, snap) {
  await tx.userOwnedMachine.update({
    where: { id: ownedMachineId },
    data: {
      location,
      minerId: snap.minerId,
      minerName: snap.minerName,
      snapshotSlug: snap.snapshotSlug ?? null,
      level: snap.level,
      hashRate: snap.hashRate,
      slotSize: snap.slotSize,
      imageUrl: snap.imageUrl,
      snapshotPrice: snap.snapshotPrice ?? null,
      acquisitionSource: snap.acquisitionSource ?? null,
    },
  });
}
