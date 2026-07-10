import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';

import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("seed");
const { PrismaClient, Prisma } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  logger.error("Error: DATABASE_URL is not defined in environment variables.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Seed Miners
  const miners = [
    {
      name: "AntMiner S19",
      slug: "antminer-s19",
      baseHashRate: 95,
      price: 150.0,
      slotSize: 2,
      imageUrl: "/machines/3.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Bitmain T17",
      slug: "bitmain-t17",
      baseHashRate: 40,
      price: 45.0,
      slotSize: 1,
      imageUrl: "/machines/2.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "MicroBT M30S",
      slug: "microbt-m30s",
      baseHashRate: 88,
      price: 120.0,
      slotSize: 2,
      imageUrl: "/machines/1.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Basic USB Miner",
      slug: "basic-usb-miner",
      baseHashRate: 2,
      price: 5.0,
      slotSize: 1,
      imageUrl: "/machines/reward3.png",
      isActive: true,
      showInShop: true
    },
    {
      name: "Pulse Mini v1",
      slug: "faucet-micro-miner",
      baseHashRate: 1,
      price: 0,
      slotSize: 1,
      imageUrl: "/machines/reward2.png",
      isActive: true,
      showInShop: false
    }
  ];

  logger.info('Seed: Start seeding miners...');
  for (const minerData of miners) {
    const { showInShop: _s, isActive: _a, price: _p, ...technicalFields } = minerData;
    const isFaucetMiner = minerData.slug === "faucet-micro-miner";
    const existing = await prisma.miner.findUnique({ where: { slug: minerData.slug } });
    if (!existing) {
      await prisma.miner.create({ data: minerData });
    } else if (!isFaucetMiner) {
      // Faucet miner: nunca sobrescrever imageUrl/baseHashRate no seed (persistência / admin)
      await prisma.miner.update({
        where: { slug: minerData.slug },
        data: technicalFields,
      });
    }
  }

  // 2. Seed Faucet Reward (cria só se não existir — não reseta cooldown ativo no banco)
  const faucetMiner = await prisma.miner.findUnique({ where: { slug: "faucet-micro-miner" } });
  if (faucetMiner) {
    const fr = await prisma.faucetReward.findUnique({ where: { minerId: faucetMiner.id } });
    if (!fr) {
      await prisma.faucetReward.create({
        data: { minerId: faucetMiner.id, isActive: true, cooldownMs: 3600000 },
      });
      logger.info("Seed: Faucet reward created!");
    } else {
      logger.info("Seed: Faucet reward already present, skipping.");
    }
  }

  // 3. Seed Auto Mining Reward
  logger.info('Seed: Configuring Auto Mining Reward...');
  await prisma.autoMiningReward.upsert({
    where: { slug: 'pulse-gpu-v1' },
    update: {
      name: "Pulse GPU v1",
      gpuHashRate: 1,
      isActive: true,
      imageUrl: "/machines/reward3.png",
      description: "Hardware de mineração automática de baixo consumo."
    },
    create: {
      name: "Pulse GPU v1",
      slug: "pulse-gpu-v1",
      gpuHashRate: 1,
      isActive: true,
      imageUrl: "/machines/reward3.png",
      description: "Hardware de mineração automática de baixo consumo."
    }
  });

  await prisma.blkEconomyConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      polPerBlk: 100,
      convertFeeBps: 500,
      minConvertPol: 50,
      dailyConvertLimitBlk: null,
      convertCooldownSec: 300,
      blkCycleReward: 0.03,
      blkCycleIntervalSec: 600,
      blkCycleActivitySec: 900,
      blkCycleMinHashrate: 0.00000001,
      blkCyclePaused: false,
      blkCycleBoost: 1
    }
  });
  logger.info('Seed: BLK economy config OK');

  const legacyBoth = await prisma.user.updateMany({
    where: { miningPayoutMode: "both" },
    data: { miningPayoutMode: "pol" }
  });
  if (legacyBoth.count > 0) {
    logger.info(`Seed: mining mode 'both' -> 'pol' for ${legacyBoth.count} user(s)`);
  }

  const defaultMilestones = [
    {
      dayThreshold: 7,
      rewardType: 'pol',
      rewardValue: new Prisma.Decimal('0.05'),
      validityDays: 1,
      displayTitle: null,
      description: null,
      active: true,
      sortOrder: 10,
      minerId: null,
      itemCode: null,
    },
    {
      dayThreshold: 15,
      rewardType: 'temporary_power',
      rewardValue: new Prisma.Decimal('75'),
      validityDays: 1,
      displayTitle: null,
      description: null,
      active: true,
      sortOrder: 20,
      minerId: null,
      itemCode: null,
      metadataJson: { durationHours: 168 },
    },
    {
      dayThreshold: 30,
      rewardType: 'pol',
      rewardValue: new Prisma.Decimal('0.25'),
      validityDays: 1,
      displayTitle: null,
      description: null,
      active: true,
      sortOrder: 30,
      minerId: null,
      itemCode: null,
    },
  ];
  for (const m of defaultMilestones) {
    await prisma.checkinStreakMilestone.upsert({
      where: { dayThreshold: m.dayThreshold },
      create: m,
      update: {
        rewardType: m.rewardType,
        rewardValue: m.rewardValue,
        validityDays: m.validityDays,
        displayTitle: m.displayTitle,
        description: m.description,
        active: m.active,
        sortOrder: m.sortOrder,
        minerId: m.minerId,
        itemCode: m.itemCode,
        ...(m.metadataJson != null ? { metadataJson: m.metadataJson } : {}),
      },
    });
  }
  logger.info('Seed: check-in streak milestones OK');

  logger.info('Seed: All data seeded successfully!');
}

main()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
