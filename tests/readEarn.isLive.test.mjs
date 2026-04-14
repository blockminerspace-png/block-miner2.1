import { test } from "node:test";
import assert from "node:assert/strict";
import { isReadEarnCampaignLive } from "../server/services/readEarnService.js";

test("isReadEarnCampaignLive requires active flag and date window", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  const live = {
    isActive: true,
    startsAt: new Date("2026-06-01T00:00:00Z"),
    expiresAt: new Date("2026-06-30T23:59:59Z")
  };
  assert.equal(isReadEarnCampaignLive(live, now), true);
  assert.equal(isReadEarnCampaignLive({ ...live, isActive: false }, now), false);
  assert.equal(
    isReadEarnCampaignLive({ ...live, startsAt: new Date("2026-06-20T00:00:00Z") }, now),
    false
  );
  assert.equal(
    isReadEarnCampaignLive({ ...live, expiresAt: new Date("2026-06-10T00:00:00Z") }, now),
    false
  );
  assert.equal(isReadEarnCampaignLive(null, now), false);
});
