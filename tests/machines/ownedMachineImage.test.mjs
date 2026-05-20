import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStockPlaceholderMinerImageUrl,
  normalizePersistableMinerImageUrl,
  resolveOwnedMachineImageUrl,
} from "#server/utils/ownedMachineImage.js";

describe("ownedMachineImage", () => {
  it("detects stock placeholder paths", () => {
    assert.equal(isStockPlaceholderMinerImageUrl("/machines/reward1.png"), true);
    assert.equal(isStockPlaceholderMinerImageUrl("/uploads/miners/a.png"), false);
  });

  it("does not persist stock placeholders", () => {
    assert.equal(normalizePersistableMinerImageUrl("/machines/reward1.png"), null);
    assert.equal(normalizePersistableMinerImageUrl("/uploads/miners/x.png"), "/uploads/miners/x.png");
  });

  it("prioritizes current catalog over owned snapshot", () => {
    const a = resolveOwnedMachineImageUrl({
      rowImageUrl: "/uploads/miners/old.png",
      ownedMachineImageUrl: "/uploads/miners/snap.png",
      catalogImageUrl: "/uploads/miners/new-catalog.png",
    });
    assert.equal(a.imageUrl, "/uploads/miners/new-catalog.png");
    assert.equal(a.imageSource, "catalog_current");
  });

  it("falls back to catalog when snapshot missing", () => {
    const b = resolveOwnedMachineImageUrl({
      rowImageUrl: "/machines/reward1.png",
      ownedMachineImageUrl: null,
      catalogImageUrl: "/uploads/miners/cat.png",
    });
    assert.equal(b.imageUrl, "/uploads/miners/cat.png");
    assert.equal(b.imageSource, "catalog_current");
  });

  it("returns none when no real image exists", () => {
    const c = resolveOwnedMachineImageUrl({
      rowImageUrl: "/machines/reward2.png",
      catalogImageUrl: "/machines/1.png",
    });
    assert.equal(c.imageUrl, null);
    assert.equal(c.imageSource, "none");
  });
});
