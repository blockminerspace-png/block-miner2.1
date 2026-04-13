import * as vaultModel from "../models/vaultModel.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createNotification } from "./notificationController.js";
import prisma from "../src/db/prisma.js";
import { releaseUserMinerFromRacksTx } from "../utils/rackMinerRelease.js";
import loggerLib from "../utils/logger.js";
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

const logger = loggerLib.child("VaultController");

/**
 * Notifies the client to refresh vault rows (`GET /api/vault`).
 * @param {number} userId
 */
function emitVaultSocketRefresh(userId) {
  const engine = getMiningEngine();
  if (engine?.io) {
    engine.io.to(`user:${userId}`).emit("vault:update", null);
  }
}

/**
 * @param {number} userId
 */
async function syncMiningProfileBestEffort(userId) {
  try {
    await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(userId);
    }
  } catch (err) {
    logger.warn("Vault: post-commit mining profile sync failed (data already saved)", {
      userId,
      message: err?.message,
    });
  }
}

/**
 * user_vault.miner_id FK → miners.id. Stale catalog rows would make inserts fail (P2003).
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number | null | undefined} minerId
 * @returns {Promise<number | null>}
 */
async function safeVaultMinerId(tx, minerId) {
  const id = minerId == null ? null : Number(minerId);
  if (!Number.isInteger(id) || id < 1) return null;
  const row = await tx.miner.findUnique({ where: { id }, select: { id: true } });
  return row ? id : null;
}

/**
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @param {number} userId
 * @param {number | null | undefined} ownedMachineId
 */
async function assertOwnedMachineNotInWarehouseTx(tx, userId, ownedMachineId) {
  if (ownedMachineId == null) return;
  const om = await tx.userOwnedMachine.findFirst({
    where: { id: ownedMachineId, userId },
    select: { location: true },
  });
  if (om?.location === MachineLocation.WAREHOUSE) {
    const err = new Error("VAULT_ALREADY_STORED");
    /** @type {any} */ (err).code = "VAULT_ALREADY_STORED";
    throw err;
  }
}

export async function getVault(req, res) {
  try {
    const vault = await vaultModel.listVault(req.user.id);
    const ownedIds = vault.map((v) => v.ownedMachineId).filter((id) => id != null);
    if (ownedIds.length > 0) {
      const rows = await prisma.userOwnedMachine.findMany({
        where: { userId: req.user.id, id: { in: ownedIds } },
        select: { id: true, location: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const v of vault) {
        if (v.ownedMachineId == null) continue;
        const om = byId.get(v.ownedMachineId);
        if (om && om.location !== MachineLocation.WAREHOUSE) {
          logger.warn("Vault row present but canonical owned-machine location is not WAREHOUSE", {
            userId: req.user.id,
            vaultId: v.id,
            ownedMachineId: om.id,
            location: om.location,
          });
        }
      }
    }
    res.json({ ok: true, vault });
  } catch (error) {
    console.error("Vault Error:", error);
    res.status(500).json({ ok: false, message: "Unable to load vault." });
  }
}

export async function moveToVault(req, res) {
  try {
    const { source, itemId } = req.body;
    const now = new Date();

    if (source === "inventory") {
      const iid = Number(itemId);
      if (!Number.isInteger(iid) || iid < 1) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Invalid inventory item.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await lockUserRowForUpdate(tx, req.user.id);
        const rowLocked = await lockUserInventoryRowForUpdate(tx, req.user.id, iid);
        if (!rowLocked) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const inventoryItem = await tx.userInventory.findFirst({
          where: { id: iid, userId: req.user.id },
        });
        if (!inventoryItem) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        await assertOwnedMachineNotInWarehouseTx(tx, req.user.id, inventoryItem.ownedMachineId);

        const minerId = await safeVaultMinerId(tx, inventoryItem.minerId);
        const omId = await ensureOwnedMachineForInventoryTx(tx, inventoryItem);
        await tx.userVault.create({
          data: {
            userId: req.user.id,
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
          where: { id: iid, userId: req.user.id },
        });
      });

      await syncMiningProfileBestEffort(req.user.id);
      emitVaultSocketRefresh(req.user.id);
    } else if (source === "rack") {
      const mid = Number(itemId);
      if (!Number.isInteger(mid) || mid < 1) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Invalid rack machine reference.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await lockUserRowForUpdate(tx, req.user.id);
        const minerLocked = await lockUserMinerRowForUpdate(tx, req.user.id, mid);
        if (!minerLocked) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const userMiner = await tx.userMiner.findFirst({
          where: {
            id: mid,
            userId: req.user.id,
          },
          include: { miner: true },
        });

        if (!userMiner) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        await assertOwnedMachineNotInWarehouseTx(tx, req.user.id, userMiner.ownedMachineId);

        const omId = await ensureOwnedMachineForUserMinerTx(
          tx,
          userMiner,
          userMiner.miner?.name || "Miner",
        );
        await releaseUserMinerFromRacksTx(tx, req.user.id, userMiner.id);
        const minerId = await safeVaultMinerId(tx, userMiner.minerId);
        const displayName = userMiner.miner?.name || "Miner";
        await tx.userVault.create({
          data: {
            userId: req.user.id,
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

      await syncMiningProfileBestEffort(req.user.id);
      emitVaultSocketRefresh(req.user.id);
    } else {
      return res.status(400).json({
        ok: false,
        code: "VAULT_BAD_SOURCE",
        messageKey: "vault.errors.VAULT_BAD_SOURCE",
        message: "Invalid source.",
      });
    }

    const engine = getMiningEngine();
    if (engine) {
      await createNotification({
        userId: req.user.id,
        title: "Miner stored",
        message: "Your miner was moved to the warehouse (vault).",
        type: "info",
        io: engine.io,
      });
    }

    res.json({ ok: true, message: "Machine moved to vault successfully!" });
  } catch (error) {
    const prismaCode = error?.code;
    const meta = error?.meta;
    if (error?.message === "VAULT_ALREADY_STORED" || error?.code === "VAULT_ALREADY_STORED") {
      return res.status(409).json({
        ok: false,
        code: "VAULT_ALREADY_STORED",
        messageKey: "vault.errors.VAULT_ALREADY_STORED",
        message: "This machine is already recorded in the warehouse. Refresh and try again.",
      });
    }
    if (error?.message === "NOT_FOUND" || error?.http === 404) {
      return res.status(404).json({
        ok: false,
        code: "VAULT_NOT_FOUND",
        messageKey: "vault.errors.VAULT_NOT_FOUND",
        message: "Item not found.",
      });
    }
    if (prismaCode === "P2034") {
      return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    }
    logger.error("Move to Vault Error", {
      prismaCode,
      message: error?.message,
      meta,
      userId: req.user?.id,
      source: req.body?.source,
    });
    if (prismaCode === "P2003" || prismaCode === "P2014" || prismaCode === "P2017") {
      return res.status(409).json({
        ok: false,
        code: "VAULT_RACK_LINK",
        messageKey: "vault.errors.VAULT_RACK_LINK",
        message: "Machine is still linked to a rack. Refresh the page and try again.",
      });
    }
    if (prismaCode === "P2025") {
      return res.status(404).json({
        ok: false,
        code: "VAULT_NOT_FOUND",
        messageKey: "vault.errors.VAULT_NOT_FOUND",
        message: "Item not found.",
      });
    }
    res.status(500).json({
      ok: false,
      code: "VAULT_UNAVAILABLE",
      messageKey: "vault.errors.VAULT_UNAVAILABLE",
      message: "Could not complete vault storage. Try again later.",
    });
  }
}

export async function retrieveFromVault(req, res) {
  try {
    const { destination, vaultId: rawVaultId } = req.body;
    const vaultId = Number(rawVaultId);
    if (!Number.isInteger(vaultId) || vaultId < 1) {
      return res.status(400).json({
        ok: false,
        code: SecurityErrorCodes.INVALID_STATE,
        messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
        message: "Invalid vault item.",
      });
    }

    const now = new Date();

    if (destination === "inventory") {
      await prisma.$transaction(async (tx) => {
        await lockUserRowForUpdate(tx, req.user.id);
        const locked = await lockUserVaultRowForUpdate(tx, req.user.id, vaultId);
        if (!locked) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const vaultItem = await tx.userVault.findFirst({
          where: { id: vaultId, userId: req.user.id },
        });
        if (!vaultItem) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const minerId = await safeVaultMinerId(tx, vaultItem.minerId);
        const omId = await ensureOwnedMachineForVaultTx(tx, vaultItem);
        await tx.userInventory.create({
          data: {
            userId: req.user.id,
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
          where: { id: vaultId, userId: req.user.id },
        });
      });

      await syncMiningProfileBestEffort(req.user.id);
      emitVaultSocketRefresh(req.user.id);
    } else if (destination === "rack") {
      const slotIndex = Number(req.body.slotIndex);
      if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Invalid slot position.",
        });
      }

      await prisma.$transaction(async (tx) => {
        await lockUserRowForUpdate(tx, req.user.id);
        const locked = await lockUserVaultRowForUpdate(tx, req.user.id, vaultId);
        if (!locked) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const vaultItem = await tx.userVault.findFirst({
          where: { id: vaultId, userId: req.user.id },
        });
        if (!vaultItem) {
          const err = new Error("NOT_FOUND");
          /** @type {any} */ (err).http = 404;
          throw err;
        }

        const slotSize = Number(vaultItem.slotSize || 1);

        if (slotSize === 2 && slotIndex % 2 !== 0) {
          const err = new Error("INVALID_SLOT");
          /** @type {any} */ (err).vaultSlot = true;
          throw err;
        }

        const targetSlots = Array.from({ length: slotSize }, (_, i) => slotIndex + i);
        const existingMachines = await tx.userMiner.findMany({
          where: {
            userId: req.user.id,
            slotIndex: { in: targetSlots },
          },
          include: { miner: true },
        });

        if (existingMachines.length > 0) {
          for (const m of existingMachines) {
            await releaseUserMinerFromRacksTx(tx, req.user.id, m.id);
            await createInventoryWithOwnedMachineTx(tx, {
              userId: req.user.id,
              minerName: m.miner?.name || m.minerName || "Miner",
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
            userId: req.user.id,
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
          where: { id: vaultId, userId: req.user.id },
        });
      });

      await syncMiningProfileBestEffort(req.user.id);
      emitVaultSocketRefresh(req.user.id);
    } else {
      return res.status(400).json({
        ok: false,
        code: "VAULT_BAD_DESTINATION",
        messageKey: "vault.errors.VAULT_BAD_DESTINATION",
        message: "Invalid destination.",
      });
    }

    const engine = getMiningEngine();
    if (engine) {
      await createNotification({
        userId: req.user.id,
        title: "Miner retrieved",
        message: "Your miner was removed from the warehouse (vault).",
        type: "success",
        io: engine.io,
      });
    }

    res.json({ ok: true, message: "Machine retrieved from vault successfully!" });
  } catch (error) {
    if (error?.message === "NOT_FOUND" || error?.http === 404) {
      return res.status(404).json({
        ok: false,
        code: "VAULT_NOT_FOUND",
        messageKey: "vault.errors.VAULT_NOT_FOUND",
        message: "Item not found in vault.",
      });
    }
    if (error?.message === "INVALID_SLOT" || error?.vaultSlot) {
      return res.status(400).json({
        ok: false,
        code: SecurityErrorCodes.INVALID_STATE,
        messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
        message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
      });
    }
    if (error?.code === "P2034") {
      return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
    }
    logger.error("Retrieve from Vault Error", {
      message: error?.message,
      prismaCode: error?.code,
      userId: req.user?.id,
      vaultId: req.body?.vaultId,
      destination: req.body?.destination,
    });
    res.status(500).json({
      ok: false,
      code: "VAULT_RETRIEVE_ERROR",
      messageKey: "vault.retrieve_error",
      message: "Internal server error during vault retrieval.",
    });
  }
}
