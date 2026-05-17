import assert from "node:assert/strict";
import test from "node:test";
import { adminMinersRouter } from "#server/modules/admin-miners/index.js";
import { toAdminMinerListRow } from "#server/modules/admin-miners/adminMiners.dto.js";
import { isPrismaSchemaMismatch } from "#server/modules/admin-miners/adminMiners.errors.js";

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
