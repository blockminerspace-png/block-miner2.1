import { randomBytes } from 'node:crypto';
import prisma from '../../src/db/prisma.js';
import type { AdminSession } from '@prisma/client';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h default

function parseExpiresIn(raw: string | undefined): number {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return SESSION_TTL_MS;
  const match = /^(\d+)(h|d|m)?$/.exec(s);
  if (!match) return SESSION_TTL_MS;
  const n = parseInt(match[1], 10);
  switch (match[2]) {
    case 'd': return n * 86400000;
    case 'm': return n * 60000;
    default: return n * 3600000;
  }
}

export function generateSessionId(): string {
  return randomBytes(24).toString('hex');
}

export async function createSession(opts: {
  adminId: number;
  ip: string | null;
  ua: string | null;
}): Promise<AdminSession> {
  const ttl = parseExpiresIn(process.env.ADMIN_JWT_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + ttl);
  const id = generateSessionId();
  return prisma.adminSession.create({
    data: { id, adminId: opts.adminId, ipAddress: opts.ip, userAgent: opts.ua, expiresAt },
  });
}

export async function getActiveSession(sessionId: string): Promise<AdminSession | null> {
  const session = await prisma.adminSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  if (session.revokedAt != null) return null;
  if (session.expiresAt < new Date()) return null;
  return session;
}

export async function touchSession(sessionId: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { lastActivityAt: new Date() },
  }).catch(() => undefined);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessionsForAdmin(adminId: number): Promise<number> {
  const result = await prisma.adminSession.updateMany({
    where: { adminId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function listActiveSessions(adminId: number) {
  return prisma.adminSession.findMany({
    where: { adminId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActivityAt: 'desc' },
  });
}

export async function listAllActiveSessions() {
  return prisma.adminSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: { admin: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { lastActivityAt: 'desc' },
  });
}
