/**
 * CCPAYMENT_ENABLED parsing and inferred enable when credentials exist.
 */
import test from "node:test";
import assert from "node:assert/strict";

test("isCcpaymentIntegrationEnabled: true/1/yes/on/enabled", async () => {
  const { isCcpaymentIntegrationEnabled } = await import("../server/services/ccpayment/ccpaymentEnv.js");
  const keys = ["CCPAYMENT_ENABLED", "CCPAYMENT_APP_ID", "CCPAYMENT_APP_SECRET"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    process.env.CCPAYMENT_APP_ID = "";
    process.env.CCPAYMENT_APP_SECRET = "";
    for (const v of ["true", "1", "yes", "on", "enabled"]) {
      process.env.CCPAYMENT_ENABLED = v;
      assert.equal(isCcpaymentIntegrationEnabled(), true, v);
    }
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("isCcpaymentIntegrationEnabled: explicit off beats credentials", async () => {
  const { isCcpaymentIntegrationEnabled } = await import("../server/services/ccpayment/ccpaymentEnv.js");
  const keys = ["CCPAYMENT_ENABLED", "CCPAYMENT_APP_ID", "CCPAYMENT_APP_SECRET"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    process.env.CCPAYMENT_ENABLED = "false";
    process.env.CCPAYMENT_APP_ID = "id";
    process.env.CCPAYMENT_APP_SECRET = "sec";
    assert.equal(isCcpaymentIntegrationEnabled(), false);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("isCcpaymentIntegrationEnabled: unset + credentials implies enabled", async () => {
  const { isCcpaymentIntegrationEnabled } = await import("../server/services/ccpayment/ccpaymentEnv.js");
  const keys = ["CCPAYMENT_ENABLED", "CCPAYMENT_APP_ID", "CCPAYMENT_APP_SECRET"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    delete process.env.CCPAYMENT_ENABLED;
    process.env.CCPAYMENT_APP_ID = "app";
    process.env.CCPAYMENT_APP_SECRET = "secret";
    assert.equal(isCcpaymentIntegrationEnabled(), true);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});

test("isCcpaymentIntegrationEnabled: unset + no credentials is disabled", async () => {
  const { isCcpaymentIntegrationEnabled } = await import("../server/services/ccpayment/ccpaymentEnv.js");
  const keys = ["CCPAYMENT_ENABLED", "CCPAYMENT_APP_ID", "CCPAYMENT_APP_SECRET"];
  const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

  try {
    delete process.env.CCPAYMENT_ENABLED;
    process.env.CCPAYMENT_APP_ID = "";
    process.env.CCPAYMENT_APP_SECRET = "";
    assert.equal(isCcpaymentIntegrationEnabled(), false);
  } finally {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
});
