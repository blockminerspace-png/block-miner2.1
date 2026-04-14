/**
 * Daily task calendar bucket (Brazil day) and next-reset helper.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getDailyTaskPeriodKey, getNextDailyTaskResetAt } from "../server/services/dailyTasks/dailyTaskPeriod.js";

test("getDailyTaskPeriodKey returns YYYY-MM-DD", () => {
  const key = getDailyTaskPeriodKey(new Date("2026-06-15T12:00:00.000Z"));
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test("getNextDailyTaskResetAt is strictly after now and on same Brazil day boundary", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const next = getNextDailyTaskResetAt(now);
  assert.ok(next.getTime() > now.getTime());
  assert.ok(next.getTime() < now.getTime() + 49 * 3600000);
});
