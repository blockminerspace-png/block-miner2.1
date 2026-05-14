import cron from "node-cron";
import { removeExpiredGPUs } from "../models/autoMiningGpuModel.js";
import { errMsg } from "../types/tsNarrowing.js";

/** node-cron scheduled task (`.stop()` to cancel). */
type CronScheduledTask = { stop: () => void };

let autoMiningGpuJob: CronScheduledTask | null = null;
let gpuCleanupJob: CronScheduledTask | null = null;

/**
 * DESABILITADO - Usar endpoint /api/auto-mining-gpu/claim para liberar GPUs
 * Não liberar automaticamente para todos os usuários (sobrecarrega o BD)
 */
export async function releaseAutoMiningGPUs(): Promise<void> {
  return;
}

/**
 * Remove GPUs expiradas a cada 1 minuto
 */
export async function cleanupExpiredGPUs(): Promise<void> {
  try {
    const removedCount = await removeExpiredGPUs();

    if (removedCount > 0) {
      console.log(`[AUTO MINING GPU CLEANUP] ${removedCount} GPU(s) expirada(s) removida(s)`);
    }
  } catch (err: unknown) {
    console.error("[AUTO MINING GPU CLEANUP] Erro durante limpeza:", errMsg(err));
  }
}

/**
 * Inicia o job de auto mining GPU
 * Libera uma GPU a cada 5 minutos
 */
export function startAutoMiningGPUJob(): void {
  if (autoMiningGpuJob) {
    console.log("[AUTO MINING GPU] Job já está em execução");
    return;
  }

  autoMiningGpuJob = cron.schedule("*/5 * * * *", async () => {
    await releaseAutoMiningGPUs();
  });

  console.log("[AUTO MINING GPU] Job iniciado - Liberando GPUs a cada 5 minutos");

  void releaseAutoMiningGPUs();
}

/**
 * Inicia o job de limpeza de GPUs expiradas
 * Remove GPUs expiradas a cada 1 minuto
 */
export function startGPUCleanupJob(): void {
  if (gpuCleanupJob) {
    console.log("[AUTO MINING GPU CLEANUP] Job já está em execução");
    return;
  }

  gpuCleanupJob = cron.schedule("* * * * *", async () => {
    await cleanupExpiredGPUs();
  });

  console.log("[AUTO MINING GPU CLEANUP] Job iniciado - Limpando GPUs a cada 1 minuto");
}

export function stopAutoMiningGPUJob(): void {
  if (autoMiningGpuJob) {
    autoMiningGpuJob.stop();
    autoMiningGpuJob = null;
    console.log("[AUTO MINING GPU] Job parado");
  }
}

export function stopGPUCleanupJob(): void {
  if (gpuCleanupJob) {
    gpuCleanupJob.stop();
    gpuCleanupJob = null;
    console.log("[AUTO MINING GPU CLEANUP] Job parado");
  }
}

export function stopAllAutoMiningGPUJobs(): void {
  stopAutoMiningGPUJob();
  stopGPUCleanupJob();
}

export function startAllAutoMiningGPUJobs(): void {
  startAutoMiningGPUJob();
  startGPUCleanupJob();
}
