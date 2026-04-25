import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkinBalance } from "../server/controllers/checkinController.js";

describe("checkinBalance", () => {
  it("returns 401 when the request is not authenticated", async () => {
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
    assert.equal(res.statusCode, 401);
    assert.equal(/** @type {{ code?: string }} */ (res.body)?.code, "UNAUTHORIZED");
    assert.equal(/** @type {{ ok?: boolean }} */ (res.body)?.ok, false);
  });
});
