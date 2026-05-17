import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidWalletConnectProjectId,
  resolveWalletConnectProjectIdFromEnv,
} from "#server/utils/walletConnectProjectId.js";

test("rejects placeholder walletconnect project ids", () => {
  assert.equal(isValidWalletConnectProjectId("00000000000000000000000000000000"), false);
  assert.equal(isValidWalletConnectProjectId("your_project_id"), false);
});

test("accepts 32-char hex project ids", () => {
  assert.equal(isValidWalletConnectProjectId("a1b2c3d4e5f6789012345678abcdef01"), true);
});

test("resolveWalletConnectProjectIdFromEnv ignores invalid env", () => {
  const prevWc = process.env.VITE_WALLETCONNECT_PROJECT_ID;
  const prevReown = process.env.VITE_REOWN_PROJECT_ID;
  try {
    process.env.VITE_WALLETCONNECT_PROJECT_ID = "00000000000000000000000000000000";
    process.env.VITE_REOWN_PROJECT_ID = "";
    assert.equal(resolveWalletConnectProjectIdFromEnv(), "");
  } finally {
    if (prevWc === undefined) delete process.env.VITE_WALLETCONNECT_PROJECT_ID;
    else process.env.VITE_WALLETCONNECT_PROJECT_ID = prevWc;
    if (prevReown === undefined) delete process.env.VITE_REOWN_PROJECT_ID;
    else process.env.VITE_REOWN_PROJECT_ID = prevReown;
  }
});
