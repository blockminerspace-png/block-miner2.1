import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MachinePlacementStatus,
  isVaultPlacementStatus,
  placementFromBackendLocation,
} from "../client/src/constants/machinePlacement.js";

describe("machinePlacement mapping", () => {
  it("maps Prisma locations to UI placement", () => {
    assert.equal(placementFromBackendLocation("INVENTORY"), MachinePlacementStatus.INVENTORY);
    assert.equal(placementFromBackendLocation("RACK"), MachinePlacementStatus.INSTALLED);
    assert.equal(placementFromBackendLocation("WAREHOUSE"), MachinePlacementStatus.VAULT);
    assert.equal(placementFromBackendLocation(undefined), MachinePlacementStatus.INVENTORY);
  });

  it("detects vault-style status values", () => {
    assert.equal(isVaultPlacementStatus(MachinePlacementStatus.VAULT), true);
    assert.equal(isVaultPlacementStatus("WAREHOUSE"), true);
    assert.equal(isVaultPlacementStatus(MachinePlacementStatus.INSTALLED), false);
  });
});
