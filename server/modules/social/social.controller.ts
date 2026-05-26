import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { buildChannelPhotoPublicUrl } from "./social.upload.js";

const logger = loggerLib.child("SocialController");

const FEED_PAGE_SIZE = 20;

function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m?.[1] ?? null;
}

export async function getPublicFeed(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const skip = (page - 1) * FEED_PAGE_SIZE;

  const [entries, total] = await Promise.all([
    prisma.youtubeVideoSubmission.findMany({
      where: { status: "approved" },
      orderBy: { reviewedAt: "desc" },
      skip,
      take: FEED_PAGE_SIZE,
      select: {
        id: true,
        videoId: true,
        videoUrl: true,
        title: true,
        reviewedAt: true,
        profile: {
          select: {
            channelName: true,
            channelPhoto: true,
            channelUrl: true,
          },
        },
      },
    }),
    prisma.youtubeVideoSubmission.count({ where: { status: "approved" } }),
  ]);

  res.json({
    ok: true,
    entries,
    total,
    page,
    pageSize: FEED_PAGE_SIZE,
    totalPages: Math.ceil(total / FEED_PAGE_SIZE),
  });
}

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const profile = await prisma.youtuberProfile.findUnique({ where: { userId } });
  res.json({ ok: true, profile: profile ?? null });
}

export async function getMySubmissions(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const submissions = await prisma.youtubeVideoSubmission.findMany({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    take: 50,
    select: {
      id: true,
      videoId: true,
      videoUrl: true,
      title: true,
      status: true,
      reviewNote: true,
      rewardGranted: true,
      submittedAt: true,
      reviewedAt: true,
    },
  });

  res.json({ ok: true, submissions });
}

export async function requestCredential(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const { channelName, channelUrl, channelPhoto, bio } = req.body as Record<string, unknown>;

  if (!channelName || typeof channelName !== "string" || !channelName.trim()) {
    res.status(400).json({ ok: false, message: "Nome do canal é obrigatório." });
    return;
  }

  const existing = await prisma.youtuberProfile.findUnique({ where: { userId } });

  if (existing) {
    if (existing.isCredentialed) {
      res.status(409).json({ ok: false, message: "Você já é um criador credenciado." });
      return;
    }
    if (existing.credentialRequestStatus === "pending") {
      res.status(409).json({ ok: false, message: "Solicitação já enviada. Aguarde a revisão." });
      return;
    }
    // rejected → allow resubmit by updating
    const updated = await prisma.youtuberProfile.update({
      where: { userId },
      data: {
        channelName: channelName.trim().slice(0, 100),
        channelPhoto: channelPhoto ? String(channelPhoto).trim() : null,
        channelUrl: channelUrl ? String(channelUrl).trim() : null,
        bio: bio ? String(bio).trim().slice(0, 500) : null,
        credentialRequestStatus: "pending",
        credentialRejectNote: null,
      },
    });
    logger.info("social.credential_resubmitted", { userId });
    res.json({ ok: true, profile: updated });
    return;
  }

  const profile = await prisma.youtuberProfile.create({
    data: {
      userId,
      channelName: channelName.trim().slice(0, 100),
      channelPhoto: channelPhoto ? String(channelPhoto).trim() : null,
      channelUrl: channelUrl ? String(channelUrl).trim() : null,
      bio: bio ? String(bio).trim().slice(0, 500) : null,
      isCredentialed: false,
      credentialRequestStatus: "pending",
    },
  });

  logger.info("social.credential_requested", { userId, profileId: profile.id });
  res.json({ ok: true, profile });
}

export async function submitVideo(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const { videoUrl, title } = req.body as { videoUrl?: string; title?: string };

  if (!videoUrl || typeof videoUrl !== "string") {
    res.status(400).json({ ok: false, message: "URL do vídeo é obrigatória." });
    return;
  }

  const videoId = extractYoutubeId(videoUrl.trim());
  if (!videoId) {
    res.status(400).json({ ok: false, message: "URL do YouTube inválida." });
    return;
  }

  const profile = await prisma.youtuberProfile.findUnique({ where: { userId } });
  if (!profile || !profile.isCredentialed) {
    res.status(403).json({ ok: false, message: "Usuário não é um YouTuber credenciado." });
    return;
  }

  const submission = await prisma.youtubeVideoSubmission.create({
    data: {
      userId,
      profileId: profile.id,
      videoUrl: videoUrl.trim(),
      videoId,
      title: typeof title === "string" ? title.trim().slice(0, 200) || null : null,
    },
  });

  logger.info("social.video_submitted", { userId, videoId, submissionId: submission.id });
  res.json({ ok: true, submission });
}

export async function uploadChannelPhoto(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const file = req.file;
  if (!file) {
    res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
    return;
  }

  const url = buildChannelPhotoPublicUrl(file.filename);
  logger.info("social.channel_photo_uploaded", { userId, filename: file.filename, size: file.size });
  res.json({ ok: true, url });
}
