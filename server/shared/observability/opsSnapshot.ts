import prisma from "../../src/db/prisma.js";
import { buildReadinessReport } from "./healthChecks.js";
import { listActiveAlerts } from "./alertRegistry.js";
import {
  getCronSchedulerStartedAt,
  getObservabilityMiningEngine,
  getObservabilitySocketIo,
} from "./runtimeRegistry.js";
import {
  httpRequestsTotal,
  httpErrors4xxTotal,
  httpErrors5xxTotal,
  socketConnectionsActive,
  socketConnectsTotal,
  socketDisconnectsTotal,
  bullmqJobsWaiting,
  bullmqJobsActive,
  bullmqJobsFailed,
  redisConnected,
  miningActiveMiners,
  miningBlockNumber,
  prismaQueriesTotal,
  prismaSlowQueriesTotal,
} from "./metricsRegistry.js";
import { getEconomyMetricsSnapshot } from "./economyMetrics.js";

function sumCounter(counter: { snapshot: () => Array<{ value: number }> }): number {
  return counter.snapshot().reduce((acc, row) => acc + row.value, 0);
}

function gaugeMax(gauge: { snapshot: () => Array<{ value: number }> }): number {
  const rows = gauge.snapshot();
  if (!rows.length) return 0;
  return Math.max(...rows.map((r) => r.value));
}

export async function buildOpsSnapshot() {
  const readiness = await buildReadinessReport(prisma);
  const io = getObservabilitySocketIo();
  const engine = getObservabilityMiningEngine();
  const cronStartedAt = getCronSchedulerStartedAt();

  const httpTotal = sumCounter(httpRequestsTotal);
  const http4xx = sumCounter(httpErrors4xxTotal);
  const http5xx = sumCounter(httpErrors5xxTotal);
  const prismaQ = sumCounter(prismaQueriesTotal);
  const prismaSlow = sumCounter(prismaSlowQueriesTotal);

  return {
    timestamp: new Date().toISOString(),
    readiness: {
      ok: readiness.ok,
      checks: readiness.checks,
    },
    alerts: listActiveAlerts(),
    socket: {
      engineClients: io?.engine?.clientsCount ?? 0,
      connectionsActive: gaugeMax(socketConnectionsActive),
      connectsTotal: sumCounter(socketConnectsTotal),
      disconnectsTotal: sumCounter(socketDisconnectsTotal),
    },
    mining: {
      blockNumber: gaugeMax(miningBlockNumber),
      activeMiners: gaugeMax(miningActiveMiners),
      engineRunning: Boolean(engine),
    },
    queues: {
      bullmqWaiting: gaugeMax(bullmqJobsWaiting),
      bullmqActive: gaugeMax(bullmqJobsActive),
      bullmqFailed: gaugeMax(bullmqJobsFailed),
    },
    redis: {
      connected: gaugeMax(redisConnected),
    },
    http: {
      requestsTotal: httpTotal,
      errors4xxTotal: http4xx,
      errors5xxTotal: http5xx,
      requestsPerMinuteEstimate: Math.round(httpTotal / Math.max(1, process.uptime() / 60)),
    },
    database: {
      prismaQueriesTotal: prismaQ,
      prismaSlowQueriesTotal: prismaSlow,
    },
    cron: {
      schedulerStartedAt: cronStartedAt ? new Date(cronStartedAt).toISOString() : null,
    },
    economy: getEconomyMetricsSnapshot(),
    process: {
      uptimeSeconds: Math.floor(process.uptime()),
      pid: process.pid,
      memoryRssBytes: process.memoryUsage().rss,
      memoryHeapUsedBytes: process.memoryUsage().heapUsed,
    },
  };
}
