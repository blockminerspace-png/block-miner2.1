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
  const viewerId = req.user?.id ?? null;

  const [submissions, total] = await Promise.all([
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

  const submissionIds = submissions.map((s) => s.id);

  // Aggregate vote counts in a single grouped query (likes = value 1, dislikes = value -1).
  const voteAgg = submissionIds.length
    ? await prisma.youtubeVideoVote.groupBy({
        by: ["submissionId", "value"],
        where: { submissionId: { in: submissionIds } },
        _count: { _all: true },
      })
    : [];

  const countsBySubmission = new Map<number, { likes: number; dislikes: number }>();
  for (const id of submissionIds) countsBySubmission.set(id, { likes: 0, dislikes: 0 });
  for (const row of voteAgg) {
    const bucket = countsBySubmission.get(row.submissionId);
    if (!bucket) continue;
    if (row.value === 1) bucket.likes = row._count._all;
    else if (row.value === -1) bucket.dislikes = row._count._all;
  }

  // Viewer's own vote per submission (if logged in).
  let myVotes = new Map<number, 1 | -1>();
  if (viewerId && submissionIds.length) {
    const rows = await prisma.youtubeVideoVote.findMany({
      where: { userId: viewerId, submissionId: { in: submissionIds } },
      select: { submissionId: true, value: true },
    });
    myVotes = new Map(rows.map((r) => [r.submissionId, r.value as 1 | -1]));
  }

  const entries = submissions.map((s) => {
    const counts = countsBySubmission.get(s.id) ?? { likes: 0, dislikes: 0 };
    return {
      ...s,
      likeCount: counts.likes,
      dislikeCount: counts.dislikes,
      myVote: myVotes.get(s.id) ?? 0,
    };
  });

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

  try {
    const { notifyNewVideoSubmission } = await import("../../services/videoTelegramNotifier.js");
    let username: string | null = null;
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    username = u?.username ?? null;
    notifyNewVideoSubmission({
      id: submission.id,
      userId,
      username,
      videoId,
      videoUrl: videoUrl.trim(),
      title: submission.title,
    });
  } catch (notifyErr) {
    logger.warn("social.video_telegram_notify_failed", {
      error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
    });
  }

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

/**
 * Credentialed creator updates their OWN profile (channel name, photo, URL, bio).
 * Does NOT change credential status — that remains an admin-only action.
 * If the user is not yet credentialed they should use `requestCredential` instead.
 */
export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const profile = await prisma.youtuberProfile.findUnique({ where: { userId } });
  if (!profile) {
    res.status(404).json({ ok: false, message: "Perfil não encontrado. Solicite credenciamento primeiro." });
    return;
  }
  if (!profile.isCredentialed) {
    res.status(403).json({ ok: false, message: "Você ainda não é um criador credenciado." });
    return;
  }

  const { channelName, channelUrl, channelPhoto, bio } = req.body as Record<string, unknown>;

  const data: Record<string, unknown> = {};
  if (typeof channelName === "string" && channelName.trim()) {
    data.channelName = channelName.trim().slice(0, 100);
  }
  if (channelUrl !== undefined) {
    data.channelUrl = channelUrl ? String(channelUrl).trim() || null : null;
  }
  if (channelPhoto !== undefined) {
    data.channelPhoto = channelPhoto ? String(channelPhoto).trim() || null : null;
  }
  if (bio !== undefined) {
    data.bio = bio ? String(bio).trim().slice(0, 500) || null : null;
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ ok: false, message: "Nenhum campo para atualizar." });
    return;
  }

  const updated = await prisma.youtuberProfile.update({ where: { userId }, data });
  logger.info("social.profile_updated", { userId, profileId: profile.id, fields: Object.keys(data) });
  res.json({ ok: true, profile: updated });
}

/**
 * Toggle community vote (like/dislike) on an approved video submission.
 * Body: { value: 1 | -1 | 0 }  — 0 removes any existing vote.
 *  - If user has no existing vote and sends 1 or -1, creates the vote.
 *  - If user has an existing vote and sends the SAME value, removes it (toggle off).
 *  - If user has an existing vote and sends the OPPOSITE value, updates it.
 *  - If user sends 0, removes any existing vote.
 * Returns updated counts + the viewer's new vote state.
 */
export async function voteVideo(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const submissionId = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    res.status(400).json({ ok: false, message: "submissionId inválido." });
    return;
  }

  const rawValue = (req.body as { value?: unknown })?.value;
  const value = Number(rawValue);
  if (![1, -1, 0].includes(value)) {
    res.status(400).json({ ok: false, message: "value deve ser 1 (like), -1 (dislike) ou 0 (remover)." });
    return;
  }

  // Only allow voting on approved videos (avoids voting on pending/rejected/private content).
  const submission = await prisma.youtubeVideoSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, status: true },
  });
  if (!submission || submission.status !== "approved") {
    res.status(404).json({ ok: false, message: "Vídeo não disponível para votação." });
    return;
  }

  const existing = await prisma.youtubeVideoVote.findUnique({
    where: { userId_submissionId: { userId, submissionId } },
  });

  let myVote: 1 | -1 | 0 = 0;

  if (value === 0) {
    if (existing) {
      await prisma.youtubeVideoVote.delete({ where: { id: existing.id } });
    }
    myVote = 0;
  } else if (!existing) {
    await prisma.youtubeVideoVote.create({ data: { userId, submissionId, value } });
    myVote = value as 1 | -1;
  } else if (existing.value === value) {
    // Same value re-sent → toggle off
    await prisma.youtubeVideoVote.delete({ where: { id: existing.id } });
    myVote = 0;
  } else {
    await prisma.youtubeVideoVote.update({ where: { id: existing.id }, data: { value } });
    myVote = value as 1 | -1;
  }

  // Recount likes/dislikes for this submission
  const counts = await prisma.youtubeVideoVote.groupBy({
    by: ["value"],
    where: { submissionId },
    _count: { _all: true },
  });
  let likeCount = 0;
  let dislikeCount = 0;
  for (const c of counts) {
    if (c.value === 1) likeCount = c._count._all;
    else if (c.value === -1) dislikeCount = c._count._all;
  }

  logger.info("social.video_voted", { userId, submissionId, value: myVote });
  res.json({ ok: true, submissionId, likeCount, dislikeCount, myVote });
}
