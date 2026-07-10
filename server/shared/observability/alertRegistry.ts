/**
 * In-process alert state for operators. External notification (PagerDuty, Telegram, etc.)
 * can poll /health/alerts or scrape metrics thresholds in a future integration.
 */

export type AlertSeverity = "warning" | "critical";

export type ActiveAlert = {
  id: string;
  severity: AlertSeverity;
  message: string;
  since: string;
  module: string;
};

const activeAlerts = new Map<string, ActiveAlert>();

export function raiseAlert(
  id: string,
  module: string,
  message: string,
  severity: AlertSeverity = "warning",
): void {
  activeAlerts.set(id, {
    id,
    module,
    message,
    severity,
    since: new Date().toISOString(),
  });
}

export function clearAlert(id: string): void {
  activeAlerts.delete(id);
}

export function listActiveAlerts(): ActiveAlert[] {
  return [...activeAlerts.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function evaluateAlertThresholds(input: {
  postgresOk: boolean;
  redisConfigured: boolean;
  redisOk: boolean;
  bullmqConfigured: boolean;
  bullmqOk: boolean;
  socketOk: boolean;
  miningOk: boolean;
  cronOk: boolean;
  errorRate5xxPerMin: number;
}): void {
  if (!input.postgresOk) {
    raiseAlert("postgres_offline", "database", "PostgreSQL health check failed", "critical");
  } else {
    clearAlert("postgres_offline");
  }

  if (input.redisConfigured && !input.redisOk) {
    raiseAlert("redis_offline", "redis", "Redis configured but unreachable", "critical");
  } else {
    clearAlert("redis_offline");
  }

  if (input.bullmqConfigured && !input.bullmqOk) {
    raiseAlert("queue_stalled", "bullmq", "BullMQ queue unreachable or stalled", "critical");
  } else {
    clearAlert("queue_stalled");
  }

  if (!input.socketOk) {
    raiseAlert("websocket_degraded", "socket", "Socket.IO engine not initialized", "critical");
  } else {
    clearAlert("websocket_degraded");
  }

  if (!input.miningOk) {
    raiseAlert("mining_stopped", "mining", "Mining engine not running or block counter stale", "critical");
  } else {
    clearAlert("mining_stopped");
  }

  if (!input.cronOk) {
    raiseAlert("cron_missed", "scheduler", "Cron scheduler heartbeat missing", "warning");
  } else {
    clearAlert("cron_missed");
  }

  const threshold = Number.parseInt(String(process.env.ALERT_5XX_RATE_PER_MIN || "30"), 10) || 30;
  if (input.errorRate5xxPerMin >= threshold) {
    raiseAlert("error_rate_high", "api", `5xx rate ${input.errorRate5xxPerMin}/min exceeds ${threshold}`, "warning");
  } else {
    clearAlert("error_rate_high");
  }
}
