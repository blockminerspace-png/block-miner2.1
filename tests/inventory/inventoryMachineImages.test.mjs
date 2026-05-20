import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const inventoryService = readFileSync(
  new URL("../../server/modules/inventory/inventory.service.ts", import.meta.url),
  "utf8",
);
const inventoryDto = readFileSync(
  new URL("../../server/modules/inventory/inventory.dto.ts", import.meta.url),
  "utf8",
);
const roomsService = readFileSync(
  new URL("../../server/modules/rooms/rooms.service.ts", import.meta.url),
  "utf8",
);
const roomsDto = readFileSync(
  new URL("../../server/modules/rooms/rooms.dto.ts", import.meta.url),
  "utf8",
);
const roomsRepository = readFileSync(
  new URL("../../server/modules/rooms/rooms.repository.ts", import.meta.url),
  "utf8",
);
const shopController = readFileSync(
  new URL("../../server/modules/shop/shop.controller.ts", import.meta.url),
  "utf8",
);
const machineTs = readFileSync(
  new URL("../../client/src/shared/utils/machine.ts", import.meta.url),
  "utf8",
);

describe("inventory machine image wiring", () => {
  it("getInventory maps imageUrl via ownedMachineImage helper", () => {
    assert.match(inventoryService, /resolveOwnedMachineImageUrl/);
    assert.match(inventoryDto, /imageSource/);
    assert.doesNotMatch(inventoryService, /DEFAULT_MINER_IMAGE_URL/);
    assert.doesNotMatch(inventoryDto, /DEFAULT_MINER_IMAGE_URL/);
  });

  it("rack list resolves miner image from snapshot helper", () => {
    assert.match(roomsDto, /resolveOwnedMachineImageUrl/);
    assert.match(roomsDto, /imageSource/);
    assert.match(
      roomsRepository,
      /ownedMachine:\s*\{\s*select:\s*\{\s*imageUrl:\s*true,\s*minerName:\s*true\s*\}/,
    );
    assert.doesNotMatch(roomsService, /DEFAULT_MINER_IMAGE_URL/);
  });

  it("shop purchase does not persist reward1 placeholder", () => {
    assert.match(shopController, /normalizePersistableMinerImageUrl/);
    assert.doesNotMatch(shopController, /DEFAULT_MINER_IMAGE_URL/);
  });

  it("getMachineDescriptor does not assign hashrate stock images", () => {
    assert.doesNotMatch(machineTs, /image = "\/machines\//);
    assert.match(machineTs, /image: string \| null/);
  });
});
