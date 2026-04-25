import { z } from "zod";
import prisma from "../src/db/prisma.js";
import { parseSupportPayload, serializeSupportPayload } from "../utils/supportMessagePayload.js";
import { toPublicSupportReply } from "../services/supportRealtime.js";
import { addUserReply } from "../services/supportTicketService.js";

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

/**
 * @param {import("@prisma/client").SupportMessage & { replies?: import("@prisma/client").SupportReply[] }} row
 */
function enrichTicket(row) {
  const { message: rawBody, replies, ...rest } = row;
  const root = parseSupportPayload(rawBody);
  const publicReplies = (replies || []).map((r) => toPublicSupportReply(r)).filter(Boolean);
  return {
    ...rest,
    body: root.body,
    attachments: root.attachments,
    /** @deprecated Use `body`; kept for older clients */
    message: root.body,
    replies: publicReplies
  };
}

function parsePagination(req) {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 20));
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

/**
 * Public: Create a new support message (ticket).
 */
export const createMessage = async (req, res) => {
  try {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
    }
    const { name, email, subject, message, attachments } = parsed.data;
    const userId = req.user?.id ?? null;

    const stored = serializeSupportPayload(message, attachments || []);

    const newMessage = await prisma.supportMessage.create({
      data: {
        userId,
        name,
        email,
        subject,
        message: stored
      }
    });

    res.status(201).json({ ok: true, message: "Created", id: newMessage.id });
  } catch (error) {
    console.error("[SupportController] Error creating message:", error);
    res.status(500).json({ ok: false, message: "Error sending support message" });
  }
};

/**
 * Authenticated: List current user's support tickets.
 */
export const listMessages = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
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
  } catch (error) {
    console.error("[SupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Authenticated: Get one ticket with parsed thread.
 */
export const getMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);

    if (!userId) {
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
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
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    res.json({ ok: true, message: enrichTicket(row) });
  } catch (error) {
    console.error("[SupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Authenticated: User reply on a ticket.
 */
/**
 * Authenticated: Upload one image for attachment to a ticket message.
 */
export const uploadSupportImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "No file uploaded" });
    }
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, url, mimeType: req.file.mimetype || null });
  } catch (error) {
    console.error("[SupportController] upload error:", error);
    res.status(500).json({ ok: false, message: "Upload failed" });
  }
};

export const replyToMessage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const id = parseInt(req.params.id, 10);

    if (!userId) return res.status(401).json({ ok: false, message: "Unauthorized" });
    if (!id || Number.isNaN(id)) return res.status(400).json({ ok: false, message: "Invalid id" });

    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
    }

    try {
      const newReply = await addUserReply({
        supportMessageId: id,
        userId,
        body: parsed.data.message,
        attachments: parsed.data.attachments
      });
      res.status(201).json({ ok: true, reply: toPublicSupportReply(newReply) });
    } catch (e) {
      if (/** @type {any} */ (e).code === "NOT_FOUND") {
        return res.status(404).json({ ok: false, message: "Support ticket not found" });
      }
      throw e;
    }
  } catch (error) {
    console.error("[SupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
