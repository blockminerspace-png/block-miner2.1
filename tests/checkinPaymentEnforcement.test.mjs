import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCheckinPaymentRequired,
  resolveCheckinReceiverFromEnv
} from "../server/controllers/checkinController.js";

describe("check-in payment requirement", () => {
  it("matches whether a non-zero treasury address is configured", () => {
    const hasTreasury = Boolean(resolveCheckinReceiverFromEnv(process.env));
    assert.equal(isCheckinPaymentRequired(), hasTreasury);
  });
});
