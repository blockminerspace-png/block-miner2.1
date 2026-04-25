import test from "node:test";
import assert from "node:assert/strict";
import { scanForNewDeposits } from "../server/cron/depositsCron.js";

test("scanForNewDeposits returns idle when scanner is inactive and not forced", async () => {
  const result = await scanForNewDeposits(false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "idle");
});
