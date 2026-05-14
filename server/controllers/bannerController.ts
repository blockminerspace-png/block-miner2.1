import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";

export async function getActiveBanners(_req: Request, res: Response): Promise<void> {
  try {
    const now = new Date();
    const banners = await prisma.dashboardBanner.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [
          {
            OR: [{ endsAt: null }, { endsAt: { gte: now } }],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    console.error("[bannerController] getActiveBanners:", err);
    res.status(500).json({ ok: false, message: "Erro ao buscar banners." });
  }
}

export async function adminList(_req: Request, res: Response): Promise<void> {
  try {
    const banners = await prisma.dashboardBanner.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, banners });
  } catch (err: unknown) {
    console.error("[bannerController] adminList:", err);
    res.status(500).json({ ok: false, message: "Erro ao listar banners." });
  }
}

type BannerWriteBody = {
  title?: string;
  message?: string;
  imageUrl?: string;
  type?: string;
  link?: string;
  linkLabel?: string;
  isActive?: boolean;
  startsAt?: unknown;
  endsAt?: unknown;
};

export async function adminCreate(req: Request<unknown, unknown, BannerWriteBody>, res: Response): Promise<void> {
  try {
    const { title, message, imageUrl, type, link, linkLabel, isActive, startsAt, endsAt } = req.body;
    if (!title?.trim()) {
      res.status(400).json({ ok: false, message: "Título é obrigatório." });
      return;
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
        startsAt: startsAt ? new Date(String(startsAt)) : null,
        endsAt: endsAt ? new Date(String(endsAt)) : null,
      },
    });
    res.json({ ok: true, banner });
  } catch (err: unknown) {
    console.error("[bannerController] adminCreate:", err);
    res.status(500).json({ ok: false, message: "Erro ao criar banner." });
  }
}

type IdParams = { id: string };

export async function adminUpdate(req: Request<IdParams, unknown, BannerWriteBody>, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
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
        startsAt: startsAt ? new Date(String(startsAt)) : null,
        endsAt: endsAt ? new Date(String(endsAt)) : null,
      },
    });
    res.json({ ok: true, banner });
  } catch (err: unknown) {
    console.error("[bannerController] adminUpdate:", err);
    res.status(500).json({ ok: false, message: "Erro ao atualizar banner." });
  }
}

export async function adminDelete(req: Request<IdParams>, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.dashboardBanner.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[bannerController] adminDelete:", err);
    res.status(500).json({ ok: false, message: "Erro ao excluir banner." });
  }
}
