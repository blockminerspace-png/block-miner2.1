import type { Prisma, UserRack } from "@prisma/client";
import prisma from "../../src/db/prisma.js";
import type { RoomListQueryRow } from "./rooms.types.js";

const roomListSelect = {
  id: true,
  roomNumber: true,
  pricePaid: true,
  unlockedAt: true,
  racks: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      position: true,
      installedAt: true,
      blockedByMinerId: true,
      userMinerId: true,
      userMiner: {
        select: {
          id: true,
          minerId: true,
          hashRate: true,
          imageUrl: true,
          level: true,
          slotSize: true,
          ownedMachineId: true,
          ownedMachine: { select: { imageUrl: true, minerName: true } },
          miner: { select: { name: true, imageUrl: true } },
        },
      },
    },
  },
} satisfies Prisma.UserRoomSelect;

export async function findRoomsWithRacksForUser(userId: number): Promise<RoomListQueryRow[]> {
  return prisma.userRoom.findMany({
    where: { userId },
    select: roomListSelect,
    orderBy: { roomNumber: "asc" },
  });
}

export async function findUserRoomsOrdered(userId: number) {
  return prisma.userRoom.findMany({
    where: { userId },
    orderBy: { roomNumber: "asc" },
  });
}

export async function findUserPolBalance(userId: number): Promise<{ polBalance: Prisma.Decimal } | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { polBalance: true },
  });
}

export async function findRackWithRoomForUser(rackId: number, userId: number) {
  return prisma.userRack.findFirst({
    where: { id: rackId, userId },
    include: { room: true },
  });
}

export async function findInventoryItemForUser(inventoryId: number, userId: number) {
  return prisma.userInventory.findFirst({
    where: { id: inventoryId, userId },
  });
}

export async function findRackByRoomAndPosition(roomId: number, position: number): Promise<UserRack | null> {
  return prisma.userRack.findFirst({
    where: { roomId, position },
  });
}

export async function findRackWithMinerForUser(rackId: number, userId: number) {
  return prisma.userRack.findFirst({
    where: { id: rackId, userId },
    include: { userMiner: { include: { miner: true } } },
  });
}

export async function findRacksWithMinersByIds(rackIds: number[], userId: number) {
  return prisma.userRack.findMany({
    where: { id: { in: rackIds }, userId },
    include: {
      userMiner: {
        include: { miner: true },
      },
    },
  });
}

export async function countUserRacks(userId: number): Promise<number> {
  return prisma.userRack.count({ where: { userId } });
}

export async function countOccupiedUserRacks(userId: number): Promise<number> {
  return prisma.userRack.count({ where: { userId, userMinerId: { not: null } } });
}

export async function countUserInventory(userId: number): Promise<number> {
  return prisma.userInventory.count({ where: { userId } });
}
