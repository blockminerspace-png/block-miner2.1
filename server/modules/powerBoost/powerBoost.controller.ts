import type { Request, Response } from "express";
import { activateBoost, getPowerBoostStatus } from "../../services/powerBoostService.js";

type AuthedRequest = Request & { user: { id: number } };

export async function getStatus(req: Request, res: Response): Promise<void> {
  const { id: userId } = (req as AuthedRequest).user;
  const status = await getPowerBoostStatus(userId);
  res.json({ ok: true, ...status });
}

export async function activate(req: Request, res: Response): Promise<void> {
  const { id: userId } = (req as AuthedRequest).user;
  const result = await activateBoost(userId);
  if (!result.ok) {
    res.status(result.code === "INSUFFICIENT_BALANCE" ? 402 : 409).json(result);
    return;
  }
  res.json(result);
}
