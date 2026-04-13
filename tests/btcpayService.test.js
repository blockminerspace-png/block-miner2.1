import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  buildBtcpayTxHash,
  extractBtcAddressFromInvoice,
  extractLightningInvoiceFromInvoice,
  parseInvoiceIdFromTxHash,
  resolveBtcpayCheckoutPaymentMethodsFromRaw,
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

test("resolveBtcpayCheckoutPaymentMethodsFromRaw defaults to BTC + Lightning", () => {
  assert.deepEqual(resolveBtcpayCheckoutPaymentMethodsFromRaw(""), ["BTC", "BTC-LightningNetwork"]);
  assert.deepEqual(resolveBtcpayCheckoutPaymentMethodsFromRaw(undefined), ["BTC", "BTC-LightningNetwork"]);
});

test("resolveBtcpayCheckoutPaymentMethodsFromRaw STORE_DEFAULT omits override", () => {
  assert.equal(resolveBtcpayCheckoutPaymentMethodsFromRaw("STORE_DEFAULT"), undefined);
  assert.equal(resolveBtcpayCheckoutPaymentMethodsFromRaw("*"), undefined);
});

test("resolveBtcpayCheckoutPaymentMethodsFromRaw parses comma list", () => {
  assert.deepEqual(resolveBtcpayCheckoutPaymentMethodsFromRaw("BTC"), ["BTC"]);
  assert.deepEqual(resolveBtcpayCheckoutPaymentMethodsFromRaw(" BTC , BTC-LightningNetwork "), [
    "BTC",
    "BTC-LightningNetwork"
  ]);
});

test("extractBtcAddressFromInvoice skips Lightning payment method", () => {
  const inv = {
    availablePaymentMethods: [
      { paymentMethodId: "BTC-LightningNetwork", destination: "lnbc1fakebolt11invoice" },
      { paymentMethodId: "BTC", destination: "bc1qexample000000000000000000000000000000" }
    ]
  };
  assert.equal(extractBtcAddressFromInvoice(inv), "bc1qexample000000000000000000000000000000");
});

test("extractLightningInvoiceFromInvoice reads Lightning destination", () => {
  const inv = {
    availablePaymentMethods: [
      { paymentMethodId: "BTC", destination: "bc1qaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { paymentMethodId: "BTC-LightningNetwork", destination: "lnbc1u1pjkexampleinvoice" }
    ]
  };
  assert.equal(extractLightningInvoiceFromInvoice(inv), "lnbc1u1pjkexampleinvoice");
});

test("extractLightningInvoiceFromInvoice falls back to paymentLink", () => {
  const inv = {
    availablePaymentMethods: [
      {
        paymentMethodId: "BTC-LightningNetwork",
        destination: null,
        paymentLink: "lightning:lnbc1u1pjkexampleinvoice"
      }
    ]
  };
  assert.equal(extractLightningInvoiceFromInvoice(inv), "lightning:lnbc1u1pjkexampleinvoice");
});
