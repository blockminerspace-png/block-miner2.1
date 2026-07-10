import type { Request, Response } from "express";
import { z } from "zod";
import prisma from "../../../src/db/prisma.js";
import { parseSupportPayload } from "../../../utils/supportMessagePayload.js";
import { toPublicSupportReply } from "../../../services/supportRealtime.js";
import { addAdminReply } from "../../../services/supportTicketService.js";
import { getSupportTicketPlayerDossier } from "../../../services/supportPlayerDossierService.js";
import { applyUserBalanceDelta } from "../../../src/runtime/miningRuntime.js";
import { getClientIp } from "../../../utils/clientIp.js";
import type { SupportMessage, SupportReply, User } from "@prisma/client";

import loggerLib from "../../../utils/logger.js";
const logger = loggerLib.child("adminSupport");

const attachmentSchema = z.object({
  url: z.string().min(1).max(512),
  mimeType: z.string().max(120).optional()
});

const creditPolSchema = z.object({
  amount: z.union([z.number(), z.string()]).transform((v) => {
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }).refine((n) => Number.isFinite(n) && n > 0 && n <= 1000, {
    message: "Amount must be a positive number up to 1000.",
  }),
  reason: z.string().trim().min(3).max(500),
});

const adminReplySchema = z.object({
  reply: z.string().trim().min(1).max(12000).optional(),
  message: z.string().trim().min(1).max(12000).optional(),
  attachments: z.array(attachmentSchema).max(5).optional()
});

type AdminTicketRow = SupportMessage & {
  replies?: SupportReply[];
  user?: Pick<User, "username" | "email"> | null;
};

function enrichTicket(row: AdminTicketRow) {
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
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
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

export const listMessages = async (req: Request, res: Response): Promise<void> => {
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
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[AdminSupportController] Error listing messages:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error listing messages" });
  }
};

type IdParams = { id: string };

export const getMessage = async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
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
      res.status(404).json({ ok: false, message: "Message not found" });
      return;
    }

    if (!row.isRead) {
      await prisma.supportMessage.update({
        where: { id },
        data: { isRead: true }
      });
    }

    res.json({ ok: true, message: enrichTicket(row as AdminTicketRow) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[AdminSupportController] Error getting message:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error getting message" });
  }
};

export const getPlayerDossier = async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }

    const result = await getSupportTicketPlayerDossier(
      prisma,
      id,
      req.query as Record<string, string | undefined>
    );
    if (!result.ok) {
      res.status(404).json({ ok: false, message: "Message not found" });
      return;
    }
    res.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[AdminSupportController] Error loading player dossier:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error loading player dossier" });
  }
};

export const creditPol = async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }

    const parsed = creditPolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }

    const ticket = await prisma.supportMessage.findUnique({
      where: { id },
      select: { id: true, userId: true, email: true, name: true },
    });
    if (!ticket) {
      res.status(404).json({ ok: false, message: "Ticket not found" });
      return;
    }
    if (!ticket.userId) {
      res.status(400).json({ ok: false, message: "Ticket is not linked to a player account" });
      return;
    }

    const userId = ticket.userId;
    const amount = parsed.data.amount;
    const reason = parsed.data.reason;
    const ip = getClientIp(req) ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw Object.assign(new Error("User not found"), { code: "USER_NOT_FOUND" });

      const updated = await tx.user.update({
        where: { id: userId },
        data: { polBalance: { increment: amount } },
        select: { polBalance: true },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: "admin_credit",
          amount,
          status: "completed",
          completedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "ADMIN_SUPPORT_CREDIT_POL",
          label: "Support POL credit",
          description: `Support ticket #${ticket.id}: ${reason}`,
          source: "admin",
          severity: "warn",
          ip,
          detailsJson: JSON.stringify({
            supportMessageId: ticket.id,
            amount,
            reason,
            transactionId: transaction.id,
          }),
          relatedEntityType: "support_message",
          relatedEntityId: String(ticket.id),
        },
      });

      return { polBalance: updated.polBalance, transactionId: transaction.id };
    });

    applyUserBalanceDelta(userId, Number(amount));

    try {
      const noteBody = `[Admin] Foram creditados ${amount.toFixed(6)} POL na sua conta. Motivo: ${reason}`;
      const reply = await addAdminReply({
        supportMessageId: ticket.id,
        body: noteBody,
      });
      res.json({
        ok: true,
        message: "POL credited",
        amount,
        polBalance: result.polBalance == null ? null : Number(result.polBalance),
        transactionId: result.transactionId,
        reply: toPublicSupportReply(reply),
      });
      return;
    } catch (replyErr) {
      logger.error("[AdminSupportController] Could not append credit note to ticket:", { error: String(replyErr) });
      res.json({
        ok: true,
        message: "POL credited",
        amount,
        polBalance: result.polBalance == null ? null : Number(result.polBalance),
        transactionId: result.transactionId,
      });
      return;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[AdminSupportController] Error crediting POL:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error crediting POL" });
  }
};

export const replyToMessage = async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ ok: false, message: "Invalid id" });
      return;
    }

    const parsed = adminReplySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: "Invalid request body", issues: parsed.error.flatten() });
      return;
    }

    const text = parsed.data.reply ?? parsed.data.message;
    if (!text) {
      res.status(400).json({ ok: false, message: "Reply content is required" });
      return;
    }

    try {
      const reply = await addAdminReply({
        supportMessageId: id,
        body: text,
        attachments: parsed.data.attachments
      });
      res.json({ ok: true, message: "Reply saved successfully", reply: toPublicSupportReply(reply) });
    } catch (inner: unknown) {
      if (errCode(inner) === "NOT_FOUND") {
        res.status(404).json({ ok: false, message: "Message not found" });
        return;
      }
      throw inner;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[AdminSupportController] Error replying to message:", { error: String(msg) });
    res.status(500).json({ ok: false, message: "Error sending reply" });
  }
};
