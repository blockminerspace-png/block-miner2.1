import path from "path";
import { existsSync, mkdirSync } from "fs";
import { findBlockMinerProjectRoot } from "./projectRoot.js";

/**
 * Persistent uploads directory (`/app/uploads` or `/app/data/uploads` in Docker).
 * Do not resolve relative to `dist/server/...` — that lands outside the volume.
 *
 * Prefer explicit UPLOADS_DIR, then legacy `./uploads` (production volume today),
 * then `./data/uploads` for new deployments.
 */
export function resolveUploadsRoot(fromModuleDir: string): string {
  if (process.env.UPLOADS_DIR?.trim()) {
    return path.resolve(process.env.UPLOADS_DIR.trim());
  }
  const projectRoot = findBlockMinerProjectRoot(fromModuleDir);
  const legacy = path.join(projectRoot, "uploads");
  const modern = path.join(projectRoot, "data", "uploads");
  if (existsSync(legacy)) {
    return legacy;
  }
  mkdirSync(modern, { recursive: true });
  return modern;
}

export function resolveUploadsSubdir(fromModuleDir: string, subdir: string): string {
  const dir = path.join(resolveUploadsRoot(fromModuleDir), subdir);
  mkdirSync(dir, { recursive: true });
  return dir;
}
