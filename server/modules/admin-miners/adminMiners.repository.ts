import type { Prisma, PrismaClient } from "@prisma/client";
import type { QueryRecord } from "../../services/queryRecord.js";
import {
  minerSelect,
  parseAdminMinerQuery,
  parseMinerWriteBody,
} from "./adminMiners.schemas.js";

const ALLOWED_TIERS = new Set(["common", "uncommon", "rare", "epic", "legendary", "special"]);
const ALLOWED_SOURCES = new Set(["store", "reward", "shortlink", "faucet", "admin", "event"]);

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
  if (sort === "oldest") return [{ createdAt: "asc" }, { id: "asc" }];
  if (sort === "name") return [{ name: "asc" }];
  if (sort === "price_asc") return [{ price: "asc" }, { id: "asc" }];
  if (sort === "price_desc") return [{ price: "desc" }, { id: "desc" }];
  if (sort === "hashrate_asc" || sort === "power_asc") return [{ baseHashRate: "asc" }, { id: "asc" }];
  if (sort === "hashrate_desc" || sort === "power_desc") return [{ baseHashRate: "desc" }, { id: "desc" }];
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
      select: minerSelect(),
    }),
    prisma.miner.count({ where }),
  ]);
  return {
    ok: true,
    ...parsed,
    total,
    totalPages: Math.max(1, Math.ceil(total / parsed.limit)),
    miners: rows.map((r) => minerDto(r as MinerRow)).filter((m) => m !== null),
  };
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
