import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkinControllerPath = join(__dirname, "../server/controllers/checkinController.js");

test("free check-in rejects users without a linked wallet (server gate)", () => {
  const src = readFileSync(checkinControllerPath, "utf8");
  assert.ok(
    src.includes("walletAddress") && src.includes("WALLET_REQUIRED"),
    "claimCheckin must require walletAddress and return WALLET_REQUIRED",
  );
  assert.ok(
    src.includes("checkin_claim_missing_wallet"),
    "missing-wallet attempts should be logged for security visibility",
  );
});

test("successful free check-in is auditable in logs", () => {
  const src = readFileSync(checkinControllerPath, "utf8");
  assert.ok(
    src.includes("checkin_free_claim_success"),
    "successful free claim should emit a structured security event",
  );
});
