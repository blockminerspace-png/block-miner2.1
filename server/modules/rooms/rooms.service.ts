import type { Prisma, UserRack } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import { applyUserBalanceDelta } from "../../src/runtime/miningRuntime.js";
import { getMiningEngine } from "../../src/miningEngineInstance.js";
import { syncUserBaseHashRate } from "../../models/minerProfileModel.js";
import { createNotification } from "../../controllers/notificationController.js";
import loggerLib from "../../utils/logger.js";
import {
  MachineLocation,
  ensureOwnedMachineForInventoryTx,
  ensureOwnedMachineForUserMinerTx,
  syncOwnedMachineSnapshotTx,
} from "../../services/userOwnedMachineService.js";
import { advisoryXactTryLockOrThrow } from "../../services/distributedLockService.js";
import { HttpStatusError } from "../../controllers/controllerHttpStatusError.js";
import {
  buildListedRoomsPayload,
  countRackTotals,
  getRoomPrices,
  loadRoomListCatalogMaps,
} from "./rooms.dto.js";
import * as roomsRepo from "./rooms.repository.js";
import {
  RACK_VISUAL_COLUMNS,
  RACKS_PER_ROOM,
  ROOM_MAX,
  type MinerWithMinerRel,
  type RackMoveBackRow,
} from "./rooms.types.js";

const logger = loggerLib.child("Rooms");

function rackSlotIndex(roomNumber: number, position: number): number {
  return 1000 + (roomNumber - 1) * RACKS_PER_ROOM + position;
}

async function moveRackMinerBackToInventoryTx(
  tx: Prisma.TransactionClient,
  rack: RackMoveBackRow,
  miner: MinerWithMinerRel,
  acquiredAt: Date,
): Promise<{ minerName: string }> {
  const minerName = miner.miner?.name || (!miner.minerId ? "Máquina custom" : "Máquina");
  const imageUrl = miner.imageUrl ?? miner.miner?.imageUrl ?? null;

  await tx.userRack.update({
    where: { id: rack.id },
    data: { userMinerId: null, installedAt: null },
  });

  await tx.userRack.updateMany({
    where: { roomId: rack.roomId, blockedByMinerId: miner.id },
    data: { blockedByMinerId: null },
  });

  const omId = await ensureOwnedMachineForUserMinerTx(tx, miner, minerName);
  await tx.userInventory.create({
    data: {
      userId: rack.userId,
      minerId: miner.minerId,
      minerName,
      level: miner.level,
      hashRate: miner.hashRate,
      slotSize: miner.slotSize,
      imageUrl,
      acquiredAt,
      ownedMachineId: omId,
    },
  });
  await syncOwnedMachineSnapshotTx(tx, omId, MachineLocation.INVENTORY, {
    minerId: miner.minerId,
    minerName,
    level: miner.level,
    hashRate: miner.hashRate,
    slotSize: miner.slotSize ?? 1,
    imageUrl,
  });

  await tx.userMiner.delete({ where: { id: miner.id } });
  return { minerName };
}

export async function listRoomsForUser(userId: number) {
  const prices = getRoomPrices();
  const rooms = await roomsRepo.findRoomsWithRacksForUser(userId);
  const maps = await loadRoomListCatalogMaps(rooms);
  const result = buildListedRoomsPayload(rooms, prices, maps);
  const { totalRacks, occupiedRacks, freeRacks } = countRackTotals(rooms);
  return { ok: true as const, rooms: result, totalRacks, occupiedRacks, freeRacks };
}

export type BuyRoomResult =
  | { ok: true; roomNumber: number; roomId: number; message: string }
  | { ok: false; status: number; code?: string; message: string };

export async function buyRoomForUser(userId: number): Promise<BuyRoomResult> {
  const prices = getRoomPrices();
  logger.info("buyRoom attempt", { userId });
  const existing = await roomsRepo.findUserRoomsOrdered(userId);
  const unlockedNumbers = existing.map((r) => r.roomNumber);
  const nextRoom = unlockedNumbers.length + 1;

  if (nextRoom > ROOM_MAX) {
    logger.warn("buyRoom: max rooms reached", { userId, nextRoom });
    return {
      ok: false,
      status: 400,
      code: "MAX_ROOMS_REACHED",
      message: "Você já desbloqueou todas as salas disponíveis.",
    };
  }

  const price = prices[nextRoom - 1] ?? 0;
  if (typeof price !== "number" || isNaN(price) || price < 0) {
    logger.error("buyRoom: invalid price config", { nextRoom, price });
    return { ok: false, status: 500, message: "Configuração de preço inválida." };
  }

  const balanceUser = await roomsRepo.findUserPolBalance(userId);
  if (!balanceUser) {
    logger.warn("buyRoom: user not found", { userId });
    return { ok: false, status: 404, message: "Usuário não encontrado." };
  }
  if (Number(balanceUser.polBalance) < price) {
    logger.warn("buyRoom: insufficient balance", { userId, balance: Number(balanceUser.polBalance), price });
    return {
      ok: false,
      status: 400,
      code: "INSUFFICIENT_BALANCE",
      message: "Saldo insuficiente para desbloquear esta sala.",
    };
  }

  const newRoom = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

  return {
    ok: true,
    roomNumber: nextRoom,
    roomId: newRoom.id,
    message: `Sala ${nextRoom} desbloqueada com sucesso!`,
  };
}

export type InstallMinerFailure = {
  status: number;
  code?: string;
  message: string;
};

type InstallMinerContext = {
  rack: NonNullable<Awaited<ReturnType<typeof roomsRepo.findRackWithRoomForUser>>>;
  inventoryItem: NonNullable<Awaited<ReturnType<typeof roomsRepo.findInventoryItemForUser>>>;
  adjacentRack: UserRack | null;
  slotIndex: number;
};

async function resolveInstallMinerContext(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<InstallMinerFailure | InstallMinerContext> {
  const rack = await roomsRepo.findRackWithRoomForUser(rackId, userId);
  if (!rack) {
    logger.warn("installMiner: rack not found", { userId, rackId });
    return { status: 404, message: "Rack não encontrado." };
  }
  if (rack.userMinerId != null || rack.blockedByMinerId != null) {
    logger.warn("installMiner: rack occupied", { userId, rackId });
    return { status: 400, code: "RACK_OCCUPIED", message: "Este rack já está ocupado." };
  }

  const inventoryItem = await roomsRepo.findInventoryItemForUser(inventoryId, userId);
  if (!inventoryItem) {
    logger.warn("installMiner: inventory item not found", { userId, inventoryId });
    return { status: 404, message: "Item não encontrado no inventário." };
  }

  const slotSize = inventoryItem.slotSize || 1;
  let adjacentRack: UserRack | null = null;
  if (slotSize >= 2) {
    if (rack.position % RACK_VISUAL_COLUMNS > RACK_VISUAL_COLUMNS - slotSize) {
      logger.warn("installMiner: 2-slot miner cannot start at row edge", {
        userId,
        rackId,
        position: rack.position,
        slotSize,
      });
      return {
        status: 400,
        code: "ROW_EDGE_NO_SPACE",
        message: "Máquinas de 2 slots precisam começar antes do fim da linha do rack.",
      };
    }
    adjacentRack = await roomsRepo.findRackByRoomAndPosition(rack.roomId, rack.position + (slotSize - 1));
    if (!adjacentRack) {
      logger.warn("installMiner: no adjacent rack for 2-slot miner", { userId, rackId, position: rack.position });
      return {
        status: 400,
        code: "NO_SPACE",
        message: "Não há espaço suficiente para esta máquina de 2 slots. Escolha um rack anterior.",
      };
    }
    if (adjacentRack.userMinerId != null || adjacentRack.blockedByMinerId != null) {
      logger.warn("installMiner: adjacent rack occupied", { userId, rackId, adjacentRackId: adjacentRack.id });
      return {
        status: 400,
        code: "ADJACENT_RACK_OCCUPIED",
        message: "O rack adjacente está ocupado. Escolha outro rack para esta máquina de 2 slots.",
      };
    }
  }

  return {
    rack,
    inventoryItem,
    adjacentRack,
    slotIndex: rackSlotIndex(rack.room.roomNumber, rack.position),
  };
}

/** Read-only checks before idempotency lease (matches legacy controller order). */
export async function preflightInstallMiner(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<InstallMinerFailure | null> {
  const resolved = await resolveInstallMinerContext(userId, rackId, inventoryId);
  return "status" in resolved ? resolved : null;
}

export type UninstallMinerFailure = {
  status: number;
  code?: string;
  message: string;
};

/** Read-only checks before idempotency lease (matches legacy controller order). */
export async function preflightUninstallMiner(
  userId: number,
  rackId: number,
): Promise<UninstallMinerFailure | null> {
  const rack = await roomsRepo.findRackWithMinerForUser(rackId, userId);
  if (!rack) {
    logger.warn("uninstallMiner: rack not found", { userId, rackId });
    return { status: 404, message: "Rack não encontrado." };
  }
  if (!rack.userMiner) {
    logger.warn("uninstallMiner: rack empty", { userId, rackId });
    return { status: 400, code: "RACK_EMPTY", message: "Este rack não tem máquina instalada." };
  }
  return null;
}

export async function installMinerForUser(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<{ inventoryItem: { minerName: string } } | InstallMinerFailure> {
  logger.info("installMiner attempt", { userId, rackId, inventoryId });

  const resolved = await resolveInstallMinerContext(userId, rackId, inventoryId);
  if ("status" in resolved) return resolved;
  const { rack, inventoryItem, adjacentRack, slotIndex } = resolved;
  const slotSize = inventoryItem.slotSize || 1;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
  return { inventoryItem: { minerName: inventoryItem.minerName } };
}

export async function uninstallMinerForUser(userId: number, rackId: number): Promise<void> {
  logger.info("uninstallMiner attempt", { userId, rackId });

  const preflight = await preflightUninstallMiner(userId, rackId);
  if (preflight) {
    throw new HttpStatusError(preflight.status, preflight.message, { code: preflight.code });
  }

  const rack = await roomsRepo.findRackWithMinerForUser(rackId, userId);
  if (!rack?.userMiner) {
    throw new HttpStatusError(404, "Rack não encontrado.");
  }

  const miner = rack.userMiner;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
    await moveRackMinerBackToInventoryTx(tx, rack, miner, new Date());
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
    returnedMinerName: miner.miner?.name || (!miner.minerId ? "Máquina custom" : "Máquina"),
  });
}

export async function uninstallMinerBatchForUser(userId: number, rackIds: number[]): Promise<void> {
  logger.info("uninstallMinerBatch attempt", { userId, rackCount: rackIds.length });

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await advisoryXactTryLockOrThrow(tx, `user_ops:${userId}`);
    const racks = await tx.userRack.findMany({
      where: { id: { in: rackIds }, userId },
      include: {
        userMiner: {
          include: { miner: true },
        },
      },
    });
    type RackWithMinerRow = (typeof racks)[number];
    const racksById = new Map<number, RackWithMinerRow>(racks.map((rack) => [rack.id, rack]));

    for (const rackId of rackIds) {
      const rack = racksById.get(rackId);
      if (!rack) {
        throw new HttpStatusError(404, "RACK_NOT_FOUND");
      }
      if (!rack.userMiner) {
        throw new HttpStatusError(400, "RACK_EMPTY", { code: "RACK_EMPTY" });
      }
    }

    const acquiredAt = new Date();
    for (const rackId of rackIds) {
      const rack = racksById.get(rackId);
      if (!rack) throw new HttpStatusError(404, "RACK_NOT_FOUND");
      const installed = rack.userMiner;
      if (!installed) throw new HttpStatusError(400, "RACK_EMPTY", { code: "RACK_EMPTY" });
      await moveRackMinerBackToInventoryTx(tx, rack, installed, acquiredAt);
    }
  });

  await syncUserBaseHashRate(userId);
  const engine = getMiningEngine();
  if (engine) {
    await engine.reloadMinerProfile(userId);
  }

  logger.info("uninstallMinerBatch: success", { userId, rackCount: rackIds.length });
}

export async function getSlotsSummaryForUser(userId: number) {
  const [totalRacks, occupiedRacks, inventoryCount] = await Promise.all([
    roomsRepo.countUserRacks(userId),
    roomsRepo.countOccupiedUserRacks(userId),
    roomsRepo.countUserInventory(userId),
  ]);

  return {
    ok: true as const,
    totalRacks,
    occupiedRacks,
    freeRacks: totalRacks - occupiedRacks,
    inventoryCount,
  };
}
