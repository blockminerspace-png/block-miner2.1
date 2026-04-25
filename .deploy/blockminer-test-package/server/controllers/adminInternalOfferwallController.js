import prisma from "../src/db/prisma.js";
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

function offerToPlain(row) {
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

export async function listOffers(_req, res) {
  try {
    const rows = await adminListOffers();
    res.json({ ok: true, offers: rows });
  } catch (e) {
    console.error("adminInternalOfferwall listOffers", e);
    res.status(500).json({ ok: false, message: "Failed to list offers." });
  }
}

export async function createOffer(req, res) {
  try {
    const parsed = await parseAdminOfferBody(prisma, req.body);
    if (!parsed.ok) {
      const payload = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      return res.status(parsed.status).json(payload);
    }
    const row = await adminCreateOffer(parsed.data);
    res.status(201).json({ ok: true, offer: row });
  } catch (e) {
    console.error("adminInternalOfferwall createOffer", e);
    res.status(500).json({ ok: false, message: "Failed to create offer." });
  }
}

export async function patchOffer(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const existing = await prisma.internalOfferwallOffer.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Offer not found." });
    }
    const merged = { ...offerToPlain(existing), ...req.body };
    const parsed = await parseAdminOfferBody(prisma, merged);
    if (!parsed.ok) {
      const payload = { ok: false, message: parsed.message, code: parsed.code };
      if (parsed.details) payload.details = parsed.details;
      return res.status(parsed.status).json(payload);
    }
    const row = await adminPatchOffer(id, parsed.data);
    res.json({ ok: true, offer: row });
  } catch (e) {
    console.error("adminInternalOfferwall patchOffer", e);
    res.status(500).json({ ok: false, message: "Failed to update offer." });
  }
}

export async function listAttempts(req, res) {
  try {
    const status = req.query.status ? String(req.query.status) : "";
    const offerId = req.query.offerId ? parseInt(String(req.query.offerId), 10) : undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const rows = await adminListAttempts({
      status: status || undefined,
      offerId: Number.isInteger(offerId) && offerId > 0 ? offerId : undefined,
      limit
    });
    res.json({ ok: true, attempts: rows });
  } catch (e) {
    console.error("adminInternalOfferwall listAttempts", e);
    res.status(500).json({ ok: false, message: "Failed to list attempts." });
  }
}

export async function approveAttempt(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid attempt id." });
    }
    const out = await adminApproveAttempt(id);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("adminInternalOfferwall approveAttempt", e);
    res.status(500).json({ ok: false, message: "Failed to approve attempt." });
  }
}

export async function listFrameHosts(_req, res) {
  try {
    const rows = await adminListFrameHosts();
    res.json({ ok: true, frameHosts: rows });
  } catch (e) {
    console.error("adminInternalOfferwall listFrameHosts", e);
    res.status(500).json({ ok: false, message: "Failed to list frame hosts." });
  }
}

export async function deactivateFrameHost(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const out = await adminDeactivateFrameHostById(id);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("adminInternalOfferwall deactivateFrameHost", e);
    res.status(500).json({ ok: false, message: "Failed to update frame host." });
  }
}

export async function rejectAttempt(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid attempt id." });
    }
    const note = req.body?.note;
    const out = await adminRejectAttempt(id, note);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("adminInternalOfferwall rejectAttempt", e);
    res.status(500).json({ ok: false, message: "Failed to reject attempt." });
  }
}
