import prisma from '../src/db/prisma.js';
import loggerLib from "../utils/logger.js";
import { getMiningEngine } from "../src/miningEngineInstance.js";
import { createNotification } from "./notificationController.js";

const logger = loggerLib.child("ChatController");

export async function getMessages(req, res) {
  try {
    const messages = await prisma.chatMessage.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
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
    // Reverse to get chronological order for the UI
    res.json({ ok: true, messages: messages.reverse() });
  } catch (error) {
    logger.error("Failed to fetch chat messages", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to load messages." });
  }
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

export async function sendMessage(req, res) {
  try {
    const { message, replyToId } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Message cannot be empty." });
    }

    // SANITIZATION: Escape HTML to prevent XSS
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
    if (engine && engine.io) {
      engine.io.emit('chat:new-message', chatMsg);
    }

    res.json({ ok: true, message: chatMsg });
  } catch (error) {
    logger.error("Failed to send message", { error: error.message });
    res.status(500).json({ ok: false, message: "Unable to send message." });
  }
}

export async function getActiveUsers(req, res) {
  try {
    const recentMessages = await prisma.chatMessage.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: { username: true }
    });
    const usernames = [...new Set(recentMessages.map(m => m.username))];
    res.json({ ok: true, usernames });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to fetch users." });
  }
}

export async function getPrivateMessages(req, res) {
  try {
    const { targetUserId } = req.params;
    const userId = req.user.id;

    const messages = await prisma.privateMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: Number(targetUserId) },
          { senderId: Number(targetUserId), receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'asc' },
      take: 50
    });

    // Mark as read
    await prisma.privateMessage.updateMany({
      where: {
        senderId: Number(targetUserId),
        receiverId: userId,
        isRead: false
      },
      data: { isRead: true }
    });

    res.json({ ok: true, messages });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load private messages." });
  }
}

export async function sendPrivateMessage(req, res) {
  try {
    const { receiverId, message } = req.body;
    const senderId = req.user.id;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ ok: false, message: "Message is empty." });
    }

    // SANITIZATION: Escape HTML to prevent XSS
    const sanitizedMessage = escapeHtml(message.trim());

    const pm = await prisma.privateMessage.create({
      data: {
        senderId,
        receiverId: Number(receiverId),
        message: sanitizedMessage
      }
    });

    const engine = getMiningEngine();
    if (engine && engine.io) {
      engine.io.to(`user:${receiverId}`).emit('chat:new-pm', pm);
      engine.io.to(`user:${senderId}`).emit('chat:new-pm', pm);
      
      // Create Notification for Receiver
      await createNotification({
        userId: Number(receiverId),
        title: "Nova Mensagem Privada",
        message: `Você recebeu uma mensagem de ${req.user.username || req.user.name}.`,
        type: "info",
        io: engine.io
      });
    }

    res.json({ ok: true, message: pm });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to send private message." });
  }
}

export async function getConversations(req, res) {
  try {
    const userId = req.user.id;

    const sent = await prisma.privateMessage.findMany({
      where: { senderId: userId },
      select: { receiverId: true, receiver: { select: { username: true } }, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    const received = await prisma.privateMessage.findMany({
      where: { receiverId: userId },
      select: { senderId: true, sender: { select: { username: true } }, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    const conversationMap = new Map();

    [...sent, ...received].forEach(msg => {
      const otherId = msg.senderId || msg.receiverId;
      const otherUsername = msg.sender?.username || msg.receiver?.username;
      
      if (!conversationMap.has(otherId) || conversationMap.get(otherId).lastMessageAt < msg.createdAt) {
        conversationMap.set(otherId, {
          userId: otherId,
          username: otherUsername,
          lastMessageAt: msg.createdAt
        });
      }
    });

    const conversations = Array.from(conversationMap.values()).sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    res.json({ ok: true, conversations });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Unable to load conversations." });
  }
}
