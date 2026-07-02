import type { Request, Response } from "express";
import {
  adminListTournaments,
  adminCreateTournament,
  adminUpdateTournament,
  adminCancelTournament,
  adminGetEntries,
  finalizeTournament,
  adminTournamentScoreAudit,
  adminTournamentScoreAuditUser,
  getTypeDisplayOrder,
  setTypeDisplayOrder,
} from "./tournaments.service.js";
import { getEngineStats } from "./application/tournament-engine-metrics.service.js";
import { listRecentDriftAlerts } from "./application/offerwall-drift.service.js";

const MAX_TOURNAMENT_DURATION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_TYPE_ORDER_LENGTH = 20;
const MAX_PRIZE_NUMERIC = 1_000_000_000;

function validatePrizeAmount(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== "number") return `${label} must be a number`;
  if (!Number.isFinite(value)) return `${label} is not a valid number`;
  if (value < 0) return `${label} must not be negative`;
  if (value > MAX_PRIZE_NUMERIC) return `${label} exceeds maximum`;
  return null;
}

function validatePrizes(prizes: unknown): string | null {
  if (!Array.isArray(prizes)) return null;
  for (const p of prizes) {
    if (typeof p !== "object" || p === null) return "Invalid prize entry";
    const r = p as Record<string, unknown>;
    if (typeof r.rankFrom !== "number" || typeof r.rankTo !== "number") return "Invalid prize rank range";
    if (r.rankFrom < 1 || r.rankTo < r.rankFrom) return "Invalid prize rank range";

    const err =
      validatePrizeAmount(r.polAmount, "polAmount") ??
      validatePrizeAmount(r.blkAmount, "blkAmount") ??
      validatePrizeAmount(r.boostHashRate, "boostHashRate") ??
      validatePrizeAmount(r.boostHours, "boostHours") ??
      validatePrizeAmount(r.minerCount, "minerCount");
    if (err) return err;

    if (r.minerId != null && r.minerId !== undefined) {
      if (typeof r.minerId !== "number" || !Number.isFinite(r.minerId) || r.minerId < 1) {
        return "Invalid minerId";
      }
    }
  }
  return null;
}

export async function listAll(req: Request, res: Response): Promise<void> {
  try {
    const tournaments = await adminListTournaments();
    res.json({ ok: true, tournaments });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const { name, description, type, metric, startsAt, endsAt, prizes, recurring } = req.body as {
    name: string;
    description?: string;
    type: "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
    metric: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL" | "DEPOSITS_USD" | "OFFERS_INTERNAL" | "OFFERS_EXTERNAL" | "OFFERS_ALL";
    startsAt: string;
    endsAt: string;
    recurring?: boolean;
    prizes: any[];
  };

  if (!name || !type || !metric || !startsAt || !endsAt) {
    res.status(400).json({ ok: false, message: "Missing required fields" });
    return;
  }

  const VALID_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"];
  const VALID_METRICS = ["HASHRATE", "BLOCKS_MINED", "CHECKINS", "TASKS_COMPLETED", "DEPOSITS_POL", "DEPOSITS_USD", "OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"];
  if (!VALID_TYPES.includes(type) || !VALID_METRICS.includes(metric)) {
    res.status(400).json({ ok: false, message: "Invalid type or metric" });
    return;
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    res.status(400).json({ ok: false, message: "Invalid dates" });
    return;
  }

  if (end.getTime() - start.getTime() > MAX_TOURNAMENT_DURATION_MS) {
    res.status(400).json({ ok: false, message: "Tournament duration exceeds 90 days maximum" });
    return;
  }

  if (!Array.isArray(prizes)) {
    res.status(400).json({ ok: false, message: "prizes must be an array" });
    return;
  }

  const prizeError = validatePrizes(prizes);
  if (prizeError) {
    res.status(400).json({ ok: false, message: prizeError });
    return;
  }

  try {
    const tournament = await adminCreateTournament({
      name,
      description,
      type,
      metric,
      startsAt: start,
      endsAt: end,
      recurring: Boolean(recurring),
      prizes,
    });
    res.json({ ok: true, tournament });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }

  const body = req.body as Record<string, unknown>;
  const VALID_TYPES = ["DAILY", "WEEKLY", "MONTHLY", "CUSTOM"];
  const VALID_METRICS = ["HASHRATE", "BLOCKS_MINED", "CHECKINS", "TASKS_COMPLETED", "DEPOSITS_POL", "DEPOSITS_USD", "OFFERS_INTERNAL", "OFFERS_EXTERNAL", "OFFERS_ALL"];

  const patch: Parameters<typeof adminUpdateTournament>[1] = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.description === "string" || body.description === null) patch.description = body.description as string | null;
  if (typeof body.type === "string") {
    if (!VALID_TYPES.includes(body.type)) { res.status(400).json({ ok: false, message: "Invalid type" }); return; }
    patch.type = body.type as never;
  }
  if (typeof body.metric === "string") {
    if (!VALID_METRICS.includes(body.metric)) { res.status(400).json({ ok: false, message: "Invalid metric" }); return; }
    patch.metric = body.metric as never;
  }
  if (typeof body.recurring === "boolean") patch.recurring = body.recurring;
  if (typeof body.startsAt === "string") {
    const d = new Date(body.startsAt);
    if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "Invalid startsAt" }); return; }
    patch.startsAt = d;
  }
  if (typeof body.endsAt === "string") {
    const d = new Date(body.endsAt);
    if (isNaN(d.getTime())) { res.status(400).json({ ok: false, message: "Invalid endsAt" }); return; }
    patch.endsAt = d;
  }
  if (patch.startsAt && patch.endsAt && patch.endsAt <= patch.startsAt) {
    res.status(400).json({ ok: false, message: "endsAt must be after startsAt" });
    return;
  }
  if (Array.isArray(body.prizes)) {
    const prizeError = validatePrizes(body.prizes);
    if (prizeError) {
      res.status(400).json({ ok: false, message: prizeError });
      return;
    }
    patch.prizes = body.prizes as never;
  }

  // Duration cap check
  const finalStart = patch.startsAt ?? (body.startsAt ? new Date(body.startsAt as string) : null);
  const finalEnd = patch.endsAt ?? (body.endsAt ? new Date(body.endsAt as string) : null);
  if (finalStart && finalEnd && finalEnd.getTime() - finalStart.getTime() > MAX_TOURNAMENT_DURATION_MS) {
    res.status(400).json({ ok: false, message: "Tournament duration exceeds 90 days maximum" });
    return;
  }

  try {
    const tournament = await adminUpdateTournament(id, patch);
    res.json({ ok: true, tournament });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const tournament = await adminCancelTournament(id);
    res.json({ ok: true, tournament });
  } catch (err) {
    res.status(400).json({ ok: false, message: String(err) });
  }
}

export async function finalize(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const result = await finalizeTournament(id);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, message: String(err) });
  }
}

export async function getDisplayOrder(_req: Request, res: Response): Promise<void> {
  try {
    const typeOrder = await getTypeDisplayOrder();
    res.json({ ok: true, typeOrder });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function updateDisplayOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as { typeOrder?: unknown };
  if (!Array.isArray(body.typeOrder) || body.typeOrder.length > MAX_TYPE_ORDER_LENGTH || !body.typeOrder.every((t) => typeof t === "string")) {
    res.status(400).json({ ok: false, message: "typeOrder must be string[] with at most 20 entries" });
    return;
  }
  try {
    const typeOrder = await setTypeDisplayOrder(body.typeOrder);
    res.json({ ok: true, typeOrder });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function entries(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  const page = parseInt(String(req.query.page ?? "1"), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const data = await adminGetEntries(id, page);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function scoreAudit(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const data = await adminTournamentScoreAudit(id);
    if (!data) { res.status(404).json({ ok: false, message: "Not found" }); return; }
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function scoreAuditUser(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  const userId = parseInt(String(req.params.userId ?? ""), 10);
  if (!id || !userId) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const data = await adminTournamentScoreAuditUser(id, userId);
    if (!data) { res.status(404).json({ ok: false, message: "Not found" }); return; }
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function engineStats(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const stats = await getEngineStats(id);
    if (!stats) { res.status(404).json({ ok: false, message: "Not found" }); return; }
    res.json({ ok: true, engineStats: stats });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function driftAlerts(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
  try {
    const alerts = await listRecentDriftAlerts(id, limit);
    res.json({ ok: true, alerts });
  } catch (err) {
    res.status(500).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
