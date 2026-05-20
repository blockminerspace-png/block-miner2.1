import type { Prisma } from "@prisma/client";
import type { QueryRecord } from "../../services/queryRecord.js";

const MAX_LIMIT = 100;
const MAX_METADATA_CHARS = 3000;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_TIERS = new Set(["common", "uncommon", "rare", "epic", "legendary", "special"]);
const ALLOWED_SOURCES = new Set(["store", "reward", "shortlink", "faucet", "admin", "event"]);
const ALLOWED_FILTERS = new Set([
  "all",
  "active",
  "inactive",
  "store",
  "hidden",
  "free",
  "paid",
  "reward",
  "shortlink",
  "faucet",
  "admin",
  "event",
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "special",
  "archived",
]);
const ALLOWED_SORTS = new Set([
  "recent",
  "oldest",
  "name",
  "price_asc",
  "price_desc",
  "power_asc",
  "power_desc",
  "hashrate_asc",
  "hashrate_desc",
  "sold",
  "value",
]);

function parsePositiveInt(value: unknown, fallback: number, max = MAX_LIMIT): number {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim();
  if (!/^\d{1,6}$/.test(s)) throw new Error("invalid_pagination");
  return Math.max(1, Math.min(max, Number(s)));
}

function cleanSearch(value: unknown): string {
  const s = String(value || "").trim();
  if (s.length > 120) throw new Error("invalid_search");
  return s;
}

function cleanText(value: unknown, opts: { max: number; required?: boolean }): string | null {
  const { max, required = false } = opts;
  const s = String(value ?? "").trim();
  if (required && !s) throw new Error("invalid_text");
  if (s.length > max) throw new Error("invalid_text");
  return s || null;
}

function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(s)) return true;
  if (["false", "0", "no", "off"].includes(s)) return false;
  return fallback;
}

function parseDecimalNumber(value: unknown, opts: { max?: number; required?: boolean } = {}): number | null {
  const { max = 1_000_000_000, required = true } = opts;
  if ((value === undefined || value === null || value === "") && !required) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("invalid_number");
  return Number(n.toFixed(8));
}

function parseIntRange(
  value: unknown,
  opts: { min?: number; max?: number; required?: boolean; fallback?: number | null } = {},
): number | null {
  const { min = 0, max = 1_000_000, required = false, fallback = null } = opts;
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error("invalid_integer");
    return fallback;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("invalid_integer");
  return n;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error("invalid_date");
  return d;
}

function normalizeSlug(value: unknown): string {
  const slug = String(value || "").trim().toLowerCase();
  if (!slug || slug.length > 80 || !SLUG_RE.test(slug)) throw new Error("invalid_slug");
  return slug;
}

const PLACEHOLDER_IMAGE_PATHS = new Set(["/icon.png", "/icons/logo-placeholder.png"]);

export function isPlaceholderMinerImageUrl(value: unknown): boolean {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return false;
  return PLACEHOLDER_IMAGE_PATHS.has(s) || s.includes("logo-placeholder");
}

export function validateMinerImageUrl(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  if (isPlaceholderMinerImageUrl(s)) throw new Error("invalid_image");
  if (s.startsWith("/uploads/") || s.startsWith("/machines/")) {
    if (s.includes("..") || s.includes("\\")) throw new Error("invalid_image");
    return s.slice(0, 500);
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new Error("invalid_image");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_image");
  if (url.username || url.password) throw new Error("invalid_image");
  return url.toString().slice(0, 500);
}

function parseMetadata(value: unknown): Prisma.InputJsonValue | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const serialized = JSON.stringify(parsed);
  if (serialized.length > MAX_METADATA_CHARS) throw new Error("invalid_metadata");
  return parsed as Prisma.InputJsonValue;
}

export function parseAdminMinerQuery(query: QueryRecord = {}) {
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit ?? query.pageSize, 25, MAX_LIMIT);
  const q = cleanSearch(query.q ?? query.search);
  const rawFilter = String(query.filter || "all").trim().toLowerCase();
  const rawSort = String(query.sort || "recent").trim().toLowerCase();
  const filter = ALLOWED_FILTERS.has(rawFilter) || rawFilter.startsWith("slots_") ? rawFilter : "all";
  const sort = ALLOWED_SORTS.has(rawSort) ? rawSort : "recent";
  return { page, limit, q, filter, sort };
}

export function parseMinerWriteBody(
  body: QueryRecord = {},
  opts: { partial?: boolean } = {},
): Prisma.MinerCreateInput | Prisma.MinerUpdateInput {
  const { partial = false } = opts;
  const data: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  if (!partial || has("name")) data.name = cleanText(body.name, { max: 120, required: true });
  if (!partial || has("slug")) data.slug = normalizeSlug(body.slug);
  if (has("description")) data.description = cleanText(body.description, { max: 500 });
  if (has("longDescription")) data.longDescription = cleanText(body.longDescription, { max: 4000 });
  if (!partial || has("baseHashRate")) data.baseHashRate = parseDecimalNumber(body.baseHashRate, { max: 1_000_000_000_000 });
  if (!partial || has("price")) data.price = parseDecimalNumber(body.price, { max: 1_000_000_000 });
  if (!partial || has("slotSize")) data.slotSize = parseIntRange(body.slotSize, { min: 1, max: 8, required: true });
  if (has("imageUrl")) {
    const raw = body.imageUrl;
    if (partial && (raw === "" || raw === null)) {
      // Omit clearing image when PATCH sends an empty field (preserve existing URL).
    } else {
      data.imageUrl = validateMinerImageUrl(raw);
    }
  }
  if (has("tier") || !partial) {
    const tier = String(body.tier || "common").trim().toLowerCase();
    if (!ALLOWED_TIERS.has(tier)) throw new Error("invalid_tier");
    data.tier = tier;
  }
  if (has("sourceType") || !partial) {
    const sourceType = String(body.sourceType || "store").trim().toLowerCase();
    if (!ALLOWED_SOURCES.has(sourceType)) throw new Error("invalid_source");
    data.sourceType = sourceType;
  }
  if (has("isActive") || !partial) data.isActive = parseBool(body.isActive, true);
  if (has("showInShop") || has("isStoreVisible") || !partial) data.showInShop = parseBool(body.showInShop ?? body.isStoreVisible, true);
  if (has("isArchived")) data.isArchived = parseBool(body.isArchived, false);
  if (has("sortOrder")) data.sortOrder = parseIntRange(body.sortOrder, { min: -100000, max: 100000, fallback: 0 });
  if (has("maxPerUser")) data.maxPerUser = parseIntRange(body.maxPerUser, { min: 1, max: 100000 });
  if (has("stockTotal")) data.stockTotal = parseIntRange(body.stockTotal, { min: 0, max: 100000000 });
  if (has("availableFrom")) data.availableFrom = parseDate(body.availableFrom);
  if (has("availableUntil")) data.availableUntil = parseDate(body.availableUntil);
  if (data.availableFrom && data.availableUntil && data.availableUntil < data.availableFrom) throw new Error("invalid_date_range");
  if (has("metadata")) data.metadata = parseMetadata(body.metadata);
  return partial ? (data as Prisma.MinerUpdateInput) : (data as Prisma.MinerCreateInput);
}

export function minerSelect(extra: Record<string, unknown> = {}): Prisma.MinerSelect {
  return {
    id: true,
    name: true,
    slug: true,
    description: true,
    longDescription: true,
    baseHashRate: true,
    price: true,
    slotSize: true,
    imageUrl: true,
    tier: true,
    sourceType: true,
    isActive: true,
    showInShop: true,
    isArchived: true,
    sortOrder: true,
    maxPerUser: true,
    stockTotal: true,
    stockSold: true,
    availableFrom: true,
    availableUntil: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    ...extra,
  } as Prisma.MinerSelect;
}

