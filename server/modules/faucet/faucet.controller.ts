import type { Request, Response } from "express";
import * as faucetService from "./faucet.service.js";

export async function startPartnerVisit(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const payload = await faucetService.startPartnerVisitForUser(req.user.id, req);
    res.json(payload);
  } catch {
    res.status(500).json({ ok: false, message: "Error starting visit." });
  }
}

export async function getStatus(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const payload = await faucetService.getStatusForUser(req.user.id);
    res.json(payload);
  } catch {
    res.status(500).json({ ok: false, message: "Error loading status." });
  }
}

export async function claim(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const result = await faucetService.claimForUser(req.user.id, req);
    if (!result.ok) {
      const body: Record<string, unknown> = { ok: false, message: result.message };
      if (result.remainingMs != null) body.remainingMs = result.remainingMs;
      res.status(result.status).json(body);
      return;
    }
    res.json({
      ok: true,
      message: result.message,
      nextAvailableAt: result.nextAvailableAt,
    });
  } catch {
    res.status(500).json({ ok: false, message: "Error claiming faucet." });
  }
}
