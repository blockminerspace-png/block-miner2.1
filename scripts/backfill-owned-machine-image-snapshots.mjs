/**
 * Idempotent backfill: copy catalog miner.imageUrl into UserOwnedMachine.imageUrl
 * only when owned snapshot is null/empty or a stock placeholder path.
 *
 * Usage (after backup): node scripts/backfill-owned-machine-image-snapshots.mjs
 * Requires DATABASE_URL and built server (prisma client).
 */
import prisma from "../dist/server/src/db/prisma.js";
import {
  isStockPlaceholderMinerImageUrl,
  normalizePersistableMinerImageUrl,
} from "../dist/server/utils/ownedMachineImage.js";

async function main() {
  const rows = await prisma.userOwnedMachine.findMany({
    where: { minerId: { not: null } },
    select: {
      id: true,
      imageUrl: true,
      minerId: true,
      miner: { select: { imageUrl: true } },
    },
  });

  let updated = 0;
  for (const row of rows) {
    const current = row.imageUrl?.trim() || "";
    const needs =
      !current || isStockPlaceholderMinerImageUrl(current);
    if (!needs) continue;
    const next = normalizePersistableMinerImageUrl(row.miner?.imageUrl ?? null);
    if (!next) continue;
    await prisma.userOwnedMachine.update({
      where: { id: row.id },
      data: { imageUrl: next },
    });
    updated += 1;
  }
  console.log(`Backfill complete. Updated ${updated} owned-machine rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
