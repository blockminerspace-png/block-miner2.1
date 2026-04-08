import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Error: DATABASE_URL is not defined in environment variables.");
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

  console.log('Seed: Start seeding miners...');
  for (const minerData of miners) {
    // update só atualiza campos técnicos (hashRate, slotSize, imageUrl)
    // NÃO sobrescreve showInShop, isActive, price — gerenciados pelo admin
    const { showInShop: _s, isActive: _a, price: _p, ...technicalFields } = minerData;
    await prisma.miner.upsert({
      where: { slug: minerData.slug },
      update: technicalFields,
      create: minerData,
    });
  }

  // 2. Seed Faucet Reward
  const faucetMiner = await prisma.miner.findUnique({ where: { slug: 'faucet-micro-miner' } });
  if (faucetMiner) {
    await prisma.faucetReward.upsert({
      where: { minerId: faucetMiner.id },
      update: { isActive: true, cooldownMs: 3600000 },
      create: { minerId: faucetMiner.id, isActive: true, cooldownMs: 3600000 }
    });
    console.log('Seed: Faucet reward configured!');
  }

  // 3. Seed Auto Mining Reward
  console.log('Seed: Configuring Auto Mining Reward...');
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
  console.log('Seed: BLK economy config OK');

  const legacyBoth = await prisma.user.updateMany({
    where: { miningPayoutMode: "both" },
    data: { miningPayoutMode: "pol" }
  });
  if (legacyBoth.count > 0) {
    console.log(`Seed: mining mode 'both' -> 'pol' for ${legacyBoth.count} user(s)`);
  }

  console.log('Seed: All data seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
