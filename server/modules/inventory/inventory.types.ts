import type { listInventory } from "./inventory.repository.js";

export type InventoryListRow = Awaited<ReturnType<typeof listInventory>>[number];
