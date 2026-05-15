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
        if (pkg && pkg.name === "block-miner") {
          const marker = path.join(dir, "server", "prisma", "schema.prisma");
          if (existsSync(marker)) {
            return dir;
          }
        }
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const normalized = fromDir.replace(/\\/g, "/");
  if (normalized.includes("/dist/server")) {
    const guess = path.resolve(fromDir, "..", "..");
    if (existsSync(path.join(guess, "package.json"))) {
      return guess;
    }
  }
  return path.join(fromDir, "..");
}
