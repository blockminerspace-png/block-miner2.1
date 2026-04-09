/**
 * CCPayment webhook IP allowlist merges official egress IPs with env extras.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveCcpaymentWebhookAllowlist } from "../server/middleware/ccpaymentWebhookIp.js";

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
