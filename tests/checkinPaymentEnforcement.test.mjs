import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckinPaymentRequired,
  resolveCheckinReceiverFromEnv
} from "#server/modules/checkin/index.js";

describe("check-in payment requirement", () => {
  it("always requires wallet on-chain payment (no free claim path)", () => {
    assert.equal(isCheckinPaymentRequired(), true);
  });

  it("still resolves treasury from env when present", () => {
    const addr = resolveCheckinReceiverFromEnv(process.env);
    assert.equal(typeof addr, "string");
  });
});
