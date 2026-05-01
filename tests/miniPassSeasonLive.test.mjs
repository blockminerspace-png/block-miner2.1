import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getMiniPassSeasonState,
  isMiniPassSeasonLive,
  isMiniPassSeasonVisible
} from "../server/services/miniPass/miniPassSeasonLive.js";

function makeSeason(overrides = {}) {
  return {
    deletedAt: null,
    isActive: true,
    startsAt: new Date("2026-05-01T00:00:00.000Z"),
    endsAt: new Date("2026-05-08T23:59:59.000Z"),
    ...overrides
  };
}

describe("miniPass season live state", () => {
  it("hides inactive or deleted seasons", () => {
    assert.equal(getMiniPassSeasonState(makeSeason({ isActive: false })), "hidden");
    assert.equal(getMiniPassSeasonState(makeSeason({ deletedAt: new Date() })), "hidden");
    assert.equal(isMiniPassSeasonVisible(makeSeason({ isActive: false })), false);
  });

  it("marks future visible seasons as upcoming", () => {
    const season = makeSeason();
    const now = new Date("2026-04-28T12:00:00.000Z");
    assert.equal(getMiniPassSeasonState(season, now), "upcoming");
    assert.equal(isMiniPassSeasonVisible(season, now), true);
    assert.equal(isMiniPassSeasonLive(season, now), false);
  });

  it("marks in-window seasons as live", () => {
    const season = makeSeason();
    const now = new Date("2026-05-04T12:00:00.000Z");
    assert.equal(getMiniPassSeasonState(season, now), "live");
    assert.equal(isMiniPassSeasonVisible(season, now), true);
    assert.equal(isMiniPassSeasonLive(season, now), true);
  });

  it("marks past seasons as ended", () => {
    const season = makeSeason();
    const now = new Date("2026-05-09T00:00:00.000Z");
    assert.equal(getMiniPassSeasonState(season, now), "ended");
    assert.equal(isMiniPassSeasonVisible(season, now), false);
    assert.equal(isMiniPassSeasonLive(season, now), false);
  });
});
