#!/usr/bin/env node
/**
 * Read-only audit: lists DB imageUrl values with no matching file under uploads root.
 * Usage (after build): node scripts/audit-upload-image-files.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../dist/server/src/db/prisma.js";
import { resolveUploadsRoot } from "../dist/server/utils/uploadsRoot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function urlToRelativeFile(imageUrl) {
  if (typeof imageUrl !== "string") return null;
  const trimmed = imageUrl.trim();
  if (!trimmed.startsWith("/uploads/")) return null;
  return trimmed.replace(/^\/uploads\/?/, "");
}

async function main() {
  const uploadRoot = resolveUploadsRoot(path.join(__dirname, "../server"));
  const miners = await prisma.miner.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, imageUrl: true },
  });

  let missing = 0;
  for (const row of miners) {
    const rel = urlToRelativeFile(row.imageUrl);
    if (!rel) continue;
    const abs = path.join(uploadRoot, rel);
    if (!fs.existsSync(abs)) {
      missing += 1;
      console.log(`MISSING miner#${row.id} ${row.name}: ${row.imageUrl}`);
    }
  }

  console.log(`Upload root: ${uploadRoot}`);
  console.log(`Miners checked: ${miners.length}, missing files: ${missing}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
