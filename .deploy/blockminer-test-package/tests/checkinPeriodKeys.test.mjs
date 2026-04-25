import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBrazilCheckinDateKey,
  getBrazilIsoWeekPeriodKey,
  getBrazilMonthPeriodKey
} from "../server/utils/checkinDate.js";

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
});
