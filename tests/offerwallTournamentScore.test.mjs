import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capZeradsPoints,
  scoringConfigPayload,
  ZERADS_SCORING_MODE,
} from "#server/modules/tournaments/offerwallTournamentScore.js";
import { ZERADS_MAX_CLICKS_PER_UTC_DAY } from "#server/modules/zerads/zeradsClickLimits.js";
import { sanitizeAdminDateRange, parseOptionalUserId } from "#server/utils/sanitizeAdminDateRange.js";

describe("offerwallTournamentScore", () => {
  it("caps zerads per UTC day", () => {
    assert.equal(capZeradsPoints(69), 69);
    assert.equal(capZeradsPoints(999), ZERADS_MAX_CLICKS_PER_UTC_DAY);
  });

  it("exposes clicks + per-day cap in config", () => {
    const cfg = scoringConfigPayload();
    assert.equal(cfg.zeradsMode, ZERADS_SCORING_MODE);
    assert.equal(cfg.zeradsMaxPerUtcDay, ZERADS_MAX_CLICKS_PER_UTC_DAY);
  });
});

describe("sanitizeAdminDateRange", () => {
  it("defaults to 7-day window ending now", () => {
    const r = sanitizeAdminDateRange(undefined, undefined);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const days = (r.range.to.getTime() - r.range.from.getTime()) / (24 * 60 * 60 * 1000);
    assert.ok(days <= 7);
    assert.ok(r.range.serverNow);
    assert.ok(r.range.serverNowBrt);
  });

  it("rejects from after to", () => {
    const r = sanitizeAdminDateRange("2026-07-10T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
    assert.equal(r.ok, false);
  });

  it("rejects range over 90 days", () => {
    const r = sanitizeAdminDateRange("2025-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z");
    assert.equal(r.ok, false);
  });
});

describe("parseOptionalUserId", () => {
  it("parses positive integers only", () => {
    assert.equal(parseOptionalUserId("294"), 294);
    assert.equal(parseOptionalUserId(""), null);
    assert.equal(parseOptionalUserId("abc"), null);
    assert.equal(parseOptionalUserId("-1"), null);
  });
});
