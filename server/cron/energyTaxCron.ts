import cron from "node-cron";
import loggerLib from "../utils/logger.js";
import { runWeeklySweep } from "../modules/energy-tax/index.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("EnergyTaxCron");

/**
 * Toda segunda-feira 21:00 América/Sao_Paulo (BRT).
 * Para cada usuário que minerou nos últimos 7 dias, cria cobranças automáticas
 * (`mode='auto'`, 1.4286%/dia) para cada dia que não foi pago manualmente.
 */
export function startEnergyTaxCron(): { energyTaxTimer: ReturnType<typeof cron.schedule> } {
  const pattern = "0 21 * * 1";
  const task = cron.schedule(
    pattern,
    () => {
      runWeeklySweep().catch((err: unknown) => {
        logger.error("weekly sweep failed", { error: errMsg(err) });
      });
    },
    { timezone: "America/Sao_Paulo" },
  );
  logger.info("scheduled", { pattern, tz: "America/Sao_Paulo" });
  return { energyTaxTimer: task };
}
