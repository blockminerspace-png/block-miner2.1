import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { createNotification } from "./notificationController.js";
import loggerLib from "../utils/logger.js";
import {
  MachineLocation,
  ensureOwnedMachineForInventoryTx,
  ensureOwnedMachineForUserMinerTx,
  syncOwnedMachineSnapshotTx,
} from "../services/userOwnedMachineService.js";
import { advisoryXactTryLockOrThrow } from "../services/distributedLockService.js";
import {
  cancelCriticalMutation,
  finalizeCriticalMutationSuccess,
  resolveCriticalMutation,
} from "../utils/criticalMutationIdempotency.js";
import { SecurityErrorCodes, buildSecurityErrorJson } from "../utils/securityErrors.js";

const logger = loggerLib.child("Rooms");

const RACKS_PER_ROOM = parseInt(process.env.RACKS_PER_ROOM || "192", 10);
const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);

function getRoomPrices() {
  const raw = process.env.ROOM_PRICES || "0,100,500,750";
  return raw.split(",").map((v) => parseFloat(v.trim()));
}

// slotIndex para miners instalados via racks: offset 1000 + posição global
function rackSlotIndex(roomNumber, position) {
  return 1000 + (roomNumber - 1) * RACKS_PER_ROOM + position;
}

export async function listRooms(req, res) {
  try {
    const userId = req.user.id;
    const prices = getRoomPrices();

    logger.info("listRooms", { userId });

    const rooms = await prisma.userRoom.findMany({
      where: { userId },
      include: {
        racks: {
          orderBy: { position: "asc" },
          include: {
            userMiner: {
              include: { miner: true }
            }
          }
        },
      },
      orderBy: { roomNumber: "asc" },
    });

    // Montar payload incluindo salas ainda bloqueadas como stubs
    const result = [];
    for (let n = 1; n <= ROOM_MAX; n++) {
      const found = rooms.find((r) => r.roomNumber === n);
      if (found) {
        result.push({
          id: found.id,
          roomNumber: found.roomNumber,
          unlocked: true,
          pricePaid: Number(found.pricePaid),
          unlockedAt: found.unlockedAt,
          racks: found.racks.map((rack) => ({
            id: rack.id,
            position: rack.position,
            installedAt: rack.installedAt || null,
            blockedByMinerId: rack.blockedByMinerId || null,
            miner: rack.userMiner
              ? {
                  id: rack.userMiner.id,
                  minerId: rack.userMiner.minerId,
                  minerName: rack.userMiner.miner?.name ?? null,
                  hashRate: rack.userMiner.hashRate,
                  imageUrl: rack.userMiner.imageUrl,
                  level: rack.userMiner.level,
                  slotSize: rack.userMiner.slotSize,
                }
              : null,
          })),
        });
      } else {
        result.push({
          roomNumber: n,
          unlocked: false,
          price: prices[n - 1] ?? 0,
          racks: [],
        });
      }
    }

    const totalRacks = rooms.reduce((s, r) => s + r.racks.length, 0);
    const occupiedRacks = rooms.reduce(
      (s, r) =>
        s +
        r.racks.filter((rack) => rack.userMinerId != null || rack.blockedByMinerId != null).length,
      0
    );

    return res.json({
      ok: true,
      rooms: result,
      totalRacks,
      occupiedRacks,
      freeRacks: totalRacks - occupiedRacks,
    });
  } catch (err) {
    logger.error("listRooms error", { err: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao listar salas." });
  }
}

export async function buyRoom(req, res) {
  try {
    const userId = req.user.id;
    const prices = getRoomPrices();

    logger.info("buyRoom attempt", { userId });
    const existing = await prisma.userRoom.findMany({
      where: { userId },
      orderBy: { roomNumber: "asc" },
    });

    const unlockedNumbers = existing.map((r) => r.roomNumber);
    const nextRoom = unlockedNumbers.length + 1;

    if (nextRoom > ROOM_MAX) {
      logger.warn("buyRoom: max rooms reached", { userId, nextRoom });
      return res.status(400).json({ ok: false, code: "MAX_ROOMS_REACHED", message: "Você já desbloqueou todas as salas disponíveis." });
    }

    const price = prices[nextRoom - 1] ?? 0;
    if (typeof price !== "number" || isNaN(price) || price < 0) {
      logger.error("buyRoom: invalid price config", { nextRoom, price });
      return res.status(500).json({ ok: false, message: "Configuração de preço inválida." });
    }

    // Verificar saldo
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
    if (!user) {
      logger.warn("buyRoom: user not found", { userId });
      return res.status(404).json({ ok: false, message: "Usuário não encontrado." });
    }
    if (Number(user.polBalance) < price) {
      logger.warn("buyRoom: insufficient balance", { userId, balance: Number(user.polBalance), price });
      return res.status(400).json({ ok: false, code: "INSUFFICIENT_BALANCE", message: "Saldo insuficiente para desbloquear esta sala." });
    }

    const newRoom = await prisma.$transaction(async (tx) => {
      if (price > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { polBalance: { decrement: price } },
        });
      }

      const room = await tx.userRoom.create({
        data: {
          userId,
          roomNumber: nextRoom,
          pricePaid: price,
        },
      });

      // Criar os racks da sala
      const racksData = Array.from({ length: RACKS_PER_ROOM }, (_, i) => ({
        userId,
        roomId: room.id,
        position: i,
      }));

      await tx.userRack.createMany({ data: racksData });

      return room;
    });

    if (price > 0) {
      applyUserBalanceDelta(userId, -price);
    }

    logger.info("buyRoom: room unlocked", { userId, roomNumber: nextRoom, price });
    const engine = getMiningEngine();
    if (engine) {
      await createNotification({
        userId,
        title: "Sala Desbloqueada!",
        message: `Sala ${nextRoom} desbloqueada com sucesso! ${RACKS_PER_ROOM} racks disponíveis.`,
        type: "success",
        io: engine.io,
      });
    }

    return res.json({
      ok: true,
      roomNumber: nextRoom,
      roomId: newRoom.id,
      message: `Sala ${nextRoom} desbloqueada com sucesso!`,
    });
  } catch (err) {
    logger.error("buyRoom error", { err: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao comprar sala." });
  }
}

export async function installMiner(req, res) {
  try {
    const userId = req.user.id;
    const rackId = Number(req.body?.rackId);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      logger.warn("installMiner: invalid rackId", { userId, rackId });
      return res.status(400).json({ ok: false, message: "rackId inválido." });
    }
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      logger.warn("installMiner: invalid inventoryId", { userId, inventoryId });
      return res.status(400).json({ ok: false, message: "inventoryId inválido." });
    }

    logger.info("installMiner attempt", { userId, rackId, inventoryId });

    // Buscar rack e validar que pertence ao usuário
    const rack = await prisma.userRack.findFirst({
      where: { id: rackId, userId },
      include: { room: true },
    });
    if (!rack) {
      logger.warn("installMiner: rack not found", { userId, rackId });
      return res.status(404).json({ ok: false, message: "Rack não encontrado." });
    }
    if (rack.userMinerId != null || rack.blockedByMinerId != null) {
      logger.warn("installMiner: rack occupied", { userId, rackId });
      return res.status(400).json({ ok: false, code: "RACK_OCCUPIED", message: "Este rack já está ocupado." });
    }

    // Buscar item do inventário
    const inventoryItem = await prisma.userInventory.findFirst({
      where: { id: inventoryId, userId },
    });
    if (!inventoryItem) {
      logger.warn("installMiner: inventory item not found", { userId, inventoryId });
      return res.status(404).json({ ok: false, message: "Item não encontrado no inventário." });
    }

    // Para miners de 2 slots: verificar rack adjacente (position+1)
    const slotSize = inventoryItem.slotSize || 1;
    let adjacentRack = null;
    if (slotSize >= 2) {
      adjacentRack = await prisma.userRack.findFirst({
        where: { roomId: rack.roomId, position: rack.position + (slotSize - 1) },
      });
      if (!adjacentRack) {
        logger.warn("installMiner: no adjacent rack for 2-slot miner", { userId, rackId, position: rack.position });
        return res.status(400).json({ ok: false, code: "NO_SPACE", message: "Não há espaço suficiente para esta máquina de 2 slots. Escolha um rack anterior." });
      }
      if (adjacentRack.userMinerId != null || adjacentRack.blockedByMinerId != null) {
        logger.warn("installMiner: adjacent rack occupied", { userId, rackId, adjacentRackId: adjacentRack.id });
        return res.status(400).json({ ok: false, code: "ADJACENT_RACK_OCCUPIED", message: "O rack adjacente está ocupado. Escolha outro rack para esta máquina de 2 slots." });
      }
    }

    const slotIndex = rackSlotIndex(rack.room.roomNumber, rack.position);

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await prisma.$transaction(async (tx) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
        const omId = await ensureOwnedMachineForInventoryTx(tx, inventoryItem);
          const newMiner = await tx.userMiner.create({
            data: {
              userId,
              slotIndex,
              minerId: inventoryItem.minerId,
              level: inventoryItem.level,
              hashRate: inventoryItem.hashRate,
              slotSize: inventoryItem.slotSize,
              imageUrl: inventoryItem.imageUrl,
              isActive: true,
              ownedMachineId: omId,
            },
          });

          await tx.userRack.update({
            where: { id: rackId },
            data: {
              userMinerId: newMiner.id,
              installedAt: new Date(),
            },
          });

          if (slotSize >= 2 && adjacentRack) {
            await tx.userRack.update({
              where: { id: adjacentRack.id },
              data: { blockedByMinerId: newMiner.id },
            });
          }

          await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.RACK, {
            minerId: inventoryItem.minerId,
            minerName: inventoryItem.minerName,
            level: inventoryItem.level,
            hashRate: inventoryItem.hashRate,
            slotSize: inventoryItem.slotSize ?? 1,
            imageUrl: inventoryItem.imageUrl,
          });

        await tx.userInventory.delete({ where: { id: inventoryId } });
      });

      await syncUserBaseHashRate(userId);
      const engine = getMiningEngine();
      if (engine) {
        await engine.reloadMinerProfile(userId);
        await createNotification({
          userId,
          title: "Máquina Instalada",
          message: `${inventoryItem.minerName} instalada no rack com sucesso!`,
          type: "success",
          io: engine.io,
        });
      }

      logger.info("installMiner: success", { userId, rackId, minerId: inventoryItem.minerId });
      const payload = { ok: true, message: "Máquina instalada com sucesso!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (err) {
      await cancelCriticalMutation(lease);
      if (/** @type {any} */ (err)?.code === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      logger.error("installMiner error", { err: err.message });
      return res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
    }
  } catch (err) {
    logger.error("installMiner error", { err: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
  }
}

export async function uninstallMiner(req, res) {
  try {
    const userId = req.user.id;
    const rackId = Number(req.body?.rackId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      logger.warn("uninstallMiner: invalid rackId", { userId, rackId });
      return res.status(400).json({ ok: false, message: "rackId inválido." });
    }

    logger.info("uninstallMiner attempt", { userId, rackId });

    const rack = await prisma.userRack.findFirst({
      where: { id: rackId, userId },
      include: { userMiner: { include: { miner: true } } },
    });
    if (!rack) {
      logger.warn("uninstallMiner: rack not found", { userId, rackId });
      return res.status(404).json({ ok: false, message: "Rack não encontrado." });
    }
    if (!rack.userMiner) {
      logger.warn("uninstallMiner: rack empty", { userId, rackId });
      return res.status(400).json({ ok: false, code: "RACK_EMPTY", message: "Este rack não tem máquina instalada." });
    }

    const miner = rack.userMiner;
    const minerName =
      miner.miner?.name || (!miner.minerId ? "Máquina custom" : "Máquina");

    const idem = await resolveCriticalMutation(req, res);
    if (!idem) return;
    const { lease, ci } = idem;

    try {
      await prisma.$transaction(async (tx) => {
        await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
        await tx.userRack.update({
          where: { id: rackId },
          data: { userMinerId: null, installedAt: null },
        });

          await tx.userRack.updateMany({
            where: { roomId: rack.roomId, blockedByMinerId: miner.id },
            data: { blockedByMinerId: null },
          });

          const omId = await ensureOwnedMachineForUserMinerTx(tx, miner, minerName);
          await tx.userInventory.create({
            data: {
              userId,
              minerId: miner.minerId,
              minerName,
              level: miner.level,
              hashRate: miner.hashRate,
              slotSize: miner.slotSize,
              imageUrl: miner.imageUrl ?? miner.miner?.imageUrl ?? null,
              acquiredAt: new Date(),
              ownedMachineId: omId,
            },
          });
          await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.INVENTORY, {
            minerId: miner.minerId,
            minerName,
            level: miner.level,
            hashRate: miner.hashRate,
            slotSize: miner.slotSize ?? 1,
            imageUrl: miner.imageUrl ?? miner.miner?.imageUrl ?? null,
          });

        await tx.userMiner.delete({ where: { id: miner.id } });
      });

      await syncUserBaseHashRate(userId);
      const engine = getMiningEngine();
      if (engine) {
        await engine.reloadMinerProfile(userId);
      }

      logger.info("uninstallMiner: success", {
        userId,
        rackId,
        minerId: miner.minerId,
        returnedMinerName: minerName,
      });
      const payload = { ok: true, message: "Máquina removida do rack com sucesso!" };
      await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
      return res.json(payload);
    } catch (err) {
      await cancelCriticalMutation(lease);
      if (/** @type {any} */ (err)?.code === "DISTRIBUTED_LOCK_BUSY") {
        return res.status(409).json(buildSecurityErrorJson(SecurityErrorCodes.RACE_CONDITION_DETECTED));
      }
      logger.error("uninstallMiner error", { err: err.message });
      return res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
    }
  } catch (err) {
    logger.error("uninstallMiner error", { err: err.message });
    return res.status(500).json({ ok: false, message: "Erro ao remover máquina." });
  }
}

export async function getSlotsSummary(req, res) {
  try {
    const userId = req.user.id;

    const [totalRacks, occupiedRacks, inventoryCount] = await Promise.all([
      prisma.userRack.count({ where: { userId } }),
      prisma.userRack.count({ where: { userId, userMinerId: { not: null } } }),
      prisma.userInventory.count({ where: { userId } }),
    ]);

    return res.json({
      ok: true,
      totalRacks,
      occupiedRacks,
      freeRacks: totalRacks - occupiedRacks,
      inventoryCount,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Erro ao buscar slots." });
  }
}
