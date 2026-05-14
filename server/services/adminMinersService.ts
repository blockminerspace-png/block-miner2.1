import type { Prisma, PrismaClient } from "@prisma/client";
import type { QueryRecord } from "./queryRecord.js";

const MAX_LIMIT = 100;
const MAX_METADATA_CHARS = 3000;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_TIERS = new Set(["common", "uncommon", "rare", "epic", "legendary", "special"]);
const ALLOWED_SOURCES = new Set(["store", "reward", "shortlink", "faucet", "admin", "event"]);

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

export function validateMinerImageUrl(value: unknown): string | null {
  const s = String(value || "").trim();
  if (!s) return null;
  if (s.startsWith("/uploads/") || s.startsWith("/machines/") || s === "/icon.png") {
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
  const q = cleanSearch(query.q);
  const filter = String(query.filter || "all").trim().toLowerCase();
  const sort = String(query.sort || "recent").trim().toLowerCase();
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
  if (has("imageUrl")) data.imageUrl = validateMinerImageUrl(body.imageUrl);
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

type MinerRowBase = Prisma.MinerGetPayload<{
  select: ReturnType<typeof minerSelect>;
}>;

type MinerRow = MinerRowBase & {
  _count?: { userOwnedMachines?: number; userInventory?: number; userMiners?: number };
};

function minerDto(row: MinerRow | null) {
  if (!row) return null;
  const sold = row._count?.userOwnedMachines ?? row.stockSold ?? 0;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    longDescription: row.longDescription || "",
    baseHashRate: Number(row.baseHashRate || 0),
    price: Number(row.price || 0),
    slotSize: Number(row.slotSize || 1),
    imageUrl: row.imageUrl || null,
    tier: row.tier || "common",
    sourceType: row.sourceType || "store",
    isActive: Boolean(row.isActive),
    showInShop: Boolean(row.showInShop),
    isStoreVisible: Boolean(row.showInShop),
    isArchived: Boolean(row.isArchived),
    sortOrder: Number(row.sortOrder || 0),
    maxPerUser: row.maxPerUser ?? null,
    stockTotal: row.stockTotal ?? null,
    stockSold: Number(sold || 0),
    availableFrom: row.availableFrom || null,
    availableUntil: row.availableUntil || null,
    metadata: row.metadata || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function containsInsensitive(value: string): { contains: string; mode: "insensitive" } {
  return { contains: value, mode: "insensitive" };
}

function buildWhere(parsed: { q: string; filter: string }): Prisma.MinerWhereInput {
  const { q, filter } = parsed;
  const and: Prisma.MinerWhereInput[] = [];
  if (q) {
    const id = /^\#?\d{1,12}$/.test(q) ? Number(q.replace(/^#/, "")) : null;
    const num = Number(q);
    and.push({
      OR: [
        id ? { id } : undefined,
        { name: containsInsensitive(q) },
        { slug: containsInsensitive(q) },
        { tier: containsInsensitive(q) },
        { sourceType: containsInsensitive(q) },
        Number.isFinite(num) ? { price: num } : undefined,
        Number.isFinite(num) ? { baseHashRate: num } : undefined,
      ].filter(Boolean) as Prisma.MinerWhereInput[],
    });
  }
  if (filter === "active") and.push({ isActive: true, isArchived: false });
  if (filter === "inactive") and.push({ isActive: false });
  if (filter === "store") and.push({ showInShop: true, isArchived: false });
  if (filter === "hidden") and.push({ showInShop: false });
  if (filter === "free") and.push({ price: 0 });
  if (filter === "paid") and.push({ price: { gt: 0 } });
  if (filter === "archived") and.push({ isArchived: true });
  if (ALLOWED_SOURCES.has(filter)) and.push({ sourceType: filter });
  if (ALLOWED_TIERS.has(filter)) and.push({ tier: filter });
  if (filter.startsWith("slots_")) {
    const slots = Number(filter.slice(6));
    if (Number.isInteger(slots) && slots > 0) and.push({ slotSize: slots });
  }
  return and.length ? { AND: and } : {};
}

function orderBy(sort: string): Prisma.MinerOrderByWithRelationInput[] {
  if (sort === "name") return [{ name: "asc" }];
  if (sort === "price_asc") return [{ price: "asc" }, { id: "asc" }];
  if (sort === "price_desc") return [{ price: "desc" }, { id: "desc" }];
  if (sort === "hashrate_asc") return [{ baseHashRate: "asc" }, { id: "asc" }];
  if (sort === "hashrate_desc") return [{ baseHashRate: "desc" }, { id: "desc" }];
  if (sort === "sold") return [{ stockSold: "desc" }, { id: "desc" }];
  if (sort === "value") return [{ price: "asc" }, { baseHashRate: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}

export async function listAdminMiners(prisma: PrismaClient, query: QueryRecord = {}) {
  const parsed = parseAdminMinerQuery(query);
  const where = buildWhere(parsed);
  const [rows, total] = await Promise.all([
    prisma.miner.findMany({
      where,
      orderBy: orderBy(parsed.sort),
      skip: (parsed.page - 1) * parsed.limit,
      take: parsed.limit,
      select: minerSelect({ _count: { select: { userOwnedMachines: true } } }),
    }),
    prisma.miner.count({ where }),
  ]);
  return { ok: true, ...parsed, total, miners: rows.map((r) => minerDto(r as MinerRow)) };
}

export async function getAdminMiner(prisma: PrismaClient, id: unknown) {
  const minerId = parseMinerId(id);
  const row = await prisma.miner.findUnique({
    where: { id: minerId },
    select: minerSelect({ _count: { select: { userOwnedMachines: true, userInventory: true, userMiners: true } } }),
  });
  return row ? { ok: true, miner: minerDto(row as MinerRow) } : null;
}

async function audit(prisma: PrismaClient, action: string, minerId: number, details: Record<string, unknown> = {}) {
  await prisma.auditLog
    .create({
      data: {
        userId: null,
        action,
        label: action.replaceAll("_", " "),
        source: "admin",
        severity: "info",
        metadata: details as Prisma.InputJsonValue,
        relatedEntityType: "miner",
        relatedEntityId: String(minerId),
      },
    })
    .catch(() => null);
}

export async function createAdminMiner(prisma: PrismaClient, body: QueryRecord) {
  const data = parseMinerWriteBody(body) as Prisma.MinerCreateInput;
  const row = await prisma.miner.create({ data, select: minerSelect() });
  await audit(prisma, "ADMIN_MINER_CREATE", row.id, { slug: row.slug, price: Number(row.price), baseHashRate: row.baseHashRate });
  return { ok: true, miner: minerDto(row as MinerRow) };
}

export async function updateAdminMiner(prisma: PrismaClient, id: unknown, body: QueryRecord) {
  const minerId = parseMinerId(id);
  const data = parseMinerWriteBody(body, { partial: true }) as Prisma.MinerUpdateInput;
  const before = await prisma.miner.findUnique({ where: { id: minerId }, select: minerSelect() });
  if (!before) return null;
  const row = await prisma.miner.update({ where: { id: minerId }, data, select: minerSelect() });
  const sensitiveChange = Number(before.price) !== Number(row.price) || Number(before.baseHashRate) !== Number(row.baseHashRate);
  await audit(prisma, sensitiveChange ? "ADMIN_MINER_ECONOMY_UPDATE" : "ADMIN_MINER_UPDATE", row.id, {
    before: { price: Number(before.price), baseHashRate: Number(before.baseHashRate), showInShop: before.showInShop, isActive: before.isActive },
    after: { price: Number(row.price), baseHashRate: Number(row.baseHashRate), showInShop: row.showInShop, isActive: row.isActive },
  });
  return { ok: true, miner: minerDto(row as MinerRow) };
}

export async function duplicateAdminMiner(prisma: PrismaClient, id: unknown) {
  const minerId = parseMinerId(id);
  const source = await prisma.miner.findUnique({ where: { id: minerId }, select: minerSelect() });
  if (!source) return null;
  const baseSlug = `${source.slug}-copy`;
  let slug = baseSlug;
  for (let i = 2; i < 100; i++) {
    const exists = await prisma.miner.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) break;
    slug = `${baseSlug}-${i}`;
  }
  const row = await prisma.miner.create({
    data: {
      name: `${source.name} Copy`.slice(0, 120),
      slug,
      description: source.description,
      longDescription: source.longDescription,
      baseHashRate: source.baseHashRate,
      price: source.price,
      slotSize: source.slotSize,
      imageUrl: source.imageUrl,
      tier: source.tier,
      sourceType: source.sourceType,
      isActive: false,
      showInShop: false,
      isArchived: false,
      sortOrder: source.sortOrder,
      maxPerUser: source.maxPerUser,
      stockTotal: source.stockTotal,
      metadata: source.metadata === null ? undefined : (source.metadata as Prisma.InputJsonValue),
    },
    select: minerSelect(),
  });
  await audit(prisma, "ADMIN_MINER_DUPLICATE", row.id, { sourceMinerId: minerId, sourceSlug: source.slug });
  return { ok: true, miner: minerDto(row as MinerRow) };
}

export async function archiveAdminMiner(prisma: PrismaClient, id: unknown) {
  return setMinerState(prisma, id, { isArchived: true, isActive: false, showInShop: false }, "ADMIN_MINER_ARCHIVE");
}

export async function toggleAdminMinerStore(prisma: PrismaClient, id: unknown, showInShop: unknown) {
  return setMinerState(prisma, id, { showInShop: Boolean(showInShop) }, "ADMIN_MINER_TOGGLE_STORE");
}

export async function toggleAdminMinerActive(prisma: PrismaClient, id: unknown, isActive: unknown) {
  return setMinerState(prisma, id, { isActive: Boolean(isActive) }, "ADMIN_MINER_TOGGLE_ACTIVE");
}

async function setMinerState(prisma: PrismaClient, id: unknown, data: Prisma.MinerUpdateInput, action: string) {
  const minerId = parseMinerId(id);
  const row = await prisma.miner.update({ where: { id: minerId }, data, select: minerSelect() });
  await audit(prisma, action, minerId, data as Record<string, unknown>);
  return { ok: true, miner: minerDto(row as MinerRow) };
}

function parseMinerId(value: unknown): number {
  const s = String(value || "").trim();
  if (!/^\d{1,12}$/.test(s)) throw new Error("invalid_miner_id");
  const id = Number(s);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid_miner_id");
  return id;
}
