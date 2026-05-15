import path from "path";
import { existsSync, readFileSync } from "fs";

/**
 * @param {string} fromDir
 * @returns {string}
 */
export function findBlockMinerProjectRoot(fromDir) {
  let dir = path.resolve(fromDir);
  for (let i = 0; i < 16; i++) {
    const marker = path.join(dir, "server", "prisma", "schema.prisma");
    const pkgPath = path.join(dir, "package.json");
    if (existsSync(marker) && existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg && pkg.name === "block-miner") {
          return dir;
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
    const guessMarker = path.join(guess, "server", "prisma", "schema.prisma");
    if (existsSync(guessMarker) && existsSync(path.join(guess, "package.json"))) {
      return guess;
    }
  }
  return path.join(fromDir, "..");
}
