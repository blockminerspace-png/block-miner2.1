/**
 * Canonical placement of a machine instance across Inventory, Mining Room (installed), and Vault.
 * Aligns with Prisma enum `MachineInstanceLocation` on the server:
 * - INVENTORY ↔ INVENTORY
 * - INSTALLED ↔ RACK (active `userMiner` row)
 * - VAULT ↔ WAREHOUSE (`user_vault` row)
 *
 * Use these values only in application/UI logic; persistence still uses backend enum strings.
 */
export const MachinePlacementStatus = Object.freeze({
  INVENTORY: "INVENTORY",
  INSTALLED: "INSTALLED",
  VAULT: "VAULT",
});

/** @typedef {keyof typeof MachinePlacementStatus} MachinePlacementStatusKey */

/**
 * Maps a backend `MachineInstanceLocation` string to UI placement.
 * @param {string | null | undefined} backendLocation
 * @returns {string}
 */
export function placementFromBackendLocation(backendLocation) {
  if (backendLocation === "RACK") return MachinePlacementStatus.INSTALLED;
  if (backendLocation === "WAREHOUSE") return MachinePlacementStatus.VAULT;
  return MachinePlacementStatus.INVENTORY;
}

/**
 * True when the UI should treat the machine as stored in the vault (warehouse).
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isVaultPlacementStatus(status) {
  return status === MachinePlacementStatus.VAULT || status === "WAREHOUSE";
}
