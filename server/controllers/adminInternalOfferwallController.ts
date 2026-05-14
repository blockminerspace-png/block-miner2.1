import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import type { InternalOfferwallOffer } from "@prisma/client";
import {
  adminApproveAttempt,
  adminCreateOffer,
  adminDeactivateFrameHostById,
  adminListAttempts,
  adminListFrameHosts,
  adminListOffers,
  adminPatchOffer,
  adminRejectAttempt,
  parseAdminOfferBody
} from "../services/internalOfferwall/internalOfferwallService.js";

function offerToPlain(row: InternalOfferwallOffer | null): Record<string, unknown> | null {
  if (!row) return null;
  return {
    kind: row.kind,
    title: row.title,
    description: row.description,
    iframeUrl: row.iframeUrl,
    minViewSeconds: row.minViewSeconds,
    rewardKind: row.rewardKind,
    rewardBlkAmount: row.rewardBlkAmount != null ? Number(row.rewardBlkAmount) : null,
    rewardPolAmount: row.rewardPolAmount != null ? Number(row.rewardPolAmount) : null,
    rewardHashRate: row.rewardHashRate,
    rewardHashRateDays: row.rewardHashRateDays,
    dailyLimitPerUser: row.dailyLimitPerUser,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    completionMode: row.completionMode,
    taskMetadata: row.taskMetadata && typeof row.taskMetadata === "object" ? row.taskMetadata : null
  };
}

export async function listOffers(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await adminListOffers();
    res.json({ ok: true, offers: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall listOffers", msg);
    res.status(500).json({ ok: false, message: "Failed to list offers." });
  }
}

export async function createOffer(req: Request, res: Response): Promise<void> {
  try {
    const parsed = await parseAdminOfferBody(prisma, req.body as object);
    if (!parsed.ok) {
      const payload: {
        ok: false;
        message: string;
        code?: string;
        details?: unknown;
      } = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      res.status(parsed.status).json(payload);
      return;
    }
    const row = await adminCreateOffer(parsed.data);
    res.status(201).json({ ok: true, offer: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall createOffer", msg);
    res.status(500).json({ ok: false, message: "Failed to create offer." });
  }
}

type IdParams = { id: string };

export async function patchOffer(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const existing = await prisma.internalOfferwallOffer.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Offer not found." });
      return;
    }
    const bodyObj =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};
    const merged = { ...offerToPlain(existing), ...bodyObj } as object;
    const parsed = await parseAdminOfferBody(prisma, merged);
    if (!parsed.ok) {
      const payload: {
        ok: false;
        message: string;
        code?: string;
        details?: unknown;
      } = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      res.status(parsed.status).json(payload);
      return;
    }
    const row = await adminPatchOffer(id, parsed.data);
    res.json({ ok: true, offer: row });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall patchOffer", msg);
    res.status(500).json({ ok: false, message: "Failed to update offer." });
  }
}

export async function listAttempts(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status ? String(req.query.status) : "";
    const rawOfferId = req.query.offerId ? parseInt(String(req.query.offerId), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offerIdFilter =
      rawOfferId !== undefined && Number.isInteger(rawOfferId) && rawOfferId > 0 ? rawOfferId : undefined;
    const rows = await adminListAttempts({
      status: status || undefined,
      offerId: offerIdFilter,
      limit
    });
    res.json({ ok: true, attempts: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall listAttempts", msg);
    res.status(500).json({ ok: false, message: "Failed to list attempts." });
  }
}

type AttemptParams = { id: string };

export async function approveAttempt(req: Request<AttemptParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const out = await adminApproveAttempt(id);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall approveAttempt", msg);
    res.status(500).json({ ok: false, message: "Failed to approve attempt." });
  }
}

export async function listFrameHosts(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await adminListFrameHosts();
    res.json({ ok: true, frameHosts: rows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall listFrameHosts", msg);
    res.status(500).json({ ok: false, message: "Failed to list frame hosts." });
  }
}

export async function deactivateFrameHost(req: Request<AttemptParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid frame host id." });
      return;
    }
    const out = await adminDeactivateFrameHostById(id);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall deactivateFrameHost", msg);
    res.status(500).json({ ok: false, message: "Failed to update frame host." });
  }
}

export async function rejectAttempt(req: Request<AttemptParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid attempt id." });
      return;
    }
    const rawNote = (req.body as { note?: unknown })?.note;
    const note = rawNote == null ? undefined : String(rawNote);
    const out = await adminRejectAttempt(id, note);
    if (!out.ok) {
      res.status(out.status ?? 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("adminInternalOfferwall rejectAttempt", msg);
    res.status(500).json({ ok: false, message: "Failed to reject attempt." });
  }
}
