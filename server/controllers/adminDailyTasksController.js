import prisma from "../src/db/prisma.js";
import { parseCreateDailyTaskDefinition } from "../services/dailyTasks/dailyTaskDefinitionAdminValidation.js";

export async function listDefinitions(_req, res) {
  try {
    const rows = await prisma.dailyTaskDefinition.findMany({
      orderBy: { sortOrder: "asc" }
    });
    res.json({ ok: true, definitions: rows });
  } catch (e) {
    console.error("adminDailyTasks listDefinitions", e);
    res.status(500).json({ ok: false, message: "Failed to load daily task definitions." });
  }
}

/**
 * Partial update: `isActive` and/or `sortOrder` (validated).
 */
export async function patchDefinition(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid task id." });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const data = {};
    if (typeof body.isActive === "boolean") {
      data.isActive = body.isActive;
    }
    if (body.sortOrder !== undefined && body.sortOrder !== null) {
      const n = parseInt(String(body.sortOrder), 10);
      if (!Number.isInteger(n) || n < 0 || n > 99999) {
        return res.status(400).json({ ok: false, message: "Invalid sort order." });
      }
      data.sortOrder = n;
    }
    if (body.internalOfferwallOfferId !== undefined) {
      if (body.internalOfferwallOfferId === null || body.internalOfferwallOfferId === "") {
        data.internalOfferwallOfferId = null;
      } else {
        const oid = parseInt(String(body.internalOfferwallOfferId), 10);
        if (!Number.isInteger(oid) || oid < 1) {
          return res.status(400).json({ ok: false, message: "Invalid internalOfferwallOfferId." });
        }
        const offer = await prisma.internalOfferwallOffer.findUnique({ where: { id: oid } });
        if (!offer) {
          return res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
        }
        data.internalOfferwallOfferId = oid;
      }
    }
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, message: "No valid fields to update." });
    }
    await prisma.dailyTaskDefinition.update({ where: { id }, data });
    const row = await prisma.dailyTaskDefinition.findUnique({ where: { id } });
    res.json({ ok: true, definition: row });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Task definition not found." });
    }
    console.error("adminDailyTasks patchDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to update daily task definition." });
  }
}

export async function createDefinition(req, res) {
  try {
    const parsed = parseCreateDailyTaskDefinition(req.body);
    if (!parsed.ok) {
      return res.status(parsed.status).json({ ok: false, message: parsed.message });
    }
    const { data, autoSortOrder } = parsed;

    if (data.rewardMinerId) {
      const miner = await prisma.miner.findUnique({ where: { id: data.rewardMinerId } });
      if (!miner) {
        return res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
      }
    }
    if (data.rewardEventMinerId) {
      const em = await prisma.eventMiner.findUnique({ where: { id: data.rewardEventMinerId } });
      if (!em) {
        return res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
      }
    }
    if (data.internalOfferwallOfferId) {
      const offer = await prisma.internalOfferwallOffer.findUnique({
        where: { id: data.internalOfferwallOfferId }
      });
      if (!offer) {
        return res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
      }
    }

    if (autoSortOrder) {
      const agg = await prisma.dailyTaskDefinition.aggregate({ _max: { sortOrder: true } });
      const max = agg._max.sortOrder ?? 0;
      data.sortOrder = max + 10;
    }

    const row = await prisma.dailyTaskDefinition.create({ data });
    res.status(201).json({ ok: true, definition: row });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(409).json({ ok: false, message: "Slug already exists." });
    }
    if (e?.code === "P2003") {
      return res.status(400).json({ ok: false, message: "Invalid foreign key (miner or event miner)." });
    }
    console.error("adminDailyTasks createDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to create daily task definition." });
  }
}

export async function deleteDefinition(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid task id." });
    }
    await prisma.dailyTaskDefinition.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Task definition not found." });
    }
    console.error("adminDailyTasks deleteDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to delete daily task definition." });
  }
}
