import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";
import loggerLib from "../../utils/logger.js";
import { refreshIframeHostAllowlistCache } from "../internal-offerwall/internal-offerwall.iframe-allowlist.js";
import {
  registerPartnerGameFrameHosts,
  refreshFrameAllowlistBestEffort,
} from "./partner-games.frame-host.js";
import * as sessionSvc from "./partner-games.service.js";
import { slugifyPartnerGameTitle } from "./partner-games.service.js";
import {
  inferPartnerLaunchMode,
  parsePartnerLaunchMode,
} from "./partner-games.launch-mode.js";
import { applyEmbedProbeToGame } from "./partner-games.embed-sync.js";
import type { PartnerEmbedProbeResult } from "./partner-games.embed.types.js";

const logger = loggerLib.child("PartnerGamesController");

function refreshFrameAllowlistAfterMutation(iframeUrl: string, extras: Array<string | null | undefined> = []) {
  void registerPartnerGameFrameHosts(prisma, [iframeUrl, ...extras]).then(() => {
    refreshFrameAllowlistBestEffort(prisma);
  });
}

/**
 * Public listing of partner games for /games tab "Partners".
 * Returns visible games ordered by sortOrder + recency. Includes vote totals
 * and the viewer's own vote (when authenticated).
 */
export async function listPartnerGamesPublic(req: Request, res: Response): Promise<void> {
  // Warm CSP frame-src allowlist from partner iframe URLs (best-effort).
  refreshFrameAllowlistBestEffort(prisma);

  const viewerId = req.user?.id ?? null;

  const games = await prisma.partnerGame.findMany({
    where: { isVisible: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      iframeUrl: true,
      fallbackUrl: true,
      partnerUrl: true,
      launchMode: true,
      embedStatus: true,
      embedBlockReason: true,
      embedProbedAt: true,
    },
  });

  const ids = games.map((g) => g.id);
  const voteAgg = ids.length
    ? await prisma.partnerGameVote.groupBy({
        by: ["partnerGameId", "value"],
        where: { partnerGameId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const countsByGame = new Map<number, { likes: number; dislikes: number }>();
  for (const id of ids) countsByGame.set(id, { likes: 0, dislikes: 0 });
  for (const row of voteAgg) {
    const bucket = countsByGame.get(row.partnerGameId);
    if (!bucket) continue;
    if (row.value === 1) bucket.likes = row._count._all;
    else if (row.value === -1) bucket.dislikes = row._count._all;
  }

  let myVotes = new Map<number, 1 | -1>();
  if (viewerId && ids.length) {
    const rows = await prisma.partnerGameVote.findMany({
      where: { userId: viewerId, partnerGameId: { in: ids } },
      select: { partnerGameId: true, value: true },
    });
    myVotes = new Map(rows.map((r) => [r.partnerGameId, r.value as 1 | -1]));
  }

  const enriched = games.map((g) => {
    const counts = countsByGame.get(g.id) ?? { likes: 0, dislikes: 0 };
    return {
      ...g,
      likeCount: counts.likes,
      dislikeCount: counts.dislikes,
      myVote: myVotes.get(g.id) ?? 0,
    };
  });

  res.json({ ok: true, games: enriched });
}

export async function getPartnerGameBySlugPublic(req: Request, res: Response): Promise<void> {
  refreshFrameAllowlistBestEffort(prisma);

  const slug = String(req.params.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ ok: false, message: "slug inválido." });
    return;
  }
  const game = await sessionSvc.getPartnerGameBySlug(slug);
  if (!game) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    return;
  }
  res.json({ ok: true, game });
}

export async function startPartnerGameSessionHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const slug = String((req.body as { slug?: string })?.slug ?? "").trim();
  if (!slug) {
    res.status(400).json({ ok: false, message: "slug é obrigatório." });
    return;
  }

  try {
    const result = await sessionSvc.startPartnerGameSession(userId, slug);
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "PARTNER_GAME_NOT_FOUND") {
      res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
      return;
    }
    logger.warn("partnerGames.session_start_failed", { userId, slug, err: msg });
    res.status(500).json({ ok: false, message: "Não foi possível iniciar a sessão." });
  }
}

export async function heartbeatPartnerGameSessionHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const sessionId = String(req.params.sessionId ?? "");
  const body = (req.body ?? {}) as {
    active?: unknown;
    iframeLoaded?: unknown;
    playSurfaceReady?: unknown;
  };
  const active = body.active !== false;
  const iframeLoaded = body.iframeLoaded !== false;
  const playSurfaceReady =
    body.playSurfaceReady !== undefined
      ? body.playSurfaceReady !== false
      : iframeLoaded;

  try {
    const session = await sessionSvc.heartbeatPartnerGameSession(userId, sessionId, {
      active,
      iframeLoaded,
      playSurfaceReady,
    });
    res.json({ ok: true, session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, message: "Sessão não encontrada." });
      return;
    }
    if (msg === "SESSION_ENDED") {
      res.status(409).json({ ok: false, message: "Sessão encerrada." });
      return;
    }
    res.status(500).json({ ok: false, message: "Heartbeat falhou." });
  }
}

export async function endPartnerGameSessionHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const sessionId = String(req.params.sessionId ?? "");
  const reason = String((req.body as { reason?: string })?.reason ?? "user_left");
  await sessionSvc.endPartnerGameSession(userId, sessionId, reason);
  res.json({ ok: true });
}

export async function getPartnerGameSessionStatsHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const slug = String(req.params.slug ?? "").trim();
  try {
    const stats = await sessionSvc.getPartnerGameSessionStats(userId, slug);
    res.json({ ok: true, ...stats });
  } catch {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
  }
}

/**
 * Vote on a partner game (like / dislike / remove). Same toggle semantics as
 * the YouTube video vote endpoint:
 *  - value 1 or -1 with no existing vote → creates the vote
 *  - same value resent → toggle off
 *  - opposite value → updates
 *  - value 0 → removes any existing vote
 */
export async function votePartnerGame(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false }); return; }

  const partnerGameId = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(partnerGameId) || partnerGameId <= 0) {
    res.status(400).json({ ok: false, message: "partnerGameId inválido." });
    return;
  }

  const value = Number((req.body as { value?: unknown })?.value);
  if (![1, -1, 0].includes(value)) {
    res.status(400).json({ ok: false, message: "value deve ser 1, -1 ou 0." });
    return;
  }

  const game = await prisma.partnerGame.findUnique({
    where: { id: partnerGameId },
    select: { id: true, isVisible: true },
  });
  if (!game || !game.isVisible) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não disponível." });
    return;
  }

  const existing = await prisma.partnerGameVote.findUnique({
    where: { userId_partnerGameId: { userId, partnerGameId } },
  });

  let myVote: 1 | -1 | 0 = 0;
  if (value === 0) {
    if (existing) await prisma.partnerGameVote.delete({ where: { id: existing.id } });
    myVote = 0;
  } else if (!existing) {
    await prisma.partnerGameVote.create({ data: { userId, partnerGameId, value } });
    myVote = value as 1 | -1;
  } else if (existing.value === value) {
    await prisma.partnerGameVote.delete({ where: { id: existing.id } });
    myVote = 0;
  } else {
    await prisma.partnerGameVote.update({ where: { id: existing.id }, data: { value } });
    myVote = value as 1 | -1;
  }

  // Recount totals for the response (one row per value bucket).
  const counts = await prisma.partnerGameVote.groupBy({
    by: ["value"],
    where: { partnerGameId },
    _count: { _all: true },
  });
  let likeCount = 0;
  let dislikeCount = 0;
  for (const c of counts) {
    if (c.value === 1) likeCount = c._count._all;
    else if (c.value === -1) dislikeCount = c._count._all;
  }

  logger.info("partnerGames.voted", { userId, partnerGameId, value: myVote });
  res.json({ ok: true, partnerGameId, likeCount, dislikeCount, myVote });
}

// ─── Admin endpoints ────────────────────────────────────────────────────────

function parseGameInput(body: unknown): {
  title?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  iframeUrl?: string;
  fallbackUrl?: string | null;
  partnerUrl?: string | null;
  isVisible?: boolean;
  sortOrder?: number;
  slug?: string;
  launchMode?: string;
} {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof b.title === "string" && b.title.trim()) {
    out.title = b.title.trim().slice(0, 200);
  }
  if (b.description !== undefined) {
    out.description = b.description ? String(b.description).trim().slice(0, 1000) || null : null;
  }
  if (b.coverImageUrl !== undefined) {
    out.coverImageUrl = b.coverImageUrl ? String(b.coverImageUrl).trim() || null : null;
  }
  if (typeof b.iframeUrl === "string" && b.iframeUrl.trim()) {
    out.iframeUrl = b.iframeUrl.trim();
  }
  if (b.fallbackUrl !== undefined) {
    out.fallbackUrl = b.fallbackUrl ? String(b.fallbackUrl).trim() || null : null;
  }
  if (b.partnerUrl !== undefined) {
    out.partnerUrl = b.partnerUrl ? String(b.partnerUrl).trim() || null : null;
  }
  if (b.isVisible !== undefined) {
    out.isVisible = Boolean(b.isVisible);
  }
  if (b.sortOrder !== undefined) {
    const n = Number(b.sortOrder);
    if (Number.isFinite(n)) out.sortOrder = Math.trunc(n);
  }
  if (typeof b.slug === "string" && b.slug.trim()) {
    out.slug = slugifyPartnerGameTitle(b.slug.trim());
  }
  if (b.launchMode !== undefined) {
    const mode = parsePartnerLaunchMode(b.launchMode);
    if (mode) out.launchMode = mode;
  }
  return out;
}

function validateUrlOrNull(value: unknown): string | null | "INVALID" {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "INVALID";
    return s;
  } catch {
    return "INVALID";
  }
}

export async function adminListPartnerGames(_req: Request, res: Response): Promise<void> {
  const games = await prisma.partnerGame.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  res.json({ ok: true, games });
}

export async function adminCreatePartnerGame(req: Request, res: Response): Promise<void> {
  const input = parseGameInput(req.body);
  if (!input.title) {
    res.status(400).json({ ok: false, message: "title é obrigatório." });
    return;
  }
  if (!input.iframeUrl) {
    res.status(400).json({ ok: false, message: "iframeUrl é obrigatório." });
    return;
  }
  // URL sanity for the URL fields
  const iframeOk = validateUrlOrNull(input.iframeUrl);
  if (iframeOk === "INVALID" || iframeOk === null) {
    res.status(400).json({ ok: false, message: "iframeUrl inválida." });
    return;
  }
  const fallbackOk = validateUrlOrNull(input.fallbackUrl ?? null);
  if (fallbackOk === "INVALID") {
    res.status(400).json({ ok: false, message: "fallbackUrl inválida." });
    return;
  }
  const partnerOk = validateUrlOrNull(input.partnerUrl ?? null);
  if (partnerOk === "INVALID") {
    res.status(400).json({ ok: false, message: "partnerUrl inválida." });
    return;
  }

  const launchMode =
    parsePartnerLaunchMode(input.launchMode) ?? inferPartnerLaunchMode(iframeOk);

  const game = await prisma.partnerGame.create({
    data: {
      slug: input.slug ?? slugifyPartnerGameTitle(input.title),
      title: input.title,
      description: input.description ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      iframeUrl: iframeOk,
      fallbackUrl: fallbackOk,
      partnerUrl: partnerOk,
      launchMode,
      isVisible: input.isVisible ?? true,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  logger.info("partnerGames.admin_created", { id: game.id, title: game.title });
  refreshFrameAllowlistAfterMutation(iframeOk, [fallbackOk, partnerOk]);
  const probed = await applyEmbedProbeToGame(prisma, game.id, iframeOk);
  const refreshed = await prisma.partnerGame.findUnique({ where: { id: game.id } });
  res.json({ ok: true, game: refreshed, embedProbe: probed });
}

export async function adminUpdatePartnerGame(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id inválido." });
    return;
  }
  const existing = await prisma.partnerGame.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    return;
  }

  const input = parseGameInput(req.body);
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.description !== undefined) data.description = input.description;
  if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;

  if (input.iframeUrl !== undefined) {
    const ok = validateUrlOrNull(input.iframeUrl);
    if (ok === "INVALID" || ok === null) {
      res.status(400).json({ ok: false, message: "iframeUrl inválida." });
      return;
    }
    data.iframeUrl = ok;
  }
  if (input.fallbackUrl !== undefined) {
    const ok = validateUrlOrNull(input.fallbackUrl);
    if (ok === "INVALID") {
      res.status(400).json({ ok: false, message: "fallbackUrl inválida." });
      return;
    }
    data.fallbackUrl = ok;
  }
  if (input.partnerUrl !== undefined) {
    const ok = validateUrlOrNull(input.partnerUrl);
    if (ok === "INVALID") {
      res.status(400).json({ ok: false, message: "partnerUrl inválida." });
      return;
    }
    data.partnerUrl = ok;
  }
  if (input.isVisible !== undefined) data.isVisible = input.isVisible;
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
  if (input.launchMode !== undefined) {
    const mode = parsePartnerLaunchMode(input.launchMode);
    if (mode) data.launchMode = mode;
  } else if (typeof data.iframeUrl === "string") {
    data.launchMode = inferPartnerLaunchMode(data.iframeUrl);
  }

  if (Object.keys(data).length === 0) {
    res.status(400).json({ ok: false, message: "Nenhum campo para atualizar." });
    return;
  }

  const updated = await prisma.partnerGame.update({ where: { id }, data });
  logger.info("partnerGames.admin_updated", { id, fields: Object.keys(data) });
  const iframeForHost =
    typeof data.iframeUrl === "string"
      ? data.iframeUrl
      : existing.iframeUrl;
  refreshFrameAllowlistAfterMutation(iframeForHost, [
    typeof data.fallbackUrl === "string" ? data.fallbackUrl : existing.fallbackUrl,
    typeof data.partnerUrl === "string" ? data.partnerUrl : existing.partnerUrl,
  ]);
  let embedProbe: PartnerEmbedProbeResult | null = null;
  if (typeof data.iframeUrl === "string") {
    embedProbe = await applyEmbedProbeToGame(prisma, id, data.iframeUrl);
  }
  const refreshed = await prisma.partnerGame.findUnique({ where: { id } });
  res.json({ ok: true, game: refreshed, embedProbe });
}

export async function adminDeletePartnerGame(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ ok: false, message: "id inválido." });
    return;
  }
  const existing = await prisma.partnerGame.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ ok: false, message: "Jogo parceiro não encontrado." });
    return;
  }
  await prisma.partnerGame.delete({ where: { id } });
  logger.info("partnerGames.admin_deleted", { id });
  refreshFrameAllowlistBestEffort(prisma);
  res.json({ ok: true });
}

import { partnerGameCoverUpload, buildPartnerGameCoverUrl } from "./partnerGames.upload.js";

export function uploadPartnerGameCover(req: Request, res: Response): void {
  partnerGameCoverUpload.single("cover")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Upload inválido.";
      res.status(400).json({ ok: false, message: msg });
      return;
    }
    if (!req.file) {
      res.status(400).json({ ok: false, message: "Nenhum arquivo enviado." });
      return;
    }
    res.json({ ok: true, url: buildPartnerGameCoverUrl(req.file.filename) });
  });
}
