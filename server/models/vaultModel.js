import prisma from '../src/db/prisma.js';

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

export async function listVault(userId) {
  return prisma.userVault.findMany({
    where: { userId },
    orderBy: { storedAt: 'asc' }
  });
}

export async function getVaultItem(userId, vaultId) {
  return prisma.userVault.findFirst({
    where: {
      id: vaultId,
      userId
    }
  });
}

export async function addVaultItem(userId, minerName, level, hashRate, slotSize, storedAt, updatedAt, minerId = null, imageUrl = null) {
  return prisma.userVault.create({
    data: {
      userId,
      minerId,
      minerName,
      level,
      hashRate,
      slotSize,
      imageUrl,
      storedAt: new Date(storedAt),
      updatedAt: new Date(updatedAt)
    }
  });
}

export async function removeVaultItem(userId, vaultId) {
  return prisma.userVault.delete({
    where: {
      id: vaultId,
      userId // Security check
    }
  });
}

export async function updateVaultItemMeta(userId, vaultId, minerName, slotSize, minerId = null) {
  let imageUrl = undefined;
  if (minerId) {
    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    imageUrl = miner?.imageUrl || DEFAULT_MINER_IMAGE_URL;
  }

  return prisma.userVault.update({
    where: {
      id: vaultId,
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