import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeCheckinStreakFromDateKeys } from "#server/utils/checkinStreak.js";

describe("computeCheckinStreakFromDateKeys", () => {
  it("keeps the streak on the next day before today's check-in", () => {
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
});
