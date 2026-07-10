import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCheckinPeriodEndKey,
  getCurrentCheckinPeriod,
  isSameCheckinPeriod,
  isPreviousPeriodEndKey,
  getCheckinPeriodLookupKeys,
} from "#server/modules/checkin/checkin.calendar.js";

const TZ = "America/Sao_Paulo";
const cfg = { timezone: TZ, resetHour: 21, graceHours: 6 };

describe("checkin.calendar (period end dateKey)", () => {
  it("before reset uses civil day as end key", () => {
    const now = new Date("2026-05-20T13:00:00-03:00");
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-20");
  });

  it("after reset uses next civil day as end key", () => {
    const now = new Date("2026-05-19T22:00:00-03:00");
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-20");
  });

  it("legacy start key does not match same period as end key", () => {
    assert.equal(isSameCheckinPeriod("2026-05-19", "2026-05-20"), false);
    assert.equal(isSameCheckinPeriod("2026-05-20", "2026-05-20"), true);
    assert.equal(isSameCheckinPeriod("2026-05-18", "2026-05-20"), false);
  });

  it("previous period end is distinct from current", () => {
    assert.equal(isPreviousPeriodEndKey("2026-05-19", "2026-05-20"), true);
    assert.equal(isSameCheckinPeriod("2026-05-19", "2026-05-20"), false);
    assert.equal(isPreviousPeriodEndKey("2026-05-18", "2026-05-20"), false);
  });

  it("morning after yesterday check-in: new period, not same as legacy row", () => {
    const now = new Date("2026-05-20T10:00:00-03:00");
    const current = getCheckinPeriodEndKey(now, cfg);
    assert.equal(current, "2026-05-20");
    assert.equal(isSameCheckinPeriod("2026-05-19", current), false);
  });

  it("lookup keys do not include legacy start alias", () => {
    const keys = getCheckinPeriodLookupKeys("2026-05-20");
    assert.equal(keys.includes("2026-05-20"), true);
    assert.equal(keys.includes("2026-05-19"), false);
  });

  it("current period window spans 21:00 to 20:59 BRT", () => {
    const now = new Date("2026-05-20T10:00:00-03:00");
    const period = getCurrentCheckinPeriod(now, cfg);
    assert.equal(period.dateKey, "2026-05-20");
    assert.equal(period.resetHour, 21);
    assert.ok(period.startsAt < period.endsAt);
    assert.ok(period.endsAt < period.nextResetAt);
  });

  it("one second before reset (20:59:59 BRT) stays in the same period", () => {
    // 20:59:59 BRT May 20 = 23:59:59 UTC May 20 → period "2026-05-20"
    const now = new Date("2026-05-20T23:59:59Z");
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-20");
  });

  it("exactly at reset instant (21:00:00 BRT) opens a new period", () => {
    // 21:00:00 BRT May 20 = 00:00:00 UTC May 21 → period "2026-05-21"
    const now = new Date("2026-05-21T00:00:00Z");
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-21");
  });

  it("midnight BRT (03:00 UTC) is within grace of the period that just reset", () => {
    // 00:00:00 BRT May 21 = 03:00:00 UTC May 21 → period "2026-05-21" (hour < 21)
    const now = new Date("2026-05-21T03:00:00Z");
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-21");
  });

  it("23:59 BRT (same day) is before reset and uses same period key", () => {
    // 23:59:59 BRT May 20 crosses midnight UTC but is still before 21:00 BRT?
    // Wait: 23:59 BRT May 20 = 02:59 UTC May 21 → hour=23 >= 21 → key "2026-05-21"
    const now = new Date("2026-05-21T02:59:00Z"); // 23:59 BRT May 20
    assert.equal(getCheckinPeriodEndKey(now, cfg), "2026-05-21");
  });

  it("same instant returns the same period key (determinism)", () => {
    const now = new Date("2026-05-20T15:30:00Z");
    assert.equal(getCheckinPeriodEndKey(now, cfg), getCheckinPeriodEndKey(now, cfg));
  });
});
