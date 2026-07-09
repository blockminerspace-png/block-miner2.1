import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  endOfBrazilDay,
  isEarnedInBrazilDay,
  isInstantBeforeBrazilDay,
  startOfBrazilDay,
} from "#server/utils/brazilDayBounds.js";

describe("brazilDayBounds", () => {
  it("treats 00:30 UTC as previous Brazil day", () => {
    const now = new Date("2026-07-09T00:30:00.000Z");
    assert.equal(startOfBrazilDay(now).toISOString(), "2026-07-08T03:00:00.000Z");
    assert.equal(endOfBrazilDay(now).toISOString(), "2026-07-09T03:00:00.000Z");
  });

  it("detects earnings inside the Brazil day window", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    assert.equal(isEarnedInBrazilDay(new Date("2026-07-09T04:00:00.000Z"), now), true);
    assert.equal(isEarnedInBrazilDay(new Date("2026-07-09T02:00:00.000Z"), now), false);
  });

  it("flags activity before today's Brazil day", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    assert.equal(isInstantBeforeBrazilDay(new Date("2026-07-09T02:00:00.000Z"), now), true);
    assert.equal(isInstantBeforeBrazilDay(new Date("2026-07-09T04:00:00.000Z"), now), false);
  });
});
