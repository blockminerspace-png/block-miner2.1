import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkinBalance } from "../server/controllers/checkinController.js";

describe("checkinBalance", () => {
  it("returns 410 with CHECKIN_BALANCE_DISABLED (wallet-only check-in)", async () => {
    const res = {
      statusCode: 200,
      /** @type {unknown} */
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      }
    };
    await checkinBalance({}, res);
    assert.equal(res.statusCode, 410);
    assert.equal(/** @type {{ code?: string }} */ (res.body)?.code, "CHECKIN_BALANCE_DISABLED");
    assert.equal(/** @type {{ ok?: boolean }} */ (res.body)?.ok, false);
  });
});
