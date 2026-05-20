import type { Prisma } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { createNotification } from "../../controllers/notificationController.js";
import { releaseUserMinerFromRacksTx } from "../../utils/rackMinerRelease.js";
import loggerLib from "../../utils/logger.js";
import {
  MachineLocation,
  createInventoryWithOwnedMachineTx,
  ensureOwnedMachineForInventoryTx,
  ensureOwnedMachineForUserMinerTx,
  ensureOwnedMachineForVaultTx,
  syncOwnedMachineSnapshotTx,
} from "../../services/userOwnedMachineService.js";
import {
  lockUserInventoryRowForUpdate,
  lockUserMinerRowForUpdate,
  lockUserRowForUpdate,
  lockUserVaultRowForUpdate,
} from "../../utils/transactionLocks.js";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import {
  collectCatalogLookupDisplayNames,
  collectEventMinerDisplayNames,
  loadEventMinerCatalogImageMap,
  loadMinerCatalogImageMapByDisplayNames,
} from "../../utils/eventMinerCatalogImage.js";
import { prismaSafeErrorMeta } from "../../utils/prismaSafeError.js";
import {
  HttpStatusError,
  readErrorMessage,
} from "../../controllers/controllerHttpStatusError.js";
import { VAULT_ERROR } from "./vault.errors.js";
import { VAULT_BULK_MAX_ITEMS } from "./vault.schemas.js";
import * as vaultRepository from "./vault.repository.js";
import { mapVaultItemDto } from "./vault.dto.js";
import type { MoveToVaultInput, RetrieveFromVaultInput } from "./vault.types.js";

const logger = loggerLib.child("VaultService");

export const VAULT_BULK_MAX = VAULT_BULK_MAX_ITEMS;

function coerceStrictPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER) {
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^\d{1,15}$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isSafeInteger(n) || n < 1) return null;
    return n;
  }
  return null;
}

function coerceVaultSlotIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < 80) {
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!/^\d{1,2}$/.test(t)) return null;
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0 || n >= 80) return null;
    return n;
  }
  return null;
}

function normalizePositiveIntIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) {
    const n = coerceStrictPositiveInt(x);
    if (n != null) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function normalizeVaultIdsFromBody(body: { vaultId?: unknown; vaultIds?: unknown }): number[] {
  const fromArr = normalizePositiveIntIds(Array.isArray(body?.vaultIds) ? body.vaultIds : []);
  if (fromArr.length > 0) return fromArr.slice(0, VAULT_BULK_MAX);
  const one = coerceStrictPositiveInt(body?.vaultId);
  if (one != null) return [one];
  return [];
}

function emitVaultSocketRefresh(userId: number): void {
  const engine = getMiningEngine();
  if (engine?.io) {
    engine.io.to(`user:${userId}`).emit("vault:update", null);
  }
}

async function syncMiningProfileBestEffort(userId: number): Promise<void> {
  try {
    await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(userId);
    }
  } catch (err: unknown) {
    logger.warn("Vault: post-commit mining profile sync failed (data already saved)", {
      userId,
      message: readErrorMessage(err),
    });
  }
}

async function safeVaultMinerId(
  tx: Prisma.TransactionClient,
  minerId: number | null | undefined,
): Promise<number | null> {
  if (minerId == null) return null;
  const n = Number(minerId);
  if (!Number.isInteger(n) || n < 1) return null;
  const row = await tx.miner.findUnique({ where: { id: n }, select: { id: true } });
  return row ? n : null;
}

async function assertOwnedMachineNotInWarehouseTx(
  tx: Prisma.TransactionClient,
  userId: number,
  ownedMachineId: number | null | undefined,
): Promise<void> {
  if (ownedMachineId == null) return;
  const om = await tx.userOwnedMachine.findFirst({
    where: { id: ownedMachineId, userId },
    select: { location: true },
  });
  if (om?.location === MachineLocation.WAREHOUSE) {
    throw new HttpStatusError(409, VAULT_ERROR.ALREADY_STORED, { code: VAULT_ERROR.ALREADY_STORED });
  }
}

async function moveSingleInventoryItemToVaultTx(
  tx: Prisma.TransactionClient,
  userId: number,
  iid: number,
  now: Date,
): Promise<void> {
  const rowLocked = await lockUserInventoryRowForUpdate(tx, userId, iid);
  if (!rowLocked) {
    throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
  }

  const inventoryItem = await tx.userInventory.findFirst({
    where: { id: iid, userId },
  });
  if (!inventoryItem) {
    throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
  }

  await assertOwnedMachineNotInWarehouseTx(tx, userId, inventoryItem.ownedMachineId);

  const minerId = await safeVaultMinerId(tx, inventoryItem.minerId);
  const omId = await ensureOwnedMachineForInventoryTx(tx, inventoryItem);
  await tx.userVault.create({
    data: {
      userId,
      minerId,
      minerName: inventoryItem.minerName,
      level: inventoryItem.level,
      hashRate: inventoryItem.hashRate,
      slotSize: inventoryItem.slotSize,
      imageUrl: inventoryItem.imageUrl,
      storedAt: now,
      ownedMachineId: omId,
    },
  });
  await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.WAREHOUSE, {
    minerId,
    minerName: inventoryItem.minerName,
    level: inventoryItem.level,
    hashRate: inventoryItem.hashRate,
    slotSize: inventoryItem.slotSize ?? 1,
    imageUrl: inventoryItem.imageUrl,
  });
  await tx.userInventory.delete({
    where: { id: iid, userId },
  });
}

async function retrieveSingleVaultRowToInventoryTx(
  tx: Prisma.TransactionClient,
  userId: number,
  vaultId: number,
  now: Date,
): Promise<void> {
  const locked = await lockUserVaultRowForUpdate(tx, userId, vaultId);
  if (!locked) {
    throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
  }

  const vaultItem = await tx.userVault.findFirst({
    where: { id: vaultId, userId },
  });
  if (!vaultItem) {
    throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
  }

  const minerId = await safeVaultMinerId(tx, vaultItem.minerId);
  const omId = await ensureOwnedMachineForVaultTx(tx, vaultItem);
  await tx.userInventory.create({
    data: {
      userId,
      minerId,
      minerName: vaultItem.minerName,
      level: vaultItem.level,
      hashRate: vaultItem.hashRate,
      slotSize: vaultItem.slotSize,
      imageUrl: vaultItem.imageUrl,
      acquiredAt: now,
      ownedMachineId: omId,
    },
  });
  await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.INVENTORY, {
    minerId,
    minerName: vaultItem.minerName,
    level: vaultItem.level,
    hashRate: vaultItem.hashRate,
    slotSize: vaultItem.slotSize ?? 1,
    imageUrl: vaultItem.imageUrl,
  });
  await tx.userVault.delete({
    where: { id: vaultId, userId },
  });
}

export async function listVaultForUser(userId: number) {
  const vaultRows = await vaultRepository.listVault(userId);
  const lookupNames = collectCatalogLookupDisplayNames(vaultRows);
  const [eventCatalogMap, minerNameCatalogMap] = await Promise.all([
    loadEventMinerCatalogImageMap(collectEventMinerDisplayNames(vaultRows)),
    loadMinerCatalogImageMapByDisplayNames(lookupNames),
  ]);
  const vault = vaultRows.map((row) => mapVaultItemDto(row, eventCatalogMap, minerNameCatalogMap));
  const ownedIds = vault.map((v) => v.ownedMachineId).filter((id): id is number => id != null);
  if (ownedIds.length > 0) {
    const rows = await vaultRepository.listOwnedMachineLocations(userId, ownedIds);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const v of vault) {
      if (v.ownedMachineId == null) continue;
      const om = byId.get(v.ownedMachineId);
      if (om && om.location !== MachineLocation.WAREHOUSE) {
        logger.warn("Vault row present but canonical owned-machine location is not WAREHOUSE", {
          userId,
          vaultId: v.id,
          ownedMachineId: om.id,
          location: om.location,
        });
      }
    }
  }
  return vault;
}

export type MoveToVaultResult = {
  movedCount: number;
  source: "inventory" | "rack";
  machineId?: number;
};

export async function moveToVaultForUser(userId: number, body: MoveToVaultInput): Promise<MoveToVaultResult> {
  const { source, itemId, itemIds } = body;
  const now = new Date();
  let lastMovedCount = 1;

  if (source !== "inventory" && source !== "rack") {
    throw new HttpStatusError(400, VAULT_ERROR.BAD_SOURCE);
  }

  if (source === "inventory") {
    const idsFromBody = Array.isArray(itemIds)
      ? normalizePositiveIntIds(itemIds)
      : (() => {
          const one = coerceStrictPositiveInt(itemId);
          return one != null ? [one] : [];
        })();
    if (idsFromBody.length === 0 || idsFromBody.length > VAULT_BULK_MAX) {
      throw new HttpStatusError(400, "INVALID_SELECTION");
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await advisoryXactTryLockOrThrow(tx, `vault:${userId}`);
      await lockUserRowForUpdate(tx, userId);
      for (const iid of idsFromBody) {
        await moveSingleInventoryItemToVaultTx(tx, userId, iid, now);
      }
    });
    await syncMiningProfileBestEffort(userId);
    emitVaultSocketRefresh(userId);
    lastMovedCount = idsFromBody.length;
    const engine = getMiningEngine();
    if (engine) {
      const plural = lastMovedCount > 1;
      await createNotification({
        userId,
        title: plural ? "Miners stored" : "Miner stored",
        message: plural
          ? `${lastMovedCount} miners were moved to the warehouse (vault).`
          : "Your miner was moved to the warehouse (vault).",
        type: "info",
        io: engine.io,
      });
    }
    return { movedCount: lastMovedCount, source: "inventory" };
  }

  const mid = coerceStrictPositiveInt(itemId);
  if (mid == null) {
    throw new HttpStatusError(400, "INVALID_RACK_REF");
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `vault:${userId}`);
    await lockUserRowForUpdate(tx, userId);
    const minerLocked = await lockUserMinerRowForUpdate(tx, userId, mid);
    if (!minerLocked) {
      throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
    }

    const userMiner = await tx.userMiner.findFirst({
      where: {
        id: mid,
        userId,
      },
      include: { miner: true },
    });

    if (!userMiner) {
      throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
    }

    await assertOwnedMachineNotInWarehouseTx(tx, userId, userMiner.ownedMachineId);

    const omId = await ensureOwnedMachineForUserMinerTx(tx, userMiner, userMiner.miner?.name || "Miner");
    await releaseUserMinerFromRacksTx(tx, userId, userMiner.id);
    const minerId = await safeVaultMinerId(tx, userMiner.minerId);
    const displayName = userMiner.miner?.name || "Miner";
    await tx.userVault.create({
      data: {
        userId,
        minerId,
        minerName: displayName,
        level: userMiner.level,
        hashRate: userMiner.hashRate,
        slotSize: userMiner.slotSize,
        imageUrl: userMiner.imageUrl || userMiner.miner?.imageUrl || null,
        storedAt: now,
        ownedMachineId: omId,
      },
    });
    await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.WAREHOUSE, {
      minerId,
      minerName: displayName,
      level: userMiner.level,
      hashRate: userMiner.hashRate,
      slotSize: userMiner.slotSize ?? 1,
      imageUrl: userMiner.imageUrl || userMiner.miner?.imageUrl || null,
    });
    await tx.userMiner.delete({
      where: { id: userMiner.id },
    });
  });

  await syncMiningProfileBestEffort(userId);
  emitVaultSocketRefresh(userId);

  const engine = getMiningEngine();
  if (engine) {
    await createNotification({
      userId,
      title: "Miner stored",
      message: "Your miner was moved to the warehouse (vault).",
      type: "info",
      io: engine.io,
    });
  }

  return { movedCount: lastMovedCount, source: "rack", machineId: mid };
}

export type RetrieveFromVaultResult = {
  movedCount: number;
  destination: "inventory" | "rack";
  vaultId?: number;
  slotIndex?: number;
};

export async function retrieveFromVaultForUser(
  userId: number,
  body: RetrieveFromVaultInput,
): Promise<RetrieveFromVaultResult> {
  const { destination } = body;
  const now = new Date();
  let retrievedCount = 1;

  if (destination !== "inventory" && destination !== "rack") {
    throw new HttpStatusError(400, VAULT_ERROR.BAD_DESTINATION);
  }

  if (destination === "inventory") {
    const vaultIds = normalizeVaultIdsFromBody(body);
    if (vaultIds.length === 0 || vaultIds.length > VAULT_BULK_MAX) {
      throw new HttpStatusError(400, "INVALID_SELECTION");
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await advisoryXactTryLockOrThrow(tx, `vault:${userId}`);
      await lockUserRowForUpdate(tx, userId);
      for (const vaultId of vaultIds) {
        await retrieveSingleVaultRowToInventoryTx(tx, userId, vaultId, now);
      }
    });
    await syncMiningProfileBestEffort(userId);
    emitVaultSocketRefresh(userId);
    retrievedCount = vaultIds.length;
    const engine = getMiningEngine();
    if (engine) {
      const plural = retrievedCount > 1;
      await createNotification({
        userId,
        title: plural ? "Miners retrieved" : "Miner retrieved",
        message: plural
          ? `${retrievedCount} miners were moved to your inventory.`
          : "Your miner was removed from the warehouse (vault).",
        type: "success",
        io: engine.io,
      });
    }
    return { movedCount: retrievedCount, destination: "inventory" };
  }

  const vaultId = coerceStrictPositiveInt(body?.vaultId);
  if (vaultId == null) {
    throw new HttpStatusError(400, "INVALID_VAULT_ITEM");
  }

  const slotIndex = coerceVaultSlotIndex(body?.slotIndex);
  if (slotIndex == null) {
    throw new HttpStatusError(400, "INVALID_SLOT");
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `vault:${userId}`);
    await lockUserRowForUpdate(tx, userId);
    const locked = await lockUserVaultRowForUpdate(tx, userId, vaultId);
    if (!locked) {
      throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
    }

    const vaultItem = await tx.userVault.findFirst({
      where: { id: vaultId, userId },
    });
    if (!vaultItem) {
      throw new HttpStatusError(404, VAULT_ERROR.NOT_FOUND);
    }

    const slotSize = Number(vaultItem.slotSize || 1);

    if (slotSize === 2 && slotIndex % 2 !== 0) {
      throw new HttpStatusError(400, VAULT_ERROR.INVALID_SLOT, { vaultSlot: slotIndex });
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

    const minerId = await safeVaultMinerId(tx, vaultItem.minerId);
    const omId = await ensureOwnedMachineForVaultTx(tx, vaultItem);
    await tx.userMiner.create({
      data: {
        userId,
        slotIndex,
        level: vaultItem.level,
        hashRate: vaultItem.hashRate,
        isActive: true,
        slotSize,
        minerId,
        imageUrl: vaultItem.imageUrl,
        ownedMachineId: omId,
      },
    });
    await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.RACK, {
      minerId,
      minerName: vaultItem.minerName,
      level: vaultItem.level,
      hashRate: vaultItem.hashRate,
      slotSize: vaultItem.slotSize ?? 1,
      imageUrl: vaultItem.imageUrl,
    });
    await tx.userVault.delete({
      where: { id: vaultId, userId },
    });
  });

  await syncMiningProfileBestEffort(userId);
  emitVaultSocketRefresh(userId);

  const engine = getMiningEngine();
  if (engine) {
    await createNotification({
      userId,
      title: "Miner retrieved",
      message: "Your miner was removed from the warehouse (vault).",
      type: "success",
      io: engine.io,
    });
  }

  return { movedCount: retrievedCount, destination: "rack", vaultId, slotIndex };
}

export function logVaultListFailure(err: unknown): void {
  logger.error("getVault failed", prismaSafeErrorMeta(err));
}
