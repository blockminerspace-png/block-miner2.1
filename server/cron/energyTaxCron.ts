import cron from "node-cron";
import loggerLib from "../utils/logger.js";
import { runWeeklySweep } from "../modules/energy-tax/index.js";
import { errMsg } from "../types/tsNarrowing.js";

const logger = loggerLib.child("EnergyTaxCron");

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
export function startEnergyTaxCron(): { energyTaxTimer: ReturnType<typeof cron.schedule> } {
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

  logger.info("scheduled", { sweepPattern, sweepBrt: "Mon 21:00 BRT" });
  return { energyTaxTimer };
}
