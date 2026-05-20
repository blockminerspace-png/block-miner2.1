import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import * as inventoryModel from "../models/inventoryModel.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createNotification } from "./notificationController.js";
import prisma from "../src/db/prisma.js";
import { releaseUserMinerFromRacksTx } from "../utils/rackMinerRelease.js";
import {
  MachineLocation,
  createInventoryWithOwnedMachineTx,
  ensureOwnedMachineForInventoryTx,
  syncOwnedMachineSnapshotTx,
} from "../services/userOwnedMachineService.js";
import {
  lockUserInventoryRowForUpdate,
  lockUserRowForUpdate,
} from "../utils/transactionLocks.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { advisoryXactTryLockOrThrow } from "../services/distributedLockService.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../utils/criticalMutationIdempotency.js";
import { prismaSafeErrorMeta } from "../utils/prismaSafeError.js";
import {
  HttpStatusError,
  readErrorCode,
  readErrorMessage,
  readHttpStatus,
  requireSessionUser,
} from "./controllerHttpStatusError.js";
import {
  normalizePersistableMinerImageUrl,
  resolveOwnedMachineImageUrl,
} from "../utils/ownedMachineImage.js";
import {
  collectCatalogLookupDisplayNames,
  collectEventMinerDisplayNames,
  eventCatalogImageFromMap,
  loadEventMinerCatalogImageMap,
  loadMinerCatalogImageMapByDisplayNames,
  minerCatalogImageFromMap,
} from "../utils/eventMinerCatalogImage.js";

type InventoryListRow = Awaited<ReturnType<typeof inventoryModel.listInventory>>[number];

function mapInventoryItemDto(
  row: InventoryListRow,
  eventCatalogMap: Map<string, string | null>,
  minerNameCatalogMap: Map<string, string | null>,
) {
  const { ownedMachine, miner, ...rest } = row;
  const { imageUrl, imageSource } = resolveOwnedMachineImageUrl({
    rowImageUrl: row.imageUrl,
    ownedMachineImageUrl: ownedMachine?.imageUrl ?? null,
    catalogImageUrl: miner?.imageUrl ?? minerCatalogImageFromMap(minerNameCatalogMap, row.minerName) ?? null,
    eventCatalogImageUrl: eventCatalogImageFromMap(eventCatalogMap, row.minerName),
  });
  return {
    ...rest,
    ownedMachineId: rest.ownedMachineId ?? ownedMachine?.id ?? null,
    imageUrl,
    imageSource,
  };
}

export async function getInventory(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const rows = await inventoryModel.listInventory(user.id);
    const lookupNames = collectCatalogLookupDisplayNames(rows);
    const [eventCatalogMap, minerNameCatalogMap] = await Promise.all([
      loadEventMinerCatalogImageMap(collectEventMinerDisplayNames(rows)),
      loadMinerCatalogImageMapByDisplayNames(lookupNames),
    ]);
    const inventory = rows.map((row) => mapInventoryItemDto(row, eventCatalogMap, minerNameCatalogMap));
    res.json({ ok: true, inventory });
  } catch (err: unknown) {
    console.error("getInventory failed", prismaSafeErrorMeta(err));
    res.status(500).json({ ok: false, message: "Unable to load inventory." });
  }
}

export async function installInventoryItem(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const slotIndex = Number(req.body?.slotIndex);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "slotIndex" } }),
      );
    }

    if (!Number.isInteger(inventoryId) || inventoryId < 1) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "inventoryId" } }),
      );
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    const now = new Date();

    try {
      const { minerName: installedMinerName } = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
      const rowLocked = await lockUserInventoryRowForUpdate(tx, user.id, inventoryId);
      if (!rowLocked) {
        throw new HttpStatusError(404, "NOT_FOUND");
      }

      const inventoryItem = await tx.userInventory.findFirst({
        where: { id: inventoryId, userId: user.id },
        include: {
          ownedMachine: { select: { id: true, imageUrl: true } },
          miner: { select: { imageUrl: true } },
        },
      });
      if (!inventoryItem) {
        throw new HttpStatusError(404, "NOT_FOUND");
      }

      const resolvedInstallImage = resolveOwnedMachineImageUrl({
        rowImageUrl: inventoryItem.imageUrl,
        ownedMachineImageUrl: inventoryItem.ownedMachine?.imageUrl ?? null,
        catalogImageUrl: inventoryItem.miner?.imageUrl ?? null,
      });
      const persistImageUrl = normalizePersistableMinerImageUrl(resolvedInstallImage.imageUrl);

      const slotSize = Number(inventoryItem.slotSize || 1);

      if (slotSize === 2 && slotIndex % 2 !== 0) {
        throw new HttpStatusError(400, "INVALID_SLOT");
      }

      const targetSlots = Array.from({ length: slotSize }, (_, i) => slotIndex + i);
      const existingMachines = await tx.userMiner.findMany({
        where: {
          userId: user.id,
          slotIndex: { in: targetSlots },
        },
        include: { miner: true },
      });

      if (existingMachines.length > 0) {
        for (const m of existingMachines) {
          await releaseUserMinerFromRacksTx(tx, user.id, m.id);
          await createInventoryWithOwnedMachineTx(tx, {
            userId: user.id,
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
          where: { userId: user.id, slotIndex: slotIndex - 1 },
          include: { miner: true },
        });
        if (prevMachine && prevMachine.slotSize === 2) {
          await releaseUserMinerFromRacksTx(tx, user.id, prevMachine.id);
          await createInventoryWithOwnedMachineTx(tx, {
            userId: user.id,
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
          userId: user.id,
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

      await tx.userInventory.delete({ where: { id: inventoryId, userId: user.id } });
      return { minerName: inventoryItem.minerName };
      });

    await syncUserBaseHashRate(user.id);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(user.id);

      await createNotification({
        userId: user.id,
        title: "Machine installed",
        message: `${installedMinerName} was installed on your rack. Your hashrate has been updated.`,
        type: "success",
        io: engine.io,
      });
    }

      const payload = { ok: true, message: "Machine installed successfully!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      const msg = readErrorMessage(error);
      const http = readHttpStatus(error);
      if (msg === "NOT_FOUND" || http === 404) {
        return res.status(404).json({ ok: false, message: "Item not found in inventory." });
      }
      if (msg === "INVALID_SLOT") {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
        });
      }
      const errCode = readErrorCode(error);
      if (errCode === "P2034" || errCode === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      console.error("Install Error:", prismaSafeErrorMeta(error));
      return res.status(500).json({ ok: false, message: "Internal server error during installation." });
    }
  } catch (error: unknown) {
    console.error("Install Error:", prismaSafeErrorMeta(error));
    res.status(500).json({ ok: false, message: "Internal server error during installation." });
  }
}

export async function removeInventoryItem(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;

    const inventoryId = Number(req.body?.inventoryId);
    if (!Number.isInteger(inventoryId) || inventoryId < 1) {
      return res.status(400).json(
        buildSecurityErrorJson(SecurityErrorCodes.INVALID_STATE, { extra: { field: "inventoryId" } }),
      );
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        const rowLocked = await lockUserInventoryRowForUpdate(tx, user.id, inventoryId);
        if (!rowLocked) {
          throw new HttpStatusError(404, "NOT_FOUND");
        }
        const row = await tx.userInventory.findFirst({
          where: { id: inventoryId, userId: user.id },
          select: { id: true, ownedMachineId: true },
        });
        if (!row) {
          throw new HttpStatusError(404, "NOT_FOUND");
        }
        await tx.userInventory.delete({ where: { id: inventoryId, userId: user.id } });
        if (row.ownedMachineId != null) {
          await tx.userOwnedMachine.delete({ where: { id: row.ownedMachineId } });
        }
      });
      const payload = { ok: true, message: "Item removed." };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorMessage(error) === "NOT_FOUND" || readHttpStatus(error) === 404) {
        return res.status(404).json({ ok: false, message: "Item not found." });
      }
      const errCode = readErrorCode(error);
      if (errCode === "P2034" || errCode === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      console.error("removeInventoryItem failed", prismaSafeErrorMeta(error));
      return res.status(500).json({ ok: false, message: "Error removing item." });
    }
  } catch (error: unknown) {
    console.error("removeInventoryItem failed", prismaSafeErrorMeta(error));
    res.status(500).json({ ok: false, message: "Error removing item." });
  }
}

export async function updateInventory(req: Request, res: Response) {
  res.json({ ok: true, message: "Inventory synced." });
}
