/**
 * Clears expires_at on user_inventory rows tied to the active faucet reward miner.
 * Run once after deploying permanent-faucet behavior so existing claims are not deleted by cleanup.
 *
 * Usage (from repo root): node scripts/clear-faucet-inventory-expiry.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const { default: prisma } = await import("../server/src/db/prisma.js");

try {
  const reward = await prisma.faucetReward.findFirst({
    where: { isActive: true },
    select: { minerId: true },
  });
  if (!reward?.minerId) {
    console.error("No active faucet reward (faucet_rewards.is_active). Nothing to do.");
    process.exit(1);
  }
  const result = await prisma.userInventory.updateMany({
    where: { minerId: reward.minerId, expiresAt: { not: null } },
    data: { expiresAt: null },
  });
  console.log(`Updated ${result.count} inventory row(s) for faucet minerId=${reward.minerId}.`);
} finally {
  await prisma.$disconnect();
}
