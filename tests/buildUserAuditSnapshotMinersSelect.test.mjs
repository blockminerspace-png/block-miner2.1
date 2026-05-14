import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

test("buildUserAuditSnapshot loads UserMiner via miner relation, not invalid minerName field", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const file = path.join(root, "dist/server/services/internalOfferwall/buildUserAuditSnapshot.js");
  const src = readFileSync(file, "utf8");
  const minersStart = src.indexOf("miners:");
  assert.ok(minersStart >= 0);
  const inv = src.indexOf("inventory:", minersStart);
  assert.ok(inv > minersStart);
  const minersBlock = src.slice(minersStart, inv);
  assert.ok(
    !minersBlock.includes("minerName: true"),
    "UserMiner model has no minerName; Prisma would throw at runtime"
  );
  assert.ok(minersBlock.includes("miner:"), "Expected nested miner select for catalog name");
});
