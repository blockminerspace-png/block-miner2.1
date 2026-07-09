import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  __testBurstAuditDedupeWouldWrite,
  _resetBurstAuditDedupeForTests,
} from "#server/modules/games/gameBurstGuard.js";

describe("gameBurstGuard dedupe", () => {
  beforeEach(() => {
    _resetBurstAuditDedupeForTests();
  });

  it("allows only one burst audit per user+game per minute", () => {
    const now = new Date("2026-07-09T14:30:15.000Z");
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", now), true);
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", now), false);
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", now), false);
  });

  it("scopes dedupe per game slug", () => {
    const now = new Date("2026-07-09T14:30:15.000Z");
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", now), true);
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "cart-rush", now), true);
  });

  it("allows a new audit in the next clock minute", () => {
    const minute1 = new Date("2026-07-09T14:30:59.000Z");
    const minute2 = new Date("2026-07-09T14:31:00.000Z");
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", minute1), true);
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", minute1), false);
    assert.equal(__testBurstAuditDedupeWouldWrite(42, "crypto-memory", minute2), true);
  });
});
