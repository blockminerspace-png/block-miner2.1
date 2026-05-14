import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

const oldTrustProxy = process.env.TRUST_PROXY;

afterEach(() => {
  if (oldTrustProxy === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = oldTrustProxy;
});

describe("logger utilities", () => {
  it("buildRequestLogContext extracts user, ip, endpoint, requestId", async () => {
    const { buildRequestLogContext } = await import("#server/utils/logger.js");
    const req = {
      user: { id: 42 },
      originalUrl: "/api/vault",
      url: "/vault",
      headers: {},
      socket: { remoteAddress: "203.0.113.9" },
      auditContext: { correlationId: "corr-abc" },
    };
    const ctx = buildRequestLogContext(req);
    assert.equal(ctx.userId, "42");
    assert.equal(ctx.ip, "203.0.113.9");
    assert.equal(ctx.endpoint, "/api/vault");
    assert.equal(ctx.requestId, "corr-abc");
    assert.ok(typeof ctx.timestamp === "string");
  });

  it("buildRequestLogContext ignores x-forwarded-for when proxy trust is disabled", async () => {
    process.env.TRUST_PROXY = "false";
    const { buildRequestLogContext } = await import("#server/utils/logger.js");
    const req = {
      headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.1" },
      originalUrl: "/x",
      socket: { remoteAddress: "127.0.0.1" },
    };
    const ctx = buildRequestLogContext(req);
    assert.equal(ctx.ip, "127.0.0.1");
  });

  it("buildRequestLogContext merges extra fields", async () => {
    const { buildRequestLogContext } = await import("#server/utils/logger.js");
    const ctx = buildRequestLogContext(null, { action: "ping" });
    assert.equal(ctx.action, "ping");
    assert.ok(ctx.timestamp);
  });
});
