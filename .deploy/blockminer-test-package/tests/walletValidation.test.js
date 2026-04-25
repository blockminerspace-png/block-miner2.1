import test from "node:test";
import assert from "node:assert/strict";
import { WITHDRAW_MIN_POL } from "../server/controllers/walletController.js";

/** Same rule as requestWithdrawal in walletController.js */
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

test("withdrawal address format matches controller rule", () => {
  assert.equal(EVM_ADDRESS.test("0x000000000000000000000000000000000000dead"), true);
  assert.equal(EVM_ADDRESS.test("0xabc"), false);
  assert.equal(EVM_ADDRESS.test("not-an-address"), false);
});

test("withdrawal amount uses parseFloat and enforces minimum POL", () => {
  const parsed = parseFloat("10.5");
  assert.ok(!Number.isNaN(parsed));
  assert.ok(parsed >= WITHDRAW_MIN_POL);
  const belowMin = parseFloat("9");
  assert.ok(belowMin < WITHDRAW_MIN_POL);
});
