import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  endOfBrazilDay,
  isEarnedInBrazilDay,
  isInstantBeforeBrazilDay,
  startOfBrazilDay,
} from "#server/utils/brazilDayBounds.js";

describe("brazilDayBounds (UTC aliases)", () => {
  it("uses UTC midnight as day boundaries", () => {
    const now = new Date("2026-07-09T00:30:00.000Z");
    assert.equal(startOfBrazilDay(now).toISOString(), "2026-07-09T00:00:00.000Z");
    assert.equal(endOfBrazilDay(now).toISOString(), "2026-07-10T00:00:00.000Z");
  });

  it("detects earnings inside the UTC day window", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    assert.equal(isEarnedInBrazilDay(new Date("2026-07-09T04:00:00.000Z"), now), true);
    assert.equal(isEarnedInBrazilDay(new Date("2026-07-08T23:00:00.000Z"), now), false);
  });

  it("flags activity before today's UTC day", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    assert.equal(isInstantBeforeBrazilDay(new Date("2026-07-08T23:00:00.000Z"), now), true);
    assert.equal(isInstantBeforeBrazilDay(new Date("2026-07-09T04:00:00.000Z"), now), false);
  });
});
