import test from "node:test";
import assert from "node:assert";
import { sanitizeAuditPayload, buildAuditSignature, stableStringify, generateCorrelationId, hashIp } from "#server/src/audit/utils.js";
import { auditEventInputSchema } from "#server/src/audit/schemas.js";
import { AuditEventType, AuditEventStatus } from "#server/src/audit/constants.js";

test("sanitizeAuditPayload masks sensitive strings and keeps non-sensitive values", () => {
  const input = {
    email: "user@example.com",
    privateKey: "abcd1234secret",
    walletAddress: "0xdeadbeef",
    amount: 42,
    nested: {
      password: "hunter2",
      note: "visible"
    }
  };

  const sanitized = sanitizeAuditPayload(input);
  assert.equal(sanitized.email, "u***@example.com");
  assert.equal(typeof sanitized.privateKey, "string");
  assert.notEqual(sanitized.privateKey, "abcd1234secret");
  assert.equal(sanitized.amount, 42);
  assert.equal(sanitized.nested.note, "visible");
  assert.equal(sanitized.nested.password, "hu***r2");
});

test("stableStringify orders object keys deterministically", () => {
  const a = { b: 1, a: 2 };
  const b = { a: 2, b: 1 };
  assert.equal(stableStringify(a), stableStringify(b));
});

test("buildAuditSignature returns a deterministic HMAC string", () => {
  process.env.AUDIT_HMAC_SECRET = "test-secret";
  const event = {
    correlationId: generateCorrelationId(),
    userId: 1,
    timestamp: new Date().toISOString(),
    eventType: AuditEventType.AUTH_LOGIN_SUCCESS,
    status: AuditEventStatus.SUCCESS,
    resultCode: "LOGIN_SUCCESS",
    payload: { detail: "ok" },
    ipHash: hashIp("127.0.0.1"),
    userAgent: "test-agent",
    schemaVersion: "audit_event_v1",
    source: "api"
  };
  const sig1 = buildAuditSignature(event);
  const sig2 = buildAuditSignature(event);
  assert.equal(sig1, sig2);
  assert.equal(typeof sig1, "string");
  assert.match(sig1, /^[0-9a-f]{64}$/);
});

test("auditEventInputSchema validates complete audit event input", () => {
  const valid = {
    correlationId: generateCorrelationId(),
    timestamp: new Date().toISOString(),
    eventType: AuditEventType.AUTH_REGISTER,
    status: AuditEventStatus.SUCCESS,
    resultCode: "USER_REGISTERED",
    payload: { referrerId: null },
    ipHash: hashIp("127.0.0.1"),
    userAgent: "test-agent",
    signature: "deadbeef",
    schemaVersion: "audit_event_v1",
    source: "api"
  };

  const parsed = auditEventInputSchema.parse(valid);
  assert.equal(parsed.eventType, AuditEventType.AUTH_REGISTER);
  assert.equal(parsed.status, AuditEventStatus.SUCCESS);
});
