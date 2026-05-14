import { describe, it, expect } from "vitest";
import {
  MachinePlacementStatus,
  isVaultPlacementStatus,
  placementFromBackendLocation,
} from "./machinePlacement";

describe("machinePlacement", () => {
  it("maps backend enum strings to UI placement", () => {
    expect(placementFromBackendLocation("INVENTORY")).toBe(MachinePlacementStatus.INVENTORY);
    expect(placementFromBackendLocation("RACK")).toBe(MachinePlacementStatus.INSTALLED);
    expect(placementFromBackendLocation("WAREHOUSE")).toBe(MachinePlacementStatus.VAULT);
  });

  it("identifies vault-style placement", () => {
    expect(isVaultPlacementStatus(MachinePlacementStatus.VAULT)).toBe(true);
    expect(isVaultPlacementStatus("WAREHOUSE")).toBe(true);
    expect(isVaultPlacementStatus(MachinePlacementStatus.INSTALLED)).toBe(false);
  });
});
