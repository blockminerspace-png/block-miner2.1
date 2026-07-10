import test from "node:test";
import assert from "node:assert/strict";
import { REFERRAL_STATS_SINCE } from "#server/models/referralModel.js";

test("REFERRAL_STATS_SINCE is 2026-07-03 UTC", () => {
  assert.equal(REFERRAL_STATS_SINCE.toISOString(), "2026-07-03T00:00:00.000Z");
});
