import { resolveOwnedMachineImageUrl } from "../../utils/ownedMachineImage.js";
import {
  collectCatalogLookupDisplayNames,
  collectEventMinerDisplayNames,
  eventCatalogImageFromMap,
  loadEventMinerCatalogImageMap,
  loadMinerCatalogImageMapByDisplayNames,
  minerCatalogImageFromMap,
} from "../../utils/eventMinerCatalogImage.js";
import { ROOM_MAX, type ListedRoomPayload, type RoomListQueryRow } from "./rooms.types.js";

export function getRoomPrices(): number[] {
  const raw = process.env.ROOM_PRICES || "0,100,500,750";
  return raw.split(",").map((v) => parseFloat(v.trim()));
}

type EventCatalogMaps = {
  eventCatalogMap: Awaited<ReturnType<typeof loadEventMinerCatalogImageMap>>;
  minerNameCatalogMap: Awaited<ReturnType<typeof loadMinerCatalogImageMapByDisplayNames>>;
};

function collectEventNameRows(rooms: RoomListQueryRow[]): Array<{ minerId: number | null; minerName: string | null }> {
  const eventNameRows: Array<{ minerId: number | null; minerName: string | null }> = [];
  for (const room of rooms) {
    for (const rack of room.racks) {
      const um = rack.userMiner;
      if (!um) continue;
      eventNameRows.push({
        minerId: um.minerId,
        minerName: um.miner?.name ?? um.ownedMachine?.minerName ?? null,
      });
    }
  }
  return eventNameRows;
}

export async function loadRoomListCatalogMaps(rooms: RoomListQueryRow[]): Promise<EventCatalogMaps> {
  const eventNameRows = collectEventNameRows(rooms);
  const [eventCatalogMap, minerNameCatalogMap] = await Promise.all([
    loadEventMinerCatalogImageMap(collectEventMinerDisplayNames(eventNameRows)),
    loadMinerCatalogImageMapByDisplayNames(collectCatalogLookupDisplayNames(eventNameRows)),
  ]);
  return { eventCatalogMap, minerNameCatalogMap };
}

function mapRackMiner(
  um: NonNullable<RoomListQueryRow["racks"][number]["userMiner"]>,
  maps: EventCatalogMaps,
) {
  const displayName = um.miner?.name ?? um.ownedMachine?.minerName ?? null;
  const { imageUrl, imageSource } = resolveOwnedMachineImageUrl({
    rowImageUrl: um.imageUrl,
    ownedMachineImageUrl: um.ownedMachine?.imageUrl ?? null,
    catalogImageUrl:
      um.miner?.imageUrl ?? minerCatalogImageFromMap(maps.minerNameCatalogMap, displayName) ?? null,
    eventCatalogImageUrl: eventCatalogImageFromMap(maps.eventCatalogMap, displayName),
  });
  return {
    id: um.id,
    minerId: um.minerId,
    minerName: displayName,
    hashRate: um.hashRate,
    imageUrl,
    imageSource,
    ownedMachineId: um.ownedMachineId,
    level: um.level,
    slotSize: um.slotSize,
  };
}

export function buildListedRoomsPayload(
  rooms: RoomListQueryRow[],
  prices: number[],
  maps: EventCatalogMaps,
): ListedRoomPayload[] {
  const result: ListedRoomPayload[] = [];
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
          miner: rack.userMiner ? mapRackMiner(rack.userMiner, maps) : null,
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
  return result;
}

export function countRackTotals(rooms: RoomListQueryRow[]): {
  totalRacks: number;
  occupiedRacks: number;
  freeRacks: number;
} {
  const totalRacks = rooms.reduce((s, r) => s + r.racks.length, 0);
  const occupiedRacks = rooms.reduce(
    (s, r) =>
      s + r.racks.filter((rack) => rack.userMinerId != null || rack.blockedByMinerId != null).length,
    0,
  );
  return { totalRacks, occupiedRacks, freeRacks: totalRacks - occupiedRacks };
}
