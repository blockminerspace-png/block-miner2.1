import { describe, it, expect } from "vitest";
import { inventoryStackKey } from "./inventoryStackKey.js";

describe("inventoryStackKey", () => {
  it("groups identical catalog rows", () => {
    const a = { minerName: "Miner", level: 1, hashRate: 100, slotSize: 1, minerId: 5 };
    const b = { minerName: "Miner", level: 1, hashRate: 100, slotSize: 1, minerId: 5 };
    expect(inventoryStackKey(a)).toBe(inventoryStackKey(b));
  });

  it("separates different stats", () => {
    const a = { minerName: "Miner", level: 1, hashRate: 100, slotSize: 1, minerId: 5 };
    const b = { minerName: "Miner", level: 2, hashRate: 100, slotSize: 1, minerId: 5 };
    expect(inventoryStackKey(a)).not.toBe(inventoryStackKey(b));
  });
});
