import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import loggerLib from '../utils/logger.js';
import { getRequestIp } from '../utils/clientIp.js';
import { createAuditLogBestEffort } from '../models/auditLogModel.js';
import { ADMIN_SESSION_COOKIE, getAdminTokenFromRequest } from '../utils/token.js';
import { findAdminByEmail, updateLastLogin } from '../modules/admin-system/adminUser.service.js';
import { verifyPassword } from '../modules/admin-system/adminPassword.service.js';
import { createSession, revokeSession, getActiveSession } from '../modules/admin-system/adminSession.service.js';
import { logAdminAction } from '../modules/admin-system/adminAuditLog.service.js';
import { resolvePermissions } from '../modules/admin-system/adminPermissions.js';
import prisma from '../src/db/prisma.js';

const logger = loggerLib.child('AdminAuthController');

// Legacy env-var credentials (backward compat)
const LEGACY_ADMIN_EMAIL = String(process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
const LEGACY_ADMIN_SECURITY_CODE = String(process.env.ADMIN_SECURITY_CODE ?? '').trim();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN ?? '24h';

function timingSafeStringEqual(a: unknown, b: unknown): boolean {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function adminCookieShouldBeSecure(req: Request): boolean {
  const flag = String(process.env.ADMIN_SESSION_COOKIE_SECURE ?? '').trim().toLowerCase();
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim().toLowerCase();
  return Boolean(req.secure || proto === 'https');
}

function buildAdminCookie(token: string, { secure }: { secure?: boolean } = {}): string {
  const parts = [`${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
  const cookieDomain = String(process.env.ADMIN_SESSION_COOKIE_DOMAIN ?? process.env.COOKIE_DOMAIN ?? '').trim();
  if (cookieDomain) parts.push(`Domain=${cookieDomain}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function pickFirstNonEmpty(obj: unknown, keys: string[]): string {
  if (!obj || typeof obj !== 'object') return '';
  const o = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

async function hasDbAdmins(): Promise<boolean> {
  const count = await prisma.adminUser.count({ where: { isActive: true } }).catch(() => 0);
  return count > 0;
}

export async function login(req: Request, res: Response): Promise<void> {
  const ip = getRequestIp(req);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

  try {
    if (!JWT_SECRET) {
      res.status(503).json({ ok: false, code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'JWT_SECRET missing.' });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const userEmailRaw = pickFirstNonEmpty(body, ['email', 'Email', 'adminEmail', 'admin_email']);
    const rawPassword = pickFirstNonEmpty(body, ['password', 'securityCode', 'code', 'adminCode', 'security_code', 'admin_password']);

    if (!userEmailRaw || !rawPassword) {
      res.status(400).json({ ok: false, message: 'Email and password required' });
      return;
    }

    const email = userEmailRaw.toLowerCase();

    // --- Try DB auth first ---
    if (await hasDbAdmins()) {
      const adminRecord = await findAdminByEmail(email);

      if (!adminRecord || !adminRecord.isActive) {
        await logAdminAction({ adminEmail: email, action: 'ADMIN_LOGIN_FAILURE', module: 'auth', success: false, errorMsg: 'INVALID_CREDENTIALS', ipAddress: ip, userAgent: ua });
        void createAuditLogBestEffort({ userId: null, action: 'ADMIN_LOGIN_FAILURE', ip, userAgent: ua, details: { reason: 'INVALID_CREDENTIALS', email } });
        res.status(401).json({ ok: false, message: 'Invalid credentials' });
        return;
      }

      const passwordOk = await verifyPassword(rawPassword, adminRecord.passwordHash);
      if (!passwordOk) {
        await logAdminAction({ adminId: adminRecord.id, adminEmail: email, action: 'ADMIN_LOGIN_FAILURE', module: 'auth', success: false, errorMsg: 'WRONG_PASSWORD', ipAddress: ip, userAgent: ua });
        void createAuditLogBestEffort({ userId: null, action: 'ADMIN_LOGIN_FAILURE', ip, userAgent: ua, details: { reason: 'WRONG_PASSWORD', email } });
        res.status(401).json({ ok: false, message: 'Invalid credentials' });
        return;
      }

      const session = await createSession({ adminId: adminRecord.id, ip, ua });
      const permissions = resolvePermissions(adminRecord.role, adminRecord.permissions);

      const token = jwt.sign(
        { role: 'admin', type: 'admin_session', adminId: adminRecord.id, sessionId: session.id, adminRole: adminRecord.role, permissions },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, issuer: 'blockminer-admin' } as SignOptions,
      );

      await updateLastLogin(adminRecord.id, ip, ua);
      await logAdminAction({ adminId: adminRecord.id, adminEmail: email, sessionId: session.id, action: 'ADMIN_LOGIN_SUCCESS', module: 'auth', ipAddress: ip, userAgent: ua });
      void createAuditLogBestEffort({ userId: null, action: 'ADMIN_LOGIN_SUCCESS', ip, userAgent: ua, details: { email, adminId: adminRecord.id } });

      res.setHeader('Set-Cookie', buildAdminCookie(token, { secure: adminCookieShouldBeSecure(req) }));
      res.json({ ok: true, message: 'Authenticated', adminId: adminRecord.id, role: adminRecord.role, name: adminRecord.name });
      return;
    }

    // --- Legacy env-var fallback ---
    if (!LEGACY_ADMIN_EMAIL || !LEGACY_ADMIN_SECURITY_CODE) {
      res.status(503).json({ ok: false, code: 'ADMIN_AUTH_NOT_CONFIGURED', message: 'Admin auth not configured.' });
      return;
    }

    const emailMatch = timingSafeStringEqual(email, LEGACY_ADMIN_EMAIL);
    const codeMatch = timingSafeStringEqual(rawPassword, LEGACY_ADMIN_SECURITY_CODE);

    if (!emailMatch || !codeMatch) {
      void createAuditLogBestEffort({ userId: null, action: 'ADMIN_LOGIN_FAILURE', ip, userAgent: ua, details: { reason: 'INVALID_CREDENTIALS' } });
      res.status(401).json({ ok: false, message: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { role: 'admin', type: 'admin_session' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN, issuer: 'blockminer-admin' } as SignOptions,
    );

    void createAuditLogBestEffort({ userId: null, action: 'ADMIN_LOGIN_SUCCESS', ip, userAgent: ua, details: { email } });
    res.setHeader('Set-Cookie', buildAdminCookie(token, { secure: adminCookieShouldBeSecure(req) }));
    res.json({ ok: true, message: 'Authenticated' });
  } catch (error: unknown) {
    logger.error('Admin login error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: 'Internal server error' });
  }
}

export async function check(req: Request, res: Response): Promise<void> {
  try {
    if (!JWT_SECRET) { res.status(503).json({ ok: false, message: 'JWT_SECRET missing.' }); return; }
    const token = getAdminTokenFromRequest(req);
    if (!token) { res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Not authenticated' }); return; }

    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'blockminer-admin', algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload) { res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Not authenticated' }); return; }

    const p = payload as Record<string, unknown>;
    if (p['role'] !== 'admin' || p['type'] !== 'admin_session') { res.status(403).json({ ok: false, message: 'Forbidden' }); return; }

    // If DB session, verify it's still active
    const sessionId = typeof p['sessionId'] === 'string' ? p['sessionId'] : null;
    if (sessionId) {
      const session = await getActiveSession(sessionId);
      if (!session) { res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Session expired or revoked' }); return; }
    }

    const adminId = typeof p['adminId'] === 'number' ? p['adminId'] : undefined;
    const role = typeof p['adminRole'] === 'string' ? p['adminRole'] : 'admin';
    res.json({ ok: true, adminId, role });
  } catch {
    res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Not authenticated' });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const ip = getRequestIp(req);
  const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;

  try {
    const token = getAdminTokenFromRequest(req);
    if (token && JWT_SECRET) {
      try {
        const payload = jwt.verify(token, JWT_SECRET, { issuer: 'blockminer-admin', algorithms: ['HS256'] }) as Record<string, unknown>;
        const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : null;
        const adminId = typeof payload['adminId'] === 'number' ? payload['adminId'] : null;
        if (sessionId) await revokeSession(sessionId);
        if (adminId) {
          const email = typeof payload['email'] === 'string' ? payload['email'] : null;
          await logAdminAction({ adminId, adminEmail: email, sessionId: sessionId ?? undefined, action: 'ADMIN_LOGOUT', module: 'auth', ipAddress: ip, userAgent: ua });
        }
      } catch { /* expired token — still clear cookie */ }
    }
  } catch { /* ignore */ }

  const clearCookie = `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
  res.setHeader('Set-Cookie', clearCookie);
  res.json({ ok: true });
}
