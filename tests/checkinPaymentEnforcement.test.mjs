import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { isCheckinPaymentRequired } from "../server/controllers/checkinController.js";

describe("check-in payment requirement flag", () => {
  const backup = {
    CHECKIN_PAYMENT_ENABLED: process.env.CHECKIN_PAYMENT_ENABLED,
    CHECKIN_RECEIVER: process.env.CHECKIN_RECEIVER,
    DEPOSIT_WALLET_ADDRESS: process.env.DEPOSIT_WALLET_ADDRESS
  };

  afterEach(() => {
    for (const k of Object.keys(backup)) {
      if (backup[k] === undefined) delete process.env[k];
      else process.env[k] = backup[k];
    }
  });

  it("returns true when feature flag is enabled and CHECKIN_RECEIVER is a non-zero address", () => {
    process.env.CHECKIN_PAYMENT_ENABLED = "true";
    process.env.CHECKIN_RECEIVER = "0x1111111111111111111111111111111111111111";
    process.env.DEPOSIT_WALLET_ADDRESS = "";
    assert.equal(isCheckinPaymentRequired(), true);
  });

  it("returns true when feature flag is enabled and only DEPOSIT_WALLET_ADDRESS is set", () => {
    process.env.CHECKIN_PAYMENT_ENABLED = "true";
    process.env.CHECKIN_RECEIVER = "";
    process.env.DEPOSIT_WALLET_ADDRESS = "0x2222222222222222222222222222222222222222";
    assert.equal(isCheckinPaymentRequired(), true);
  });

  it("returns false when flag is off even if treasury vars are set", () => {
    process.env.CHECKIN_PAYMENT_ENABLED = "false";
    process.env.CHECKIN_RECEIVER = "0x1111111111111111111111111111111111111111";
    process.env.DEPOSIT_WALLET_ADDRESS = "";
    assert.equal(isCheckinPaymentRequired(), false);
  });

  it("returns false when both treasury env vars are empty", () => {
    process.env.CHECKIN_PAYMENT_ENABLED = "true";
    process.env.CHECKIN_RECEIVER = "";
    process.env.DEPOSIT_WALLET_ADDRESS = "";
    assert.equal(isCheckinPaymentRequired(), false);
  });
});
