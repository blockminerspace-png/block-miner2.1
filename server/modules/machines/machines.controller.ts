import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import * as machineModel from "../../models/machineModel.js";
import * as minersModel from "../../models/minersModel.js";
import { getOrCreateMinerProfile, syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import prisma from '../../src/db/prisma.js';
import { releaseUserMinerFromRacksTx } from "../../utils/rackMinerRelease.js";
import {
  MachineLocation,
  createInventoryWithOwnedMachineTx,
  ensureOwnedMachineForUserMinerTx,
  syncOwnedMachineSnapshotTx,
} from "../../services/userOwnedMachineService.js";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../../utils/criticalMutationIdempotency.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../../utils/securityErrors.js";
import { lockUserRowForUpdate } from "../../utils/transactionLocks.js";
import { logUserActivity } from "../../utils/logger.js";
import {
  readErrorCode,
  requireSessionUser,
} from "../../controllers/controllerHttpStatusError.js";

export async function listMachines(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const machines = await machineModel.listUserMachines(user.id);
    res.json({ ok: true, machines });
  } catch (error: unknown) {
    console.error("Error loading machines:", error);
    res.status(500).json({ ok: false, message: "Unable to load machines." });
  }
}

export async function toggleMachine(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId, isActive } = req.body;
    const machine = await machineModel.getMachineById(user.id, machineId);
    if (!machine) return res.status(404).json({ ok: false, message: "Machine not found." });

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        await tx.userMiner.update({
          where: { id: machineId, userId: user.id },
          data: { isActive },
        });
      });
      await syncUserBaseHashRate(user.id);
      const engine = getMiningEngine();
      if (engine) await engine.reloadMinerProfile(user.id);
      const payload = { ok: true, message: isActive ? "Machine activated." : "Machine deactivated." };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      logUserActivity("GAME_MACHINE_TOGGLE", req, { machineId, isActive });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      throw error;
    }
  } catch {
    res.status(500).json({ ok: false, message: "Unable to toggle machine." });
  }
}

export async function removeMachine(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId } = req.body;
    const fullMiner = await prisma.userMiner.findFirst({
      where: { id: machineId, userId: user.id },
      include: { miner: true },
    });
    if (!fullMiner) return res.status(404).json({ ok: false, message: "Miner not found." });

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    const now = new Date();

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        await releaseUserMinerFromRacksTx(tx, user.id, machineId);
          const displayName = fullMiner.miner?.name || "Miner";
          const omId = await ensureOwnedMachineForUserMinerTx(tx, fullMiner, displayName);
          await tx.userInventory.create({
            data: {
              userId: user.id,
              minerName: displayName,
              level: fullMiner.level,
              hashRate: fullMiner.hashRate,
              slotSize: fullMiner.slotSize,
              minerId: fullMiner.minerId || null,
              imageUrl: fullMiner.imageUrl || fullMiner.miner?.imageUrl || null,
              acquiredAt: now,
              ownedMachineId: omId,
            },
          });
          await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.INVENTORY, {
            minerId: fullMiner.minerId,
            minerName: displayName,
            level: fullMiner.level,
            hashRate: fullMiner.hashRate,
            slotSize: fullMiner.slotSize ?? 1,
            imageUrl: fullMiner.imageUrl || fullMiner.miner?.imageUrl || null,
          });
        await tx.userMiner.delete({ where: { id: machineId } });
      });

      await syncUserBaseHashRate(user.id);
      const engine = getMiningEngine();
      if (engine) await engine.reloadMinerProfile(user.id);

      const payload = { ok: true, message: "Miner sent to inventory!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      logUserActivity("GAME_MACHINE_REMOVE_TO_INVENTORY", req, { machineId });
      return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      console.error("Error removing miner:", error);
      return res.status(500).json({ ok: false, message: "Error removing miner." });
    }
  } catch (error: unknown) {
    console.error("Error removing miner:", error);
    res.status(500).json({ ok: false, message: "Error removing miner." });
  }
}

export async function moveMachine(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const { machineId, targetSlotIndex } = req.body;

    if (!Number.isInteger(targetSlotIndex) || targetSlotIndex < 0 || targetSlotIndex >= 80) {
      return res.status(400).json({ ok: false, message: "Invalid target slot." });
    }

    const machine = await machineModel.getMachineById(user.id, machineId);
    if (!machine) return res.status(404).json({ ok: false, message: "Machine not found." });

    if (machine.slotSize === 2 && targetSlotIndex % 2 !== 0) {
      return res.status(400).json({ ok: false, message: "Large machines must start on an even slot." });
    }

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    // Check if slot is occupied
    const targetSlots = Array.from({ length: machine.slotSize }, (_, i) => targetSlotIndex + i);
    const existingMachines = await prisma.userMiner.findMany({
      where: {
        userId: user.id,
        slotIndex: { in: targetSlots },
        id: { not: machineId } // Ignore self
      },
      include: { miner: true }
    });

    const now = new Date();

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${user.id}`);
        await lockUserRowForUpdate(tx, user.id);
        // 1. Send existing overlapping machines to inventory
        if (existingMachines.length > 0) {
        for (const m of existingMachines) {
          await releaseUserMinerFromRacksTx(tx, user.id, m.id);
          await createInventoryWithOwnedMachineTx(tx, {
            userId: user.id,
            minerName: m.miner?.name || "Miner",
            level: m.level,
            hashRate: m.hashRate,
            slotSize: m.slotSize,
            minerId: m.minerId,
            imageUrl: m.imageUrl || m.miner?.imageUrl,
            acquiredAt: now,
            updatedAt: now,
          });
          await tx.userMiner.delete({ where: { id: m.id } });
        }
      }

      // Check for 2-slot overlaps from previous slot
      if (targetSlotIndex % 2 === 1) {
        const prevMachine = await tx.userMiner.findFirst({
          where: {
            userId: user.id,
            slotIndex: targetSlotIndex - 1,
            id: { not: machineId }
          },
          include: { miner: true }
        });
        if (prevMachine && prevMachine.slotSize === 2) {
          await releaseUserMinerFromRacksTx(tx, user.id, prevMachine.id);
          await createInventoryWithOwnedMachineTx(tx, {
            userId: user.id,
            minerName: prevMachine.miner?.name || "Miner",
            level: prevMachine.level,
            hashRate: prevMachine.hashRate,
            slotSize: prevMachine.slotSize,
            minerId: prevMachine.minerId,
            imageUrl: prevMachine.imageUrl || prevMachine.miner?.imageUrl,
            acquiredAt: now,
            updatedAt: now,
          });
          await tx.userMiner.delete({ where: { id: prevMachine.id } });
        }
      }

      // 2. Move the actual machine
        await tx.userMiner.update({
          where: { id: machineId },
          data: { slotIndex: targetSlotIndex },
        });
      });

    await syncUserBaseHashRate(user.id);
    const engine = getMiningEngine();
    if (engine) await engine.reloadMinerProfile(user.id);

    const payload = { ok: true, message: "Machine moved successfully." };
    await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
    logUserActivity("GAME_MACHINE_MOVE_SLOT", req, { machineId, targetSlotIndex });
    return res.json(payload);
    } catch (error: unknown) {
      await cancelCriticalMutation(lease);
      if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      console.error("Move Error:", error);
      return res.status(500).json({ ok: false, message: "Error moving machine." });
    }
  } catch (error: unknown) {
    console.error("Move Error:", error);
    res.status(500).json({ ok: false, message: "Error moving machine." });
  }
}
