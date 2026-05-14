import type { Request, Response } from "express";
import {
  adminCreateStreamDestination,
  adminDeleteStreamDestination,
  adminPatchStreamDestination,
  destinationToAdminJson,
} from "../services/streaming/youtubeStreamService.js";
import {
  isStreamActive,
  reconcileAllStaleStreamDestinations,
  reconcileStaleStreamDbState,
  startStreamForDestination,
  stopStreamForDestination,
} from "../services/streaming/streamRunner.js";
import prisma from "../src/db/prisma.js";

type IdParams = { id?: string };

type JsonBody = Record<string, unknown>;

export async function listDestinations(_req: Request, res: Response): Promise<void> {
  try {
    await reconcileAllStaleStreamDestinations();
    const rows = await prisma.streamDestination.findMany({ orderBy: [{ id: "asc" }] });
    const destinations = rows.map((r) => ({
      ...destinationToAdminJson(r),
      workerAlive: isStreamActive(r.id),
    }));
    res.json({ ok: true, destinations });
  } catch (e: unknown) {
    console.error("adminYoutubeStream listDestinations", e);
    res.status(500).json({ ok: false, message: "Failed to list stream destinations." });
  }
}

export async function getDestination(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const row = await prisma.streamDestination.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ ok: false, message: "Destination not found." });
      return;
    }
    await reconcileStaleStreamDbState(row);
    const fresh = await prisma.streamDestination.findUnique({ where: { id } });
    if (!fresh) {
      res.status(404).json({ ok: false, message: "Destination not found." });
      return;
    }
    res.json({
      ok: true,
      destination: { ...destinationToAdminJson(fresh), workerAlive: isStreamActive(id) },
    });
  } catch (e: unknown) {
    console.error("adminYoutubeStream getDestination", e);
    res.status(500).json({ ok: false, message: "Failed to load destination." });
  }
}

export async function createDestination(req: Request<unknown, unknown, JsonBody>, res: Response): Promise<void> {
  try {
    const out = await adminCreateStreamDestination(req.body);
    if (!out.ok) {
      res.status(typeof out.status === "number" ? out.status : 500).json({ ok: false, message: out.message });
      return;
    }
    res.status(201).json({ ok: true, destination: out.destination });
  } catch (e: unknown) {
    console.error("adminYoutubeStream createDestination", e);
    res.status(500).json({ ok: false, message: "Failed to create destination." });
  }
}

export async function patchDestination(req: Request<IdParams, unknown, JsonBody>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    const out = await adminPatchStreamDestination(id, req.body);
    if (!out.ok) {
      res.status(typeof out.status === "number" ? out.status : 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true, destination: out.destination });
  } catch (e: unknown) {
    console.error("adminYoutubeStream patchDestination", e);
    res.status(500).json({ ok: false, message: "Failed to update destination." });
  }
}

export async function deleteDestination(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    await stopStreamForDestination(id).catch((_err: unknown) => {});
    const out = await adminDeleteStreamDestination(id);
    if (!out.ok) {
      res.status(typeof out.status === "number" ? out.status : 500).json({ ok: false, message: out.message });
      return;
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("adminYoutubeStream deleteDestination", e);
    res.status(500).json({ ok: false, message: "Failed to delete destination." });
  }
}

export async function postStart(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const row = await prisma.streamDestination.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ ok: false, message: "Destination not found." });
      return;
    }
    if (!row.enabled) {
      res.status(400).json({ ok: false, message: "Destination is disabled." });
      return;
    }
    await prisma.streamDestination.update({
      where: { id },
      data: { desiredRunning: true, lastWorkerStatus: "STARTING", lastError: null },
    });
    void startStreamForDestination(id).catch((err: unknown) => {
      console.error("startStreamForDestination", id, err);
    });
    res.json({ ok: true, status: "STARTING" });
  } catch (e: unknown) {
    console.error("adminYoutubeStream postStart", e);
    res.status(500).json({ ok: false, message: "Failed to start stream." });
  }
}

export async function postStop(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    await prisma.streamDestination.update({
      where: { id },
      data: { desiredRunning: false },
    });
    await stopStreamForDestination(id);
    res.json({ ok: true, status: "OFFLINE" });
  } catch (e: unknown) {
    console.error("adminYoutubeStream postStop", e);
    res.status(500).json({ ok: false, message: "Failed to stop stream." });
  }
}
