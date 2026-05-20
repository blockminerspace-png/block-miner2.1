import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const inventoryController = readFileSync(
  new URL("../../server/controllers/inventoryController.ts", import.meta.url),
  "utf8",
);
const roomsController = readFileSync(
  new URL("../../server/controllers/roomsController.ts", import.meta.url),
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
    assert.match(inventoryController, /resolveOwnedMachineImageUrl/);
    assert.match(inventoryController, /imageSource/);
    assert.doesNotMatch(inventoryController, /DEFAULT_MINER_IMAGE_URL/);
  });

  it("rack list resolves miner image from snapshot helper", () => {
    assert.match(roomsController, /resolveOwnedMachineImageUrl/);
    assert.match(roomsController, /ownedMachine:\s*\{\s*select:\s*\{\s*imageUrl:\s*true\s*\}/);
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
