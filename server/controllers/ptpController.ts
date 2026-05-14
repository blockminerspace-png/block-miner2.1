import crypto from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import type { Prisma } from "@prisma/client";

const PTP_RATE_USD_PER_1000 = 0.1;
const PTP_EARNING_PER_VIEW_USD = PTP_RATE_USD_PER_1000 / 1000;

type CreateAdBody = {
  title?: unknown;
  url?: unknown;
  views?: unknown;
};

export async function createAd(req: Request<unknown, unknown, CreateAdBody>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const userId = req.user.id;
    const { title, url, views } = req.body;
    const targetViews = Number(views ?? 0);
    const costUsd = (targetViews / 1000) * PTP_RATE_USD_PER_1000;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("Insufficient balance");

      if (Number(user.usdcBalance) < costUsd) throw new Error("Insufficient balance");

      await tx.user.update({
        where: { id: userId },
        data: { usdcBalance: { decrement: costUsd } },
      });

      const adHash = crypto.randomBytes(8).toString("hex");
      await tx.ptpAd.create({
        data: {
          userId,
          title: title == null ? "" : String(title),
          url: url == null ? "" : String(url),
          hash: adHash,
          paidUsd: costUsd,
          targetViews,
          costUsd,
        },
      });
    });

    res.json({ ok: true, message: "Ad created successfully" });
  } catch (error: unknown) {
    console.error("Error creating ad:", error);
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getMyAds(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    const ads = await prisma.ptpAd.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ ok: true, ads });
  } catch (_error: unknown) {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}

type TrackBody = { adId?: unknown; viewerHash?: string };

export async function trackView(req: Request<unknown, unknown, TrackBody>, res: Response): Promise<void> {
  try {
    const { adId, viewerHash } = req.body;

    const clientIp = req.ip || req.socket?.remoteAddress || "unknown";
    const finalHash = viewerHash
      ? `${viewerHash}-${clientIp}`
      : crypto.createHash("md5").update(clientIp).digest("hex");

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ad = await tx.ptpAd.findUnique({ where: { id: Number(adId) } });

      if (!ad || ad.status !== "active" || ad.views >= ad.targetViews) {
        if (ad && ad.status === "active" && ad.views >= ad.targetViews) {
          await tx.ptpAd.update({
            where: { id: Number(adId) },
            data: { status: "completed" },
          });
        }
        return;
      }

      const existingView = await tx.ptpView.findFirst({
        where: { adId: Number(adId), viewerHash: finalHash },
      });
      if (existingView) return;

      const newViewsCount = ad.views + 1;
      const isNowCompleted = newViewsCount >= ad.targetViews;

      await tx.ptpView.create({ data: { adId: Number(adId), viewerHash: finalHash } });
      await tx.ptpAd.update({
        where: { id: Number(adId) },
        data: {
          views: newViewsCount,
          status: isNowCompleted ? "completed" : "active",
        },
      });

      await tx.ptpEarning.create({
        data: {
          userId: ad.userId,
          adId: Number(adId),
          amountUsd: PTP_EARNING_PER_VIEW_USD,
        },
      });

      await tx.user.update({
        where: { id: ad.userId },
        data: { usdcBalance: { increment: PTP_EARNING_PER_VIEW_USD } },
      });
    });

    res.json({ ok: true, message: "View tracked" });
  } catch (_error: unknown) {
    res.status(500).json({ ok: false, message: "Server error" });
  }
}
