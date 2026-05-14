import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDaysToBrazilDateKey,
  getBrazilDateKeyAliases,
  getBrazilCheckinDateKey,
  getBrazilIsoWeekPeriodKey,
  getBrazilMonthPeriodKey,
  normalizeBrazilDateKey
} from "#server/utils/checkinDate.js";

describe("check-in period keys (Brazil calendar)", () => {
  it("month key matches YYYY-MM prefix of Brazil day key", () => {
    const d = new Date("2026-08-20T15:00:00Z");
    const day = getBrazilCheckinDateKey(d);
    const month = getBrazilMonthPeriodKey(d);
    assert.equal(month, day.slice(0, 7));
    assert.match(month, /^\d{4}-\d{2}$/);
  });

  it("ISO week key matches expected pattern", () => {
    const d = new Date("2026-04-14T12:00:00Z");
    const w = getBrazilIsoWeekPeriodKey(d);
    assert.match(w, /^\d{4}-W\d{2}$/);
  });

  it("is stable for the same instant", () => {
    const d = new Date("2026-01-05T18:30:00Z");
    assert.equal(getBrazilIsoWeekPeriodKey(d), getBrazilIsoWeekPeriodKey(d));
    assert.equal(getBrazilMonthPeriodKey(d), getBrazilMonthPeriodKey(d));
  });

  it("normalizes legacy date key shapes to YYYY-MM-DD", () => {
    assert.equal(normalizeBrazilDateKey("2026-4-8"), "2026-04-08");
    assert.equal(normalizeBrazilDateKey("2026/04/08"), "2026-04-08");
    assert.equal(normalizeBrazilDateKey("04/08/2026"), "2026-04-08");
    assert.equal(normalizeBrazilDateKey("4/8/2026"), "2026-04-08");
  });

  it("exposes same-day aliases used to recover legacy check-ins", () => {
    const aliases = new Set(getBrazilDateKeyAliases("2026-04-08"));
    assert.equal(aliases.has("2026-04-08"), true);
    assert.equal(aliases.has("2026-4-8"), true);
    assert.equal(aliases.has("2026/04/08"), true);
    assert.equal(aliases.has("04/08/2026"), true);
    assert.equal(aliases.has("4/8/2026"), true);
  });

  it("adds days using the normalized Brazil calendar key", () => {
    assert.equal(addDaysToBrazilDateKey("2026-4-8", 1), "2026-04-09");
    assert.equal(addDaysToBrazilDateKey("04/08/2026", -1), "2026-04-07");
  });
});
