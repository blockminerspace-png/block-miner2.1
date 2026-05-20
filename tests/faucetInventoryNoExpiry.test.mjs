import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const faucetServicePath = join(__dirname, "../server/modules/faucet/faucet.service.ts");
const faucetDtoPath = join(__dirname, "../server/modules/faucet/faucet.dto.ts");

test("faucet claim does not set 24h inventory TTL", () => {
  const src = readFileSync(faucetServicePath, "utf8");
  assert.ok(src.includes("createInventoryWithOwnedMachineTx"), "expected faucet to create inventory via helper");
  assert.ok(
    !src.includes("24 * 60 * 60 * 1000"),
    "faucet must not assign 24h expiresAt to inventory (silent cleanup removal)",
  );
});

test("faucet status exposes permanent inventory flags for UI alignment", () => {
  const src = readFileSync(faucetDtoPath, "utf8");
  assert.ok(src.includes("inventoryPermanent"), "status reward should declare permanent inventory");
  assert.ok(src.includes("inventoryExpiresAt"), "status reward should expose expiresAt field (null)");
});
