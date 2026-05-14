import type { Request, Response } from "express";
import { Prisma } from "../src/db/prismaNamespace.js";
import prisma from "../src/db/prisma.js";
import {
  REWARD_HASHRATE,
  REWARD_NONE,
  REWARD_POL,
} from "../services/checkinMilestoneService.js";

const TYPES = new Set<string>([REWARD_POL, REWARD_HASHRATE, REWARD_NONE]);

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
    msg
  );
}

type MilestoneBody = {
  dayThreshold?: unknown;
  rewardType?: unknown;
  rewardValue?: unknown;
  validityDays?: unknown;
  displayTitle?: unknown;
  description?: unknown;
  active?: unknown;
  sortOrder?: unknown;
};

type MilestoneInput = Parameters<(typeof prisma.checkinStreakMilestone)["create"]>[0]["data"];

function parseBody(body: unknown): MilestoneInput {
  const b = typeof body === "object" && body !== null ? (body as MilestoneBody) : {};
  const dayThreshold = Number(b.dayThreshold);
  if (!Number.isInteger(dayThreshold) || dayThreshold < 1) {
    throw new Error("dayThreshold must be a positive integer.");
  }
  const rewardType = String(b.rewardType ?? REWARD_NONE).toLowerCase();
  if (!TYPES.has(rewardType)) {
    throw new Error(`rewardType must be one of: ${[...TYPES].join(", ")}`);
  }
  const rewardValue = Number(b.rewardValue ?? 0);
  if (!(rewardValue >= 0) || !Number.isFinite(rewardValue)) {
    throw new Error("rewardValue must be a non-negative number.");
  }
  const validityDays = Math.max(1, Number(b.validityDays ?? 7));
  const displayTitle =
    b.displayTitle != null ? String(b.displayTitle).trim() || null : null;
  const description = b.description != null ? String(b.description).trim() || null : null;
  const active = b.active !== false;
  const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

  return {
    dayThreshold,
    rewardType,
    rewardValue: new Prisma.Decimal(String(rewardValue)),
    validityDays,
    displayTitle,
    description,
    active,
    sortOrder,
  };
}

export async function listCheckinMilestones(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.checkinStreakMilestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
    });
    res.json({
      ok: true,
      milestones: rows.map((m) => ({
        ...m,
        rewardValue: Number(m.rewardValue),
      })),
    });
  } catch (e: unknown) {
    console.error("admin listCheckinMilestones", e);
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
  res: Response
): Promise<void> {
  try {
    const data = parseBody(req.body);
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
    console.error("admin createCheckinMilestone", e);
    res.status(500).json({ ok: false, message: "Failed to create milestone." });
  }
}

type IdParams = { id?: string };

export async function updateCheckinMilestone(
  req: Request<IdParams, unknown, MilestoneBody>,
  res: Response
): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const data = parseBody(req.body);
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
    console.error("admin updateCheckinMilestone", e);
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
    console.error("admin deleteCheckinMilestone", e);
    res.status(500).json({ ok: false, message: "Failed to delete milestone." });
  }
}
