import { describe, it, expect } from "vitest";
import { dedupeOccupiedSlotsForDismantle } from "./inventoryRackUtils";

describe("dedupeOccupiedSlotsForDismantle", () => {
  it("keeps one entry per userMiner id", () => {
    const slots = [
      { id: 10, miner: { id: 99, hashRate: 5 } },
      { id: 11, miner: { id: 99, hashRate: 5 } },
      { id: 12, miner: { id: 100, hashRate: 3 } },
    ];
    const d = dedupeOccupiedSlotsForDismantle(slots);
    expect(d.map((x) => x.id)).toEqual([10, 12]);
  });

  it("drops slots without miner or id", () => {
    expect(dedupeOccupiedSlotsForDismantle([{ id: 1 }, { miner: {} }])).toEqual([]);
  });
});
