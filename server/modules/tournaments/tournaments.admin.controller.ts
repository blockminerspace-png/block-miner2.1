import type { Request, Response } from "express";
import {
  adminListTournaments,
  adminCreateTournament,
  adminCancelTournament,
  adminGetEntries,
  finalizeTournament,
} from "./tournaments.service.js";

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
    metric: "HASHRATE" | "BLOCKS_MINED" | "CHECKINS" | "TASKS_COMPLETED" | "DEPOSITS_POL";
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
  const VALID_METRICS = ["HASHRATE", "BLOCKS_MINED", "CHECKINS", "TASKS_COMPLETED", "DEPOSITS_POL"];
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

  if (!Array.isArray(prizes)) {
    res.status(400).json({ ok: false, message: "prizes must be an array" });
    return;
  }

  for (const p of prizes) {
    if (
      typeof p.rankFrom !== "number" ||
      typeof p.rankTo !== "number" ||
      p.rankFrom < 1 ||
      p.rankTo < p.rankFrom
    ) {
      res.status(400).json({ ok: false, message: "Invalid prize rank range" });
      return;
    }
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
