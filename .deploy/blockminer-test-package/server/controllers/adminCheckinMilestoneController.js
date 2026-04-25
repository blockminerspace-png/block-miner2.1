import { Prisma } from "../src/db/prismaNamespace.js";
import prisma from "../src/db/prisma.js";
import { REWARD_HASHRATE, REWARD_NONE, REWARD_POL } from "../services/checkinMilestoneService.js";

const TYPES = new Set([REWARD_POL, REWARD_HASHRATE, REWARD_NONE]);

function isMissingMilestoneTablesError(e) {
  if (!e || typeof e !== "object") return false;
  if (e.code === "P2021" || e.code === "P2010") return true;
  const msg = String(e.message || "");
  return /checkin_streak_milestones|user_checkin_streak_rewards|does not exist|relation.*does not exist/i.test(
    msg
  );
}

function parseBody(body) {
  const dayThreshold = Number(body?.dayThreshold);
  if (!Number.isInteger(dayThreshold) || dayThreshold < 1) {
    throw new Error("dayThreshold must be a positive integer.");
  }
  const rewardType = String(body?.rewardType || REWARD_NONE).toLowerCase();
  if (!TYPES.has(rewardType)) {
    throw new Error(`rewardType must be one of: ${[...TYPES].join(", ")}`);
  }
  const rewardValue = Number(body?.rewardValue ?? 0);
  if (!(rewardValue >= 0) || !Number.isFinite(rewardValue)) {
    throw new Error("rewardValue must be a non-negative number.");
  }
  const validityDays = Math.max(1, Number(body?.validityDays ?? 7));
  const displayTitle = body?.displayTitle != null ? String(body.displayTitle).trim() || null : null;
  const description = body?.description != null ? String(body.description).trim() || null : null;
  const active = body?.active !== false;
  const sortOrder = Number.isFinite(Number(body?.sortOrder)) ? Number(body.sortOrder) : 0;

  return {
    dayThreshold,
    rewardType,
    rewardValue: new Prisma.Decimal(String(rewardValue)),
    validityDays,
    displayTitle,
    description,
    active,
    sortOrder
  };
}

export async function listCheckinMilestones(_req, res) {
  try {
    const rows = await prisma.checkinStreakMilestone.findMany({
      orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }]
    });
    res.json({
      ok: true,
      milestones: rows.map((m) => ({
        ...m,
        rewardValue: Number(m.rewardValue)
      }))
    });
  } catch (e) {
    console.error("admin listCheckinMilestones", e);
    if (isMissingMilestoneTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry."
      });
    }
    res.status(500).json({ ok: false, message: "Failed to list milestones." });
  }
}

export async function createCheckinMilestone(req, res) {
  try {
    const data = parseBody(req.body);
    const row = await prisma.checkinStreakMilestone.create({ data });
    res.json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e) {
    if (e?.code === "P2002") {
      return res.status(400).json({ ok: false, message: "A milestone with this day threshold already exists." });
    }
    if (e.message && !e.code) {
      return res.status(400).json({ ok: false, message: e.message });
    }
    if (isMissingMilestoneTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry."
      });
    }
    console.error("admin createCheckinMilestone", e);
    res.status(500).json({ ok: false, message: "Failed to create milestone." });
  }
}

export async function updateCheckinMilestone(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    const data = parseBody(req.body);
    const row = await prisma.checkinStreakMilestone.update({
      where: { id },
      data
    });
    res.json({ ok: true, milestone: { ...row, rewardValue: Number(row.rewardValue) } });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Milestone not found." });
    }
    if (e?.code === "P2002") {
      return res.status(400).json({ ok: false, message: "A milestone with this day threshold already exists." });
    }
    if (e.message && !e.code) {
      return res.status(400).json({ ok: false, message: e.message });
    }
    if (isMissingMilestoneTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry."
      });
    }
    console.error("admin updateCheckinMilestone", e);
    res.status(500).json({ ok: false, message: "Failed to update milestone." });
  }
}

export async function deleteCheckinMilestone(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id." });
    }
    await prisma.checkinStreakMilestone.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Milestone not found." });
    }
    if (isMissingMilestoneTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "MILESTONE_DB_PENDING",
        message:
          "Check-in milestone tables are missing. Apply pending Prisma migrations on the server, then retry."
      });
    }
    console.error("admin deleteCheckinMilestone", e);
    res.status(500).json({ ok: false, message: "Failed to delete milestone." });
  }
}
