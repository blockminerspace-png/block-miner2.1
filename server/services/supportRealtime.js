import { parseSupportPayload } from "../utils/supportMessagePayload.js";

/** @type {import("socket.io").Server | null} */
let ioRef = null;

/**
 * @param {import("socket.io").Server} io
 */
export function setSupportIo(io) {
  ioRef = io;
}

/**
 * Shape a SupportReply row for clients (parsed body + attachments).
 * @param {import("@prisma/client").SupportReply} row
 */
export function toPublicSupportReply(row) {
  if (!row) return null;
  const { body, attachments } = parseSupportPayload(row.message);
  return {
    id: row.id,
    supportMessageId: row.supportMessageId,
    senderId: row.senderId,
    isAdmin: row.isAdmin,
    createdAt: row.createdAt,
    body,
    attachments,
    /** @deprecated Use `body`; kept for older clients */
    message: body
  };
}

/**
 * Notify subscribers of a new reply on a support thread.
 * @param {number} supportMessageId
 * @param {import("@prisma/client").SupportReply} replyRow
 */
export function emitSupportReply(supportMessageId, replyRow) {
  if (!ioRef || !supportMessageId) return;
  const payload = toPublicSupportReply(replyRow);
  ioRef.to(`support:${supportMessageId}`).emit("support:reply", {
    supportMessageId,
    reply: payload
  });
}
