import test from "node:test";
import assert from "node:assert/strict";
import {
  endOfUtcDay,
  parseEarningsPeriod,
  parseUtcStatsWindow,
  resolveEarningsWindow,
  startOfUtcDay,
  utcDateKey,
} from "#server/utils/utcStatsPeriod.js";

const FIXED_NOW = new Date("2026-07-08T15:30:00.000Z");

test("parseEarningsPeriod accepts today and defaults unknown to 30d", () => {
  assert.equal(parseEarningsPeriod("today"), "today");
  assert.equal(parseEarningsPeriod("7d"), "7d");
  assert.equal(parseEarningsPeriod("bogus"), "30d");
});

test("resolveEarningsWindow today is UTC midnight to end of UTC day", () => {
  const w = resolveEarningsWindow("today", FIXED_NOW);
  assert.equal(w.fromUtc?.toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(w.toUtc.toISOString(), "2026-07-08T23:59:59.999Z");
});

test("resolveEarningsWindow 7d spans 7 UTC calendar days inclusive", () => {
  const w = resolveEarningsWindow("7d", FIXED_NOW);
  assert.equal(w.fromUtc?.toISOString(), "2026-07-02T00:00:00.000Z");
  assert.equal(w.toUtc.toISOString(), "2026-07-08T23:59:59.999Z");
});

test("parseUtcStatsWindow honors explicit fromUtc and toUtc", () => {
  const w = parseUtcStatsWindow({
    fromUtc: "2026-07-01T12:00:00.000Z",
    toUtc: "2026-07-05T18:00:00.000Z",
  });
  assert.equal(w.fromUtc?.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(w.toUtc.toISOString(), "2026-07-05T23:59:59.999Z");
});

test("utcDateKey uses ISO date portion", () => {
  assert.equal(utcDateKey(FIXED_NOW), "2026-07-08");
  assert.equal(startOfUtcDay(FIXED_NOW).toISOString(), "2026-07-08T00:00:00.000Z");
  assert.equal(endOfUtcDay(FIXED_NOW).toISOString(), "2026-07-08T23:59:59.999Z");
});
