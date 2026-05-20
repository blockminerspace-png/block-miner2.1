import { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";

type OrphanRow = { amount: unknown };

async function runGlobalRescue() {
  console.log("[INFO] Iniciando Resgate Global de Órfãos...");

  const users = await prisma.user.findMany({
    where: { walletAddress: { not: null } },
    select: { id: true, walletAddress: true },
  });

  console.log(`[INFO] Verificando ${users.length} usuários com carteira vinculada.`);

  for (const user of users) {
    const addr = user.walletAddress;
    if (!addr) continue;
    const wallet = addr.toLowerCase();

    await prisma.$transaction(async (tx) => {
      const orphans = await tx.$queryRaw<OrphanRow[]>(
        Prisma.sql`DELETE FROM public.orphan_deposits WHERE LOWER(wallet_address) = ${wallet} RETURNING amount`,
      );

      if (orphans && orphans.length > 0) {
        const total = orphans.reduce((sum, o) => sum + Number(o.amount), 0);
        await tx.user.update({
          where: { id: user.id },
          data: { polBalance: { increment: total } },
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            amount: total,
            type: "deposit",
            status: "completed",
            txHash: `GLOBAL-RESCUE-${Date.now()}`,
            completedAt: new Date(),
          },
        });
        console.log(`[SUCESSO] Usuário ${user.id} resgatou ${total} POL.`);
      }
    });
  }
  console.log("[INFO] Resgate Global Finalizado.");
}

void runGlobalRescue().finally(() => prisma.$disconnect());
