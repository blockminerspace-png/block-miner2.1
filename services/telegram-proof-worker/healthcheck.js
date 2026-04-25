import prisma from "../../server/src/db/prisma.js";

try {
  await prisma.telegramOutboxEvent.count({ take: 1 });
  await prisma.$disconnect();
  process.exit(0);
} catch (error) {
  console.error("[telegram-proof-worker-health]", error?.message || error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
}
