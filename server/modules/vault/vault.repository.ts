import prisma from "../../src/db/prisma.js";
import { normalizePersistableMinerImageUrl } from "../../utils/ownedMachineImage.js";

export async function listVault(userId: number) {
  return prisma.userVault.findMany({
    where: { userId },
    include: {
      ownedMachine: { select: { id: true, imageUrl: true } },
      miner: { select: { imageUrl: true } },
    },
    orderBy: { storedAt: "asc" },
  });
}

export async function getVaultItem(userId: number, vaultId: number) {
  return prisma.userVault.findFirst({
    where: {
      id: vaultId,
      userId,
    },
  });
}

export async function addVaultItem(
  userId: number,
  minerName: string,
  level: number,
  hashRate: number,
  slotSize: number,
  storedAt: Date | string,
  updatedAt: Date | string,
  minerId: number | null = null,
  imageUrl: string | null = null,
) {
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
      updatedAt: new Date(updatedAt),
    },
  });
}

export async function removeVaultItem(userId: number, vaultId: number) {
  return prisma.userVault.delete({
    where: {
      id: vaultId,
      userId,
    },
  });
}

export async function updateVaultItemMeta(
  userId: number,
  vaultId: number,
  minerName: string,
  slotSize: number,
  minerId: number | null = null,
) {
  let imageUrl: string | undefined;
  if (minerId) {
    const miner = await prisma.miner.findUnique({ where: { id: minerId } });
    imageUrl = normalizePersistableMinerImageUrl(miner?.imageUrl ?? null) ?? undefined;
  }

  return prisma.userVault.update({
    where: {
      id: vaultId,
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

export async function listOwnedMachineLocations(userId: number, ownedMachineIds: number[]) {
  if (ownedMachineIds.length === 0) return [];
  return prisma.userOwnedMachine.findMany({
    where: { userId, id: { in: ownedMachineIds } },
    select: { id: true, location: true },
  });
}
