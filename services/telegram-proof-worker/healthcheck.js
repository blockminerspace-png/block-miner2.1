import prisma from "#server/src/db/prisma.js";

try {
  await prisma.telegramOutboxEvent.count({ take: 1 });
  await prisma.$disconnect();
  process.exit(0);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.error("[telegram-proof-worker-health]", msg);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
