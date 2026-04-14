import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  buildBtcpayTxHash,
  extractBtcAddressFromInvoice,
  extractLightningInvoiceFromInvoice,
  isBtcpayComingSoon,
  isBtcpayConfigured,
  isBtcpayInvoiceFlowEnabled,
  listBtcpayMissingEnvKeys,
  parseInvoiceIdFromTxHash,
  resolveBtcpayCheckoutPaymentMethodsFromRaw,
  verifyBtcpayWebhookSignature
} from "../server/services/btcpayService.js";

const BTCPAY_ENV_KEYS = ["BTCPAY_URL", "BTCPAY_API_KEY", "BTCPAY_STORE_ID", "BTCPAY_WEBHOOK_SECRET"];

test("listBtcpayMissingEnvKeys reports all four when unset", () => {
  const saved = Object.fromEntries(BTCPAY_ENV_KEYS.map((k) => [k, process.env[k]]));
  const savedComingSoon = process.env.BTCPAY_COMING_SOON;
  try {
    delete process.env.BTCPAY_COMING_SOON;
    for (const k of BTCPAY_ENV_KEYS) delete process.env[k];
    assert.deepEqual(listBtcpayMissingEnvKeys(), [...BTCPAY_ENV_KEYS]);
    assert.equal(isBtcpayConfigured(), false);
    process.env.BTCPAY_URL = "https://btcpay.example.com";
    assert.deepEqual(listBtcpayMissingEnvKeys(), BTCPAY_ENV_KEYS.slice(1));
    process.env.BTCPAY_API_KEY = "token";
    process.env.BTCPAY_STORE_ID = "store";
    process.env.BTCPAY_WEBHOOK_SECRET = "whsec";
    assert.deepEqual(listBtcpayMissingEnvKeys(), []);
    assert.equal(isBtcpayConfigured(), true);
    assert.equal(isBtcpayComingSoon(), false);
    assert.equal(isBtcpayInvoiceFlowEnabled(), true);
    process.env.BTCPAY_COMING_SOON = "1";
    assert.equal(isBtcpayComingSoon(), true);
    assert.equal(isBtcpayInvoiceFlowEnabled(), false);
    process.env.BTCPAY_COMING_SOON = "0";
    assert.equal(isBtcpayComingSoon(), false);
    assert.equal(isBtcpayInvoiceFlowEnabled(), true);
    delete process.env.BTCPAY_COMING_SOON;
    assert.equal(isBtcpayInvoiceFlowEnabled(), true);
  } finally {
    for (const k of BTCPAY_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    if (savedComingSoon === undefined) delete process.env.BTCPAY_COMING_SOON;
    else process.env.BTCPAY_COMING_SOON = savedComingSoon;
  }
});

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

test("resolveBtcpayCheckoutPaymentMethodsFromRaw defaults to store default (omit list)", () => {
  assert.equal(resolveBtcpayCheckoutPaymentMethodsFromRaw(""), undefined);
  assert.equal(resolveBtcpayCheckoutPaymentMethodsFromRaw(undefined), undefined);
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
