import type { PrismaClient } from "@prisma/client";

export type ReadinessReport = {
  ok: boolean;
  timestamp: string;
  checks: Record<string, { ok: boolean; latencyMs: number; message?: string; details?: Record<string, unknown> }>;
  alerts: Array<{ id: string; severity: string; message: string; since: string; module: string }>;
};

export function recordHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void;
export function recordPrismaQuery(model: string, operation: string, durationMs: number): void;
export function recordModuleAction(module: string, action: string, durationMs?: number): void;
export function recordCronHeartbeat(job: string): void;
export function renderPrometheusMetrics(): string;
export function normalizeRoute(path: string): string;
export function buildReadinessReport(prisma: PrismaClient): Promise<ReadinessReport>;
export function getLivenessPayload(): { ok: true; uptimeSeconds: number; pid: number };
export function getBasicHealthPayload(): { ok: true; message: string };
export function record5xxForAlerting(): void;
export function attachSocketObservability(io: import("socket.io").Server): void;
export function listActiveAlerts(): ReadinessReport["alerts"];
export function raiseAlert(id: string, module: string, message: string, severity?: "warning" | "critical"): void;
export function clearAlert(id: string): void;
export function setObservabilityMiningEngine(engine: unknown): void;
export function setObservabilitySocketIo(io: import("socket.io").Server | null): void;
export function markCronSchedulerStarted(): void;
