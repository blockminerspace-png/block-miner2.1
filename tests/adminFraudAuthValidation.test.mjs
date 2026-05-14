import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { requireAdminAuth } from "#server/middleware/adminAuth.js";
import { listAdminFraudSignals } from "#server/services/adminFraudSignalsService.js";

const oldSecret = process.env.JWT_SECRET;

afterEach(() => {
  if (oldSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = oldSecret;
});

describe("admin fraud API protection and validation", () => {
  it("requires admin authentication middleware before route handlers", async () => {
    process.env.JWT_SECRET = "x".repeat(40);
    const req = { headers: {}, cookies: {} };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    let nextCalled = false;
    requireAdminAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.code, "ADMIN_SESSION_INVALID");
  });

  it("rejects invalid fraud query params before database work", async () => {
    await assert.rejects(
      () => listAdminFraudSignals({}, { scope: "not_allowed" }),
      /invalid_scope/,
    );
    await assert.rejects(
      () => listAdminFraudSignals({}, { page: "1;drop" }),
      /invalid_page/,
    );
  });
});
