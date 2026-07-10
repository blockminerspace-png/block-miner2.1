import type { Request, Response } from 'express';
import prisma from '../../src/db/prisma.js';
import { getRequestIp } from '../../utils/clientIp.js';
import {
  listAdmins,
  createAdmin,
  updateAdmin,
  changeAdminPassword,
  findAdminById,
  countSuperAdmins,
} from './adminUser.service.js';
import {
  listActiveSessions,
  listAllActiveSessions,
  revokeSession,
  revokeAllSessionsForAdmin,
} from './adminSession.service.js';
import { queryAdminAuditLogs, logAdminAction } from './adminAuditLog.service.js';
import { isStrongPassword } from './adminPassword.service.js';
import { ADMIN_ROLES } from './adminPermissions.js';

function getAdminCtx(req: Request) {
  return {
    adminId: req.admin?.adminId ?? null,
    adminEmail: req.admin?.email ?? null,
    sessionId: req.admin?.sessionId ?? null,
    ip: getRequestIp(req),
    ua: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  };
}

// GET /api/admin/admins
export async function listAdminsHandler(req: Request, res: Response): Promise<void> {
  const admins = await listAdmins();
  res.json({ ok: true, admins });
}

// POST /api/admin/admins
export async function createAdminHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const { name, email, password, role, permissions } = req.body ?? {};

  if (!name || !email || !password) {
    res.status(400).json({ ok: false, message: 'name, email and password are required' });
    return;
  }
  if (!isStrongPassword(password)) {
    res.status(400).json({
      ok: false,
      message: 'Password must be at least 12 characters and include uppercase, lowercase, number and symbol.',
    });
    return;
  }
  if (role && !ADMIN_ROLES.includes(role)) {
    res.status(400).json({ ok: false, message: `Invalid role. Allowed: ${ADMIN_ROLES.join(', ')}` });
    return;
  }

  try {
    const admin = await createAdmin({
      name,
      email,
      password,
      role: role ?? 'admin',
      permissions: Array.isArray(permissions) ? permissions : [],
      createdById: ctx.adminId ?? undefined,
    });
    await logAdminAction({
      ...ctx,
      action: 'ADMIN_CREATE',
      module: 'admins',
      resource: 'AdminUser',
      resourceId: String(admin.id),
      newValue: { name: admin.name, email: admin.email, role: admin.role },
    });
    res.status(201).json({ ok: true, admin });
  } catch (err: unknown) {
    if (String(err).includes('Unique constraint')) {
      res.status(409).json({ ok: false, message: 'Email already in use.' });
    } else {
      res.status(500).json({ ok: false, message: 'Failed to create admin.' });
    }
  }
}

// PATCH /api/admin/admins/:id
export async function updateAdminHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ ok: false, message: 'Invalid id' }); return; }

  const { name, role, permissions, isActive } = req.body ?? {};

  if (role && !ADMIN_ROLES.includes(role)) {
    res.status(400).json({ ok: false, message: 'Invalid role' }); return;
  }

  // Prevent removing last super_admin
  if (role && role !== 'super_admin') {
    const target = await findAdminById(id);
    if (target?.role === 'super_admin') {
      const count = await countSuperAdmins();
      if (count <= 1) {
        res.status(400).json({ ok: false, message: 'Cannot demote the last super_admin.' }); return;
      }
    }
  }
  if (isActive === false) {
    const target = await findAdminById(id);
    if (target?.role === 'super_admin') {
      const count = await countSuperAdmins();
      if (count <= 1) {
        res.status(400).json({ ok: false, message: 'Cannot deactivate the last super_admin.' }); return;
      }
    }
  }

  const before = await findAdminById(id);
  const admin = await updateAdmin(id, {
    name,
    role,
    permissions: Array.isArray(permissions) ? permissions : undefined,
    isActive,
    updatedById: ctx.adminId ?? undefined,
  });

  if (isActive === false) {
    await revokeAllSessionsForAdmin(id);
  }

  await logAdminAction({
    ...ctx,
    action: 'ADMIN_UPDATE',
    module: 'admins',
    resource: 'AdminUser',
    resourceId: String(id),
    oldValue: before ? { name: before.name, role: before.role, isActive: before.isActive } : undefined,
    newValue: { name: admin.name, role: admin.role, isActive: admin.isActive },
  });
  res.json({ ok: true, admin });
}

// POST /api/admin/admins/:id/reset-password
export async function resetAdminPasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ ok: false, message: 'Invalid id' }); return; }

  const { newPassword } = req.body ?? {};
  if (!newPassword || !isStrongPassword(newPassword)) {
    res.status(400).json({ ok: false, message: 'Password must be at least 12 chars with uppercase, lowercase, number and symbol.' });
    return;
  }

  await changeAdminPassword(id, newPassword);
  await revokeAllSessionsForAdmin(id);
  await logAdminAction({
    ...ctx,
    action: 'ADMIN_PASSWORD_RESET',
    module: 'admins',
    resource: 'AdminUser',
    resourceId: String(id),
  });
  res.json({ ok: true });
}

// GET /api/admin/admins/:id/sessions
export async function getAdminSessionsHandler(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ ok: false, message: 'Invalid id' }); return; }
  const sessions = await listActiveSessions(id);
  res.json({ ok: true, sessions });
}

// DELETE /api/admin/admins/:id/sessions
export async function revokeAdminSessionsHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ ok: false, message: 'Invalid id' }); return; }
  const count = await revokeAllSessionsForAdmin(id);
  await logAdminAction({
    ...ctx,
    action: 'ADMIN_SESSIONS_REVOKE_ALL',
    module: 'admins',
    resource: 'AdminUser',
    resourceId: String(id),
    newValue: { revokedCount: count },
  });
  res.json({ ok: true, revokedCount: count });
}

// GET /api/admin/sessions
export async function listMySessionsHandler(req: Request, res: Response): Promise<void> {
  const adminId = req.admin?.adminId;
  if (!adminId) { res.status(401).json({ ok: false, message: 'Not authenticated' }); return; }
  const sessions = await listActiveSessions(adminId);
  res.json({ ok: true, sessions, currentSessionId: req.admin?.sessionId });
}

// GET /api/admin/sessions/all
export async function listAllSessionsHandler(_req: Request, res: Response): Promise<void> {
  const sessions = await listAllActiveSessions();
  res.json({ ok: true, sessions });
}

// DELETE /api/admin/sessions/:sessionId
export async function revokeSessionHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const sessionId = req.params.sessionId as string;
  await revokeSession(sessionId);
  await logAdminAction({
    ...ctx,
    action: 'ADMIN_SESSION_REVOKE',
    module: 'admins',
    resource: 'AdminSession',
    resourceId: sessionId,
  });
  res.json({ ok: true });
}

// GET /api/admin/admin-audit
export async function adminAuditLogHandler(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const adminId = req.query.adminId ? Number(req.query.adminId) : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const module = typeof req.query.module === 'string' ? req.query.module : undefined;
  const success = req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const result = await queryAdminAuditLogs({ adminId, action, module, success, from, to, page, pageSize });
  res.json({ ok: true, ...result });
}

// POST /api/admin/change-password  (own password)
export async function changeOwnPasswordHandler(req: Request, res: Response): Promise<void> {
  const ctx = getAdminCtx(req);
  const adminId = req.admin?.adminId;
  if (!adminId) { res.status(401).json({ ok: false, message: 'Not authenticated' }); return; }

  const { newPassword } = req.body ?? {};
  if (!newPassword || !isStrongPassword(newPassword)) {
    res.status(400).json({ ok: false, message: 'Password must be at least 12 chars with uppercase, lowercase, number and symbol.' });
    return;
  }

  await changeAdminPassword(adminId, newPassword);
  // Revoke all OTHER sessions (keep current)
  const currentSessionId = req.admin?.sessionId;
  const sessions = await listActiveSessions(adminId);
  for (const s of sessions) {
    if (s.id !== currentSessionId) await revokeSession(s.id);
  }

  await logAdminAction({
    ...ctx,
    action: 'ADMIN_CHANGE_OWN_PASSWORD',
    module: 'admins',
    resource: 'AdminUser',
    resourceId: String(adminId),
  });
  res.json({ ok: true });
}

// GET /api/admin/admin-overview
export async function adminOverviewHandler(_req: Request, res: Response): Promise<void> {
  const [totalAdmins, activeAdmins, activeSessions, recentLogs] = await Promise.all([
    prisma.adminUser.count(),
    prisma.adminUser.count({ where: { isActive: true } }),
    prisma.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { admin: { select: { name: true, email: true } } },
    }),
  ]);
  res.json({ ok: true, totalAdmins, activeAdmins, activeSessions, recentLogs });
}
