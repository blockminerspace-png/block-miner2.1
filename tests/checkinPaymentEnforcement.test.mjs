import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCheckinPaymentRequired } from "../server/controllers/checkinController.js";

describe("check-in payment requirement", () => {
  it("always requires on-chain POL payment", () => {
    assert.equal(isCheckinPaymentRequired(), true);
  });
});
