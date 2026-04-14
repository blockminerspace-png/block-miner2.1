import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { normalizeShopIdempotencyKey, __resetShopIdempotencyStoreForTests } from "../server/services/shopIdempotencyStore.js";
import {
  beginIdempotencyLease,
  commitIdempotencyResult,
  __resetIdempotencyMemoryForTests,
} from "../server/services/idempotencyService.js";

describe("shop idempotency (shared service)", () => {
  beforeEach(() => {
    __resetShopIdempotencyStoreForTests();
    __resetIdempotencyMemoryForTests();
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

  it("commits and replays the same successful payload for a user + key", async () => {
    const userId = 42;
    const key = "abcd1234-abcd-abcd-abcd-abcdefghijkl";
    const requestHash = "hash-a";
    const phase = await beginIdempotencyLease({
      scope: "shop_purchase",
      userId,
      idempotencyKey: key,
      requestHash,
    });
    assert.equal(phase.type, "lease");
    await commitIdempotencyResult(phase, {
      requestHash,
      responseJson: { newBalance: 10, quantity: 2, minerName: "X", totalPrice: 5 },
    });
    const again = await beginIdempotencyLease({
      scope: "shop_purchase",
      userId,
      idempotencyKey: key,
      requestHash,
    });
    assert.equal(again.type, "replay");
    assert.deepEqual(again.responseJson, { newBalance: 10, quantity: 2, minerName: "X", totalPrice: 5 });
  });

  it("isolates keys per user", async () => {
    const key = "abcd1234-abcd-abcd-abcd-abcdefghijkl";
    const h = "h1";
    const p1 = await beginIdempotencyLease({ scope: "shop_purchase", userId: 1, idempotencyKey: key, requestHash: h });
    const p2 = await beginIdempotencyLease({ scope: "shop_purchase", userId: 2, idempotencyKey: key, requestHash: h });
    assert.equal(p1.type, "lease");
    assert.equal(p2.type, "lease");
    await commitIdempotencyResult(p1, { requestHash: h, responseJson: { newBalance: 1 } });
    await commitIdempotencyResult(p2, { requestHash: h, responseJson: { newBalance: 2 } });
    const r1 = await beginIdempotencyLease({ scope: "shop_purchase", userId: 1, idempotencyKey: key, requestHash: h });
    const r2 = await beginIdempotencyLease({ scope: "shop_purchase", userId: 2, idempotencyKey: key, requestHash: h });
    assert.equal(r1.type, "replay");
    assert.equal(r2.type, "replay");
    assert.deepEqual(r1.responseJson, { newBalance: 1 });
    assert.deepEqual(r2.responseJson, { newBalance: 2 });
  });
});
