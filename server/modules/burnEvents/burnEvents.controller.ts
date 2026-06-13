import type { Request, Response } from "express";
import * as svc from "./burnEvents.service.js";

export async function listActive(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: number } }).user?.id ?? undefined;
  try {
    const events = await svc.listActiveEvents(userId);
    res.json({ ok: true, events });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function myMachines(req: Request, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: number } }).user?.id;
  if (!userId) { res.status(401).json({ ok: false, message: "UNAUTHENTICATED" }); return; }
  try {
    const machines = await svc.getUserBurnableMachines(userId);
    res.json({ ok: true, machines });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function claim(req: Request<{ id: string }>, res: Response): Promise<void> {
  const userId = (req as Request & { user?: { id: number } }).user?.id;
  if (!userId) { res.status(401).json({ ok: false, message: "UNAUTHENTICATED" }); return; }
  const eventId = parseInt(req.params.id, 10);
  if (!eventId) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  const { minerIds } = req.body as { minerIds?: unknown };
  if (!Array.isArray(minerIds)) {
    res.status(400).json({ ok: false, message: "minerIds must be an array of UserOwnedMachine ids" });
    return;
  }
  try {
    const result = await svc.claimBurnEvent(userId, eventId, minerIds as number[]);
    res.json(result);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "ERROR";
    const msg = err instanceof Error ? err.message : String(err);
    const status = code === "EVENT_NOT_FOUND" ? 404
      : code === "UNAUTHENTICATED" ? 401
      : 400;
    res.status(status).json({ ok: false, code, message: msg });
  }
}
