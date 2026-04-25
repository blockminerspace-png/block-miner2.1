import prisma from "../db/prisma.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("FaucetBootstrap");

const DEFAULT_SLUG = "faucet-micro-miner";
const DEFAULT_IMAGE = "/machines/reward2.png";

/**
 * Ensures faucet miner + faucet_rewards row exist. Does not overwrite an existing
 * miner row (DB / admin is source of truth). Uses .env only when creating the miner.
 */
export async function ensureFaucetReward() {
  const slug = String(process.env.FAUCET_MINER_SLUG || DEFAULT_SLUG).trim() || DEFAULT_SLUG;
  const cooldownMs = Math.max(0, Number(process.env.FAUCET_COOLDOWN_MS || 3_600_000)) || 3_600_000;

  let miner = await prisma.miner.findUnique({ where: { slug } });

  if (!miner) {
    const name = String(process.env.FAUCET_MINER_NAME || "Pulse Mini v1").trim() || "Pulse Mini v1";
    const rawPower = Number(process.env.FAUCET_POWER ?? process.env.FAUCET_BASE_HASH_RATE ?? 1);
    const baseHashRate = Number.isFinite(rawPower) ? rawPower : 1;
    const imageUrl = String(process.env.FAUCET_IMAGE_URL || DEFAULT_IMAGE).trim() || DEFAULT_IMAGE;

    miner = await prisma.miner.create({
      data: {
        name,
        slug,
        baseHashRate,
        price: 0,
        slotSize: 1,
        imageUrl,
        isActive: true,
        showInShop: false,
      },
    });
    logger.info("Created faucet miner from env defaults", {
      slug,
      baseHashRate,
      imageUrl: imageUrl.slice(0, 80),
    });
  }

  const existingReward = await prisma.faucetReward.findUnique({
    where: { minerId: miner.id },
  });
  if (!existingReward) {
    await prisma.faucetReward.create({
      data: {
        minerId: miner.id,
        isActive: true,
        cooldownMs,
      },
    });
    logger.info("Created faucet reward row", { minerId: miner.id, cooldownMs });
  }

  return { minerId: miner.id, slug };
}
