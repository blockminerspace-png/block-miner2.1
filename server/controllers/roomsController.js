import prisma from "../src/db/prisma.js";
import { applyUserBalanceDelta } from "../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { syncUserBaseHashRate } from "../models/minerProfileModel.js";
import { createNotification } from "./notificationController.js";

const RACKS_PER_ROOM = parseInt(process.env.RACKS_PER_ROOM || "24", 10);
const ROOM_MAX = parseInt(process.env.ROOM_MAX || "6", 10);

function getRoomPrices() {
  const raw = process.env.ROOM_PRICES || "0,500,1200,2500,4500,7500";
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
    return res.status(500).json({ ok: false, message: "Erro ao listar salas." });
  }
}

export async function buyRoom(req, res) {
  try {
    const userId = req.user.id;
    const prices = getRoomPrices();

    // Descobrir próxima sala a ser comprada
    const existing = await prisma.userRoom.findMany({
      where: { userId },
      orderBy: { roomNumber: "asc" },
    });

    const unlockedNumbers = existing.map((r) => r.roomNumber);
    const nextRoom = unlockedNumbers.length + 1;

    if (nextRoom > ROOM_MAX) {
      return res.status(400).json({ ok: false, code: "MAX_ROOMS_REACHED", message: "Você já desbloqueou todas as salas disponíveis." });
    }

    const price = prices[nextRoom - 1] ?? 0;

    // Verificar saldo
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { polBalance: true } });
    if (!user || Number(user.polBalance) < price) {
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
    return res.status(500).json({ ok: false, message: "Erro ao comprar sala." });
  }
}

export async function installMiner(req, res) {
  try {
    const userId = req.user.id;
    const rackId = Number(req.body?.rackId);
    const inventoryId = Number(req.body?.inventoryId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      return res.status(400).json({ ok: false, message: "rackId inválido." });
    }
    if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
      return res.status(400).json({ ok: false, message: "inventoryId inválido." });
    }

    // Buscar rack e validar que pertence ao usuário
    const rack = await prisma.userRack.findFirst({
      where: { id: rackId, userId },
      include: { room: true },
    });
    if (!rack) {
      return res.status(404).json({ ok: false, message: "Rack não encontrado." });
    }
    if (rack.userMinerId !== null) {
      return res.status(400).json({ ok: false, code: "RACK_OCCUPIED", message: "Este rack já está ocupado." });
    }

    // Buscar item do inventário
    const inventoryItem = await prisma.userInventory.findFirst({
      where: { id: inventoryId, userId },
    });
    if (!inventoryItem) {
      return res.status(404).json({ ok: false, message: "Item não encontrado no inventário." });
    }

    // Verificar se este item já está instalado em algum rack
    const alreadyInRack = await prisma.userMiner.findFirst({
      where: {
        userId,
        // Miners de rack têm slotIndex >= 1000
        slotIndex: {
          gte: 1000,
        },
        userRack: { isNot: null },
      },
    });
    // Na verdade precisamos verificar por minerId + hashRate correspondente — mais simples: verificar via join
    // A verificação mais confiável: se o item de inventário foi movido para userMiner, não está mais em inventory
    // Então apenas chegar aqui já confirma que o item está disponível

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

    return res.json({ ok: true, message: "Máquina instalada com sucesso!" });
  } catch (err) {
    console.error("installMiner error:", err);
    return res.status(500).json({ ok: false, message: "Erro ao instalar máquina." });
  }
}

export async function uninstallMiner(req, res) {
  try {
    const userId = req.user.id;
    const rackId = Number(req.body?.rackId);

    if (!Number.isInteger(rackId) || rackId <= 0) {
      return res.status(400).json({ ok: false, message: "rackId inválido." });
    }

    const rack = await prisma.userRack.findFirst({
      where: { id: rackId, userId },
      include: { userMiner: true },
    });
    if (!rack) {
      return res.status(404).json({ ok: false, message: "Rack não encontrado." });
    }
    if (!rack.userMiner) {
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

    return res.json({ ok: true, message: "Máquina removida do rack com sucesso!" });
  } catch (err) {
    console.error("uninstallMiner error:", err);
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
