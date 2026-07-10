import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { ensureRedisConnected, getRedisUrl } from "../../services/redisClient.js";
import { BLOCKMINER_QUEUE_NAME, getBlockminerQueue, isBullMqPublishingEnabled } from "../../jobs/blockminerQueue.js";
import {
  bullmqJobsActive,
  bullmqJobsCompleted,
  bullmqJobsFailed,
  bullmqJobsWaiting,
  httpErrors5xxTotal,
  miningActiveMiners,
  miningBlockNumber,
  redisConnected,
  redisMemoryBytes,
} from "./metricsRegistry.js";
import { evaluateAlertThresholds, listActiveAlerts } from "./alertRegistry.js";
import {
  getCronSchedulerStartedAt,
  getObservabilityMiningEngine,
  getObservabilitySocketIo,
} from "./runtimeRegistry.js";
import { findBlockMinerProjectRoot } from "../../utils/projectRoot.js";
import { fileURLToPath } from "node:url";

const HEALTH_CHECK_TIMEOUT_MS =
  Number.parseInt(String(process.env.HEALTH_CHECK_TIMEOUT_MS || "2000"), 10) || 2000;

export type HealthCheckResult = {
  ok: boolean;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
};

export type ReadinessReport = {
  ok: boolean;
  timestamp: string;
  checks: Record<string, HealthCheckResult>;
  alerts: ReturnType<typeof listActiveAlerts>;
};

let recent5xxTimestamps: number[] = [];

export function record5xxForAlerting(): void {
  const now = Date.now();
  recent5xxTimestamps.push(now);
  recent5xxTimestamps = recent5xxTimestamps.filter((t) => now - t < 60_000);
}

function fivexxPerMinute(): number {
  const now = Date.now();
  return recent5xxTimestamps.filter((t) => now - t < 60_000).length;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("health_check_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkPostgres(prisma: PrismaClient): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, HEALTH_CHECK_TIMEOUT_MS);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  const url = getRedisUrl();
  if (!url) {
    redisConnected.set({}, 0);
    return { ok: true, latencyMs: 0, message: "not_configured" };
  }
  try {
    const client = await withTimeout(ensureRedisConnected(), HEALTH_CHECK_TIMEOUT_MS);
    if (!client) throw new Error("redis_connect_failed");
    const pong = await withTimeout(client.ping(), HEALTH_CHECK_TIMEOUT_MS);
    if (pong !== "PONG") throw new Error(`unexpected_ping:${pong}`);
    redisConnected.set({}, 1);
    try {
      const info = await withTimeout(client.info("memory"), HEALTH_CHECK_TIMEOUT_MS);
      const match = /used_memory:(\d+)/.exec(info);
      if (match) redisMemoryBytes.set({}, Number(match[1]));
    } catch {
      /* optional */
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    redisConnected.set({}, 0);
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function checkBullMq(): Promise<HealthCheckResult> {
  const start = Date.now();
  if (!isBullMqPublishingEnabled()) {
    return { ok: true, latencyMs: 0, message: "not_configured" };
  }
  try {
    const queue = getBlockminerQueue();
    if (!queue) throw new Error("queue_unavailable");
    const counts = await withTimeout(queue.getJobCounts(), HEALTH_CHECK_TIMEOUT_MS);
    bullmqJobsWaiting.set({ queue: BLOCKMINER_QUEUE_NAME }, counts.waiting ?? 0);
    bullmqJobsActive.set({ queue: BLOCKMINER_QUEUE_NAME }, counts.active ?? 0);
    bullmqJobsFailed.set({ queue: BLOCKMINER_QUEUE_NAME }, counts.failed ?? 0);
    bullmqJobsCompleted.set({ queue: BLOCKMINER_QUEUE_NAME }, counts.completed ?? 0);
    const congested = (counts.waiting ?? 0) > 500 || (counts.failed ?? 0) > 100;
    return {
      ok: !congested,
      latencyMs: Date.now() - start,
      details: counts,
      ...(congested ? { message: "queue_congested" } : {}),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export function checkWebSocket(): HealthCheckResult {
  const start = Date.now();
  const io = getObservabilitySocketIo();
  if (!io) {
    return { ok: false, latencyMs: Date.now() - start, message: "socket_not_initialized" };
  }
  const clients = io.engine?.clientsCount ?? 0;
  return {
    ok: true,
    latencyMs: Date.now() - start,
    details: { clients },
  };
}

export function checkMiningEngine(): HealthCheckResult {
  const start = Date.now();
  const engine = getObservabilityMiningEngine();
  if (!engine) {
    return { ok: false, latencyMs: Date.now() - start, message: "engine_not_initialized" };
  }
  const miners = engine.miners?.size ?? 0;
  const blockNumber = engine.blockNumber ?? 0;
  miningActiveMiners.set({}, miners);
  miningBlockNumber.set({}, blockNumber);
  return {
    ok: blockNumber > 0,
    latencyMs: Date.now() - start,
    details: { miners, blockNumber },
  };
}

export function checkScheduler(): HealthCheckResult {
  const start = Date.now();
  const startedAt = getCronSchedulerStartedAt();
  if (!startedAt) {
    return { ok: false, latencyMs: Date.now() - start, message: "cron_not_started" };
  }
  return {
    ok: true,
    latencyMs: Date.now() - start,
    details: { startedAt: new Date(startedAt).toISOString() },
  };
}

export function checkStorage(): HealthCheckResult {
  const start = Date.now();
  try {
    const root = findBlockMinerProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
    const uploads = path.join(root, "server", "uploads");
    const exists = fs.existsSync(uploads);
    return {
      ok: exists,
      latencyMs: Date.now() - start,
      details: { uploadsPath: uploads, exists },
      ...(exists ? {} : { message: "uploads_missing" }),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export function checkCallbacks(): HealthCheckResult {
  const start = Date.now();
  // Callback routes are always mounted; deep queue health is in BullMQ + cron heartbeat.
  return {
    ok: true,
    latencyMs: Date.now() - start,
    message: "surface_mounted",
    details: { routes: ["/zeradsptc.php", "/api/offerwallme"] },
  };
}

export async function buildReadinessReport(prisma: PrismaClient): Promise<ReadinessReport> {
  const [postgres, redis, bullmq] = await Promise.all([
    checkPostgres(prisma),
    checkRedis(),
    checkBullMq(),
  ]);
  const websocket = checkWebSocket();
  const storage = checkStorage();
  const callbacks = checkCallbacks();
  const scheduler = checkScheduler();
  const mining = checkMiningEngine();

  const checks = { postgres, redis, bullmq, websocket, storage, callbacks, scheduler, mining };
  const requiredOk = postgres.ok && websocket.ok && mining.ok && scheduler.ok;
  const redisConfigured = Boolean(getRedisUrl());
  const bullmqConfigured = isBullMqPublishingEnabled();

  evaluateAlertThresholds({
    postgresOk: postgres.ok,
    redisConfigured,
    redisOk: redis.ok,
    bullmqConfigured,
    bullmqOk: bullmq.ok,
    socketOk: websocket.ok,
    miningOk: mining.ok,
    cronOk: scheduler.ok,
    errorRate5xxPerMin: fivexxPerMinute(),
  });

  // Touch 5xx counter so it appears in metrics even when zero
  void httpErrors5xxTotal.snapshot();

  return {
    ok: requiredOk && (!redisConfigured || redis.ok) && (!bullmqConfigured || bullmq.ok),
    timestamp: new Date().toISOString(),
    checks,
    alerts: listActiveAlerts(),
  };
}

export function getLivenessPayload(): { ok: true; uptimeSeconds: number; pid: number } {
  return { ok: true, uptimeSeconds: Math.floor(process.uptime()), pid: process.pid };
}

export function getBasicHealthPayload(): { ok: true; message: string } {
  return { ok: true, message: "BlockMiner online" };
}
