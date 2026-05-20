import prisma from '../src/db/prisma.js';
import { createInventoryWithOwnedMachineTx } from '../services/userOwnedMachineService.js';
import { normalizePersistableMinerImageUrl } from '../utils/ownedMachineImage.js';

export async function listInventory(userId) {
  return prisma.userInventory.findMany({
    where: { userId },
    include: {
      ownedMachine: { select: { id: true, imageUrl: true } },
      miner: { select: { imageUrl: true } },
    },
    orderBy: { acquiredAt: 'asc' }
  });
}

export async function getInventoryItem(userId, inventoryId) {
  return prisma.userInventory.findFirst({
    where: { 
      id: inventoryId,
      userId 
    }
  });
}

export async function addInventoryItem(userId, minerName, level, hashRate, slotSize, acquiredAt, updatedAt, minerId = null, imageUrl = null) {
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

export async function removeInventoryItem(userId, inventoryId) {
  return prisma.userInventory.delete({
    where: { 
      id: inventoryId,
      userId // Security check
    }
  });
}

export async function updateInventoryItemMeta(userId, inventoryId, minerName, slotSize, minerId = null) {
  let imageUrl: string | null | undefined;
  if (minerId) {
    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    imageUrl = normalizePersistableMinerImageUrl(miner?.imageUrl ?? null);
  }

  return prisma.userInventory.update({
    where: { 
      id: inventoryId,
      userId
    },
    data: {
      minerName,
      slotSize,
      minerId,
      imageUrl,
      updatedAt: new Date()
    }
  });
}
