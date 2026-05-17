import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  archiveAdminMiner,
  createAdminMiner,
  duplicateAdminMiner,
  listAdminMiners,
  parseMinerWriteBody,
  toggleAdminMinerStore,
  updateAdminMiner,
  validateMinerImageUrl,
} from "#server/services/adminMinersService.js";

function prismaMock() {
  const miners = new Map();
  const auditLogs = [];
  let nextId = 1;
  const select = (row) => ({ ...row, _count: { userOwnedMachines: row.userOwnedMachines || 0 } });
  return {
    miners,
    auditLogs,
    miner: {
      findMany: async ({ skip = 0, take = 25 } = {}) => [...miners.values()].slice(skip, skip + take).map(select),
      count: async () => miners.size,
      findUnique: async ({ where }) => {
        if (where.slug) return [...miners.values()].find((m) => m.slug === where.slug) || null;
        return miners.get(where.id) ? select(miners.get(where.id)) : null;
      },
      create: async ({ data }) => {
        if ([...miners.values()].some((m) => m.slug === data.slug)) {
          const err = new Error("Unique constraint failed");
          err.code = "P2002";
          throw err;
        }
        const row = {
          id: nextId++,
          description: null,
          longDescription: null,
          imageUrl: null,
          tier: "common",
          sourceType: "store",
          isActive: true,
          showInShop: true,
          isArchived: false,
          sortOrder: 0,
          maxPerUser: null,
          stockTotal: null,
          stockSold: 0,
          availableFrom: null,
          availableUntil: null,
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        miners.set(row.id, row);
        return select(row);
      },
      update: async ({ where, data }) => {
        const current = miners.get(where.id);
        if (!current) throw new Error("not found");
        const row = { ...current, ...data, updatedAt: new Date() };
        miners.set(where.id, row);
        return select(row);
      },
    },
    auditLog: {
      create: async ({ data }) => {
        auditLogs.push(data);
        return data;
      },
    },
  };
}

const validMiner = {
  name: "Elite Miner",
  slug: "elite-miner",
  baseHashRate: 1000,
  price: 1.25,
  slotSize: 2,
  imageUrl: "https://example.com/miner.png",
  tier: "rare",
  sourceType: "store",
  isActive: true,
  showInShop: true,
};

describe("admin miners service", () => {
  it("creates a valid miner and writes audit log", async () => {
    const prisma = prismaMock();
    const res = await createAdminMiner(prisma, validMiner);
    assert.equal(res.ok, true);
    assert.equal(res.miner.slug, "elite-miner");
    assert.equal(prisma.auditLogs[0].action, "ADMIN_MINER_CREATE");
  });

  it("rejects invalid slug, negative price/hashrate and invalid slots", () => {
    assert.throws(() => parseMinerWriteBody({ ...validMiner, slug: "Bad Slug!" }), /invalid_slug/);
    assert.throws(() => parseMinerWriteBody({ ...validMiner, price: -1 }), /invalid_number/);
    assert.throws(() => parseMinerWriteBody({ ...validMiner, baseHashRate: -1 }), /invalid_number/);
    assert.throws(() => parseMinerWriteBody({ ...validMiner, slotSize: 0 }), /invalid_integer/);
  });

  it("rejects duplicate slug", async () => {
    const prisma = prismaMock();
    await createAdminMiner(prisma, validMiner);
    await assert.rejects(() => createAdminMiner(prisma, validMiner), /Unique constraint/);
  });

  it("updates, duplicates, archives and toggles store visibility", async () => {
    const prisma = prismaMock();
    const created = await createAdminMiner(prisma, validMiner);
    const updated = await updateAdminMiner(prisma, created.miner.id, { price: 2, baseHashRate: 1500 });
    assert.equal(updated.miner.price, 2);
    assert.equal(prisma.auditLogs.at(-1).action, "ADMIN_MINER_ECONOMY_UPDATE");

    const duplicated = await duplicateAdminMiner(prisma, created.miner.id);
    assert.equal(duplicated.miner.isActive, false);
    assert.equal(duplicated.miner.showInShop, false);
    assert.match(duplicated.miner.slug, /^elite-miner-copy/);

    const hidden = await toggleAdminMinerStore(prisma, created.miner.id, false);
    assert.equal(hidden.miner.showInShop, false);

    const archived = await archiveAdminMiner(prisma, created.miner.id);
    assert.equal(archived.miner.isArchived, true);
    assert.equal(archived.miner.isActive, false);
  });

  it("lists with pagination and safe image URLs", async () => {
    const prisma = prismaMock();
    await createAdminMiner(prisma, validMiner);
    const list = await listAdminMiners(prisma, { page: 1, limit: 10, q: "elite" });
    assert.equal(list.miners.length, 1);
    assert.equal(list.totalPages, 1);
    assert.equal(validateMinerImageUrl("/uploads/safe.png"), "/uploads/safe.png");
    assert.throws(() => validateMinerImageUrl("javascript:alert(1)"), /invalid_image/);
    assert.throws(() => validateMinerImageUrl("/uploads/../x.png"), /invalid_image/);
  });

  it("normalizes invalid filter and sort instead of throwing 500-prone errors", async () => {
    const prisma = prismaMock();
    await createAdminMiner(prisma, validMiner);
    const list = await listAdminMiners(prisma, { page: "bad", limit: 10, filter: "not-real", sort: "not-real" }).catch((err) => err);
    assert.match(String(list.message), /invalid_pagination/);

    const normalized = await listAdminMiners(prisma, { page: 1, limit: 10, filter: "not-real", sort: "not-real" });
    assert.equal(normalized.filter, "all");
    assert.equal(normalized.sort, "recent");
    assert.equal(normalized.miners.length, 1);
  });
});
