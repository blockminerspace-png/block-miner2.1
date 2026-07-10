import type { Request, Response } from "express";
import prisma from "#server/src/db/prisma.js";
import {
  buildReadinessReport,
  getBasicHealthPayload,
  getLivenessPayload,
  listActiveAlerts,
  renderPrometheusMetrics,
} from "#server/shared/observability/index.js";

export function health(_req: Request, res: Response): void {
  res.json(getBasicHealthPayload());
}

export function live(_req: Request, res: Response): void {
  res.json(getLivenessPayload());
}

export async function ready(_req: Request, res: Response): Promise<void> {
  const report = await buildReadinessReport(prisma);
  res.status(report.ok ? 200 : 503).json(report);
}

export function alerts(_req: Request, res: Response): void {
  res.json({ ok: true, alerts: listActiveAlerts(), timestamp: new Date().toISOString() });
}

export function metrics(_req: Request, res: Response): void {
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusMetrics());
}
