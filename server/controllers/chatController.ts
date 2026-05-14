import type { Request, Response } from "express";
import prisma from "../src/db/prisma.js";
import loggerLib from "../utils/logger.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createNotification } from "./notificationController.js";

const logger = loggerLib.child("ChatController");

export async function getMessages(_req: Request, res: Response): Promise<void> {
  try {
    const messages = await prisma.chatMessage.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: { name: true, username: true }
        },
        replyTo: {
          select: {
            id: true,
            username: true,
            message: true
          }
        }
      }
    });
    res.json({ ok: true, messages: messages.reverse() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("Failed to fetch chat messages", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to load messages." });
  }
}

function escapeHtml(text: string) {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m] ?? m);
}

type SendBody = { message?: unknown; replyToId?: unknown };

export async function sendMessage(req: Request<object, unknown, SendBody>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { message, replyToId } = req.body;
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ ok: false, message: "Message cannot be empty." });
      return;
    }

    const sanitizedMessage = escapeHtml(message.trim());

    const chatMsg = await prisma.chatMessage.create({
      data: {
        userId: req.user.id,
        username: req.user.username || req.user.name,
        message: sanitizedMessage,
        replyToId: replyToId ? Number(replyToId) : null,
        createdAt: new Date()
      },
      include: {
        replyTo: {
          select: {
            id: true,
            username: true,
            message: true
          }
        }
      }
    });
    const engine = getMiningEngine();
    if (engine?.io) {
      engine.io.emit("chat:new-message", chatMsg);
    }

    res.json({ ok: true, message: chatMsg });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("Failed to send message", { error: msg });
    res.status(500).json({ ok: false, message: "Unable to send message." });
  }
}

export async function getActiveUsers(_req: Request, res: Response): Promise<void> {
  try {
    const recentMessages = await prisma.chatMessage.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      select: { username: true }
    });
    const usernames = [...new Set(recentMessages.map((m) => m.username))];
    res.json({ ok: true, usernames });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Unable to fetch users." });
  }
}

type TargetParams = { targetUserId: string };

export async function getPrivateMessages(req: Request<TargetParams>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;
    const { targetUserId } = req.params;

    const messages = await prisma.privateMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: Number(targetUserId) },
          { senderId: Number(targetUserId), receiverId: userId }
        ]
      },
      orderBy: { createdAt: "asc" },
      take: 50
    });

    await prisma.privateMessage.updateMany({
      where: {
        senderId: Number(targetUserId),
        receiverId: userId,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({ ok: true, messages });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Unable to load private messages." });
  }
}

type PmBody = { receiverId?: unknown; message?: unknown };

export async function sendPrivateMessage(req: Request<object, unknown, PmBody>, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const { receiverId, message } = req.body;
    const senderId = req.user.id;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ ok: false, message: "Message is empty." });
      return;
    }

    const sanitizedMessage = escapeHtml(message.trim());

    const pm = await prisma.privateMessage.create({
      data: {
        senderId,
        receiverId: Number(receiverId),
        message: sanitizedMessage
      }
    });

    const engine = getMiningEngine();
    if (engine?.io) {
      engine.io.to(`user:${receiverId}`).emit("chat:new-pm", pm);
      engine.io.to(`user:${senderId}`).emit("chat:new-pm", pm);

      await createNotification({
        userId: Number(receiverId),
        title: "Nova Mensagem Privada",
        message: `Você recebeu uma mensagem de ${req.user.username || req.user.name}.`,
        type: "info",
        io: engine.io
      });
    }

    res.json({ ok: true, message: pm });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Unable to send private message." });
  }
}

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    if (req.user == null) {
      res.status(401).json({ ok: false, message: "Unauthorized." });
      return;
    }
    const userId = req.user.id;

    const sent = await prisma.privateMessage.findMany({
      where: { senderId: userId },
      select: { receiverId: true, receiver: { select: { username: true } }, createdAt: true },
      orderBy: { createdAt: "desc" }
    });

    const received = await prisma.privateMessage.findMany({
      where: { receiverId: userId },
      select: { senderId: true, sender: { select: { username: true } }, createdAt: true },
      orderBy: { createdAt: "desc" }
    });

    const conversationMap = new Map<
      number,
      { userId: number; username: string | null | undefined; lastMessageAt: Date }
    >();

    for (const msg of sent) {
      const otherId = msg.receiverId;
      const otherUsername = msg.receiver?.username;
      const prev = conversationMap.get(otherId);
      if (!prev || prev.lastMessageAt < msg.createdAt) {
        conversationMap.set(otherId, {
          userId: otherId,
          username: otherUsername,
          lastMessageAt: msg.createdAt
        });
      }
    }
    for (const msg of received) {
      const otherId = msg.senderId;
      const otherUsername = msg.sender?.username;
      const prev = conversationMap.get(otherId);
      if (!prev || prev.lastMessageAt < msg.createdAt) {
        conversationMap.set(otherId, {
          userId: otherId,
          username: otherUsername,
          lastMessageAt: msg.createdAt
        });
      }
    }

    const conversations = Array.from(conversationMap.values()).sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    );

    res.json({ ok: true, conversations });
  } catch (_e: unknown) {
    res.status(500).json({ ok: false, message: "Unable to load conversations." });
  }
}
