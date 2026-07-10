#!/usr/bin/env node
/**
 * Runs all tests under tests/ via Node's built-in test runner.
 */
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = join(root, "tests");

function collect(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...collect(p));
    else if (/\.test\.(mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const files = collect(testsDir).sort();
if (files.length === 0) {
  console.error("No test files found under tests/");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: root,
});
process.exit(result.status ?? 1);
