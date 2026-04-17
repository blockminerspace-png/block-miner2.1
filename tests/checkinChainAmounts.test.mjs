import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseCheckinAmountWei,
  parseCheckinBalanceAmountWei
} from "../server/services/checkinChain.js";

test("parseCheckinAmountWei defaults to 0.01 POL", () => {
  assert.equal(parseCheckinAmountWei(), 10_000_000_000_000_000n);
});

test("parseCheckinBalanceAmountWei defaults to 0.03 POL", () => {
  assert.equal(parseCheckinBalanceAmountWei(), 30_000_000_000_000_000n);
});
