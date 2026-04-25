import { z } from "zod";
import prisma from "../src/db/prisma.js";
import { parseSupportPayload } from "../utils/supportMessagePayload.js";
import { toPublicSupportReply } from "../services/supportRealtime.js";
import { addAdminReply } from "../services/supportTicketService.js";
import { getSupportTicketPlayerDossier } from "../services/supportPlayerDossierService.js";

const attachmentSchema = z.object({
  url: z.string().min(1).max(512),
  mimeType: z.string().max(120).optional()
});

const adminReplySchema = z.object({
  reply: z.string().trim().min(1).max(12000).optional(),
  message: z.string().trim().min(1).max(12000).optional(),
  attachments: z.array(attachmentSchema).max(5).optional()
});

/**
 * @param {import("@prisma/client").SupportMessage & { replies?: import("@prisma/client").SupportReply[], user?: unknown }} row
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
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const skip = (page - 1) * limit;
  return { limit, page, skip };
}

/**
 * Admin: List all support messages.
 */
export const listMessages = async (req, res) => {
  try {
    const { limit, page, skip } = parsePagination(req);
    const userIdFilter = req.query.userId ? parseInt(String(req.query.userId), 10) : null;
    const where =
      userIdFilter && !Number.isNaN(userIdFilter) ? { userId: userIdFilter } : {};

    const [messages, total] = await Promise.all([
      prisma.supportMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              username: true,
              email: true
            }
          }
        }
      }),
      prisma.supportMessage.count({ where })
    ]);

    res.json({ ok: true, messages, page, limit, total });
  } catch (error) {
    console.error("[AdminSupportController] Error listing messages:", error);
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

/**
 * Admin: Get specific message details.
 */
export const getMessage = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const row = await prisma.supportMessage.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            username: true,
            email: true
          }
        },
        replies: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!row) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    if (!row.isRead) {
      await prisma.supportMessage.update({
        where: { id },
        data: { isRead: true }
      });
    }

    res.json({ ok: true, message: enrichTicket(row) });
  } catch (error) {
    console.error("[AdminSupportController] Error getting message:", error);
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

/**
 * Admin: Aggregated player data for the ticket author (read-only dossier).
 */
export const getPlayerDossier = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const result = await getSupportTicketPlayerDossier(prisma, id, req.query);
    if (!result.ok) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }
    res.json(result);
  } catch (error) {
    console.error("[AdminSupportController] Error loading player dossier:", error);
    res.status(500).json({ ok: false, message: "Error loading player dossier" });
  }
};

/**
 * Admin: Reply to a message.
 */
export const replyToMessage = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const parsed = adminReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
    }

    const text = parsed.data.reply ?? parsed.data.message;
    if (!text) {
      return res.status(400).json({ ok: false, message: "Reply content is required" });
    }

    try {
      const reply = await addAdminReply({
        supportMessageId: id,
        body: text,
        attachments: parsed.data.attachments
      });
      res.json({ ok: true, message: "Reply saved successfully", reply: toPublicSupportReply(reply) });
    } catch (e) {
      if (/** @type {any} */ (e).code === "NOT_FOUND") {
        return res.status(404).json({ ok: false, message: "Message not found" });
      }
      throw e;
    }
  } catch (error) {
    console.error("[AdminSupportController] Error replying to message:", error);
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
