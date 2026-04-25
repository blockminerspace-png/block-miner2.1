import prisma from "../src/db/prisma.js";

// Admin: listar todos os criadores credenciados
export async function adminList(_req, res) {
  try {
    const creators = await prisma.user.findMany({
      where: { isCreator: true },
      select: { id: true, username: true, name: true, youtubeUrl: true, createdAt: true },
      orderBy: { username: "asc" },
    });
    res.json({ ok: true, creators });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao listar criadores." });
  }
}

// Admin: buscar usuários por username (para adicionar criador)
export async function adminSearch(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ ok: true, users: [] });
  try {
    const users = await prisma.user.findMany({
      where: { username: { contains: q, mode: "insensitive" } },
      select: { id: true, username: true, name: true, isCreator: true, youtubeUrl: true },
      take: 10,
    });
    res.json({ ok: true, users });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao buscar usuários." });
  }
}

// Admin: credenciar ou atualizar criador
export async function adminUpsert(req, res) {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });

  const { youtubeUrl } = req.body;

  // Valida URL do YouTube (básico)
  if (youtubeUrl) {
    const isYt = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl);
    if (!isYt) return res.status(400).json({ ok: false, message: "URL deve ser do YouTube." });
  }

  try {
    await prisma.user.update({
      where: { id },
      data: { isCreator: true, youtubeUrl: youtubeUrl || null },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao credenciar criador." });
  }
}

// Admin: remover credencial de criador
export async function adminRemove(req, res) {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ ok: false, message: "ID inválido." });
  try {
    await prisma.user.update({
      where: { id },
      data: { isCreator: false, youtubeUrl: null },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false, message: "Erro ao remover credencial." });
  }
}
