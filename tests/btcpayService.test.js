import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  buildBtcpayTxHash,
  parseInvoiceIdFromTxHash,
  verifyBtcpayWebhookSignature
} from "../server/services/btcpayService.js";

test("verifyBtcpayWebhookSignature accepts valid sha256 signature", () => {
  const secret = "webhook-secret";
  const body = Buffer.from('{"type":"InvoiceSettled","invoiceId":"abc"}');
  const mac = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyBtcpayWebhookSignature(body, `sha256=${mac}`, secret), true);
});

test("verifyBtcpayWebhookSignature rejects wrong signature", () => {
  const secret = "webhook-secret";
  const body = Buffer.from("{}");
  assert.equal(verifyBtcpayWebhookSignature(body, "sha256=deadbeef", secret), false);
});

test("verifyBtcpayWebhookSignature rejects malformed header", () => {
  const secret = "webhook-secret";
  const body = Buffer.from("{}");
  assert.equal(verifyBtcpayWebhookSignature(body, "nope", secret), false);
});

test("buildBtcpayTxHash and parseInvoiceIdFromTxHash roundtrip", () => {
  const id = "UiXy12";
  const h = buildBtcpayTxHash(id);
  assert.equal(parseInvoiceIdFromTxHash(h), id);
  assert.equal(parseInvoiceIdFromTxHash("0xabc"), null);
});
