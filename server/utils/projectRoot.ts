import path from "path";
import { existsSync, readFileSync } from "fs";

/**
 * @param {string} fromDir
 * @returns {string}
 */
export function findBlockMinerProjectRoot(fromDir) {
  let dir = fromDir;
  for (let i = 0; i < 12; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg && pkg.name === "block-miner") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(fromDir, "..");
}
