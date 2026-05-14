import test from "node:test";
import assert from "node:assert/strict";
import { isIncomingNativePolTx } from "#server/services/polygonHdDepositScanner.js";

test("isIncomingNativePolTx accepts native POL to HD address", () => {
  const addr = "0xabc0000000000000000000000000000000000001".toLowerCase();
  assert.equal(
    isIncomingNativePolTx(
      { to: addr, isError: "0", value: "1000000000000000000" },
      addr
    ),
    true
  );
});

test("isIncomingNativePolTx rejects failed tx", () => {
  const addr = "0xabc0000000000000000000000000000000000001".toLowerCase();
  assert.equal(
    isIncomingNativePolTx(
      { to: addr, isError: "1", value: "1" },
      addr
    ),
    false
  );
});

test("isIncomingNativePolTx rejects wrong destination", () => {
  const addr = "0xabc0000000000000000000000000000000000001".toLowerCase();
  assert.equal(
    isIncomingNativePolTx(
      { to: "0xdef0000000000000000000000000000000000002", isError: "0", value: "1" },
      addr
    ),
    false
  );
});

test("isIncomingNativePolTx rejects zero value", () => {
  const addr = "0xabc0000000000000000000000000000000000001".toLowerCase();
  assert.equal(
    isIncomingNativePolTx({ to: addr, isError: "0", value: "0" }, addr),
    false
  );
});
