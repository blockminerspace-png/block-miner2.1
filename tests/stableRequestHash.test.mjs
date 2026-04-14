import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stableRequestHash } from "../server/utils/stableRequestHash.js";

describe("stableRequestHash", () => {
  it("is stable under key reordering for nested objects", () => {
    const a = stableRequestHash({ z: 1, a: { m: 2, b: 3 } });
    const b = stableRequestHash({ a: { b: 3, m: 2 }, z: 1 });
    assert.equal(a, b);
  });

  it("changes when a field value changes", () => {
    const a = stableRequestHash({ minerId: 1, quantity: 2 });
    const b = stableRequestHash({ minerId: 1, quantity: 3 });
    assert.notEqual(a, b);
  });

  it("ignores cfTurnstileToken in nested body for idempotency binding", () => {
    const a = stableRequestHash({
      body: { minerId: 1, quantity: 2, cfTurnstileToken: "aaa" },
      params: {},
      path: "/x",
    });
    const b = stableRequestHash({
      body: { minerId: 1, quantity: 2, cfTurnstileToken: "bbb" },
      params: {},
      path: "/x",
    });
    assert.equal(a, b);
  });
});
