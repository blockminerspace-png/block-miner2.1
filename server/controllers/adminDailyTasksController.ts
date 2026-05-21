import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import prisma from "../src/db/prisma.js";
import {
  parseCreateDailyTaskDefinition,
  parsePatchDailyTaskDefinition,
} from "../services/dailyTasks/dailyTaskDefinitionAdminValidation.js";

function prismaErrCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

type DefinitionIdParams = { id: string };

export async function listDefinitions(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.dailyTaskDefinition.findMany({
      orderBy: { sortOrder: "asc" },
    });
    res.json({ ok: true, definitions: rows });
  } catch (e: unknown) {
    console.error("adminDailyTasks listDefinitions", e);
    res.status(500).json({ ok: false, message: "Failed to load daily task definitions." });
  }
}

export async function patchDefinition(
  req: Request<DefinitionIdParams>,
  res: Response
): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid task id." });
      return;
    }
    const parsed = parsePatchDailyTaskDefinition(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ ok: false, message: parsed.message });
      return;
    }
    const { data, needsMinerId, needsEventMinerId, needsOfferwallId } = parsed;

    if (needsMinerId != null) {
      const miner = await prisma.miner.findUnique({ where: { id: needsMinerId } });
      if (!miner) { res.status(400).json({ ok: false, message: "rewardMinerId does not exist." }); return; }
    }
    if (needsEventMinerId != null) {
      const em = await prisma.eventMiner.findUnique({ where: { id: needsEventMinerId } });
      if (!em) { res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." }); return; }
    }
    if (needsOfferwallId != null) {
      const offer = await prisma.internalOfferwallOffer.findUnique({ where: { id: needsOfferwallId } });
      if (!offer) { res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." }); return; }
    }

    await prisma.dailyTaskDefinition.update({ where: { id }, data });
    const row = await prisma.dailyTaskDefinition.findUnique({ where: { id } });
    res.json({ ok: true, definition: row });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }
    if (prismaErrCode(e) === "P2002") {
      res.status(409).json({ ok: false, message: "Slug already exists." });
      return;
    }
    console.error("adminDailyTasks patchDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to update daily task definition." });
  }
}

export async function createDefinition(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseCreateDailyTaskDefinition(req.body);
    if (!parsed.ok) {
      res.status(parsed.status).json({ ok: false, message: parsed.message });
      return;
    }
    const { data, autoSortOrder } = parsed as {
      ok: true;
      autoSortOrder: boolean;
      data: Prisma.DailyTaskDefinitionUncheckedCreateInput;
    };

    if (data.rewardMinerId) {
      const miner = await prisma.miner.findUnique({ where: { id: data.rewardMinerId } });
      if (!miner) {
        res.status(400).json({ ok: false, message: "rewardMinerId does not exist." });
        return;
      }
    }
    if (data.rewardEventMinerId) {
      const em = await prisma.eventMiner.findUnique({ where: { id: data.rewardEventMinerId } });
      if (!em) {
        res.status(400).json({ ok: false, message: "rewardEventMinerId does not exist." });
        return;
      }
    }
    if (data.internalOfferwallOfferId) {
      const offer = await prisma.internalOfferwallOffer.findUnique({
        where: { id: data.internalOfferwallOfferId },
      });
      if (!offer) {
        res.status(400).json({ ok: false, message: "internalOfferwallOfferId does not exist." });
        return;
      }
    }

    if (autoSortOrder) {
      const agg = await prisma.dailyTaskDefinition.aggregate({ _max: { sortOrder: true } });
      const max = agg._max.sortOrder ?? 0;
      data.sortOrder = max + 10;
    }

    const row = await prisma.dailyTaskDefinition.create({ data });
    res.status(201).json({ ok: true, definition: row });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2002") {
      res.status(409).json({ ok: false, message: "Slug already exists." });
      return;
    }
    if (prismaErrCode(e) === "P2003") {
      res.status(400).json({ ok: false, message: "Invalid foreign key (miner or event miner)." });
      return;
    }
    console.error("adminDailyTasks createDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to create daily task definition." });
  }
}

export async function deleteDefinition(req: Request<DefinitionIdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid task id." });
      return;
    }
    await prisma.dailyTaskDefinition.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: unknown) {
    if (prismaErrCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Task definition not found." });
      return;
    }
    console.error("adminDailyTasks deleteDefinition", e);
    res.status(500).json({ ok: false, message: "Failed to delete daily task definition." });
  }
}
