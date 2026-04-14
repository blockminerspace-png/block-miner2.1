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

const DEFAULT_MINER_IMAGE_URL = "/machines/reward1.png";

export async function getInventory(req, res) {
  try {
    const inventory = await inventoryModel.listInventory(req.user.id);
    res.json({ ok: true, inventory });
  } catch {
    res.status(500).json({ ok: false, message: "Unable to load inventory." });
  }
}

export async function installInventoryItem(req, res) {
  try {
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
    /** @type {{ minerName: string } | null} */
    let notifyMeta = null;

    try {
      await prisma.$transaction(async (tx) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${req.user.id}`);
        await lockUserRowForUpdate(tx, req.user.id);
      const rowLocked = await lockUserInventoryRowForUpdate(tx, req.user.id, inventoryId);
      if (!rowLocked) {
        const err = new Error("NOT_FOUND");
        /** @type {any} */ (err).http = 404;
        throw err;
      }

      const inventoryItem = await tx.userInventory.findFirst({
        where: { id: inventoryId, userId: req.user.id },
      });
      if (!inventoryItem) {
        const err = new Error("NOT_FOUND");
        /** @type {any} */ (err).http = 404;
        throw err;
      }

      const slotSize = Number(inventoryItem.slotSize || 1);

      if (slotSize === 2 && slotIndex % 2 !== 0) {
        const err = new Error("INVALID_SLOT");
        /** @type {any} */ (err).http = 400;
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

      if (slotIndex % 2 === 1) {
        const prevMachine = await tx.userMiner.findFirst({
          where: { userId: req.user.id, slotIndex: slotIndex - 1 },
          include: { miner: true },
        });
        if (prevMachine && prevMachine.slotSize === 2) {
          await releaseUserMinerFromRacksTx(tx, req.user.id, prevMachine.id);
          await createInventoryWithOwnedMachineTx(tx, {
            userId: req.user.id,
            minerName: prevMachine.miner?.name || prevMachine.minerName || "Miner",
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
          userId: req.user.id,
          slotIndex,
          level: inventoryItem.level,
          hashRate: inventoryItem.hashRate,
          isActive: true,
          slotSize,
          minerId: inventoryItem.minerId,
          imageUrl: inventoryItem.imageUrl || DEFAULT_MINER_IMAGE_URL,
          ownedMachineId: omId,
        },
      });
      await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.RACK, {
        minerId: inventoryItem.minerId,
        minerName: inventoryItem.minerName,
        level: inventoryItem.level,
        hashRate: inventoryItem.hashRate,
        slotSize: inventoryItem.slotSize ?? 1,
        imageUrl: inventoryItem.imageUrl || DEFAULT_MINER_IMAGE_URL,
      });

      await tx.userInventory.delete({ where: { id: inventoryId, userId: req.user.id } });
      notifyMeta = { minerName: inventoryItem.minerName };
      });

    await syncUserBaseHashRate(req.user.id);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(req.user.id);

      if (notifyMeta) {
        await createNotification({
          userId: req.user.id,
          title: "Machine installed",
          message: `${notifyMeta.minerName} was installed on your rack. Your hashrate has been updated.`,
          type: "success",
          io: engine.io,
        });
      }
    }

      const payload = { ok: true, message: "Machine installed successfully!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error) {
      await cancelCriticalMutation(lease);
      if (error?.message === "NOT_FOUND" || error?.http === 404) {
        return res.status(404).json({ ok: false, message: "Item not found in inventory." });
      }
      if (error?.message === "INVALID_SLOT") {
        return res.status(400).json({
          ok: false,
          code: SecurityErrorCodes.INVALID_STATE,
          messageKey: `errors.security.${SecurityErrorCodes.INVALID_STATE}`,
          message: "Large machines must start on an even slot (1, 3, 5, 7 on UI).",
        });
      }
      if (error?.code === "P2034" || error?.code === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      console.error("Install Error:", error);
      return res.status(500).json({ ok: false, message: "Internal server error during installation." });
    }
  } catch (error) {
    console.error("Install Error:", error);
    res.status(500).json({ ok: false, message: "Internal server error during installation." });
  }
}

export async function removeInventoryItem(req, res) {
  try {
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
      await prisma.$transaction(async (tx) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${req.user.id}`);
        await lockUserRowForUpdate(tx, req.user.id);
        const rowLocked = await lockUserInventoryRowForUpdate(tx, req.user.id, inventoryId);
        if (!rowLocked) {
          throw new Error("NOT_FOUND");
        }
        const row = await tx.userInventory.findFirst({
          where: { id: inventoryId, userId: req.user.id },
          select: { id: true, ownedMachineId: true },
        });
        if (!row) {
          throw new Error("NOT_FOUND");
        }
        await tx.userInventory.delete({ where: { id: inventoryId, userId: req.user.id } });
        if (row.ownedMachineId != null) {
          await tx.userOwnedMachine.delete({ where: { id: row.ownedMachineId } });
        }
      });
      const payload = { ok: true, message: "Item removed." };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (error) {
      await cancelCriticalMutation(lease);
      if (error?.message === "NOT_FOUND") {
        return res.status(404).json({ ok: false, message: "Item not found." });
      }
      if (error?.code === "P2034" || error?.code === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      return res.status(500).json({ ok: false, message: "Error removing item." });
    }
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error removing item." });
  }
}

export async function updateInventory(req, res) {
  res.json({ ok: true, message: "Inventory synced." });
}
