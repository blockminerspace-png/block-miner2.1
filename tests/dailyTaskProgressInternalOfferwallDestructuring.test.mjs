import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

test("bumpDailyTasksForUser destructures internalOfferwallOfferId (no ReferenceError at runtime)", () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const file = path.join(root, "server/services/dailyTasks/dailyTaskProgressService.js");
  const src = readFileSync(file, "utf8");
  assert.ok(
    src.includes("{ dedupeKey, delta, gameSlug, internalOfferwallOfferId } = {}"),
    "internalOfferwallOfferId must be in bumpDailyTasksForUser destructuring"
  );
});
