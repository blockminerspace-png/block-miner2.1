import prisma from '../../src/db/prisma.js';

export interface LogAdminActionOpts {
  adminId?: number | null;
  adminEmail?: string | null;
  sessionId?: string | null;
  action: string;
  module?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
  errorMsg?: string | null;
  durationMs?: number | null;
}

export async function logAdminAction(opts: LogAdminActionOpts): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminId: opts.adminId ?? null,
      adminEmail: opts.adminEmail ?? null,
      sessionId: opts.sessionId ?? null,
      action: opts.action,
      module: opts.module ?? null,
      resource: opts.resource ?? null,
      resourceId: opts.resourceId ? String(opts.resourceId) : null,
      oldValue: opts.oldValue !== undefined ? (opts.oldValue as object) : undefined,
      newValue: opts.newValue !== undefined ? (opts.newValue as object) : undefined,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      success: opts.success ?? true,
      errorMsg: opts.errorMsg ?? null,
      durationMs: opts.durationMs ?? null,
    },
  }).catch(() => undefined); // best-effort, never throws
}

export async function queryAdminAuditLogs(opts: {
  adminId?: number;
  action?: string;
  module?: string;
  success?: boolean;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 50 } = opts;
  const where = {
    ...(opts.adminId != null ? { adminId: opts.adminId } : {}),
    ...(opts.action ? { action: { contains: opts.action, mode: 'insensitive' as const } } : {}),
    ...(opts.module ? { module: opts.module } : {}),
    ...(opts.success != null ? { success: opts.success } : {}),
    ...(opts.from || opts.to ? {
      createdAt: {
        ...(opts.from ? { gte: opts.from } : {}),
        ...(opts.to ? { lte: opts.to } : {}),
      },
    } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { admin: { select: { name: true, email: true } } },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
