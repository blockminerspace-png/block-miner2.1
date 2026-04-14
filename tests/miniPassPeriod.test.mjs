import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveMissionPeriodKey,
  utcDayKey,
  utcIsoWeekKey
} from "../server/services/miniPass/miniPassPeriod.js";
import {
  CADENCE_DAILY,
  CADENCE_EVENT,
  CADENCE_WEEKLY,
  EVENT_PERIOD_KEY,
  MISSION_LOGIN_DAY,
  MISSION_PLAY_GAMES
} from "../server/services/miniPass/miniPassConstants.js";

describe("miniPassPeriod helpers", () => {
  it("builds UTC day keys", () => {
    const d = new Date("2026-04-14T23:59:59.000Z");
    assert.equal(utcDayKey(d), "2026-04-14");
  });

  it("builds deterministic UTC ISO week keys", () => {
    const d = new Date("2026-04-14T10:00:00.000Z");
    assert.equal(utcIsoWeekKey(d), "2026-W16");
  });

  it("resolves event cadence to event period key", () => {
    assert.equal(resolveMissionPeriodKey(CADENCE_EVENT, MISSION_PLAY_GAMES), EVENT_PERIOD_KEY);
  });

  it("resolves login-day daily cadence using Brazil check-in day", () => {
    const d = new Date("2026-04-14T12:00:00.000Z");
    assert.equal(resolveMissionPeriodKey(CADENCE_DAILY, MISSION_LOGIN_DAY, d), "2026-04-14");
  });

  it("resolves generic daily cadence using UTC day key", () => {
    const d = new Date("2026-04-14T12:00:00.000Z");
    assert.equal(resolveMissionPeriodKey(CADENCE_DAILY, MISSION_PLAY_GAMES, d), "2026-04-14");
  });

  it("resolves weekly cadence to ISO week key", () => {
    const d = new Date("2026-04-14T12:00:00.000Z");
    assert.equal(resolveMissionPeriodKey(CADENCE_WEEKLY, MISSION_PLAY_GAMES, d), "2026-W16");
    assert.equal(resolveMissionPeriodKey(CADENCE_WEEKLY, MISSION_LOGIN_DAY, d), "2026-W16");
  });
});
