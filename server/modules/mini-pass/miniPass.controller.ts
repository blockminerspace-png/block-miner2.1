import type { Request, Response } from "express";
import {
  getMiniPassSeasonDashboard,
  listLiveMiniPassSeasons,
} from "../../services/miniPass/miniPassDashboardService.js";
import { claimMiniPassLevelReward } from "../../services/miniPass/miniPassClaimService.js";
import {

  purchaseMiniPassComplete,
  purchaseMiniPassLevels,
} from "../../services/miniPass/miniPassPurchaseService.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("miniPass");

function langFromReq(req: Request): string {
  const raw = req.headers["accept-language"];
  if (Array.isArray(raw)) return raw[0] ?? "en";
  return typeof raw === "string" ? raw : "en";
}

type PurchaseBody = { quantity?: unknown };

export async function listMiniPassSeasons(req: Request, res: Response): Promise<void> {
  try {
    const rows = await listLiveMiniPassSeasons(langFromReq(req));
    res.json({ ok: true, seasons: rows });
  } catch (e: unknown) {
    logger.error("listMiniPassSeasons", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

type SeasonParams = { seasonId: string };

export async function getMiniPassSeason(req: Request<SeasonParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    if (!seasonId) {
      res.status(400).json({ ok: false, code: "invalid_season" });
      return;
    }

    const data = await getMiniPassSeasonDashboard(userId, seasonId, langFromReq(req));
    if (!data.ok) {
      res.status(data.status ?? 500).json({ ok: false, code: data.code });
      return;
    }
    const { ok: _ok, status: _st, code: _cd, ...rest } = data;
    res.json({ ok: true, ...rest });
  } catch (e: unknown) {
    logger.error("getMiniPassSeason", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

type ClaimParams = { seasonId: string; levelRewardId: string };

export async function postClaimMiniPassReward(req: Request<ClaimParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    const levelRewardId = parseInt(req.params.levelRewardId, 10);
    if (!seasonId || !levelRewardId) {
      res.status(400).json({ ok: false, code: "invalid_params" });
      return;
    }

    const r = await claimMiniPassLevelReward(userId, seasonId, levelRewardId);
    if (!r.ok) {
      res.status(r.status ?? 500).json({ ok: false, code: r.code });
      return;
    }
    res.json({
      ok: true,
      duplicate: r.duplicate,
      summary: r.summary,
    });
  } catch (e: unknown) {
    logger.error("postClaimMiniPassReward", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postBuyMiniPassLevels(
  req: Request<SeasonParams, unknown, PurchaseBody>,
  res: Response
): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    const quantity = Math.floor(Number(req.body?.quantity ?? 1));
    if (!seasonId) {
      res.status(400).json({ ok: false, code: "invalid_season" });
      return;
    }

    const r = await purchaseMiniPassLevels(userId, seasonId, quantity);
    if (!r.ok) {
      res.status(r.status ?? 500).json({ ok: false, code: r.code });
      return;
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e: unknown) {
    logger.error("postBuyMiniPassLevels", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postCompleteMiniPass(req: Request<SeasonParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, code: "unauthorized" });
      return;
    }
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    if (!seasonId) {
      res.status(400).json({ ok: false, code: "invalid_season" });
      return;
    }

    const r = await purchaseMiniPassComplete(userId, seasonId);
    if (!r.ok) {
      res.status(r.status ?? 500).json({ ok: false, code: r.code });
      return;
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e: unknown) {
    logger.error("postCompleteMiniPass", { error: String(e) });
    res.status(500).json({ ok: false, code: "error" });
  }
}
