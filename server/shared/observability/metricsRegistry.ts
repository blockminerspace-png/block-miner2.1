/**
 * Lightweight in-process metrics registry (Prometheus text exposition).
 * No external dependency — suitable for single-instance or sidecar scraping.
 */

type LabelMap = Record<string, string>;

function labelKey(labels: LabelMap): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return `{${keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(",")}}`;
}

function escapeLabel(value: string): string {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export class Counter {
  readonly name: string;
  readonly help: string;
  private totals = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: LabelMap = {}, value = 1): void {
    const key = labelKey(labels);
    this.totals.set(key, (this.totals.get(key) ?? 0) + value);
  }

  snapshot(): Array<{ labels: LabelMap; value: number }> {
    return [...this.totals.entries()].map(([key, value]) => ({
      labels: parseLabelKey(key),
      value,
    }));
  }
}

export class Gauge {
  readonly name: string;
  readonly help: string;
  private values = new Map<string, number>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(labels: LabelMap, value: number): void {
    this.values.set(labelKey(labels), value);
  }

  inc(labels: LabelMap = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  dec(labels: LabelMap = {}, value = 1): void {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) - value);
  }

  snapshot(): Array<{ labels: LabelMap; value: number }> {
    return [...this.values.entries()].map(([key, value]) => ({
      labels: parseLabelKey(key),
      value,
    }));
  }
}

export class Histogram {
  readonly name: string;
  readonly help: string;
  private readonly buckets: number[];
  private data = new Map<string, { counts: number[]; sum: number; count: number }>();

  constructor(name: string, help: string, buckets: number[] = LATENCY_BUCKETS_MS) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: LabelMap, valueMs: number): void {
    const key = labelKey(labels);
    let entry = this.data.get(key);
    if (!entry) {
      entry = { counts: new Array(this.buckets.length + 1).fill(0), sum: 0, count: 0 };
      this.data.set(key, entry);
    }
    entry.sum += valueMs;
    entry.count += 1;
    let placed = false;
    for (let i = 0; i < this.buckets.length; i++) {
      if (valueMs <= this.buckets[i]) {
        entry.counts[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) entry.counts[this.buckets.length] += 1;
  }

  snapshot(): Array<{ labels: LabelMap; buckets: number[]; counts: number[]; sum: number; count: number }> {
    return [...this.data.entries()].map(([key, entry]) => ({
      labels: parseLabelKey(key),
      buckets: this.buckets,
      counts: entry.counts,
      sum: entry.sum,
      count: entry.count,
    }));
  }
}

function parseLabelKey(key: string): LabelMap {
  if (!key) return {};
  const inner = key.slice(1, -1);
  const labels: LabelMap = {};
  const re = /(\w+)="((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    labels[m[1]] = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return labels;
}

/** HTTP */
export const httpRequestsTotal = new Counter("blockminer_http_requests_total", "Total HTTP requests");
export const httpRequestDurationMs = new Histogram(
  "blockminer_http_request_duration_ms",
  "HTTP request duration in milliseconds",
);
export const httpErrors4xxTotal = new Counter("blockminer_http_errors_4xx_total", "Total HTTP 4xx responses");
export const httpErrors5xxTotal = new Counter("blockminer_http_errors_5xx_total", "Total HTTP 5xx responses");

/** Socket.IO */
export const socketConnectionsActive = new Gauge("blockminer_socket_connections_active", "Active Socket.IO connections");
export const socketConnectsTotal = new Counter("blockminer_socket_connects_total", "Total Socket.IO connections");
export const socketDisconnectsTotal = new Counter("blockminer_socket_disconnects_total", "Total Socket.IO disconnects");
export const socketMessagesTotal = new Counter("blockminer_socket_messages_total", "Total Socket.IO messages emitted");

/** Prisma */
export const prismaQueriesTotal = new Counter("blockminer_prisma_queries_total", "Total Prisma queries");
export const prismaQueryDurationMs = new Histogram(
  "blockminer_prisma_query_duration_ms",
  "Prisma query duration in milliseconds",
);
export const prismaSlowQueriesTotal = new Counter("blockminer_prisma_slow_queries_total", "Prisma queries slower than 1s");

/** BullMQ */
export const bullmqJobsWaiting = new Gauge("blockminer_bullmq_jobs_waiting", "BullMQ jobs waiting");
export const bullmqJobsActive = new Gauge("blockminer_bullmq_jobs_active", "BullMQ jobs active");
export const bullmqJobsFailed = new Gauge("blockminer_bullmq_jobs_failed", "BullMQ jobs failed");
export const bullmqJobsCompleted = new Gauge("blockminer_bullmq_jobs_completed", "BullMQ jobs completed");

/** Redis */
export const redisConnected = new Gauge("blockminer_redis_connected", "Redis connection status (1=up, 0=down)");
export const redisMemoryBytes = new Gauge("blockminer_redis_memory_bytes", "Redis used memory in bytes");

/** Cron */
export const cronLastRunUnix = new Gauge("blockminer_cron_last_run_unix", "Unix timestamp of last cron execution");
export const cronMissedTotal = new Counter("blockminer_cron_missed_total", "Cron jobs that missed expected schedule");

/** Mining */
export const miningBlocksTotal = new Counter("blockminer_mining_blocks_total", "Mining blocks settled");
export const miningActiveMiners = new Gauge("blockminer_mining_active_miners", "Active miners in engine");
export const miningBlockNumber = new Gauge("blockminer_mining_block_number", "Current mining block number");

/** Module actions (callbacks, rewards, etc.) */
export const moduleActionsTotal = new Counter("blockminer_module_actions_total", "Domain module actions");
export const moduleActionDurationMs = new Histogram(
  "blockminer_module_action_duration_ms",
  "Domain module action duration in milliseconds",
);

const SLOW_QUERY_MS = Number.parseInt(String(process.env.PRISMA_SLOW_QUERY_MS || "1000"), 10) || 1000;

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  const labels = { method: method.toUpperCase(), route: normalizeRoute(route), status: String(statusCode) };
  httpRequestsTotal.inc(labels);
  httpRequestDurationMs.observe({ method: labels.method, route: labels.route }, durationMs);
  if (statusCode >= 400 && statusCode < 500) httpErrors4xxTotal.inc({ route: labels.route });
  if (statusCode >= 500) httpErrors5xxTotal.inc({ route: labels.route });
}

export function recordPrismaQuery(model: string, operation: string, durationMs: number): void {
  const labels = { model, operation };
  prismaQueriesTotal.inc(labels);
  prismaQueryDurationMs.observe(labels, durationMs);
  if (durationMs >= SLOW_QUERY_MS) prismaSlowQueriesTotal.inc(labels);
}

export function recordModuleAction(module: string, action: string, durationMs?: number): void {
  const labels = { module, action };
  moduleActionsTotal.inc(labels);
  if (durationMs != null) moduleActionDurationMs.observe(labels, durationMs);
}

export function recordCronHeartbeat(job: string): void {
  cronLastRunUnix.set({ job }, Math.floor(Date.now() / 1000));
}

export function normalizeRoute(path: string): string {
  const raw = String(path || "/");
  return raw
    .replace(/\/\d+/g, "/:id")
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:uuid")
    .slice(0, 120);
}

export function renderPrometheusMetrics(): string {
  const lines: string[] = [];

  for (const counter of [
    httpRequestsTotal,
    httpErrors4xxTotal,
    httpErrors5xxTotal,
    socketConnectsTotal,
    socketDisconnectsTotal,
    socketMessagesTotal,
    prismaQueriesTotal,
    prismaSlowQueriesTotal,
    cronMissedTotal,
    miningBlocksTotal,
    moduleActionsTotal,
  ]) {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    for (const { labels, value } of counter.snapshot()) {
      lines.push(`${counter.name}${labelKey(labels)} ${value}`);
    }
  }

  for (const gauge of [
    socketConnectionsActive,
    bullmqJobsWaiting,
    bullmqJobsActive,
    bullmqJobsFailed,
    bullmqJobsCompleted,
    redisConnected,
    redisMemoryBytes,
    cronLastRunUnix,
    miningActiveMiners,
    miningBlockNumber,
  ]) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    for (const { labels, value } of gauge.snapshot()) {
      lines.push(`${gauge.name}${labelKey(labels)} ${value}`);
    }
  }

  for (const hist of [httpRequestDurationMs, prismaQueryDurationMs, moduleActionDurationMs]) {
    lines.push(`# HELP ${hist.name} ${hist.help}`);
    lines.push(`# TYPE ${hist.name} histogram`);
    for (const snap of hist.snapshot()) {
      const lk = labelKey(snap.labels);
      let cumulative = 0;
      for (let i = 0; i < snap.buckets.length; i++) {
        cumulative += snap.counts[i];
        lines.push(`${hist.name}_bucket${lk}{le="${snap.buckets[i]}"} ${cumulative}`);
      }
      cumulative += snap.counts[snap.buckets.length];
      lines.push(`${hist.name}_bucket${lk}{le="+Inf"} ${cumulative}`);
      lines.push(`${hist.name}_sum${lk} ${snap.sum}`);
      lines.push(`${hist.name}_count${lk} ${snap.count}`);
    }
  }

  lines.push(`# HELP blockminer_process_uptime_seconds Process uptime`);
  lines.push(`# TYPE blockminer_process_uptime_seconds gauge`);
  lines.push(`blockminer_process_uptime_seconds ${Math.floor(process.uptime())}`);

  return `${lines.join("\n")}\n`;
}
