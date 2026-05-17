export type AdminMinerListRow = {
  id: number | string;
  name: string;
  slug: string | null;
  imageUrl?: string | null;
  tier?: string | null;
  rarity?: string | null;
  status?: string | null;
  price?: string | number | null;
  power?: string | number | null;
  hashRate?: string | number | null;
  baseHashRate?: string | number | null;
  isActive?: boolean;
  isVisible?: boolean;
  isStoreItem?: boolean;
  showInShop?: boolean;
  isStoreVisible?: boolean;
  isArchived?: boolean;
  salesCount?: number;
  stockSold?: number;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
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
