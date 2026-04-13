import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetShopIdempotencyStoreForTests,
  getShopIdempotencyPayload,
  normalizeShopIdempotencyKey,
  setShopIdempotencyPayload,
} from "../server/services/shopIdempotencyStore.js";

describe("shopIdempotencyStore", () => {
  beforeEach(() => {
    __resetShopIdempotencyStoreForTests();
  });

  it("normalizeShopIdempotencyKey accepts UUID-like keys", () => {
    const k = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
    assert.equal(normalizeShopIdempotencyKey(k), k);
  });

  it("normalizeShopIdempotencyKey rejects short or invalid keys", () => {
    assert.equal(normalizeShopIdempotencyKey("short"), null);
    assert.equal(normalizeShopIdempotencyKey("bad space"), null);
    assert.equal(normalizeShopIdempotencyKey(""), null);
  });

  it("returns stored payload for same user and key", () => {
    const userId = 42;
    const key = "abcd1234-abcd-abcd-abcd-abcdefghijkl";
    setShopIdempotencyPayload(userId, key, { newBalance: 10, quantity: 2, minerName: "X", totalPrice: 5 });
    const got = getShopIdempotencyPayload(userId, key);
    assert.deepEqual(got, { newBalance: 10, quantity: 2, minerName: "X", totalPrice: 5 });
  });

  it("isolates keys per user", () => {
    const key = "abcd1234-abcd-abcd-abcd-abcdefghijkl";
    setShopIdempotencyPayload(1, key, { newBalance: 1 });
    setShopIdempotencyPayload(2, key, { newBalance: 2 });
    assert.equal(getShopIdempotencyPayload(1, key).newBalance, 1);
    assert.equal(getShopIdempotencyPayload(2, key).newBalance, 2);
  });
});
