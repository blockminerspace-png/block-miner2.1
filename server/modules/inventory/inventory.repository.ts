import prisma from "../../src/db/prisma.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";

export async function listInventory(userId: number) {
  return prisma.userInventory.findMany({
    where: { userId },
    include: {
      ownedMachine: { select: { id: true, imageUrl: true } },
      miner: { select: { imageUrl: true } },
    },
    orderBy: { acquiredAt: "asc" },
  });
}

export async function getInventoryItem(userId: number, inventoryId: number) {
  return prisma.userInventory.findFirst({
    where: {
      id: inventoryId,
      userId,
    },
  });
}

export async function addInventoryItem(
  userId: number,
  minerName: string,
  level: number,
  hashRate: number,
  slotSize: number,
  acquiredAt: Date | string,
  updatedAt: Date | string,
  minerId: number | null = null,
  imageUrl: string | null = null,
) {
  const a = new Date(acquiredAt);
  const u = new Date(updatedAt);
  return prisma.$transaction((tx) =>
    createInventoryWithOwnedMachineTx(tx, {
      userId,
      minerId,
      minerName,
      level,
      hashRate,
      slotSize,
      imageUrl,
      acquiredAt: a,
      updatedAt: u,
    }),
  );
}

export async function removeInventoryItem(userId: number, inventoryId: number) {
  return prisma.userInventory.delete({
    where: {
      id: inventoryId,
      userId,
    },
  });
}

export async function updateInventoryItemMeta(
  userId: number,
  inventoryId: number,
  minerName: string,
  slotSize: number,
  minerId: number | null = null,
) {
  let imageUrl: string | null | undefined;
  if (minerId) {
    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    imageUrl = normalizePersistableMinerImageUrl(miner?.imageUrl ?? null);
  }

  return prisma.userInventory.update({
    where: {
      id: inventoryId,
      userId,
    },
    data: {
      minerName,
      slotSize,
      minerId,
      imageUrl,
      updatedAt: new Date(),
    },
  });
}
