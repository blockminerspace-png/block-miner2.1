import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";

const logger = loggerLib.child("NotificationController");

export async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json({ ok: true, notifications });
  } catch (error) {
    logger.error("Failed to fetch notifications", error);
    res.status(500).json({ ok: false, message: "Error fetching notifications" });
  }
}

export async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (id === 'all') {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
    } else {
      await prisma.notification.update({
        where: { id: Number(id), userId },
        data: { isRead: true }
      });
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error("Failed to mark notification as read", error);
    res.status(500).json({ ok: false, message: "Error updating notification" });
  }
}

/**
 * Utility function to create a notification and emit via socket
 */
export async function createNotification({ userId, title, message, type = 'info', io }) {
  try {
    const notification = await prisma.notification.create({
      data: { userId, title, message, type }
    });

    if (io) {
      io.to(`user:${userId}`).emit("notification:new", notification);
    }
    return notification;
  } catch (error) {
    console.error("Failed to create notification", error);
  }
}
