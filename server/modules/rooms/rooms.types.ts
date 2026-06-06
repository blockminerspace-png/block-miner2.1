import type { Prisma } from "@prisma/client";

export const RACKS_PER_ROOM = parseInt(process.env.RACKS_PER_ROOM || "192", 10);
export const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);
export const RACK_VISUAL_COLUMNS = 4;

export type RackMoveBackRow = { id: number; roomId: number; userId: number };
export type MinerWithMinerRel = Prisma.UserMinerGetPayload<{
  include: { miner: true; ownedMachine: { select: { minerName: true; imageUrl: true } } };
}>;

export type ListedRoomPayload =
  | {
      id: number;
      roomNumber: number;
      unlocked: true;
      pricePaid: number;
      unlockedAt: Date;
      racks: Array<{
        id: number;
        position: number;
        installedAt: Date | null;
        blockedByMinerId: number | null;
        miner: {
          id: number;
          minerId: number | null;
          minerName: string | null;
          hashRate: number;
          imageUrl: string | null;
          imageSource: "owned_snapshot" | "catalog_current" | "none";
          ownedMachineId: number | null;
          level: number;
          slotSize: number;
        } | null;
      }>;
    }
  | { roomNumber: number; unlocked: false; price: number; racks: [] };

export type RoomListQueryRow = Prisma.UserRoomGetPayload<{
  select: {
    id: true;
    roomNumber: true;
    pricePaid: true;
    unlockedAt: true;
    racks: {
      select: {
        id: true;
        position: true;
        installedAt: true;
        blockedByMinerId: true;
        userMinerId: true;
        userMiner: {
          select: {
            id: true;
            minerId: true;
            hashRate: true;
            imageUrl: true;
            level: true;
            slotSize: true;
            ownedMachineId: true;
            ownedMachine: { select: { imageUrl: true; minerName: true } };
            miner: { select: { name: true; imageUrl: true } };
          };
        };
      };
    };
  };
}>;
