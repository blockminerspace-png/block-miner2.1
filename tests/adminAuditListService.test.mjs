import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferAuditCategory } from "../server/services/adminAuditListService.js";

describe("adminAuditListService.inferAuditCategory", () => {
  it("buckets admin vs auth login events", () => {
    assert.equal(inferAuditCategory("ADMIN_LOGIN_SUCCESS"), "admin");
    assert.equal(inferAuditCategory("ADMIN_LOGIN_FAILURE"), "admin");
    assert.equal(inferAuditCategory("AUTH_LOGIN_SUCCESS"), "auth");
    assert.equal(inferAuditCategory("AUTH_REGISTER"), "auth");
  });

  it("buckets economy and games", () => {
    assert.equal(inferAuditCategory("ECONOMY_DEPOSIT"), "economy");
    assert.equal(inferAuditCategory("GAME2048_CLAIM"), "games");
    assert.equal(inferAuditCategory("READ_EARN_CLAIM"), "games");
  });

  it("buckets user activity and system", () => {
    assert.equal(inferAuditCategory("USER_VIDEO_START"), "user_activity");
    assert.equal(inferAuditCategory("USER_API_POST_VAULT_MOVE_TO_VAULT"), "user_activity");
    assert.equal(inferAuditCategory("SYSTEM_HEALTHCHECK"), "system");
  });
});
