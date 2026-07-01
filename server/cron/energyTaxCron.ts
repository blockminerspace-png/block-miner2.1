import cron from "node-cron";
import loggerLib from "../utils/logger.js";
import { runWeeklySweep, checkAndUpdateEnergyBlock, isEnergyTaxActive, lastSevenBrtDays } from "../modules/energy-tax/index.js";
import { errMsg } from "../types/tsNarrowing.js";
import prisma from "../src/db/prisma.js";

const logger = loggerLib.child("EnergyTaxCron");

async function runDailyEnergyBlockCheck() {
  if (!isEnergyTaxActive()) return;
  const days = lastSevenBrtDays();
  const windowStart = days[0];
  const now = new Date();

  // Quem minerou nos últimos 7 dias
  const minerRows = await prisma.blockMinerReward.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: windowStart, lt: now } },
  });

  logger.info("daily block check starting", { users: minerRows.length });
  let updated = 0;
  for (const row of minerRows) {
    try {
      await checkAndUpdateEnergyBlock(row.userId);
      updated++;
    } catch (err: unknown) {
      logger.warn("block check failed for user", { userId: row.userId, error: errMsg(err) });
    }
  }
  logger.info("daily block check done", { updated });
}

/**
 * Toda segunda-feira 21:00 BRT = terça 00:00 UTC.
 * Usamos o pattern em UTC ("0 0 * * 2") em vez de timezone: "America/Sao_Paulo",
 * seguindo o padrão dos demais crons do projeto e evitando um bug do node-cron 3.x
 * onde schedules semanais com timezone não-BRT podiam perder o disparo.
 *
 * A janela de cobrança em si é calculada em BRT dentro do runWeeklySweep
 * (via lastSevenBrtDays), então o resultado é idêntico.
 *
 * Para cada usuário que minerou nos últimos 7 dias, cria cobranças automáticas
 * (`mode='auto'`, 2,1429%/dia = 15%/semana) para cada dia que não foi pago manualmente
 * — dias isentos por atividade recebem `mode='exempt'`.
 */
export function startEnergyTaxCron(): { energyTaxTimer: ReturnType<typeof cron.schedule>; energyBlockTimer: ReturnType<typeof cron.schedule> } {
  // Segunda 21:00 BRT (UTC-3) == terça 00:00 UTC. Pattern em UTC é robusto.
  const sweepPattern = "0 0 * * 2";
  const energyTaxTimer = cron.schedule(
    sweepPattern,
    () => {
      runWeeklySweep().catch((err: unknown) => {
        logger.error("weekly sweep failed", { error: errMsg(err) });
      });
    },
    { timezone: "UTC" },
  );

  // Diariamente à meia-noite BRT (03:00 UTC) para atualizar bloqueios de energia
  const blockPattern = "0 3 * * *";
  const energyBlockTimer = cron.schedule(
    blockPattern,
    () => {
      runDailyEnergyBlockCheck().catch((err: unknown) => {
        logger.error("daily block check failed", { error: errMsg(err) });
      });
    },
    { timezone: "UTC" },
  );

  logger.info("scheduled", { sweepPattern, sweepBrt: "Mon 21:00 BRT", blockPattern, blockBrt: "00:00 BRT" });
  return { energyTaxTimer, energyBlockTimer };
}
