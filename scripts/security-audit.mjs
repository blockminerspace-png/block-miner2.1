/**
 * Fails the process when npm audit reports critical vulnerabilities (CI gate).
 */

import { spawnSync } from "node:child_process";

const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["audit", "--audit-level=critical"], {
  stdio: "inherit",
  shell: false,
});

process.exit(typeof r.status === "number" ? r.status : 1);
