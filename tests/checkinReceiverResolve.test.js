import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveCheckinReceiverFromEnv } from "#server/modules/checkin/index.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const A = "0x1111111111111111111111111111111111111111";
const B = "0x2222222222222222222222222222222222222222";

describe("resolveCheckinReceiverFromEnv", () => {
  it("returns empty when both are missing", () => {
    assert.equal(resolveCheckinReceiverFromEnv({}), "");
  });

  it("prefers CHECKIN_RECEIVER over DEPOSIT_WALLET_ADDRESS", () => {
    assert.equal(
      resolveCheckinReceiverFromEnv({
        CHECKIN_RECEIVER: A,
        DEPOSIT_WALLET_ADDRESS: B
      }),
      A
    );
  });

  it("falls back to DEPOSIT_WALLET_ADDRESS when CHECKIN_RECEIVER is empty", () => {
    assert.equal(
      resolveCheckinReceiverFromEnv({
        CHECKIN_RECEIVER: "",
        DEPOSIT_WALLET_ADDRESS: B
      }),
      B
    );
  });

  it("skips zero address and uses deposit wallet", () => {
    assert.equal(
      resolveCheckinReceiverFromEnv({
        CHECKIN_RECEIVER: ZERO,
        DEPOSIT_WALLET_ADDRESS: B
      }),
      B
    );
  });

  it("trims whitespace", () => {
    assert.equal(
      resolveCheckinReceiverFromEnv({
        CHECKIN_RECEIVER: `  ${A}  `,
        DEPOSIT_WALLET_ADDRESS: B
      }),
      A
    );
  });
});
