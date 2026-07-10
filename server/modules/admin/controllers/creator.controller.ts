import type { Request, Response } from "express";
import prisma from "../../../src/db/prisma.js";

type IdParams = { id: string };

type SearchQuery = { q?: string };

type UpsertBody = {
  youtubeUrl?: string | null;
};

export async function adminList(_req: Request, res: Response): Promise<void> {
  try {
    const creators = await prisma.user.findMany({
      where: { isCreator: true },
      select: { id: true, username: true, name: true, youtubeUrl: true, createdAt: true },
      orderBy: { username: "asc" },
    });
    res.json({ ok: true, creators });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao listar criadores." });
  }
}

export async function adminSearch(req: Request<unknown, unknown, unknown, SearchQuery>, res: Response): Promise<void> {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    res.json({ ok: true, users: [] });
    return;
  }
  try {
    const users = await prisma.user.findMany({
      where: { username: { contains: q, mode: "insensitive" } },
      select: { id: true, username: true, name: true, isCreator: true, youtubeUrl: true },
      take: 10,
    });
    res.json({ ok: true, users });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao buscar usuários." });
  }
}

export async function adminUpsert(req: Request<IdParams, unknown, UpsertBody>, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }

  const { youtubeUrl } = req.body;

  if (youtubeUrl) {
    const isYt = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl);
    if (!isYt) {
      res.status(400).json({ ok: false, message: "URL deve ser do YouTube." });
      return;
    }
  }

  try {
    await prisma.user.update({
      where: { id },
      data: { isCreator: true, youtubeUrl: youtubeUrl || null },
    });
    res.json({ ok: true });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao credenciar criador." });
  }
}

export async function adminRemove(req: Request<IdParams>, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (!id) {
    res.status(400).json({ ok: false, message: "ID inválido." });
    return;
  }
  try {
    await prisma.user.update({
      where: { id },
      data: { isCreator: false, youtubeUrl: null },
    });
    res.json({ ok: true });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Erro ao remover credencial." });
  }
}
