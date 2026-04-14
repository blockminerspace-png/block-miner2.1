import { Prisma } from "../src/db/prismaNamespace.js";
import { ZodError } from "zod";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { READ_EARN_MACHINE } from "../utils/readEarnConstants.js";
import { parseReadEarnCreate, parseReadEarnUpdate } from "../utils/readEarnSchemas.js";
import { hashReadEarnCode } from "../services/readEarnService.js";

const logger = loggerLib.child("AdminReadEarn");

function isMissingReadEarnTablesError(e) {
  if (!e || typeof e !== "object") return false;
  if (e.code === "P2021" || e.code === "P2010") return true;
  const msg = String(e.message || "");
  return /read_earn_campaigns|read_earn_redemptions|does not exist|relation.*does not exist/i.test(msg);
}

function mapCampaign(row) {
  if (!row) return null;
  const redemptionCount = row._count?.redemptions ?? row.redemptionCount ?? 0;
  return {
    id: row.id,
    title: row.title,
    partnerUrl: row.partnerUrl,
    rewardType: row.rewardType,
    rewardAmount: Number(row.rewardAmount),
    rewardMinerId: row.rewardMinerId,
    hashrateValidityDays: row.hashrateValidityDays,
    startsAt: row.startsAt,
    expiresAt: row.expiresAt,
    isActive: row.isActive,
    maxRedemptions: row.maxRedemptions,
    sortOrder: row.sortOrder,
    redemptionCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function adminListReadEarnCampaigns(_req, res) {
  try {
    const rows = await prisma.readEarnCampaign.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
      include: { _count: { select: { redemptions: true } } }
    });
    res.json({ ok: true, campaigns: rows.map(mapCampaign) });
  } catch (e) {
    logger.error("adminListReadEarnCampaigns", { err: e?.message });
    if (isMissingReadEarnTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
    }
    res.status(500).json({ ok: false, message: "Failed to list campaigns." });
  }
}

export async function adminCreateReadEarnCampaign(req, res) {
  try {
    const data = parseReadEarnCreate(req.body || {});
    const codeHash = await hashReadEarnCode(data.rewardCode);
    const row = await prisma.readEarnCampaign.create({
      data: {
        title: data.title,
        partnerUrl: data.partnerUrl,
        codeHash,
        rewardType: data.rewardType,
        rewardAmount: new Prisma.Decimal(String(data.rewardAmount)),
        rewardMinerId: data.rewardMinerId ?? null,
        hashrateValidityDays: data.hashrateValidityDays,
        startsAt: data.startsAt,
        expiresAt: data.expiresAt,
        maxRedemptions: data.maxRedemptions ?? null,
        sortOrder: data.sortOrder,
        isActive: data.isActive
      },
      include: { _count: { select: { redemptions: true } } }
    });
    res.json({ ok: true, campaign: mapCampaign(row) });
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues?.[0];
      return res.status(400).json({
        ok: false,
        message: first?.message || "Validation failed."
      });
    }
    if (isMissingReadEarnTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
    }
    logger.error("adminCreateReadEarnCampaign", { err: e?.message });
    res.status(500).json({ ok: false, message: "Failed to create campaign." });
  }
}

export async function adminUpdateReadEarnCampaign(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid campaign id." });
    }

    const data = parseReadEarnUpdate(req.body || {});
    const existing = await prisma.readEarnCampaign.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Campaign not found." });
    }

    const startsAt = data.startsAt ?? existing.startsAt;
    const expiresAt = data.expiresAt ?? existing.expiresAt;
    if (expiresAt <= startsAt) {
      return res.status(400).json({ ok: false, message: "expiresAt must be after startsAt." });
    }

    const rewardType = data.rewardType ?? existing.rewardType;
    const rewardMinerId =
      data.rewardMinerId !== undefined ? data.rewardMinerId : existing.rewardMinerId;
    if (String(rewardType).toLowerCase() === READ_EARN_MACHINE && !rewardMinerId) {
      return res.status(400).json({
        ok: false,
        message: "rewardMinerId is required when rewardType is machine."
      });
    }

    /** @type {import("@prisma/client").Prisma.ReadEarnCampaignUpdateInput} */
    const updatePayload = {};
    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.partnerUrl !== undefined) updatePayload.partnerUrl = data.partnerUrl;
    if (data.rewardType !== undefined) updatePayload.rewardType = data.rewardType;
    if (data.rewardAmount !== undefined) {
      updatePayload.rewardAmount = new Prisma.Decimal(String(data.rewardAmount));
    }
    if (data.rewardMinerId !== undefined) {
      updatePayload.rewardMinerId = data.rewardMinerId;
    }
    if (data.hashrateValidityDays !== undefined) {
      updatePayload.hashrateValidityDays = data.hashrateValidityDays;
    }
    if (data.startsAt !== undefined) updatePayload.startsAt = data.startsAt;
    if (data.expiresAt !== undefined) updatePayload.expiresAt = data.expiresAt;
    if (data.maxRedemptions !== undefined) updatePayload.maxRedemptions = data.maxRedemptions;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
    if (data.rewardCode) {
      updatePayload.codeHash = await hashReadEarnCode(data.rewardCode);
    }

    const row = await prisma.readEarnCampaign.update({
      where: { id },
      data: updatePayload,
      include: { _count: { select: { redemptions: true } } }
    });
    res.json({ ok: true, campaign: mapCampaign(row) });
  } catch (e) {
    if (e instanceof ZodError) {
      const first = e.issues?.[0];
      return res.status(400).json({
        ok: false,
        message: first?.message || "Validation failed."
      });
    }
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Campaign not found." });
    }
    if (isMissingReadEarnTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
    }
    logger.error("adminUpdateReadEarnCampaign", { err: e?.message });
    res.status(500).json({ ok: false, message: "Failed to update campaign." });
  }
}

export async function adminDeleteReadEarnCampaign(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ ok: false, message: "Invalid campaign id." });
    }

    const cnt = await prisma.readEarnRedemption.count({ where: { campaignId: id } });
    if (cnt > 0) {
      return res.status(409).json({
        ok: false,
        message: "Cannot delete a campaign that already has redemptions."
      });
    }

    await prisma.readEarnCampaign.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    if (e?.code === "P2025") {
      return res.status(404).json({ ok: false, message: "Campaign not found." });
    }
    if (isMissingReadEarnTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
    }
    logger.error("adminDeleteReadEarnCampaign", { err: e?.message });
    res.status(500).json({ ok: false, message: "Failed to delete campaign." });
  }
}

export async function adminListReadEarnRedemptions(req, res) {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId < 1) {
      return res.status(400).json({ ok: false, message: "Invalid campaign id." });
    }

    const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const campaign = await prisma.readEarnCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, title: true }
    });
    if (!campaign) {
      return res.status(404).json({ ok: false, message: "Campaign not found." });
    }

    const [rows, total] = await Promise.all([
      prisma.readEarnRedemption.findMany({
        where: { campaignId },
        orderBy: { redeemedAt: "desc" },
        skip,
        take,
        include: {
          user: { select: { id: true, username: true, email: true } }
        }
      }),
      prisma.readEarnRedemption.count({ where: { campaignId } })
    ]);

    res.json({
      ok: true,
      campaign,
      total,
      redemptions: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.user?.username,
        email: r.user?.email,
        rewardSnapshot: r.rewardSnapshot,
        redeemedAt: r.redeemedAt,
        ip: r.ip
      }))
    });
  } catch (e) {
    if (isMissingReadEarnTablesError(e)) {
      return res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
    }
    logger.error("adminListReadEarnRedemptions", { err: e?.message });
    res.status(500).json({ ok: false, message: "Failed to list redemptions." });
  }
}
