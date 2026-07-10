import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeCheckinStreakFromDateKeys } from "#server/utils/checkinStreak.js";

// BRT = UTC-3. Period resets at 21:00 BRT = 00:00 UTC next civil day.
// Period end key = civil day when the period closes.
// E.g. 22:00 BRT Apr 28 → key "2026-04-29" (period started at 21h Apr 28, closes at 21h Apr 29)

describe("computeCheckinStreakFromDateKeys", () => {
  it("keeps the streak on the next day before today's check-in", () => {
    // 12:00 UTC = 09:00 BRT Apr 29 → current period key "2026-04-29" (before 21h)
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["2026-04-28", "2026-04-27", "2026-04-26"],
      now
    );
    assert.equal(streak, 3);
  });

  it("counts legacy same-day keys instead of resetting to zero", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["4/28/2026", "2026-04-27", "2026-4-26"],
      now
    );
    assert.equal(streak, 3);
  });

  it("resets only when there is a real gap in the previous day", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["2026-04-27", "2026-04-26", "2026-04-24"],
      now
    );
    assert.equal(streak, 0);
  });

  it("starts a new streak at one after a comeback check-in", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["2026-04-29", "2026-04-27", "2026-04-26"],
      now
    );
    assert.equal(streak, 1);
  });

  it("returns 0 for empty history", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    assert.equal(computeCheckinStreakFromDateKeys([], now), 0);
  });

  // 21:00 BRT = 00:00 UTC next civil day. At exactly 00:00 UTC Apr 29,
  // the current period key becomes "2026-04-29" (new period just opened).
  it("correctly identifies period key just after 21:00 BRT reset (00:00 UTC)", () => {
    // 00:00:01 UTC Apr 29 = 21:00:01 BRT Apr 28 → new period → key "2026-04-29"
    const now = new Date("2026-04-29T00:00:01Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["2026-04-28", "2026-04-27"],
      now
    );
    // Current period key is "2026-04-29", not yet checked in.
    // Yesterday's key is "2026-04-28" which IS in the set → streak = 2
    assert.equal(streak, 2);
  });

  it("one second before 21:00 BRT reset: same-day check-in still counts", () => {
    // 23:59:59 UTC Apr 28 = 20:59:59 BRT Apr 28 → period key "2026-04-28"
    const now = new Date("2026-04-28T23:59:59Z");
    const streak = computeCheckinStreakFromDateKeys(
      ["2026-04-28", "2026-04-27", "2026-04-26"],
      now
    );
    // Current period key "2026-04-28" IS in the set → streak = 3
    assert.equal(streak, 3);
  });

  it("keys in any order produce the same streak (Set-based, order-independent)", () => {
    const now = new Date("2026-04-29T12:00:00Z");
    const keysAsc = ["2026-04-26", "2026-04-27", "2026-04-28"];
    const keysDesc = ["2026-04-28", "2026-04-27", "2026-04-26"];
    const keysMixed = ["2026-04-27", "2026-04-28", "2026-04-26"];
    assert.equal(computeCheckinStreakFromDateKeys(keysAsc, now), 3);
    assert.equal(computeCheckinStreakFromDateKeys(keysDesc, now), 3);
    assert.equal(computeCheckinStreakFromDateKeys(keysMixed, now), 3);
  });

  it("simulates streak recovery: keys include 2 missed days filled in, streak continues", () => {
    // User had streak of 5 (Apr 24–28), missed Apr 29 and Apr 30, paid recovery.
    // Now it's May 1 (12:00 UTC = 09:00 BRT, period key "2026-05-01").
    // Recovery inserted "2026-04-29" and "2026-04-30".
    const now = new Date("2026-05-01T12:00:00Z");
    const keys = [
      "2026-04-24", "2026-04-25", "2026-04-26", "2026-04-27", "2026-04-28",
      "2026-04-29", // recovery
      "2026-04-30", // recovery
    ];
    // Current period "2026-05-01" not yet checked in.
    // Yesterday "2026-04-30" IS in set → streak = 7
    assert.equal(computeCheckinStreakFromDateKeys(keys, now), 7);
  });

  it("grace window: shows pre-gap streak when within 6h of missed period reset", () => {
    // 03:00 UTC Apr 29 = 00:00 BRT Apr 29 = 3h after 21:00 BRT Apr 28 reset.
    // Grace window for period "2026-04-28" ends at 21:00 BRT Apr 28 + 6h = 03:00 BRT Apr 29 = 06:00 UTC.
    // At 03:00 UTC we're inside grace → should show streak from day before yesterday (2026-04-27).
    const now = new Date("2026-04-29T06:00:00Z"); // exactly at grace end
    const keys = ["2026-04-27", "2026-04-26", "2026-04-25"];
    // Current period "2026-04-29" not checked in.
    // Yesterday "2026-04-28" not in set.
    // isWithinGraceForPeriod("2026-04-28", now) — grace ends at 00:00 UTC Apr 29 + 6h = 06:00 UTC.
    // now = exactly 06:00 UTC → at/just past grace boundary.
    // This test covers the boundary; the exact result depends on <= vs <.
    // The check is `now.getTime() <= end.getTime()` so 06:00 UTC is included.
    assert.equal(computeCheckinStreakFromDateKeys(keys, now), 3);
  });
});
