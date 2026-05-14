import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isValidMachineLocationTransition } from "#server/utils/machineInstanceState.js";

describe("machineInstanceState", () => {
  it("allows identity transitions", () => {
    assert.equal(isValidMachineLocationTransition("INVENTORY", "INVENTORY"), true);
    assert.equal(isValidMachineLocationTransition("RACK", "RACK"), true);
  });

  it("allows inventory rack and vault edges", () => {
    assert.equal(isValidMachineLocationTransition("INVENTORY", "RACK"), true);
    assert.equal(isValidMachineLocationTransition("RACK", "INVENTORY"), true);
    assert.equal(isValidMachineLocationTransition("INVENTORY", "WAREHOUSE"), true);
    assert.equal(isValidMachineLocationTransition("RACK", "WAREHOUSE"), true);
    assert.equal(isValidMachineLocationTransition("WAREHOUSE", "INVENTORY"), true);
    assert.equal(isValidMachineLocationTransition("WAREHOUSE", "RACK"), true);
  });

});
