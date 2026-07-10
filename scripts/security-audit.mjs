#!/usr/bin/env node
/**
 * Runs `npm audit` with moderate-or-higher severity threshold.
 * Exit code follows npm audit (non-zero when vulnerabilities are found).
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npm",
  ["audit", "--audit-level=moderate"],
  { stdio: "inherit", shell: process.platform === "win32" },
);

process.exit(result.status ?? 1);
