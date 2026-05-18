import assert from "node:assert/strict";
import test from "node:test";
import { adminMinersRouter } from "#server/modules/admin-miners/index.js";
import { toAdminMinerListRow } from "#server/modules/admin-miners/adminMiners.dto.js";
import { isPrismaSchemaMismatch, ADMIN_MINERS_ERROR } from "#server/modules/admin-miners/adminMiners.errors.js";
import { parseAdminMinerQuery } from "#server/modules/admin-miners/adminMiners.schemas.js";

test("admin miners router preserves /miners routes", () => {
  const stack = adminMinersRouter.stack.map((layer) => layer.route?.path).filter(Boolean);
  assert.ok(stack.includes("/miners"));
  assert.ok(stack.includes("/miners/:id"));
  assert.ok(stack.includes("/miners/upload-image"));
});

test("isPrismaSchemaMismatch detects missing column errors", () => {
  assert.equal(
    isPrismaSchemaMismatch(new Error('The column "long_description" does not exist in the current database.')),
    true,
  );
  assert.equal(isPrismaSchemaMismatch(new Error("invalid_slug")), false);
});

test("admin miner DTO serializes Date and numeric values safely", () => {
  const row = toAdminMinerListRow({
    id: 1,
    name: "Elite",
    slug: "elite",
    price: "1.25000000",
    baseHashRate: 1000,
    showInShop: true,
    stockSold: 2,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  });
  assert.equal(row.price, "1.25000000");
  assert.equal(row.baseHashRate, "1000");
  assert.equal(row.hashRate, "1000");
  assert.equal(row.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(row.salesCount, 2);
  assert.equal("passwordHash" in row, false);
});

test("parseAdminMinerQuery accepts filter=all and sort=recent", () => {
  const parsed = parseAdminMinerQuery({ page: "1", limit: "25", filter: "all", sort: "recent" });
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.filter, "all");
  assert.equal(parsed.sort, "recent");
});

test("parseAdminMinerQuery normalizes unknown filter and sort", () => {
  const parsed = parseAdminMinerQuery({ page: 1, limit: 10, filter: "not-real", sort: "not-real" });
  assert.equal(parsed.filter, "all");
  assert.equal(parsed.sort, "recent");
});

test("parseAdminMinerQuery rejects invalid pagination", () => {
  assert.throws(() => parseAdminMinerQuery({ page: "bad", limit: 10 }), /invalid_pagination/);
});

test("schema out of date error code is stable for clients", () => {
  assert.equal(ADMIN_MINERS_ERROR.SCHEMA_OUT_OF_DATE, "ADMIN_MINERS_SCHEMA_OUT_OF_DATE");
});
