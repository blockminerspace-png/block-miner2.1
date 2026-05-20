import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { createNotification } from "../../controllers/notificationController.js";
import { releaseUserMinerFromRacksTx } from "../../utils/rackMinerRelease.js";
import {
  MachineLocation,
  createInventoryWithOwnedMachineTx,
  ensureOwnedMachineForInventoryTx,
  syncOwnedMachineSnapshotTx,
} from "../../services/userOwnedMachineService.js";
import {
  lockUserInventoryRowForUpdate,
  lockUserRowForUpdate,
} from "../../utils/transactionLocks.js";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import {
  normalizePersistableMinerImageUrl,
  resolveOwnedMachineImageUrl,
} from "../../utils/ownedMachineImage.js";
import {
  collectCatalogLookupDisplayNames,
  collectEventMinerDisplayNames,
  loadEventMinerCatalogImageMap,
  loadMinerCatalogImageMapByDisplayNames,
} from "../../utils/eventMinerCatalogImage.js";
import { HttpStatusError } from "../../controllers/controllerHttpStatusError.js";
import { INVENTORY_ERROR } from "./inventory.errors.js";
import * as inventoryRepository from "./inventory.repository.js";
import { mapInventoryItemDto } from "./inventory.dto.js";

export async function listInventoryForUser(userId: number) {
  const rows = await inventoryRepository.listInventory(userId);
  const lookupNames = collectCatalogLookupDisplayNames(rows);
  const [eventCatalogMap, minerNameCatalogMap] = await Promise.all([
    loadEventMinerCatalogImageMap(collectEventMinerDisplayNames(rows)),
    loadMinerCatalogImageMapByDisplayNames(lookupNames),
  ]);
  return rows.map((row) => mapInventoryItemDto(row, eventCatalogMap, minerNameCatalogMap));
}

export async function installInventoryItemForUser(
  userId: number,
  slotIndex: number,
  inventoryId: number,
): Promise<{ minerName: string }> {
  const now = new Date();

  const { minerName: installedMinerName } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
    await lockUserRowForUpdate(tx, userId);
    const rowLocked = await lockUserInventoryRowForUpdate(tx, userId, inventoryId);
    if (!rowLocked) {
      throw new HttpStatusError(404, INVENTORY_ERROR.NOT_FOUND);
    }

    const inventoryItem = await tx.userInventory.findFirst({
      where: { id: inventoryId, userId },
      include: {
        ownedMachine: { select: { id: true, imageUrl: true } },
        miner: { select: { imageUrl: true } },
      },
    });
    if (!inventoryItem) {
      throw new HttpStatusError(404, INVENTORY_ERROR.NOT_FOUND);
    }

    const resolvedInstallImage = resolveOwnedMachineImageUrl({
      rowImageUrl: inventoryItem.imageUrl,
      ownedMachineImageUrl: inventoryItem.ownedMachine?.imageUrl ?? null,
      catalogImageUrl: inventoryItem.miner?.imageUrl ?? null,
    });
    const persistImageUrl = normalizePersistableMinerImageUrl(resolvedInstallImage.imageUrl);

    const slotSize = Number(inventoryItem.slotSize || 1);

    if (slotSize === 2 && slotIndex % 2 !== 0) {
      throw new HttpStatusError(400, INVENTORY_ERROR.INVALID_SLOT);
    }

    const targetSlots = Array.from({ length: slotSize }, (_, i) => slotIndex + i);
    const existingMachines = await tx.userMiner.findMany({
      where: {
        userId,
        slotIndex: { in: targetSlots },
      },
      include: { miner: true },
    });

    if (existingMachines.length > 0) {
      for (const m of existingMachines) {
        await releaseUserMinerFromRacksTx(tx, userId, m.id);
        await createInventoryWithOwnedMachineTx(tx, {
          userId,
          minerName: m.miner?.name ?? "Miner",
          level: m.level,
          hashRate: m.hashRate,
          slotSize: m.slotSize,
          minerId: m.minerId || null,
          imageUrl: m.imageUrl || m.miner?.imageUrl || null,
          acquiredAt: now,
          updatedAt: now,
        });
        await tx.userMiner.delete({ where: { id: m.id } });
      }
    }

    if (slotIndex % 2 === 1) {
      const prevMachine = await tx.userMiner.findFirst({
        where: { userId, slotIndex: slotIndex - 1 },
        include: { miner: true },
      });
      if (prevMachine && prevMachine.slotSize === 2) {
        await releaseUserMinerFromRacksTx(tx, userId, prevMachine.id);
        await createInventoryWithOwnedMachineTx(tx, {
          userId,
          minerName: prevMachine.miner?.name ?? "Miner",
          level: prevMachine.level,
          hashRate: prevMachine.hashRate,
          slotSize: prevMachine.slotSize,
          minerId: prevMachine.minerId || null,
          imageUrl: prevMachine.imageUrl || prevMachine.miner?.imageUrl || null,
          acquiredAt: now,
          updatedAt: now,
        });
        await tx.userMiner.delete({ where: { id: prevMachine.id } });
      }
    }

    const omId = await ensureOwnedMachineForInventoryTx(tx, inventoryItem);
    await tx.userMiner.create({
      data: {
        userId,
        slotIndex,
        level: inventoryItem.level,
        hashRate: inventoryItem.hashRate,
        isActive: true,
        slotSize,
        minerId: inventoryItem.minerId,
        imageUrl: persistImageUrl,
        ownedMachineId: omId,
      },
    });
    await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.RACK, {
      minerId: inventoryItem.minerId,
      minerName: inventoryItem.minerName,
      level: inventoryItem.level,
      hashRate: inventoryItem.hashRate,
      slotSize: inventoryItem.slotSize ?? 1,
      imageUrl: persistImageUrl,
    });

    await tx.userInventory.delete({ where: { id: inventoryId, userId } });
    return { minerName: inventoryItem.minerName };
  });

  await syncUserBaseHashRate(userId);
  const engine = getMiningEngine();
  if (engine) {
    await engine.reloadMinerProfile(userId);
    await createNotification({
      userId,
      title: "Machine installed",
      message: `${installedMinerName} was installed on your rack. Your hashrate has been updated.`,
      type: "success",
      io: engine.io,
    });
  }

  return { minerName: installedMinerName };
}

export async function removeInventoryItemForUser(userId: number, inventoryId: number): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
    await lockUserRowForUpdate(tx, userId);
    const rowLocked = await lockUserInventoryRowForUpdate(tx, userId, inventoryId);
    if (!rowLocked) {
      throw new HttpStatusError(404, INVENTORY_ERROR.NOT_FOUND);
    }
    const row = await tx.userInventory.findFirst({
      where: { id: inventoryId, userId },
      select: { id: true, ownedMachineId: true },
    });
    if (!row) {
      throw new HttpStatusError(404, INVENTORY_ERROR.NOT_FOUND);
    }
    await tx.userInventory.delete({ where: { id: inventoryId, userId } });
    if (row.ownedMachineId != null) {
      await tx.userOwnedMachine.delete({ where: { id: row.ownedMachineId } });
    }
  });
}
