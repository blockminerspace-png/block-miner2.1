import cron from "node-cron";
import loggerLib from "../utils/logger.js";
import { runWeeklySweep } from "../modules/energy-tax/index.js";
import { errMsg } from "../types/tsNarrowing.js";
import { getRedis } from "../services/redisClient.js";
import { recordCronHeartbeat } from "../shared/observability/index.js";

const logger = loggerLib.child("EnergyTaxCron");

const SWEEP_LOCK_KEY = "energy_tax:weekly_sweep_lock";
const SWEEP_LOCK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function acquireSweepLock(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true; // no Redis → allow (single-node fallback)
  const result = await redis.set(SWEEP_LOCK_KEY, "1", "PX", SWEEP_LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseSweepLock(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(SWEEP_LOCK_KEY).catch(() => {});
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
 *
 * Redis lock (SET NX PX 7200000) impede dupla execução em ambientes multi-container
 * (block-miner-app + block-miner-worker).
 */
export function startEnergyTaxCron(): { energyTaxTimer: ReturnType<typeof cron.schedule> } {
  const sweepPattern = "0 0 * * 2";
  const energyTaxTimer = cron.schedule(
    sweepPattern,
    async () => {
      const acquired = await acquireSweepLock().catch((err: unknown) => {
        logger.warn("sweep lock acquire failed, proceeding without lock", { error: errMsg(err) });
        return true;
      });
      if (!acquired) {
        logger.info("sweep lock held by another instance, skipping");
        return;
      }
      try {
        await runWeeklySweep();
        recordCronHeartbeat("energy_tax_weekly_sweep");
      } catch (err: unknown) {
        logger.error("weekly sweep failed", { error: errMsg(err) });
      } finally {
        await releaseSweepLock();
      }
    },
    { timezone: "UTC" },
  );

  logger.info("scheduled", { sweepPattern, sweepBrt: "Mon 21:00 BRT" });
  return { energyTaxTimer };
}
