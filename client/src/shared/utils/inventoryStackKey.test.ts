import { describe, it, expect } from "vitest";
import { inventoryStackKey } from "./inventoryStackKey";

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

  it("treats string hashRate and float noise as same stack", () => {
    const a = { minerName: "Miner", level: 1, hashRate: "100", slotSize: 1, minerId: 5 };
    const b = { minerName: "Miner", level: 1, hashRate: 100.0000004, slotSize: 1, minerId: 5 };
    expect(inventoryStackKey(a)).toBe(inventoryStackKey(b));
  });

  it("normalizes miner name casing and whitespace", () => {
    const a = { minerName: "  Miner ", level: 1, hashRate: 100, slotSize: 1, minerId: 5 };
    const b = { minerName: "miner", level: 1, hashRate: 100, slotSize: 1, minerId: 5 };
    expect(inventoryStackKey(a)).toBe(inventoryStackKey(b));
  });

  it("maps null and missing minerId to same bucket when other fields match", () => {
    const a = { minerName: "Miner", level: 1, hashRate: 100, slotSize: 1, minerId: null };
    const b = { minerName: "Miner", level: 1, hashRate: 100, slotSize: 1 };
    expect(inventoryStackKey(a)).toBe(inventoryStackKey(b));
  });
});
