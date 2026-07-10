import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../src/db/prisma.js";
import { parseSupportPayload, serializeSupportPayload } from "../../utils/supportMessagePayload.js";
import { toPublicSupportReply } from "../../services/supportRealtime.js";
import { addUserReply } from "../../services/supportTicketService.js";
import type { SupportMessage, SupportReply } from "@prisma/client";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("support.controller");

const attachmentSchema = z.object({
  url: z.string().min(1).max(512),
  mimeType: z.string().max(120).optional()
});

const createMessageSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(12000),
  attachments: z.array(attachmentSchema).max(5).optional()
});

const replySchema = z.object({
  message: z.string().trim().min(1).max(12000),
  attachments: z.array(attachmentSchema).max(5).optional()
});

type TicketRow = SupportMessage & { replies?: SupportReply[] };

function enrichTicket(row: TicketRow) {
  const { message: rawBody, replies, ...rest } = row;
  const root = parseSupportPayload(rawBody);
  const publicReplies = (replies ?? []).map((r) => toPublicSupportReply(r)).filter(Boolean);
  return {
    ...rest,
    body: root.body,
    attachments: root.attachments,
    /** @deprecated Use `body`; kept for older clients */
    message: root.body,
    replies: publicReplies
  };
}

function parsePagination(req: Request) {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

function errCode(e: unknown): string | undefined {
  if (e !== null && typeof e === "object" && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return undefined;
}

/**
 * Public: Create a new support message (ticket).
 */
export const createMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }
    const { name, email, subject, message, attachments } = parsed.data;
    const userId = req.user?.id ?? null;

    const stored = serializeSupportPayload(message, attachments ?? []);

    const newMessage = await prisma.supportMessage.create({
      data: {
        userId,
        name,
        email,
        subject,
        message: stored
      }
    });

    try {
      const { notifyNewSupportTicket } = await import("../../services/supportTelegramNotifier.js");
      let username: string | null = null;
      if (userId) {
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
        username = u?.username ?? null;
      }
      notifyNewSupportTicket({
        id: newMessage.id,
        name,
        email,
        subject,
        body: message,
        userId,
        username,
      });
    } catch (notifyErr) {
      logger.warn("[SupportController] Telegram notify failed:", { error: String(notifyErr instanceof Error ? notifyErr.message : notifyErr) });
    }

    res.status(201).json({ ok: true, message: "Created", id: newMessage.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[SupportController] Error creating message:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error sending support message" });
  }
};

/**
 * Authenticated: List current user's support tickets.
 */
export const listMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }

    const { limit, page, skip } = parsePagination(req);

    const [messages, total] = await Promise.all([
      prisma.supportMessage.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          subject: true,
          isRead: true,
          isReplied: true,
          createdAt: true
        }
      }),
      prisma.supportMessage.count({ where: { userId } })
    ]);

    res.json({ ok: true, messages, page, limit, total });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[SupportController] Error listing messages:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

type MessageParams = { id: string };

/**
 * Authenticated: Get one ticket with parsed thread.
 */
export const getMessage = async (req: Request<MessageParams>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);

    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }

    const row = await prisma.supportMessage.findUnique({
      where: { id },
      include: {
        replies: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!row || row.userId !== userId) {
      res.status(404).json({ ok: false, message: "Message not found" });
      return;
    }

    res.json({ ok: true, message: enrichTicket(row as TicketRow) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[SupportController] Error getting message:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Authenticated: Upload one image for attachment to a ticket message.
 */
export const uploadSupportImage = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, message: "No file uploaded" });
      return;
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url, mimeType: req.file.mimetype || null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[SupportController] upload error:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Upload failed" });
  }
};

export const replyToMessage = async (req: Request<MessageParams>, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);

    if (!userId) {
      res.status(401).json({ ok: false, message: "Unauthorized" });
      return;
    }
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }

    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }

    try {
      const newReply = await addUserReply({
        supportMessageId: id,
        userId,
        body: parsed.data.message,
        attachments: parsed.data.attachments
      });
      res.status(201).json({ ok: true, reply: toPublicSupportReply(newReply) });
    } catch (inner: unknown) {
      if (errCode(inner) === "NOT_FOUND") {
        res.status(404).json({ ok: false, message: "Support ticket not found" });
        return;
      }
      throw inner;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[SupportController] Error replying to message:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
