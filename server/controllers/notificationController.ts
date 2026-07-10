import type { Notification } from "@prisma/client";
import type { Request, Response } from "express";
import type { Server } from "socket.io";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("NotificationController");

type MarkParams = { id: string };

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({ ok: true, notifications });
  } catch (error: unknown) {
    logger.error("Failed to fetch notifications", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: "Error fetching notifications" });
  }
}

export async function markAsRead(req: Request<MarkParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const { id } = req.params;

    if (id === "all") {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });
    } else {
      await prisma.notification.update({
        where: { id: Number(id), userId },
        data: { isRead: true },
      });
    }

    res.json({ ok: true });
  } catch (error: unknown) {
    logger.error("Failed to mark notification as read", {
      err: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ ok: false, message: "Error updating notification" });
  }
}

type CreateNotificationArgs = {
  userId: number;
  title: string;
  message: string;
  type?: string;
  io?: Server | null;
};

/**
 * Utility function to create a notification and emit via socket
 */
export async function createNotification({
  userId,
  title,
  message,
  type = "info",
  io,
}: CreateNotificationArgs): Promise<Notification | undefined> {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, message, type },
    });

    if (io) {
      io.to(`user:${userId}`).emit("notification:new", notification);
    }
    return notification;
  } catch (error: unknown) {
    logger.error("Failed to create notification", { error: String(error) });
    return undefined;
  }
}
