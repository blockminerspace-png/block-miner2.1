/**
 * Single Prisma client + pg pool (TypeScript source: `backend/src/shared/prisma/client.ts`).
 * Loaded via `createRequire` so `tsc` for `server/` does not treat `backend/dist` as emit inputs.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { findBlockMinerProjectRoot } from "../../utils/projectRoot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = findBlockMinerProjectRoot(__dirname);
const clientPath = path.join(projectRoot, "backend/dist/shared/prisma/client.js");

const prisma: PrismaClient = (await import(pathToFileURL(clientPath).href)).default;

export default prisma;
