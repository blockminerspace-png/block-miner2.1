import type { listVault } from "./vault.repository.js";

export type VaultListRow = Awaited<ReturnType<typeof listVault>>[number];

export type MoveToVaultInput = {
  source: "inventory" | "rack";
  itemId?: unknown;
  itemIds?: unknown;
};

export type RetrieveFromVaultInput = {
  destination: "inventory" | "rack";
  vaultId?: unknown;
  vaultIds?: unknown;
  slotIndex?: unknown;
};
