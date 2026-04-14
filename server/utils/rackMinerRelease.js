/**
 * When a UserMiner row is removed outside the rooms uninstall flow, user_racks
 * may still reference it. user_miner_id is unique per rack row; blocked_by_miner_id
 * is not an FK and can point at this miner from an adjacent slot (2-slot machines).
 *
 * userMiner ids are globally unique, so we clear by miner id only. This matches
 * rooms uninstall (roomId + blockedByMinerId) and fixes racks whose user_id drifted.
 *
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} _userId Reserved for callers; ownership is enforced before release.
 * @param {number} userMinerId
 */
export async function releaseUserMinerFromRacksTx(tx, _userId, userMinerId) {
  await tx.userRack.updateMany({
    where: { userMinerId },
    data: { userMinerId: null, installedAt: null },
  });
  await tx.userRack.updateMany({
    where: { blockedByMinerId: userMinerId },
    data: { blockedByMinerId: null },
  });
}
