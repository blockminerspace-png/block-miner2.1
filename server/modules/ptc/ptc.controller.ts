import type { Request, Response } from "express";
import * as svc from "./ptc.service.js";
import * as repo from "./ptc.repository.js";

function err(res: Response, status: number, msg: string) {
  res.status(status).json({ ok: false, message: msg });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    const s = await svc.getSettings();
    res.json({ ok: true, settings: s });
  } catch {
    err(res, 500, "Server error");
  }
}

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const {
      pricePerViewShib,
      rewardPerViewShib,
      minDurationSeconds,
      maxDurationSeconds,
      minViews,
      maxViews,
      isEnabled,
    } = req.body as Record<string, unknown>;

    await svc.updateSettings({
      ...(pricePerViewShib !== undefined && { pricePerViewShib: Number(pricePerViewShib) }),
      ...(rewardPerViewShib !== undefined && { rewardPerViewShib: Number(rewardPerViewShib) }),
      ...(minDurationSeconds !== undefined && { minDurationSeconds: Number(minDurationSeconds) }),
      ...(maxDurationSeconds !== undefined && { maxDurationSeconds: Number(maxDurationSeconds) }),
      ...(minViews !== undefined && { minViews: Number(minViews) }),
      ...(maxViews !== undefined && { maxViews: Number(maxViews) }),
      ...(isEnabled !== undefined && { isEnabled: Boolean(isEnabled) }),
    });
    res.json({ ok: true });
  } catch (e) {
    err(res, 500, e instanceof Error ? e.message : "Server error");
  }
}

// ── User: campaign creation & management ─────────────────────────────────────

export async function createCampaign(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const { title, description, url, adType, durationSeconds, targetViews } = req.body as Record<string, unknown>;

    if (!title || !url) { err(res, 400, "Title and URL required"); return; }

    await svc.createCampaign(req.user.id, {
      title: String(title),
      description: String(description ?? ""),
      url: String(url),
      adType: adType === "iframe" ? "iframe" : "window",
      durationSeconds: Number(durationSeconds ?? 10),
      targetViews: Number(targetViews ?? 0),
    });
    res.json({ ok: true, message: "Campaign submitted for approval" });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

export async function getMyCampaigns(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const campaigns = await svc.getMyCampaigns(req.user.id);
    res.json({ ok: true, campaigns });
  } catch {
    err(res, 500, "Server error");
  }
}

export async function editCampaign(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const adId = Number(req.params.id);
    const { title, description, active } = req.body as Record<string, unknown>;

    await svc.editCampaign(req.user.id, adId, {
      ...(title !== undefined && { title: String(title) }),
      ...(description !== undefined && { description: String(description) }),
      ...(active !== undefined && { active: Boolean(active) }),
    });
    res.json({ ok: true });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

export async function addViews(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const adId = Number(req.params.id);
    const views = Number((req.body as Record<string, unknown>).views);
    if (!views || views < 1) { err(res, 400, "Invalid views count"); return; }
    await svc.addViews(req.user.id, adId, views);
    res.json({ ok: true });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

export async function removeViews(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const adId = Number(req.params.id);
    const views = Number((req.body as Record<string, unknown>).views);
    if (!views || views < 1) { err(res, 400, "Invalid views count"); return; }
    await svc.removeViews(req.user.id, adId, views);
    res.json({ ok: true });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

// ── Viewer (earn SHIB by watching ads) ───────────────────────────────────────

export async function getNextAd(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const ad = await svc.getNextAd(req.user.id);
    res.json({ ok: true, ad: ad ?? null });
  } catch {
    err(res, 500, "Server error");
  }
}

export async function trackView(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const adId = Number(req.params.id);
    const viewerHash = `user_${req.user.id}`;
    await svc.trackView(req.user.id, adId, viewerHash);
    res.json({ ok: true, message: "View recorded" });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

export async function getEarningsHistory(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) { err(res, 401, "Unauthorized"); return; }
    const history = await svc.getEarningsHistory(req.user.id);
    res.json({ ok: true, history });
  } catch {
    err(res, 500, "Server error");
  }
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function adminListPending(req: Request, res: Response): Promise<void> {
  try {
    const campaigns = await repo.getPendingCampaigns();
    res.json({ ok: true, campaigns });
  } catch {
    err(res, 500, "Server error");
  }
}

export async function adminListAll(req: Request, res: Response): Promise<void> {
  try {
    const page = Number((req.query as Record<string, string>).page ?? 1);
    const limit = Number((req.query as Record<string, string>).limit ?? 20);
    const result = await repo.getAllCampaignsAdmin(page, limit);
    res.json({ ok: true, ...result });
  } catch {
    err(res, 500, "Server error");
  }
}

export async function adminApprove(req: Request, res: Response): Promise<void> {
  try {
    await svc.approveCampaign(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}

export async function adminReject(req: Request, res: Response): Promise<void> {
  try {
    const reason = String((req.body as Record<string, unknown>).reason ?? "Policy violation");
    await svc.rejectCampaign(Number(req.params.id), reason);
    res.json({ ok: true });
  } catch (e) {
    err(res, 400, e instanceof Error ? e.message : "Server error");
  }
}
