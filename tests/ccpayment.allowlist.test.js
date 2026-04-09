/**
 * CCPayment webhook IP allowlist merges official egress IPs with env extras.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveCcpaymentWebhookAllowlist,
  getWebhookClientIp
} from "../server/middleware/ccpaymentWebhookIp.js";

test("resolveCcpaymentWebhookAllowlist uses defaults when env empty", () => {
  const list = resolveCcpaymentWebhookAllowlist("");
  assert.ok(list.includes("54.150.123.157"));
  assert.equal(list.length, 3);
});

test("resolveCcpaymentWebhookAllowlist unions env IPs with defaults (deduped)", () => {
  const list = resolveCcpaymentWebhookAllowlist("89.167.119.164, 54.150.123.157, 10.0.0.1");
  assert.ok(list.includes("54.150.123.157"));
  assert.ok(list.includes("89.167.119.164"));
  assert.ok(list.includes("10.0.0.1"));
  assert.ok(list.includes("35.72.150.75"));
});

test("getWebhookClientIp prefers X-Forwarded-For first hop (no TRUST_PROXY gate)", () => {
  const req = { headers: { "x-forwarded-for": "54.150.123.157, 172.18.0.1" }, ip: "172.18.0.2" };
  assert.equal(getWebhookClientIp(req), "54.150.123.157");
});

test("getWebhookClientIp uses CF-Connecting-IP when XFF absent", () => {
  const req = { headers: { "cf-connecting-ip": "35.72.150.75" }, ip: "10.0.0.1" };
  assert.equal(getWebhookClientIp(req), "35.72.150.75");
});

test("getWebhookClientIp uses X-Real-IP when XFF and CF absent", () => {
  const req = { headers: { "x-real-ip": "18.176.186.244" }, ip: "127.0.0.1" };
  assert.equal(getWebhookClientIp(req), "18.176.186.244");
});
