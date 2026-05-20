import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import * as vaultModel from "../models/vaultModel.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createNotification } from "./notificationController.js";
import prisma from "../src/db/prisma.js";
import { releaseUserMinerFromRacksTx } from "../utils/rackMinerRelease.js";
import loggerLib, { logUserActivity } from "../utils/logger.js";
import {
  MachineLocation,
  createInventoryWithOwnedMachineTx,
  ensureOwnedMachineForInventoryTx,
  ensureOwnedMachineForUserMinerTx,
  ensureOwnedMachineForVaultTx,
  syncOwnedMachineSnapshotTx,
} from "../services/userOwnedMachineService.js";
import {
  lockUserInventoryRowForUpdate,
  lockUserMinerRowForUpdate,
  lockUserRowForUpdate,
  lockUserVaultRowForUpdate,
} from "../utils/transactionLocks.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";
import { advisoryXactTryLockOrThrow } from "../services/distributedLockService.js";
import { resolveOwnedMachineImageUrl } from "../utils/ownedMachineImage.js";
import {
  collectCatalogLookupDisplayNames,
  collectEventMinerDisplayNames,
  eventCatalogImageFromMap,
  loadEventMinerCatalogImageMap,
  loadMinerCatalogImageMapByDisplayNames,
  minerCatalogImageFromMap,
} from "../utils/eventMinerCatalogImage.js";
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
  readVaultSlot
} from "./controllerHttpStatusError.js";

const logger = loggerLib.child("VaultController");

function respondMoveToVaultError(req: Request, res: Response, error: unknown): void {
  const prismaCode = readErrorCode(error);
  if (prismaCode === "DISTRIBUTED_LOCK_BUSY") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  if (readErrorMessage(error) === "VAULT_ALREADY_STORED" || prismaCode === "VAULT_ALREADY_STORED") {
    res.status(409).json({
      ok: false,
      code: "VAULT_ALREADY_STORED",
      messageKey: "vault.errors.VAULT_ALREADY_STORED",
      message: "This machine is already recorded in the warehouse. Refresh and try again.",
    });
    return;
  }
  if (readErrorMessage(error) === "NOT_FOUND" || readHttpStatus(error) === 404) {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found.",
    });
    return;
  }
  if (prismaCode === "P2034") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  logger.error("Move to Vault Error", {
    ...prismaSafeErrorMeta(error),
    prismaCode,
    userId: req.user?.id,
    source: req.body?.source
  });
  if (prismaCode === "P2003" || prismaCode === "P2014" || prismaCode === "P2017") {
    res.status(409).json({
      ok: false,
      code: "VAULT_RACK_LINK",
      messageKey: "vault.errors.VAULT_RACK_LINK",
      message: "Machine is still linked to a rack. Refresh the page and try again.",
    });
    return;
  }
  if (prismaCode === "P2025") {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found.",
    });
    return;
  }
  res.status(500).json({
    ok: false,
    code: "VAULT_UNAVAILABLE",
    messageKey: "vault.errors.VAULT_UNAVAILABLE",
    message: "Could not complete vault storage. Try again later.",
  });
}

function respondRetrieveFromVaultError(req: Request, res: Response, error: unknown): void {
  const prismaCode = readErrorCode(error);
  if (prismaCode === "DISTRIBUTED_LOCK_BUSY") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  if (readErrorMessage(error) === "NOT_FOUND" || readHttpStatus(error) === 404) {
    res.status(404).json({
      ok: false,
      code: "VAULT_NOT_FOUND",
      messageKey: "vault.errors.VAULT_NOT_FOUND",
      message: "Item not found in vault.",
    });
    return;
  }
  if (readErrorMessage(error) === "INVALID_SLOT" || readVaultSlot(error) != null) {
    res.status(400).json({
      ok: false,
      code: SecurityErrorCodes.INVALID_STATE,
      messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
      message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
    });
    return;
  }
  if (prismaCode === "P2034") {
    res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    return;
  }
  logger.error("Retrieve from Vault Error", {
    ...prismaSafeErrorMeta(error),
    userId: req.user?.id,
    vaultId: req.body?.vaultId,
    destination: req.body?.destination
  });
  res.status(500).json({
    ok: false,
    code: "VAULT_RETRIEVE_ERROR",
    messageKey: "vault.retrieve_error",
    message: "Internal server error during vault retrieval.",
  });
}

/** Max machines per bulk vault / inventory request (abuse guard). */
const VAULT_BULK_MAX = 120;

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

/**
 * Rack slot index (0..79).
 */
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
  const fromArr = normalizePositiveIntIds(
    Array.isArray(body?.vaultIds) ? body.vaultIds : [],
  );
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
      message: readErrorMessage(err)
    });
  }
}

async function safeVaultMinerId(
  tx: Prisma.TransactionClient,
  minerId: number | null | undefined
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
  ownedMachineId: number | null | undefined
): Promise<void> {
  if (ownedMachineId == null) return;
  const om = await tx.userOwnedMachine.findFirst({
    where: { id: ownedMachineId, userId },
    select: { location: true },
  });
  if (om?.location === MachineLocation.WAREHOUSE) {
    const err = new HttpStatusError(409, "VAULT_ALREADY_STORED", { code: "VAULT_ALREADY_STORED" });
    throw err;
  }
}

async function moveSingleInventoryItemToVaultTx(
  tx: Prisma.TransactionClient,
  userId: number,
  iid: number,
  now: Date
): Promise<void> {
  const rowLocked = await lockUserInventoryRowForUpdate(tx, userId, iid);
  if (!rowLocked) {
    throw new HttpStatusError(404, "NOT_FOUND");
  }

  const inventoryItem = await tx.userInventory.findFirst({
    where: { id: iid, userId },
  });
  if (!inventoryItem) {
    throw new HttpStatusError(404, "NOT_FOUND");
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
  now: Date
): Promise<void> {
  const locked = await lockUserVaultRowForUpdate(tx, userId, vaultId);
  if (!locked) {
    throw new HttpStatusError(404, "NOT_FOUND");
  }

  const vaultItem = await tx.userVault.findFirst({
    where: { id: vaultId, userId },
  });
  if (!vaultItem) {
    throw new HttpStatusError(404, "NOT_FOUND");
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

export async function getVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = req.user;
    const vaultRows = await vaultModel.listVault(user.id);
    const lookupNames = collectCatalogLookupDisplayNames(vaultRows);
    const [eventCatalogMap, minerNameCatalogMap] = await Promise.all([
      loadEventMinerCatalogImageMap(collectEventMinerDisplayNames(vaultRows)),
      loadMinerCatalogImageMapByDisplayNames(lookupNames),
    ]);
    const vault = vaultRows.map((row) => {
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
    });
    const ownedIds = vault.map((v) => v.ownedMachineId).filter((id) => id != null);
    if (ownedIds.length > 0) {
      const rows = await prisma.userOwnedMachine.findMany({
        where: { userId: user.id, id: { in: ownedIds } },
        select: { id: true, location: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const v of vault) {
        if (v.ownedMachineId == null) continue;
        const om = byId.get(v.ownedMachineId);
        if (om && om.location !== MachineLocation.WAREHOUSE) {
          logger.warn("Vault row present but canonical owned-machine location is not WAREHOUSE", {
            userId: user.id,
            vaultId: v.id,
            ownedMachineId: om.id,
            location: om.location,
          });
        }
      }
    }
    res.json({ ok: true, vault });
  } catch (error: unknown) {
    logger.error("getVault failed", prismaSafeErrorMeta(error));
    res.status(500).json({ ok: false, message: "Unable to load vault." });
  }
}

export async function moveToVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = req.user;
    const { source, itemId, itemIds } = req.body;
    const now = new Date();
    let lastMovedCount = 1;

    if (source !== "inventory" && source !== "rack") {
      return res.status(400).json({
        ok: false,
        code: "VAULT_BAD_SOURCE",
        messageKey: "vault.errors.VAULT_BAD_SOURCE",
        message: "Invalid source.",
      });
    }

    if (source === "inventory") {
      const idsFromBody = Array.isArray(itemIds)
        ? normalizePositiveIntIds(itemIds)
        : (() => {
            const one = coerceStrictPositiveInt(itemId);
            return one != null ? [one] : [];
          })();
      if (idsFromBody.length === 0 || idsFromBody.length > VAULT_BULK_MAX) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Invalid inventory selection.",
        });
      }

      const idem = await resolveCriticalMutation(req, res);
      if (!idem) return;
      const { lease, ci } = idem;
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await advisoryXactTryLockOrThrow(tx, `vault:${user.id}`);
          await lockUserRowForUpdate(tx, user.id);
          for (const iid of idsFromBody) {
            await moveSingleInventoryItemToVaultTx(tx, user.id, iid, now);
          }
        });
        await syncMiningProfileBestEffort(user.id);
        emitVaultSocketRefresh(user.id);
        lastMovedCount = idsFromBody.length;
        const engine = getMiningEngine();
        if (engine) {
          const plural = lastMovedCount > 1;
          await createNotification({
            userId: user.id,
            title: plural ? "Miners stored" : "Miner stored",
            message: plural
              ? `${lastMovedCount} miners were moved to the warehouse (vault).`
              : "Your miner was moved to the warehouse (vault).",
            type: "info",
            io: engine.io,
          });
        }
        const payload = {
          ok: true,
          message: "Machine moved to vault successfully!",
          movedCount: lastMovedCount,
        };
        await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
        logUserActivity("VAULT_MOVE_TO", req, { source: "inventory", movedCount: lastMovedCount });
        return res.json(payload);
      } catch (error: unknown) {
        await cancelCriticalMutation(lease);
        return respondMoveToVaultError(req, res, error);
      }
    }

    const mid = coerceStrictPositiveInt(itemId);
    if (mid == null) {
      return res.status(400).json({
        ok: false,
        code: SecurityErrorCodes.INVALID_STATE,
        messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
        message: "Invalid rack machine reference.",
      });
    }

    const idemRack = await resolveCriticalMutation(req, res);
    if (!idemRack) return;
    const { lease: leaseRack, ci: ciRack } = idemRack;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `vault:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        const minerLocked = await lockUserMinerRowForUpdate(tx, user.id, mid);
          if (!minerLocked) {
            throw new HttpStatusError(404, "NOT_FOUND");
          }

          const userMiner = await tx.userMiner.findFirst({
            where: {
              id: mid,
              userId: user.id,
            },
            include: { miner: true },
          });

          if (!userMiner) {
            throw new HttpStatusError(404, "NOT_FOUND");
          }

          await assertOwnedMachineNotInWarehouseTx(tx, user.id, userMiner.ownedMachineId);

          const omId = await ensureOwnedMachineForUserMinerTx(
            tx,
            userMiner,
            userMiner.miner?.name || "Miner",
          );
          await releaseUserMinerFromRacksTx(tx, user.id, userMiner.id);
          const minerId = await safeVaultMinerId(tx, userMiner.minerId);
          const displayName = userMiner.miner?.name || "Miner";
          await tx.userVault.create({
            data: {
              userId: user.id,
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

      await syncMiningProfileBestEffort(user.id);
      emitVaultSocketRefresh(user.id);

      const engine = getMiningEngine();
      if (engine) {
        await createNotification({
          userId: user.id,
          title: "Miner stored",
          message: "Your miner was moved to the warehouse (vault).",
          type: "info",
          io: engine.io,
        });
      }
      const payloadRack = {
        ok: true,
        message: "Machine moved to vault successfully!",
        movedCount: lastMovedCount,
      };
      await finalizeCriticalMutationSuccess(leaseRack, {
        requestHash: ciRack.requestHash,
        responseJson: payloadRack,
      });
      logUserActivity("VAULT_MOVE_TO", req, { source: "rack", movedCount: lastMovedCount, machineId: mid });
      return res.json(payloadRack);
    } catch (error: unknown) {
      await cancelCriticalMutation(leaseRack);
      return respondMoveToVaultError(req, res, error);
    }
  } catch (error: unknown) {
    return respondMoveToVaultError(req, res, error);
  }
}

export async function retrieveFromVault(req: Request, res: Response) {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const user = req.user;
    const { destination } = req.body;
    const now = new Date();
    let retrievedCount = 1;

    if (destination !== "inventory" && destination !== "rack") {
      return res.status(400).json({
        ok: false,
        code: "VAULT_BAD_DESTINATION",
        messageKey: "vault.errors.VAULT_BAD_DESTINATION",
        message: "Invalid destination.",
      });
    }

    if (destination === "inventory") {
      const vaultIds = normalizeVaultIdsFromBody(req.body);
      if (vaultIds.length === 0 || vaultIds.length > VAULT_BULK_MAX) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Invalid vault selection.",
        });
      }

      const idem = await resolveCriticalMutation(req, res);
      if (!idem) return;
      const { lease, ci } = idem;
      try {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await advisoryXactTryLockOrThrow(tx, `vault:${user.id}`);
          await lockUserRowForUpdate(tx, user.id);
          for (const vaultId of vaultIds) {
            await retrieveSingleVaultRowToInventoryTx(tx, user.id, vaultId, now);
          }
        });
        await syncMiningProfileBestEffort(user.id);
        emitVaultSocketRefresh(user.id);
        retrievedCount = vaultIds.length;
        const engine = getMiningEngine();
        if (engine) {
          const plural = retrievedCount > 1;
          await createNotification({
            userId: user.id,
            title: plural ? "Miners retrieved" : "Miner retrieved",
            message: plural
              ? `${retrievedCount} miners were moved to your inventory.`
              : "Your miner was removed from the warehouse (vault).",
            type: "success",
            io: engine.io,
          });
        }
        const payload = {
          ok: true,
          message: "Machine retrieved from vault successfully!",
          movedCount: retrievedCount,
        };
        await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
        logUserActivity("VAULT_RETRIEVE_FROM", req, { destination: "inventory", movedCount: retrievedCount });
        return res.json(payload);
      } catch (error: unknown) {
        await cancelCriticalMutation(lease);
        return respondRetrieveFromVaultError(req, res, error);
      }
    }

    const vaultId = coerceStrictPositiveInt(req.body?.vaultId);
    if (vaultId == null) {
      return res.status(400).json({
        ok: false,
        code: SecurityErrorCodes.INVALID_STATE,
        messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
        message: "Invalid vault item.",
      });
    }

    const slotIndex = coerceVaultSlotIndex(req.body?.slotIndex);
    if (slotIndex == null) {
      return res.status(400).json({
        ok: false,
        code: SecurityErrorCodes.INVALID_STATE,
        messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
        message: "Invalid slot position.",
      });
    }

    const idemRack = await resolveCriticalMutation(req, res);
    if (!idemRack) return;
    const { lease: leaseRack, ci: ciRack } = idemRack;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `vault:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        const locked = await lockUserVaultRowForUpdate(tx, user.id, vaultId);
          if (!locked) {
            throw new HttpStatusError(404, "NOT_FOUND");
          }

          const vaultItem = await tx.userVault.findFirst({
            where: { id: vaultId, userId: user.id },
          });
          if (!vaultItem) {
            throw new HttpStatusError(404, "NOT_FOUND");
          }

          const slotSize = Number(vaultItem.slotSize || 1);

          if (slotSize === 2 && slotIndex % 2 !== 0) {
            throw new HttpStatusError(400, "INVALID_SLOT", { vaultSlot: slotIndex });
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

          const minerId = await safeVaultMinerId(tx, vaultItem.minerId);
          const omId = await ensureOwnedMachineForVaultTx(tx, vaultItem);
          await tx.userMiner.create({
            data: {
              userId: user.id,
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
          where: { id: vaultId, userId: user.id },
        });
      });

      await syncMiningProfileBestEffort(user.id);
      emitVaultSocketRefresh(user.id);

      const engine = getMiningEngine();
      if (engine) {
        await createNotification({
          userId: user.id,
          title: "Miner retrieved",
          message: "Your miner was removed from the warehouse (vault).",
          type: "success",
          io: engine.io,
        });
      }
      const payloadRack = {
        ok: true,
        message: "Machine retrieved from vault successfully!",
        movedCount: retrievedCount,
      };
      await finalizeCriticalMutationSuccess(leaseRack, {
        requestHash: ciRack.requestHash,
        responseJson: payloadRack,
      });
      logUserActivity("VAULT_RETRIEVE_FROM", req, {
        destination: "rack",
        vaultId,
        slotIndex,
        movedCount: retrievedCount,
      });
      return res.json(payloadRack);
    } catch (error: unknown) {
      await cancelCriticalMutation(leaseRack);
      return respondRetrieveFromVaultError(req, res, error);
    }
  } catch (error: unknown) {
    return respondRetrieveFromVaultError(req, res, error);
  }
}
