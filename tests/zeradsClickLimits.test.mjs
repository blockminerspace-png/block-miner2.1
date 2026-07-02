import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateZeradsClicksPerUser,
  capZeradsClicksForUtcDay,
  ZERADS_MAX_CLICKS_PER_UTC_DAY,
} from "#server/modules/zerads/zeradsClickLimits.js";

describe("zeradsClickLimits UTC", () => {
  it("caps each UTC day at platform max", () => {
    assert.equal(capZeradsClicksForUtcDay(0), 0);
    assert.equal(capZeradsClicksForUtcDay(69), 69);
    assert.equal(capZeradsClicksForUtcDay(159), ZERADS_MAX_CLICKS_PER_UTC_DAY);
  });

  it("aggregates per user with per-day cap", () => {
    const day = new Date("2026-07-01T12:00:00.000Z");
    const map = aggregateZeradsClicksPerUser([
      { userId: 90, callbackAt: day, clicks: 80 },
      { userId: 90, callbackAt: new Date("2026-07-01T18:00:00.000Z"), clicks: 79 },
    ]);
    const t = map.get(90);
    assert.equal(t?.raw, 159);
    assert.equal(t?.credited, 100);
  });
});
