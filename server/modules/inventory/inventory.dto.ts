import {
  eventCatalogImageFromMap,
  minerCatalogImageFromMap,
} from "../../utils/eventMinerCatalogImage.js";
import { resolveOwnedMachineImageUrl } from "../../utils/ownedMachineImage.js";
import type { InventoryListRow } from "./inventory.types.js";

export function mapInventoryItemDto(
  row: InventoryListRow,
  eventCatalogMap: Map<string, string | null>,
  minerNameCatalogMap: Map<string, string | null>,
) {
  const { ownedMachine, miner, ...rest } = row;
  const { imageUrl, imageSource } = resolveOwnedMachineImageUrl({
    rowImageUrl: row.imageUrl,
    ownedMachineImageUrl: ownedMachine?.imageUrl ?? null,
    catalogImageUrl: miner?.imageUrl ?? minerCatalogImageFromMap(minerNameCatalogMap, row.minerName) ?? null,
    eventCatalogImageUrl: eventCatalogImageFromMap(eventCatalogMap, row.minerName),
  });
  return {
    ...rest,
    ownedMachineId: rest.ownedMachineId ?? ownedMachine?.id ?? null,
    imageUrl,
    imageSource,
  };
}
