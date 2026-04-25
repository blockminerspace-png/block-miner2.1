/**
 * Valid logical transitions for Prisma enum `MachineInstanceLocation`.
 * Inventory <-> rack uses install/uninstall; warehouse uses vault move/retrieve.
 *
 * Client UI uses `MachinePlacementStatus` (see `client/src/constants/machinePlacement.js`):
 * INVENTORY, INSTALLED (rack), VAULT (warehouse).
 */
export const MACHINE_INSTANCE_LOCATIONS = /** @type {const} */ (["INVENTORY", "RACK", "WAREHOUSE"]);

/** @typedef {(typeof MACHINE_INSTANCE_LOCATIONS)[number]} MachineInstanceLocation */

/** @type {ReadonlyArray<[MachineInstanceLocation, MachineInstanceLocation]>} */
const ALLOWED_TRANSITIONS = [
  ["INVENTORY", "RACK"],
  ["RACK", "INVENTORY"],
  ["INVENTORY", "WAREHOUSE"],
  ["RACK", "WAREHOUSE"],
  ["WAREHOUSE", "INVENTORY"],
  ["WAREHOUSE", "RACK"],
];

/**
 * @param {MachineInstanceLocation} from
 * @param {MachineInstanceLocation} to
 * @returns {boolean}
 */
export function isValidMachineLocationTransition(from, to) {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([a, b]) => a === from && b === to);
}
