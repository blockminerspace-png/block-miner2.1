/** One row from `GET /api/vault` after optional UI fields are applied. */
export interface VaultRow {
  id: number;
  minerName?: string | null;
  hashRate?: number | string;
  level?: number;
  slotSize?: number;
  imageUrl?: string | null;
  minerId?: number | null;
  status?: string;
  ownedMachineId?: number | null;
}

export interface VaultStackGroup extends VaultRow {
  quantity: number;
  items: VaultRow[];
}
