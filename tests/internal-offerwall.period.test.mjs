import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countDailyCompletions,
  getInternalOfferwallPeriodKey,
  getNextInternalOfferwallResetAt,
} from "#server/modules/internal-offerwall/internal-offerwall.period.js";
import { RESET_TYPE_DAILY } from "#server/modules/internal-offerwall/internal-offerwall.config.js";

describe("internal-offerwall.period", () => {
  it("uses Brazil calendar day as period key", () => {
    const atUtcMidnight = new Date("2026-07-09T00:30:00.000Z");
    assert.equal(getInternalOfferwallPeriodKey(atUtcMidnight), "2026-07-08");
  });

  it("next reset is midnight Brasília (03:00 UTC when offset is -03)", () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    assert.equal(getNextInternalOfferwallResetAt(now).toISOString(), "2026-07-10T03:00:00.000Z");
  });

  it("counts legacy UTC period keys on the same Brazil day", () => {
    const periodKey = "2026-07-08";
    const count = countDailyCompletions(
      [
        { periodKey: "2026-07-09", completedAt: new Date("2026-07-09T01:00:00.000Z") },
        { periodKey: "2026-07-08", completedAt: new Date("2026-07-08T23:00:00.000Z") },
      ],
      periodKey,
      RESET_TYPE_DAILY,
    );
    assert.equal(count, 2);
  });
});
