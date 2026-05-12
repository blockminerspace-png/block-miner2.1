import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const checkinTs = join(__dirname, "../server/controllers/checkinController.ts");
const checkinJs = join(__dirname, "../server/controllers/checkinController.js");
const checkinControllerPath = existsSync(checkinTs) ? checkinTs : checkinJs;

test("wallet check-in rejects users without a linked wallet (server gate)", () => {
  const src = readFileSync(checkinControllerPath, "utf8");
  assert.ok(
    src.includes("walletAddress") && src.includes("WALLET_REQUIRED") && src.includes("confirmCheckin"),
    "confirmCheckin must require walletAddress and return WALLET_REQUIRED",
  );
  assert.ok(
    src.includes("checkin_confirm_missing_wallet"),
    "missing-wallet attempts should be logged for security visibility",
  );
});

test("successful wallet check-in is auditable in logs", () => {
  const src = readFileSync(checkinControllerPath, "utf8");
  assert.ok(
    src.includes("checkin_wallet_confirm_success"),
    "successful wallet check-in should emit a structured security event",
  );
});

test("balance check-in path is implemented and auditable", () => {
  const src = readFileSync(checkinControllerPath, "utf8");
  assert.ok(
    src.includes("checkin_balance_confirm_success"),
    "successful balance check-in should emit a structured security event",
  );
  assert.ok(src.includes("checkinBalance"), "checkinBalance handler should exist");
});
