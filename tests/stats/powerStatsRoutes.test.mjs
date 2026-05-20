import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrismaAwareErrorBody,
  isPrismaConnectionError,
  isPrismaSchemaMismatch,
  prismaAwareHttpStatus,
} from "#server/utils/prismaHttpErrors.js";
import {
  mergeRankingSampleWithUser,
  POWER_STATS_RANKING_USER_CAP,
} from "#server/services/networkHashrateService.js";

test("isPrismaConnectionError detects pool timeout message", () => {
  assert.equal(
    isPrismaConnectionError(new Error("timeout exceeded when trying to connect")),
    true,
  );
  assert.equal(
    isPrismaConnectionError(
      new Error("Transaction API error: Unable to start a transaction in the given time."),
    ),
    true,
  );
  assert.equal(isPrismaConnectionError(new Error("invalid input")), false);
});

test("isPrismaSchemaMismatch detects missing column", () => {
  assert.equal(
    isPrismaSchemaMismatch(new Error('column "foo" does not exist in the current database')),
    true,
  );
});

test("buildPrismaAwareErrorBody maps connection errors to SERVICE_UNAVAILABLE", () => {
  const body = buildPrismaAwareErrorBody(
    new Error("timeout exceeded when trying to connect"),
    "fallback",
  );
  assert.equal(body.code, "SERVICE_UNAVAILABLE");
  assert.equal(body.ok, false);
  assert.equal(prismaAwareHttpStatus(new Error("timeout exceeded when trying to connect")), 503);
});

test("mergeRankingSampleWithUser appends current user when missing from sample", () => {
  const sample = [{ id: 1 }, { id: 2 }];
  const merged = mergeRankingSampleWithUser(sample, { id: 99 }, 99);
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, 99);
});

test("POWER_STATS_RANKING_USER_CAP bounds ranking sample size", () => {
  assert.equal(POWER_STATS_RANKING_USER_CAP, 400);
});
