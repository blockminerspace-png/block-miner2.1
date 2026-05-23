import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import { createInventoryWithOwnedMachineTx } from "../../services/userOwnedMachineService.js";
import { createAuditLogBestEffort } from "../../models/auditLogModel.js";
import loggerLib from "../../utils/logger.js";

const logger = loggerLib.child("AdminSocialController");

// ─── YouTuber Profiles ────────────────────────────────────────────────────────

export async function listProfiles(_req: Request, res: Response): Promise<void> {
  const profiles = await prisma.youtuberProfile.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, name: true, email: true } },
      _count: { select: { submissions: true } },
    },
  });
  res.json({ ok: true, profiles });
}

export async function createProfile(req: Request, res: Response): Promise<void> {
  const { userId, channelName, channelPhoto, channelUrl, bio, isCredentialed } =
    req.body as Record<string, unknown>;

  if (!userId || !channelName) {
    res.status(400).json({ ok: false, message: "userId e channelName são obrigatórios." });
    return;
  }

  try {
    const profile = await prisma.youtuberProfile.create({
      data: {
        userId: Number(userId),
        channelName: String(channelName).trim().slice(0, 100),
        channelPhoto: channelPhoto ? String(channelPhoto).trim() : null,
        channelUrl: channelUrl ? String(channelUrl).trim() : null,
        bio: bio ? String(bio).trim().slice(0, 500) : null,
        isCredentialed: isCredentialed !== false,
      },
    });
    res.json({ ok: true, profile });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unique constraint") && msg.includes("user_id")) {
      res.status(409).json({ ok: false, message: "Usuário já possui um perfil." });
      return;
    }
    res.status(400).json({ ok: false, message: msg });
  }
}

export async function updateProfile(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }

  const { channelName, channelPhoto, channelUrl, bio, isCredentialed } =
    req.body as Record<string, unknown>;

  const profile = await prisma.youtuberProfile.update({
    where: { id },
    data: {
      ...(channelName != null && { channelName: String(channelName).trim().slice(0, 100) }),
      ...(channelPhoto !== undefined && { channelPhoto: channelPhoto ? String(channelPhoto).trim() : null }),
      ...(channelUrl !== undefined && { channelUrl: channelUrl ? String(channelUrl).trim() : null }),
      ...(bio !== undefined && { bio: bio ? String(bio).trim().slice(0, 500) : null }),
      ...(isCredentialed !== undefined && { isCredentialed: Boolean(isCredentialed) }),
    },
  });
  res.json({ ok: true, profile });
}

export async function deleteProfile(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }
  await prisma.youtuberProfile.delete({ where: { id } });
  res.json({ ok: true });
}

// ─── Credential Requests ─────────────────────────────────────────────────────

export async function listCredentialRequests(_req: Request, res: Response): Promise<void> {
  const profiles = await prisma.youtuberProfile.findMany({
    where: { credentialRequestStatus: "pending" },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, username: true, name: true, email: true } },
    },
  });
  res.json({ ok: true, profiles });
}

export async function approveCredential(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }

  const profile = await prisma.youtuberProfile.update({
    where: { id },
    data: { isCredentialed: true, credentialRequestStatus: "approved", credentialRejectNote: null },
  });
  logger.info("social.credential_approved", { profileId: id, userId: profile.userId });
  res.json({ ok: true, profile });
}

export async function rejectCredential(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }

  const { rejectNote } = req.body as { rejectNote?: string };

  const profile = await prisma.youtuberProfile.update({
    where: { id },
    data: {
      credentialRequestStatus: "rejected",
      credentialRejectNote: rejectNote ? String(rejectNote).trim().slice(0, 500) : null,
    },
  });
  logger.info("social.credential_rejected", { profileId: id, userId: profile.userId });
  res.json({ ok: true });
}

// ─── Video Submissions ────────────────────────────────────────────────────────

export async function listSubmissions(req: Request, res: Response): Promise<void> {
  const status = String(req.query.status ?? "pending");
  const where = status === "all" ? {} : { status };

  const submissions = await prisma.youtubeVideoSubmission.findMany({
    where,
    orderBy: { submittedAt: "desc" },
    take: 200,
    include: {
      user: { select: { id: true, username: true, name: true } },
      profile: { select: { channelName: true, channelPhoto: true } },
      miner: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  res.json({ ok: true, submissions });
}

export async function approveSubmission(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }

  const submission = await prisma.youtubeVideoSubmission.findUnique({ where: { id } });
  if (!submission) { res.status(404).json({ ok: false, message: "Submissão não encontrada." }); return; }
  if (submission.status !== "pending") {
    res.status(409).json({ ok: false, message: "Submissão já foi revisada." });
    return;
  }

  // Get configured reward miner
  const settings = await prisma.youtuberRewardSettings.findUnique({ where: { id: 1 } });
  const rewardMinerId = settings?.minerId ?? null;
  let rewardMiner = rewardMinerId
    ? await prisma.miner.findUnique({ where: { id: rewardMinerId } })
    : null;

  const now = new Date();
  const adminId = (req as Request & { adminUser?: { id: number } }).adminUser?.id ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.youtubeVideoSubmission.update({
      where: { id },
      data: {
        status: "approved",
        reviewedBy: adminId,
        reviewedAt: now,
        rewardMinerId: rewardMiner?.id ?? null,
        rewardGranted: rewardMiner != null,
      },
    });

    if (rewardMiner) {
      await createInventoryWithOwnedMachineTx(tx, {
        userId: submission.userId,
        minerId: rewardMiner.id,
        minerName: rewardMiner.name,
        hashRate: rewardMiner.baseHashRate,
        slotSize: rewardMiner.slotSize,
        imageUrl: rewardMiner.imageUrl ?? null,
        snapshotSlug: rewardMiner.slug,
        snapshotPrice: Number(rewardMiner.price),
        acquisitionSource: "youtuber_reward",
      });
    }
  });

  if (rewardMiner) {
    void createAuditLogBestEffort({
      userId: submission.userId,
      action: "youtuber_reward_granted",
      source: "admin",
      severity: "info",
      details: { submissionId: id, minerId: rewardMiner.id, minerName: rewardMiner.name },
    });
  }

  logger.info("social.submission_approved", {
    submissionId: id,
    userId: submission.userId,
    rewardMiner: rewardMiner?.name ?? null,
    adminId,
  });

  res.json({ ok: true, rewardGranted: rewardMiner != null, rewardMinerName: rewardMiner?.name ?? null });
}

export async function rejectSubmission(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) { res.status(400).json({ ok: false, message: "ID inválido." }); return; }

  const submission = await prisma.youtubeVideoSubmission.findUnique({ where: { id } });
  if (!submission) { res.status(404).json({ ok: false, message: "Submissão não encontrada." }); return; }
  if (submission.status !== "pending") {
    res.status(409).json({ ok: false, message: "Submissão já foi revisada." });
    return;
  }

  const { reviewNote } = req.body as { reviewNote?: string };
  const adminId = (req as Request & { adminUser?: { id: number } }).adminUser?.id ?? null;

  await prisma.youtubeVideoSubmission.update({
    where: { id },
    data: {
      status: "rejected",
      reviewedBy: adminId,
      reviewedAt: new Date(),
      reviewNote: reviewNote ? String(reviewNote).trim().slice(0, 500) : null,
    },
  });

  logger.info("social.submission_rejected", { submissionId: id, userId: submission.userId, adminId });
  res.json({ ok: true });
}

// ─── Reward Settings ──────────────────────────────────────────────────────────

export async function getRewardSettings(_req: Request, res: Response): Promise<void> {
  const settings = await prisma.youtuberRewardSettings.findUnique({
    where: { id: 1 },
    include: { miner: { select: { id: true, name: true, imageUrl: true, baseHashRate: true } } },
  });
  res.json({ ok: true, minerId: settings?.minerId ?? null, miner: settings?.miner ?? null });
}

export async function setRewardSettings(req: Request, res: Response): Promise<void> {
  const { minerId } = req.body as { minerId?: number | null };

  await prisma.youtuberRewardSettings.upsert({
    where: { id: 1 },
    create: { id: 1, minerId: minerId ?? null },
    update: { minerId: minerId ?? null },
  });

  const miner = minerId
    ? await prisma.miner.findUnique({
        where: { id: minerId },
        select: { id: true, name: true, imageUrl: true, baseHashRate: true },
      })
    : null;

  res.json({ ok: true, minerId: minerId ?? null, miner });
}
