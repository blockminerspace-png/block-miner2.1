import prisma from "../src/db/prisma.js";

// ─── Public ─────────────────────────────────────────────────────────────────

export async function getActiveBanners(req, res) {
  try {
    const now = new Date();
    const banners = await prisma.dashboardBanner.findMany({
      where: {
        isActive: true,
        OR: [
          { startsAt: null },
          { startsAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endsAt: null },
              { endsAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, banners });
  } catch (err) {
    console.error("[bannerController] getActiveBanners:", err);
    res.status(500).json({ ok: false, message: "Erro ao buscar banners." });
  }
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminList(req, res) {
  try {
    const banners = await prisma.dashboardBanner.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, banners });
  } catch (err) {
    console.error("[bannerController] adminList:", err);
    res.status(500).json({ ok: false, message: "Erro ao listar banners." });
  }
}

export async function adminCreate(req, res) {
  try {
    const { title, message, imageUrl, type, link, linkLabel, isActive, startsAt, endsAt } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ ok: false, message: "Título é obrigatório." });
    }
    const banner = await prisma.dashboardBanner.create({
      data: {
        title: title.trim(),
        message: message?.trim() || "",
        imageUrl: imageUrl?.trim() || null,
        type: type || "info",
        link: link?.trim() || null,
        linkLabel: linkLabel?.trim() || null,
        isActive: isActive !== false,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    });
    res.json({ ok: true, banner });
  } catch (err) {
    console.error("[bannerController] adminCreate:", err);
    res.status(500).json({ ok: false, message: "Erro ao criar banner." });
  }
}

export async function adminUpdate(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { title, message, imageUrl, type, link, linkLabel, isActive, startsAt, endsAt } = req.body;
    const banner = await prisma.dashboardBanner.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(message !== undefined && { message: message.trim() }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
        ...(type !== undefined && { type }),
        link: link?.trim() || null,
        linkLabel: linkLabel?.trim() || null,
        ...(isActive !== undefined && { isActive }),
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
      },
    });
    res.json({ ok: true, banner });
  } catch (err) {
    console.error("[bannerController] adminUpdate:", err);
    res.status(500).json({ ok: false, message: "Erro ao atualizar banner." });
  }
}

export async function adminDelete(req, res) {
  try {
    const id = parseInt(req.params.id);
    await prisma.dashboardBanner.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("[bannerController] adminDelete:", err);
    res.status(500).json({ ok: false, message: "Erro ao excluir banner." });
  }
}
