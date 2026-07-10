import type { Request, Response } from "express";
import prisma from "../../src/db/prisma.js";

import loggerLib from "../../utils/logger.js";
const logger = loggerLib.child("publicSupport.controller");

const MAX_SUBJECT_LEN = 120;
const MAX_MSG_LEN = 2000;
const MAX_NAME_LEN = 80;
const MAX_URL_LEN = 512;

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ─── Public (no auth) ────────────────────────────────────────────────────────

function sanitizeImageUrl(v: unknown): string | null {
  const s = sanitizeStr(v, MAX_URL_LEN);
  if (!s) return null;
  if (!/^\/uploads\/[\w\-\.]+$/.test(s)) return null;
  return s;
}

export async function createTicket(req: Request, res: Response) {
  const name = sanitizeStr(req.body?.name, MAX_NAME_LEN);
  const email = sanitizeStr(req.body?.email, 200).toLowerCase();
  const subject = sanitizeStr(req.body?.subject, MAX_SUBJECT_LEN);
  const message = sanitizeStr(req.body?.message, MAX_MSG_LEN);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "missing_fields" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const ticket = await prisma.publicSupportTicket.create({
    data: {
      guestName: name,
      guestEmail: email,
      subject,
      messages: { create: { authorType: "guest", content: message, imageUrl } },
    },
    include: { messages: true },
  });

  try {
    const { notifyNewPublicSupportTicket } = await import("../../services/videoTelegramNotifier.js");
    notifyNewPublicSupportTicket({
      id: ticket.id,
      guestName: name,
      guestEmail: email,
      subject,
      message,
    });
  } catch (notifyErr) {
    logger.warn("[PublicSupport] Telegram notify failed:", { error: String(notifyErr instanceof Error ? notifyErr.message : notifyErr) });
  }

  res.status(201).json({ ok: true, ticket });
}

export async function listTicketsByEmail(req: Request, res: Response) {
  const email = sanitizeStr(req.query?.email, 200).toLowerCase();
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "invalid_email" });
  }

  const tickets = await prisma.publicSupportTicket.findMany({
    where: { guestEmail: email },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorType: true, content: true, createdAt: true },
      },
    },
    take: 50,
  });

  res.json({ ok: true, tickets });
}

export async function getTicket(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  const email = sanitizeStr(req.query?.email, 200).toLowerCase();

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });

  const ticket = await prisma.publicSupportTicket.findFirst({
    where: { id, guestEmail: email },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!ticket) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true, ticket });
}

export async function addGuestMessage(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  const email = sanitizeStr(req.body?.email, 200).toLowerCase();
  const content = sanitizeStr(req.body?.message, MAX_MSG_LEN);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  if (!email || !isValidEmail(email)) return res.status(400).json({ error: "invalid_email" });
  if (!content && !imageUrl) return res.status(400).json({ error: "empty_message" });

  const ticket = await prisma.publicSupportTicket.findFirst({
    where: { id, guestEmail: email },
    select: { id: true, status: true },
  });
  if (!ticket) return res.status(404).json({ error: "not_found" });
  if (ticket.status === "closed") return res.status(400).json({ error: "ticket_closed" });

  const msg = await prisma.publicSupportMessage.create({
    data: { ticketId: id, authorType: "guest", content: content || "", imageUrl },
  });
  await prisma.publicSupportTicket.update({
    where: { id },
    data: { updatedAt: new Date(), status: "open" },
  });

  try {
    const { notifyNewPublicSupportTicket } = await import("../../services/videoTelegramNotifier.js");
    notifyNewPublicSupportTicket({
      id,
      guestName: email,
      guestEmail: email,
      subject: `(nova mensagem) ticket #${id}`,
      message: content,
    });
  } catch (notifyErr) {
    logger.warn("[PublicSupport] Telegram guest-message notify failed:", { error: String(notifyErr instanceof Error ? notifyErr.message : notifyErr) });
  }

  res.status(201).json({ ok: true, message: msg });
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function adminListTickets(req: Request, res: Response) {
  const status = typeof req.query?.status === "string" ? req.query.status : undefined;
  const page = Math.max(1, parseInt(String(req.query?.page ?? "1"), 10) || 1);
  const limit = 30;

  const where = status && status !== "all" ? { status } : {};

  const [total, tickets] = await Promise.all([
    prisma.publicSupportTicket.count({ where }),
    prisma.publicSupportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { authorType: true, content: true, createdAt: true },
        },
      },
    }),
  ]);

  res.json({ ok: true, tickets, total, page, limit });
}

export async function adminGetTicket(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

  const ticket = await prisma.publicSupportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) return res.status(404).json({ error: "not_found" });

  res.json({ ok: true, ticket });
}

export async function adminReply(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  const content = sanitizeStr(req.body?.message, MAX_MSG_LEN);
  const imageUrl = sanitizeImageUrl(req.body?.imageUrl);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  if (!content && !imageUrl) return res.status(400).json({ error: "empty_message" });

  const ticket = await prisma.publicSupportTicket.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!ticket) return res.status(404).json({ error: "not_found" });

  const msg = await prisma.publicSupportMessage.create({
    data: { ticketId: id, authorType: "admin", content: content || "", imageUrl },
  });
  await prisma.publicSupportTicket.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  res.status(201).json({ ok: true, message: msg });
}

export async function adminSetStatus(req: Request, res: Response) {
  const id = parseInt(String(req.params.id), 10);
  const status = sanitizeStr(req.body?.status, 20);

  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
  if (status !== "open" && status !== "closed") return res.status(400).json({ error: "invalid_status" });

  await prisma.publicSupportTicket.update({ where: { id }, data: { status } });
  res.json({ ok: true });
}
