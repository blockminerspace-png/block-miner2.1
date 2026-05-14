/**
 * Runs Node's built-in test runner only on files in /tests (avoids picking up client Vitest files).
 */
import { spawnSync } from "child_process";
import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const testsDir = path.join(root, "tests");

const files = readdirSync(testsDir)
  .filter((f) => /\.test\.(js|mjs)$/.test(f))
  .map((f) => path.join(testsDir, f));

if (files.length === 0) {
  console.error("No tests/*.test.{js,mjs} files found.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "--experimental-test-coverage",
    ...files,
  ],
  {
    stdio: "inherit",
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || "test",
      JWT_SECRET: process.env.JWT_SECRET || "testsecret"
    }
  }
);

process.exit(result.status === null ? 1 : result.status);
