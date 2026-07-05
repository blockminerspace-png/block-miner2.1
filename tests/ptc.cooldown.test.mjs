import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getViewCooldownCutoff } from "../server/modules/ptc/ptc.repository.ts";
import { VIEW_COOLDOWN_MS, SESSION_STALE_MS, SESSION_CLAIM_WINDOW_MS } from "../server/modules/ptc/ptc.config.ts";

describe("PTC cooldown helpers", () => {
  it("uses rolling 24h UTC window for view cutoff", () => {
    const now = new Date("2026-07-05T15:00:00.000Z");
    const cutoff = getViewCooldownCutoff(now);
    assert.equal(cutoff.getTime(), now.getTime() - VIEW_COOLDOWN_MS);
  });

  it("defines expected session timeouts", () => {
    assert.equal(VIEW_COOLDOWN_MS, 24 * 60 * 60 * 1000);
    assert.equal(SESSION_STALE_MS, 90_000);
    assert.equal(SESSION_CLAIM_WINDOW_MS, 2 * 60 * 60 * 1000);
  });
});
