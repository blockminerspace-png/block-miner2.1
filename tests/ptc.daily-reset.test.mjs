import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getUtcCalendarDate,
  getNextUtcResetAt,
  msUntilNextUtcReset,
  wasViewedOnUtcDate,
  utcDateFromNow,
} from "../server/modules/ptc/ptc.utc.ts";
import { SESSION_STALE_MS, SESSION_CLAIM_WINDOW_MS } from "../server/modules/ptc/ptc.config.ts";

describe("PTC UTC daily reset", () => {
  it("formats UTC calendar date from ISO instant", () => {
    assert.equal(getUtcCalendarDate(new Date("2026-07-05T23:59:00.000Z")), "2026-07-05");
    assert.equal(getUtcCalendarDate(new Date("2026-07-06T00:00:00.000Z")), "2026-07-06");
  });

  it("next reset is always 00:00 UTC of the following day", () => {
    const now = new Date("2026-07-05T15:30:00.000Z");
    assert.equal(getNextUtcResetAt(now).toISOString(), "2026-07-06T00:00:00.000Z");
    assert.equal(msUntilNextUtcReset(now), 8.5 * 60 * 60 * 1000);
  });

  it("view blocked only when last viewed on same UTC day", () => {
    const now = new Date("2026-07-05T20:00:00.000Z");
    const viewedMorning = utcDateFromNow(new Date("2026-07-05T09:00:00.000Z"));
    const viewedYesterday = utcDateFromNow(new Date("2026-07-04T23:59:00.000Z"));

    assert.equal(wasViewedOnUtcDate(viewedMorning, null, now), true);
    assert.equal(wasViewedOnUtcDate(viewedYesterday, null, now), false);
    assert.equal(
      wasViewedOnUtcDate(null, new Date("2026-07-05T00:10:00.000Z"), now),
      true,
    );
  });

  it("defines expected session timeouts", () => {
    assert.equal(SESSION_STALE_MS, 90_000);
    assert.equal(SESSION_CLAIM_WINDOW_MS, 2 * 60 * 60 * 1000);
  });
});
