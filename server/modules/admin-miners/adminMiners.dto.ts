import type { AdminMinerListRow } from "./adminMiners.types.js";

function dateToJson(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function valueToString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function valueToNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function toAdminMinerListRow(row: AdminMinerListRow): AdminMinerListRow {
  const baseHashRate = valueToString(row.baseHashRate ?? row.hashRate ?? row.power);
  const price = valueToString(row.price);
  const stockSold = valueToNumber(row.stockSold ?? row.salesCount);
  const showInShop = Boolean(row.showInShop ?? row.isStoreVisible ?? row.isStoreItem);
  return {
    ...row,
    id: row.id,
    slug: row.slug ?? null,
    price,
    power: baseHashRate,
    hashRate: baseHashRate,
    baseHashRate,
    isActive: Boolean(row.isActive),
    isVisible: showInShop,
    isStoreItem: showInShop,
    showInShop,
    isStoreVisible: showInShop,
    stockSold,
    salesCount: stockSold,
    createdAt: dateToJson(row.createdAt),
    updatedAt: dateToJson(row.updatedAt),
  };
}

export function toAdminMinersListResponse<T extends { miners: AdminMinerListRow[]; total: number; page: number; limit: number; totalPages?: number }>(
  data: T,
) {
  return {
    ...data,
    totalPages: data.totalPages ?? Math.max(1, Math.ceil(data.total / data.limit)),
    miners: data.miners.map(toAdminMinerListRow),
  };
}
