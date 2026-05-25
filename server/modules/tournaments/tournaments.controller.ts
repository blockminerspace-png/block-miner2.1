import type { Request, Response } from "express";
import {
  listActiveTournaments,
  getTournamentWithLeaderboard,
  getUserTournamentHistory,
} from "./tournaments.service.js";

export async function listTournaments(req: Request, res: Response): Promise<void> {
  try {
    const tournaments = await listActiveTournaments();
    res.json({ ok: true, tournaments });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to load tournaments" });
  }
}

export async function getTournament(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  const userId = (req as any).user?.id as number | undefined;
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) { res.status(404).json({ ok: false, message: "Not found" }); return; }
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed to load tournament" });
  }
}

export async function myRank(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  const userId = (req as any).user.id as number;
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const data = await getTournamentWithLeaderboard(id, userId);
    if (!data) { res.status(404).json({ ok: false, message: "Not found" }); return; }
    res.json({ ok: true, myEntry: data.myEntry, myRankLive: data.myRankLive });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed" });
  }
}

export async function myHistory(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.id as number;
  try {
    const history = await getUserTournamentHistory(userId);
    res.json({ ok: true, history });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Failed" });
  }
}
