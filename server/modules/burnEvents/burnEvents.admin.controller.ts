import type { Request, Response } from "express";
import * as svc from "./burnEvents.service.js";

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export async function listAll(_req: Request, res: Response): Promise<void> {
  try {
    const events = await svc.adminListEvents();
    res.json({ ok: true, events });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const b = req.body as Record<string, unknown>;
  try {
    const event = await svc.adminCreateEvent({
      title: String(b.title ?? ""),
      description: b.description != null ? String(b.description) : null,
      imageUrl: b.imageUrl != null ? String(b.imageUrl) : null,
      requiredHashRate: Number(b.requiredHashRate),
      rewardMinerId: Number(b.rewardMinerId),
      claimLimitPerUser: b.claimLimitPerUser != null ? Number(b.claimLimitPerUser) : 1,
      stockTotal: b.stockTotal != null && b.stockTotal !== "" ? Number(b.stockTotal) : null,
      startsAt: parseDate(b.startsAt),
      endsAt: parseDate(b.endsAt),
      isActive: b.isActive !== false,
    });
    res.json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function update(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  const b = req.body as Record<string, unknown>;
  try {
    const patch: Partial<svc.AdminEventInput> = {};
    if (b.title !== undefined) patch.title = String(b.title);
    if (b.description !== undefined) patch.description = b.description != null ? String(b.description) : null;
    if (b.imageUrl !== undefined) patch.imageUrl = b.imageUrl != null ? String(b.imageUrl) : null;
    if (b.requiredHashRate !== undefined) patch.requiredHashRate = Number(b.requiredHashRate);
    if (b.rewardMinerId !== undefined) patch.rewardMinerId = Number(b.rewardMinerId);
    if (b.claimLimitPerUser !== undefined) patch.claimLimitPerUser = Number(b.claimLimitPerUser);
    if (b.stockTotal !== undefined) patch.stockTotal = b.stockTotal != null && b.stockTotal !== "" ? Number(b.stockTotal) : null;
    if (b.startsAt !== undefined) patch.startsAt = parseDate(b.startsAt);
    if (b.endsAt !== undefined) patch.endsAt = parseDate(b.endsAt);
    if (b.isActive !== undefined) patch.isActive = Boolean(b.isActive);
    const event = await svc.adminUpdateEvent(id, patch);
    res.json({ ok: true, event });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function remove(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    await svc.adminSoftDeleteEvent(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}

export async function claims(req: Request<{ id: string }>, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  const page = parseInt(String(req.query.page ?? "1"), 10);
  if (!id) { res.status(400).json({ ok: false, message: "Invalid id" }); return; }
  try {
    const data = await svc.adminListClaims(id, page);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, message: String(err) });
  }
}
