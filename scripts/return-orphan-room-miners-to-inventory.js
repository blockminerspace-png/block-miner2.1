/**
 * Recupera máquinas "órfãs" no sentido recuperável:
 * UserMiner com slotIndex >= 1000 (instalação via salas/racks) mas sem nenhum
 * UserRack.user_miner_id apontando para ela — o jogador não vê no rack nem no inventário.
 *
 * Para cada uma: limpa blocked_by, cria linha em user_inventory, remove user_miners.
 *
 * NÃO restaura linhas já apagadas de user_miners (sem backup não há como).
 *
 * Uso:
 *   DRY_RUN=1 node scripts/return-orphan-room-miners-to-inventory.js   # só lista
 *   node scripts/return-orphan-room-miners-to-inventory.js
 */
import "dotenv/config";
import prisma from "../server/src/db/prisma.js";
import { releaseUserMinerFromRacksTx } from "../server/utils/rackMinerRelease.js";
import { syncUserBaseHashRate } from "../server/models/minerProfileModel.js";

const ROOM_SLOT_MIN = 1000;
const dryRun = ["1", "true", "yes"].includes(String(process.env.DRY_RUN || "").toLowerCase());

function minerNameFor(m) {
  return m.miner?.name || (!m.minerId ? "Máquina custom" : "Máquina");
}

async function main() {
  const candidates = await prisma.userMiner.findMany({
    where: { slotIndex: { gte: ROOM_SLOT_MIN } },
    include: { userRack: true, miner: true },
  });

  const orphans = candidates.filter((m) => !m.userRack);

  console.log(
    `[return-orphans] room-slot miners (slotIndex>=${ROOM_SLOT_MIN}): ${candidates.length}, sem rack: ${orphans.length}`
  );

  if (orphans.length === 0) {
    return;
  }

  if (dryRun) {
    for (const m of orphans) {
      console.log(
        `[DRY_RUN] would return userMiner id=${m.id} userId=${m.userId} minerId=${m.minerId} hashRate=${m.hashRate} name=${minerNameFor(m)}`
      );
    }
    return;
  }

  const affectedUserIds = new Set();

  for (const m of orphans) {
    const name = minerNameFor(m);
    await prisma.$transaction(async (tx) => {
      await releaseUserMinerFromRacksTx(tx, m.userId, m.id);
      await tx.userInventory.create({
        data: {
          userId: m.userId,
          minerId: m.minerId,
          minerName: name,
          level: m.level,
          hashRate: m.hashRate,
          slotSize: m.slotSize,
          imageUrl: m.imageUrl ?? m.miner?.imageUrl ?? null,
          acquiredAt: new Date(),
        },
      });
      await tx.userMiner.delete({ where: { id: m.id } });
    });
    affectedUserIds.add(m.userId);
    console.log(`[return-orphans] userId=${m.userId} userMinerId=${m.id} -> inventory (${name})`);
  }

  for (const userId of affectedUserIds) {
    await syncUserBaseHashRate(userId);
  }

  console.log(`[return-orphans] done. users updated: ${affectedUserIds.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
