import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { getAdminTokenFromRequest } from '../utils/token.js';
import loggerNamespace from '../utils/logger.js';
import { getActiveSession, touchSession } from '../modules/admin-system/adminSession.service.js';
import { findAdminById } from '../modules/admin-system/adminUser.service.js';
import { resolvePermissions } from '../modules/admin-system/adminPermissions.js';

const logger = loggerNamespace.child('AdminAuthMiddleware');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('Admin JWT secret is missing');
      res.status(503).json({ ok: false, message: 'Admin auth unavailable.' });
      return;
    }

    const token = getAdminTokenFromRequest(req);
    if (!token) {
      res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Admin session invalid.' });
      return;
    }

    let payload: JwtPayload | string | null = null;
    try {
      payload = jwt.verify(token, jwtSecret, { issuer: 'blockminer-admin', algorithms: ['HS256'] });
    } catch {
      res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Admin session invalid.' });
      return;
    }

    if (typeof payload === 'string' || !isRecord(payload)) {
      res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Admin session invalid.' });
      return;
    }

    if (payload['role'] !== 'admin' || payload['type'] !== 'admin_session') {
      res.status(403).json({ ok: false, message: 'Forbidden' });
      return;
    }

    const sessionId = typeof payload['sessionId'] === 'string' ? payload['sessionId'] : undefined;
    const adminId = typeof payload['adminId'] === 'number' ? payload['adminId'] : undefined;

    if (sessionId && adminId) {
      // DB-backed session: validate
      const session = await getActiveSession(sessionId);
      if (!session) {
        res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Session expired or revoked.' });
        return;
      }

      const adminRecord = await findAdminById(adminId);
      if (!adminRecord || !adminRecord.isActive) {
        res.status(401).json({ ok: false, code: 'ADMIN_SESSION_INVALID', message: 'Admin account inactive.' });
        return;
      }

      const permissions = resolvePermissions(adminRecord.role, adminRecord.permissions);

      req.admin = {
        role: adminRecord.role,
        adminId,
        sessionId,
        email: adminRecord.email,
        name: adminRecord.name,
        permissions,
      };

      // Touch session async (non-blocking)
      void touchSession(sessionId);
    } else {
      // Legacy env-var session
      req.admin = { role: 'admin', permissions: ['*'] };
    }

    next();
  } catch (error: unknown) {
    logger.error('Admin auth middleware error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: 'Unable to authenticate.' });
  }
}

export function verifyAdminJwtToken(token: string | null | undefined): JwtPayload | null {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret || !token) return null;
    const payload = jwt.verify(String(token).trim(), jwtSecret, { issuer: 'blockminer-admin', algorithms: ['HS256'] });
    if (typeof payload === 'string' || !isRecord(payload)) return null;
    if (payload['role'] !== 'admin' || payload['type'] !== 'admin_session') return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}
