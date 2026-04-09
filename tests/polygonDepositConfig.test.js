/**
 * Unit tests: POL deposit env parsing (no DB / no network).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getMinDepositPol,
  getRequiredBlockConfirmations
} from "../server/services/polygonDepositConfig.js";

test("getMinDepositPol reads MIN_DEPOSIT_AMOUNT each call", () => {
  const save = process.env.MIN_DEPOSIT_AMOUNT;
  try {
    delete process.env.MIN_DEPOSIT_AMOUNT;
    assert.equal(getMinDepositPol(), 0.01);

    process.env.MIN_DEPOSIT_AMOUNT = "0.5";
    assert.equal(getMinDepositPol(), 0.5);

    process.env.MIN_DEPOSIT_AMOUNT = "nope";
    assert.equal(getMinDepositPol(), 0.01);
  } finally {
    if (save === undefined) delete process.env.MIN_DEPOSIT_AMOUNT;
    else process.env.MIN_DEPOSIT_AMOUNT = save;
  }
});

test("getRequiredBlockConfirmations defaults and enforces minimum 1", () => {
  const save = process.env.BLOCK_CONFIRMATIONS;
  try {
    delete process.env.BLOCK_CONFIRMATIONS;
    assert.equal(getRequiredBlockConfirmations(), 3);

    process.env.BLOCK_CONFIRMATIONS = "12";
    assert.equal(getRequiredBlockConfirmations(), 12);

    process.env.BLOCK_CONFIRMATIONS = "0";
    assert.equal(getRequiredBlockConfirmations(), 3);
  } finally {
    if (save === undefined) delete process.env.BLOCK_CONFIRMATIONS;
    else process.env.BLOCK_CONFIRMATIONS = save;
  }
});
