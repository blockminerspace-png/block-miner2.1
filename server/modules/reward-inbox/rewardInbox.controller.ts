import type { Request, Response } from "express";
import { requireSessionUser } from "../../controllers/controllerHttpStatusError.js";
import * as rewardInboxService from "./rewardInbox.service.js";

export async function getRewardInbox(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const items = await rewardInboxService.listPendingInboxForUser(user.id);
    res.json({ ok: true, items });
  } catch {
    res.status(500).json({ ok: false, message: "Failed to load inbox." });
  }
}

export async function collectReward(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const inboxId = Number(req.params.id);
    if (!Number.isInteger(inboxId) || inboxId < 1) {
      res.status(400).json({ ok: false, message: "Invalid inbox id." });
      return;
    }
    await rewardInboxService.collectInboxItem(user.id, inboxId);
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND") {
      res.status(404).json({ ok: false, code: "not_found" });
      return;
    }
    if (msg === "ALREADY_COLLECTED") {
      res.status(409).json({ ok: false, code: "already_collected" });
      return;
    }
    res.status(500).json({ ok: false, message: "Failed to collect reward." });
  }
}

export async function collectAllRewards(req: Request, res: Response) {
  try {
    const user = requireSessionUser(req, res);
    if (!user) return;
    const result = await rewardInboxService.collectAllPendingForUser(user.id);
    res.json(result);
  } catch {
    res.status(500).json({ ok: false, message: "Failed to collect rewards." });
  }
}
