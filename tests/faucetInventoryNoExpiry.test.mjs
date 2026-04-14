import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const faucetControllerPath = join(__dirname, "../server/controllers/faucetController.js");

test("faucet claim does not set 24h inventory TTL", () => {
  const src = readFileSync(faucetControllerPath, "utf8");
  assert.ok(src.includes("createInventoryWithOwnedMachineTx"), "expected faucet to create inventory via helper");
  assert.ok(
    !src.includes("24 * 60 * 60 * 1000"),
    "faucet must not assign 24h expiresAt to inventory (silent cleanup removal)",
  );
});

test("faucet status exposes permanent inventory flags for UI alignment", () => {
  const src = readFileSync(faucetControllerPath, "utf8");
  assert.ok(src.includes("inventoryPermanent"), "status reward should declare permanent inventory");
  assert.ok(src.includes("inventoryExpiresAt"), "status reward should expose expiresAt field (null)");
});
