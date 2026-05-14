import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserApiActivityAction,
  shouldAuditUserRequest,
} from "#server/middleware/userActivityAudit.js";

describe("userActivityAudit middleware helpers", () => {
  it("builds stable action names from API method and path", () => {
    assert.equal(
      buildUserApiActivityAction("post", "/api/vault/move-to-vault"),
      "USER_API_POST_VAULT_MOVE_TO_VAULT",
    );
    assert.equal(
      buildUserApiActivityAction("DELETE", "/api/support/123?x=1"),
      "USER_API_DELETE_SUPPORT_ID",
    );
  });

  it("audits authenticated mutating user requests", () => {
    const req = {
      user: { id: 42 },
      method: "POST",
      originalUrl: "/api/checkin/balance",
    };
    const res = { statusCode: 200 };
    assert.equal(shouldAuditUserRequest(req, res), true);
  });

  it("audits authenticated reads by default", () => {
    assert.equal(
      shouldAuditUserRequest(
        { user: { id: 1 }, method: "GET", originalUrl: "/api/wallet/balance" },
        { statusCode: 200 },
      ),
      true,
    );
  });

  it("skips reads only when configured, and skips admin routes, heartbeat, and anonymous requests", () => {
    assert.equal(
      shouldAuditUserRequest(
        { user: { id: 1 }, method: "GET", originalUrl: "/api/wallet/balance" },
        { statusCode: 200 },
        { auditReads: false },
      ),
      false,
    );
    assert.equal(
      shouldAuditUserRequest(
        { user: { id: 1 }, method: "POST", originalUrl: "/api/admin/users/1/send-miner" },
        { statusCode: 200 },
      ),
      false,
    );
    assert.equal(
      shouldAuditUserRequest(
        { user: { id: 1 }, method: "POST", originalUrl: "/api/session/heartbeat" },
        { statusCode: 200 },
      ),
      false,
    );
    assert.equal(
      shouldAuditUserRequest(
        { method: "POST", originalUrl: "/api/faucet/claim" },
        { statusCode: 200 },
      ),
      false,
    );
  });

  it("can include authenticated reads when configured explicitly", () => {
    assert.equal(
      shouldAuditUserRequest(
        { user: { id: 1 }, method: "GET", originalUrl: "/api/inventory" },
        { statusCode: 200 },
        { auditReads: true },
      ),
      true,
    );
  });
});
