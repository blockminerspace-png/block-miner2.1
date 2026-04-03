import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { createNotification } from "./notificationController.js";
import loggerLib from "../utils/logger.js";

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
            userMiner: true,
          },
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
            miner: rack.userMiner
              ? {
                  id: rack.userMiner.id,
                  minerId: rack.userMiner.minerId,
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
      (s, r) => s + r.racks.filter((rack) => rack.userMinerId !== null).length,
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
    if (rack.userMinerId !== null) {
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

    // Item presente em userInventory já confirma disponibilidade — sem necessidade de consulta adicional.

    const slotIndex = rackSlotIndex(rack.room.roomNumber, rack.position);

    await prisma.$transaction(async (tx) => {
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
        },
      });

      await tx.userRack.update({
        where: { id: rackId },
        data: {
          userMinerId: newMiner.id,
          installedAt: new Date(),
        },
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
    return res.json({ ok: true, message: "Máquina instalada com sucesso!" });
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
      include: { userMiner: true },
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

    await prisma.$transaction(async (tx) => {
      await tx.userRack.update({
        where: { id: rackId },
        data: { userMinerId: null, installedAt: null },
      });

      await tx.userInventory.create({
        data: {
          userId,
          minerId: miner.minerId,
          minerName: "Máquina", // fallback; enriquecemos abaixo
          level: miner.level,
          hashRate: miner.hashRate,
          slotSize: miner.slotSize,
          imageUrl: miner.imageUrl,
          acquiredAt: new Date(),
        },
      });

      await tx.userMiner.delete({ where: { id: miner.id } });
    });

    await syncUserBaseHashRate(userId);
    const engine = getMiningEngine();
    if (engine) {
      await engine.reloadMinerProfile(userId);
    }

    logger.info("uninstallMiner: success", { userId, rackId, minerId: miner.minerId });
    return res.json({ ok: true, message: "Máquina removida do rack com sucesso!" });
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
