import {
  getMiniPassSeasonDashboard,
  listLiveMiniPassSeasons
} from "../services/miniPass/miniPassDashboardService.js";
import { claimMiniPassLevelReward } from "../services/miniPass/miniPassClaimService.js";
import {
  purchaseMiniPassComplete,
  purchaseMiniPassLevels
} from "../services/miniPass/miniPassPurchaseService.js";

function langFromReq(req) {
  return req.headers["accept-language"] || "en";
}

export async function listMiniPassSeasons(req, res) {
  try {
    const rows = await listLiveMiniPassSeasons(langFromReq(req));
    res.json({ ok: true, seasons: rows });
  } catch (e) {
    console.error("listMiniPassSeasons", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function getMiniPassSeason(req, res) {
  try {
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    if (!seasonId) return res.status(400).json({ ok: false, code: "invalid_season" });

    const data = await getMiniPassSeasonDashboard(userId, seasonId, langFromReq(req));
    if (!data.ok) {
      return res.status(data.status || 500).json({ ok: false, code: data.code });
    }
    const { ok: _ok, status: _st, code: _cd, ...rest } = data;
    res.json({ ok: true, ...rest });
  } catch (e) {
    console.error("getMiniPassSeason", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postClaimMiniPassReward(req, res) {
  try {
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    const levelRewardId = parseInt(req.params.levelRewardId, 10);
    if (!seasonId || !levelRewardId) {
      return res.status(400).json({ ok: false, code: "invalid_params" });
    }

    const r = await claimMiniPassLevelReward(userId, seasonId, levelRewardId);
    if (!r.ok) {
      return res.status(r.status || 500).json({ ok: false, code: r.code });
    }
    res.json({
      ok: true,
      duplicate: r.duplicate,
      summary: r.summary
    });
  } catch (e) {
    console.error("postClaimMiniPassReward", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postBuyMiniPassLevels(req, res) {
  try {
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    const quantity = Math.floor(Number(req.body?.quantity ?? 1));
    if (!seasonId) return res.status(400).json({ ok: false, code: "invalid_season" });

    const r = await purchaseMiniPassLevels(userId, seasonId, quantity);
    if (!r.ok) {
      return res.status(r.status || 500).json({ ok: false, code: r.code });
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e) {
    console.error("postBuyMiniPassLevels", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}

export async function postCompleteMiniPass(req, res) {
  try {
    const userId = req.user.id;
    const seasonId = parseInt(req.params.seasonId, 10);
    if (!seasonId) return res.status(400).json({ ok: false, code: "invalid_season" });

    const r = await purchaseMiniPassComplete(userId, seasonId);
    if (!r.ok) {
      return res.status(r.status || 500).json({ ok: false, code: r.code });
    }
    res.json({ ok: true, purchaseId: r.purchaseId, polBalance: r.polBalance });
  } catch (e) {
    console.error("postCompleteMiniPass", e);
    res.status(500).json({ ok: false, code: "error" });
  }
}
