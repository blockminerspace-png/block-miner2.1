import type { Request, Response } from "express";
import { Prisma } from "../../../src/db/prismaNamespace.js";
import prisma from "../../../src/db/prisma.js";
import {

  assertMinerExistsForMilestone,
  parseMilestoneBody,
  REWARD_MACHINE,
} from "../../../modules/checkin/checkin.milestoneRules.js";

import loggerLib from "../../../utils/logger.js";
const logger = loggerLib.child("adminCheckinMilestone");

function getPrismaCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

function isMissingMilestoneTablesError(e: unknown): boolean {
  const code = getPrismaCode(e);
  if (code === "P2021" || code === "P2010") return true;
  const msg =
    e instanceof Error
      ? e.message
      : e !== null && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string"
        ? String((e as { message: string }).message)
        : "";
  return /checkin_streak_milestones|user_checkin_streak_rewards|does not exist|relation.*does not exist/i.test(
    msg,
  );
}

type MilestoneBody = Record<string, unknown>;

type MilestoneInput = Parameters<(typeof prisma.checkinStreakMilestone)["create"]>[0]["data"];

async function parseAndValidateBody(body: unknown): Promise<MilestoneInput> {
  const parsed = parseMilestoneBody(body);
  if (parsed.rewardType === REWARD_MACHINE && parsed.minerId) {
    await assertMinerExistsForMilestone(prisma, parsed.minerId);
  }
  return parsed;
}

export async function listCheckinMilestones(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.checkinStreakMilestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
      include: {
        miner: { select: { id: true, name: true, baseHashRate: true, isActive: true, isArchived: true } },
      },
    });
    res.json({
      ok: true,
      milestones: rows.map((m) => ({
        ...m,
        rewardValue: Number(m.rewardValue),
        minerName: m.miner?.name ?? null,
      })),
    });
  } catch (e: unknown) {
    logger.error("admin listCheckinMilestones", { error: String(e) });
    if (isMissingMilestoneTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry.",
      });
      return;
    }
    res.status(500).json({ ok: false, message: "Failed to list milestones." });
  }
}

export async function createCheckinMilestone(
  req: Request<unknown, unknown, MilestoneBody>,
  res: Response,
): Promise<void> {
  try {
    const data = await parseAndValidateBody(req.body);
    const row = await prisma.checkinStreakMilestone.create({ data });
    res.json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e: unknown) {
    const code = getPrismaCode(e);
    const errPeek =
      typeof e === "object" && e !== null ? (e as { message?: unknown; code?: unknown }) : null;
    if (code === "P2002") {
      res.status(400).json({ ok: false, message: "A milestone with this day threshold already exists." });
      return;
    }
    if (
      errPeek?.message !== undefined &&
      String(errPeek.message) &&
      (errPeek.code === undefined || errPeek.code === null)
    ) {
      res.status(400).json({ ok: false, message: String(errPeek.message) });
      return;
    }
    if (isMissingMilestoneTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry.",
      });
      return;
    }
    logger.error("admin createCheckinMilestone", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to create milestone." });
  }
}

type IdParams = { id?: string };

export async function updateCheckinMilestone(
  req: Request<IdParams, unknown, MilestoneBody>,
  res: Response,
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const data = await parseAndValidateBody(req.body);
    const row = await prisma.checkinStreakMilestone.update({
      where: { id },
      data,
    });
    res.json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e: unknown) {
    if (getPrismaCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Milestone not found." });
      return;
    }
    if (getPrismaCode(e) === "P2002") {
      res.status(400).json({ ok: false, message: "A milestone with this day threshold already exists." });
      return;
    }
    if (e instanceof Error && e.message && getPrismaCode(e) === undefined) {
      res.status(400).json({ ok: false, message: e.message });
      return;
    }
    if (isMissingMilestoneTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry.",
      });
      return;
    }
    logger.error("admin updateCheckinMilestone", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to update milestone." });
  }
}

export async function deleteCheckinMilestone(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    await prisma.checkinStreakMilestone.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: unknown) {
    if (getPrismaCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Milestone not found." });
      return;
    }
    if (isMissingMilestoneTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry.",
      });
      return;
    }
    logger.error("admin deleteCheckinMilestone", { error: String(e) });
    res.status(500).json({ ok: false, message: "Failed to delete milestone." });
  }
}
