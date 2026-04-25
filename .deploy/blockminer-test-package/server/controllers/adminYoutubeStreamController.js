import {
  adminCreateStreamDestination,
  adminDeleteStreamDestination,
  adminPatchStreamDestination,
  destinationToAdminJson
} from "../services/streaming/youtubeStreamService.js";
import {
  isStreamActive,
  reconcileAllStaleStreamDestinations,
  reconcileStaleStreamDbState,
  startStreamForDestination,
  stopStreamForDestination
} from "../services/streaming/streamRunner.js";
import prisma from "../src/db/prisma.js";

export async function listDestinations(_req, res) {
  try {
    await reconcileAllStaleStreamDestinations();
    const rows = await prisma.streamDestination.findMany({ orderBy: [{ id: "asc" }] });
    const destinations = rows.map((r) => ({
      ...destinationToAdminJson(r),
      workerAlive: isStreamActive(r.id)
    }));
    res.json({ ok: true, destinations });
  } catch (e) {
    console.error("adminYoutubeStream listDestinations", e);
    res.status(500).json({ ok: false, message: "Failed to list stream destinations." });
  }
}

export async function getDestination(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const row = await prisma.streamDestination.findUnique({ where: { id } });
    if (!row) {
      return res.status(404).json({ ok: false, message: "Destination not found." });
    }
    await reconcileStaleStreamDbState(row);
    const fresh = await prisma.streamDestination.findUnique({ where: { id } });
    if (!fresh) {
      return res.status(404).json({ ok: false, message: "Destination not found." });
    }
    res.json({
      ok: true,
      destination: { ...destinationToAdminJson(fresh), workerAlive: isStreamActive(id) }
    });
  } catch (e) {
    console.error("adminYoutubeStream getDestination", e);
    res.status(500).json({ ok: false, message: "Failed to load destination." });
  }
}

export async function createDestination(req, res) {
  try {
    const out = await adminCreateStreamDestination(req.body);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.status(201).json({ ok: true, destination: out.destination });
  } catch (e) {
    console.error("adminYoutubeStream createDestination", e);
    res.status(500).json({ ok: false, message: "Failed to create destination." });
  }
}

export async function patchDestination(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    const out = await adminPatchStreamDestination(id, req.body);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.json({ ok: true, destination: out.destination });
  } catch (e) {
    console.error("adminYoutubeStream patchDestination", e);
    res.status(500).json({ ok: false, message: "Failed to update destination." });
  }
}

export async function deleteDestination(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    await stopStreamForDestination(id).catch(() => {});
    const out = await adminDeleteStreamDestination(id);
    if (!out.ok) {
      return res.status(out.status).json({ ok: false, message: out.message });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error("adminYoutubeStream deleteDestination", e);
    res.status(500).json({ ok: false, message: "Failed to delete destination." });
  }
}

export async function postStart(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const row = await prisma.streamDestination.findUnique({ where: { id } });
    if (!row) {
      return res.status(404).json({ ok: false, message: "Destination not found." });
    }
    if (!row.enabled) {
      return res.status(400).json({ ok: false, message: "Destination is disabled." });
    }
    await prisma.streamDestination.update({
      where: { id },
      data: { desiredRunning: true, lastWorkerStatus: "STARTING", lastError: null }
    });
    void startStreamForDestination(id).catch((err) => {
      console.error("startStreamForDestination", id, err);
    });
    res.json({ ok: true, status: "STARTING" });
  } catch (e) {
    console.error("adminYoutubeStream postStart", e);
    res.status(500).json({ ok: false, message: "Failed to start stream." });
  }
}

export async function postStop(req, res) {
  try {
    const id = parseInt(String(req.params.id || ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    await prisma.streamDestination.update({
      where: { id },
      data: { desiredRunning: false }
    });
    await stopStreamForDestination(id);
    res.json({ ok: true, status: "OFFLINE" });
  } catch (e) {
    console.error("adminYoutubeStream postStop", e);
    res.status(500).json({ ok: false, message: "Failed to stop stream." });
  }
}
