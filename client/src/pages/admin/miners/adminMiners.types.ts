export type AdminMinerListRow = {
  id: number | string;
  name: string;
  slug?: string | null;
  imageUrl?: string | null;
  tier?: string | null;
  rarity?: string | null;
  status?: string | null;
  price?: string | null;
  power?: string | null;
  hashRate?: string | null;
  baseHashRate?: string | number | null;
  slotSize?: number | string | null;
  description?: string | null;
  longDescription?: string | null;
  sourceType?: string | null;
  stockTotal?: number | null;
  stockSold?: number | null;
  isActive?: boolean;
  isVisible?: boolean;
  isStoreItem?: boolean;
  showInShop?: boolean;
  isStoreVisible?: boolean;
  isArchived?: boolean;
  salesCount?: number;
  sortOrder?: number;
  maxPerUser?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  metadata?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
};

/** @deprecated Use AdminMinerListRow */
export type AdminMinerApiRow = AdminMinerListRow & Record<string, unknown>;

export type AdminMinersQuery = {
  page: number;
  limit: number;
  filter: string;
  sort: string;
  q?: string;
};

export type AdminMinersListResponse =
  | {
      ok: true;
      miners: AdminMinerListRow[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }
  | {
      ok: false;
      code?: string;
      error: string;
      message?: string;
    };

export type MinerMutationResponse = { ok?: boolean; miner?: AdminMinerListRow; message?: string; error?: string };

export type UploadImageResponse = { ok?: boolean; url?: string; message?: string; error?: string };
