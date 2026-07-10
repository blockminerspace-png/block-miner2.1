import prisma from "../src/db/prisma.js";
import { serializeSupportPayload } from "../utils/supportMessagePayload.js";
import { emitSupportReply } from "./supportRealtime.js";

import loggerLib from "../utils/logger.js";
const logger = loggerLib.child("supportTicketService");

/**
 * @param {number} supportMessageId
 * @param {number} userId
 */
export async function assertTicketOwnedByUser(supportMessageId, userId) {
  const row = await prisma.supportMessage.findUnique({
    where: { id: supportMessageId },
    select: { id: true, userId: true }
  });
  if (!row || row.userId !== userId) return null;
  return row;
}

/**
 * @param {{ supportMessageId: number, userId: number, body: string, attachments?: Array<{ url: string, mimeType?: string }> }} params
 */
export async function addUserReply(params) {
  const { supportMessageId, userId, body, attachments = [] } = params;
  const ticket = await assertTicketOwnedByUser(supportMessageId, userId);
  if (!ticket) {
    const err = new Error("NOT_FOUND") as Error & { code: string };
    err.code = "NOT_FOUND";
    throw err;
  }
  const stored = serializeSupportPayload(body, attachments);
  const newReply = await prisma.supportReply.create({
    data: {
      supportMessageId,
      senderId: userId,
      message: stored,
      isAdmin: false
    }
  });
  emitSupportReply(supportMessageId, newReply);

  try {
    const { notifySupportReply } = await import("../services/videoTelegramNotifier.js");
    const [fullTicket, user] = await Promise.all([
      prisma.supportMessage.findUnique({ where: { id: supportMessageId }, select: { subject: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    ]);
    notifySupportReply({
      ticketId: supportMessageId,
      subject: fullTicket?.subject ?? null,
      username: user?.username ?? null,
      userId,
      message: typeof body === "string" ? body : "",
    });
  } catch (notifyErr) {
    logger.warn("[SupportTicket] Telegram reply notify failed:", { error: String(notifyErr instanceof Error ? notifyErr.message : notifyErr) });
  }

  return newReply;
}

/**
 * @param {{ supportMessageId: number, body: string, attachments?: Array<{ url: string, mimeType?: string }> }} params
 */
export async function addAdminReply(params) {
  const { supportMessageId, body, attachments = [] } = params;
  const ticket = await prisma.supportMessage.findUnique({
    where: { id: supportMessageId },
    select: { id: true }
  });
  if (!ticket) {
    const err = new Error("NOT_FOUND") as Error & { code: string };
    err.code = "NOT_FOUND";
    throw err;
  }
  const stored = serializeSupportPayload(body, attachments);
  const [reply] = await prisma.$transaction([
    prisma.supportReply.create({
      data: {
        supportMessageId,
        message: stored,
        isAdmin: true,
        senderId: null
      }
    }),
    prisma.supportMessage.update({
      where: { id: supportMessageId },
      data: { isReplied: true, repliedAt: new Date() }
    })
  ]);
  emitSupportReply(supportMessageId, reply);
  return reply;
}
