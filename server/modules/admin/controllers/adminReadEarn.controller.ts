import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import prisma from "../../../src/db/prisma.js";
import loggerLib from "../../../utils/logger.js";
import { READ_EARN_MACHINE } from "../../../utils/readEarnConstants.js";
import { parseReadEarnCreate, parseReadEarnUpdate } from "../../../utils/readEarnSchemas.js";
import { hashReadEarnCode } from "../../../services/readEarnService.js";

const logger = loggerLib.child("AdminReadEarn");

function isMissingReadEarnTablesError(e: unknown): boolean {
  if (e === null || typeof e !== "object") return false;
  const o = e as { code?: unknown; message?: unknown };
  if (o.code === "P2021" || o.code === "P2010") return true;
  const msg = String(o.message ?? "");
  return /read_earn_campaigns|read_earn_redemptions|does not exist|relation.*does not exist/i.test(msg);
}

function errCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

function mapCampaign(row: unknown) {
  if (!row || typeof row !== "object") return null;
  const r = row as {
    id: number;
    title: string;
    partnerUrl: string;
    rewardType: string;
    rewardAmount: unknown;
    rewardMinerId: number | null;
    hashrateValidityDays: number;
    startsAt: Date;
    expiresAt: Date;
    isActive: boolean;
    maxRedemptions: number | null;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    _count?: { redemptions: number };
    redemptionCount?: number;
  };
  const redemptionCount = r._count?.redemptions ?? r.redemptionCount ?? 0;
  return {
    id: r.id,
    title: r.title,
    partnerUrl: r.partnerUrl,
    rewardType: r.rewardType,
    rewardAmount: Number(r.rewardAmount),
    rewardMinerId: r.rewardMinerId,
    hashrateValidityDays: r.hashrateValidityDays,
    startsAt: r.startsAt,
    expiresAt: r.expiresAt,
    isActive: r.isActive,
    maxRedemptions: r.maxRedemptions,
    sortOrder: r.sortOrder,
    redemptionCount,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  };
}

export async function adminListReadEarnCampaigns(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await prisma.readEarnCampaign.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "desc" }],
      include: { _count: { select: { redemptions: true } } }
    });
    res.json({ ok: true, campaigns: rows.map(mapCampaign) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("adminListReadEarnCampaigns", { err: msg });
    if (isMissingReadEarnTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
      return;
    }
    res.status(500).json({ ok: false, message: "Failed to list campaigns." });
  }
}

export async function adminCreateReadEarnCampaign(req: Request, res: Response): Promise<void> {
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
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      const first = e.issues?.[0];
      res.status(400).json({
        ok: false,
        message: first?.message || "Validation failed."
      });
      return;
    }
    if (isMissingReadEarnTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("adminCreateReadEarnCampaign", { err: msg });
    res.status(500).json({ ok: false, message: "Failed to create campaign." });
  }
}

type IdParams = { id: string };

export async function adminUpdateReadEarnCampaign(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid campaign id." });
      return;
    }

    const data = parseReadEarnUpdate(req.body || {});
    const existing = await prisma.readEarnCampaign.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ ok: false, message: "Campaign not found." });
      return;
    }

    const startsAt = data.startsAt ?? existing.startsAt;
    const expiresAt = data.expiresAt ?? existing.expiresAt;
    if (expiresAt <= startsAt) {
      res.status(400).json({ ok: false, message: "expiresAt must be after startsAt." });
      return;
    }

    const rewardType = data.rewardType ?? existing.rewardType;
    const rewardMinerId =
      data.rewardMinerId !== undefined ? data.rewardMinerId : existing.rewardMinerId;
    if (String(rewardType).toLowerCase() === READ_EARN_MACHINE && !rewardMinerId) {
      res.status(400).json({
        ok: false,
        message: "rewardMinerId is required when rewardType is machine."
      });
      return;
    }

    const updatePayload: Prisma.ReadEarnCampaignUncheckedUpdateInput = {};
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
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      const first = e.issues?.[0];
      res.status(400).json({
        ok: false,
        message: first?.message || "Validation failed."
      });
      return;
    }
    if (errCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Campaign not found." });
      return;
    }
    if (isMissingReadEarnTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("adminUpdateReadEarnCampaign", { err: msg });
    res.status(500).json({ ok: false, message: "Failed to update campaign." });
  }
}

export async function adminDeleteReadEarnCampaign(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid campaign id." });
      return;
    }

    const cnt = await prisma.readEarnRedemption.count({ where: { campaignId: id } });
    if (cnt > 0) {
      res.status(409).json({
        ok: false,
        message: "Cannot delete a campaign that already has redemptions."
      });
      return;
    }

    await prisma.readEarnCampaign.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: unknown) {
    if (errCode(e) === "P2025") {
      res.status(404).json({ ok: false, message: "Campaign not found." });
      return;
    }
    if (isMissingReadEarnTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("adminDeleteReadEarnCampaign", { err: msg });
    res.status(500).json({ ok: false, message: "Failed to delete campaign." });
  }
}

export async function adminListReadEarnRedemptions(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId < 1) {
      res.status(400).json({ ok: false, message: "Invalid campaign id." });
      return;
    }

    const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
    const skip = Math.max(0, Number(req.query.skip) || 0);

    const campaign = await prisma.readEarnCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, title: true }
    });
    if (!campaign) {
      res.status(404).json({ ok: false, message: "Campaign not found." });
      return;
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
  } catch (e: unknown) {
    if (isMissingReadEarnTablesError(e)) {
      res.status(503).json({
        ok: false,
        code: "READ_EARN_DB_PENDING",
        message: "Read & Earn tables are missing. Apply pending Prisma migrations, then retry."
      });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("adminListReadEarnRedemptions", { err: msg });
    res.status(500).json({ ok: false, message: "Failed to list redemptions." });
  }
}
