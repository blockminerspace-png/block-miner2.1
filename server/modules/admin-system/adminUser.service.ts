import prisma from '../../src/db/prisma.js';
import { hashPassword } from './adminPassword.service.js';
import { resolvePermissions } from './adminPermissions.js';
import type { AdminUser } from '@prisma/client';

export type AdminUserPublic = Omit<AdminUser, 'passwordHash'> & { permissions: string[] };

function toPublic(u: AdminUser): AdminUserPublic {
  const { passwordHash: _ph, ...rest } = u;
  return { ...rest, permissions: resolvePermissions(u.role, u.permissions) };
}

export async function findAdminByEmail(email: string): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { email: email.toLowerCase().trim() } });
}

export async function findAdminById(id: number): Promise<AdminUser | null> {
  return prisma.adminUser.findUnique({ where: { id } });
}

export async function listAdmins(): Promise<AdminUserPublic[]> {
  const admins = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
  return admins.map(toPublic);
}

export async function createAdmin(data: {
  name: string;
  email: string;
  password: string;
  role?: string;
  permissions?: string[];
  createdById?: number;
}): Promise<AdminUserPublic> {
  const passwordHash = await hashPassword(data.password);
  const admin = await prisma.adminUser.create({
    data: {
      name: data.name.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash,
      role: data.role ?? 'admin',
      permissions: data.permissions ?? [],
      createdById: data.createdById ?? null,
      updatedById: data.createdById ?? null,
    },
  });
  return toPublic(admin);
}

export async function updateAdmin(
  id: number,
  data: { name?: string; role?: string; permissions?: string[]; isActive?: boolean; updatedById?: number },
): Promise<AdminUserPublic> {
  const admin = await prisma.adminUser.update({
    where: { id },
    data: {
      ...(data.name != null ? { name: data.name.trim() } : {}),
      ...(data.role != null ? { role: data.role } : {}),
      ...(data.permissions != null ? { permissions: data.permissions } : {}),
      ...(data.isActive != null ? { isActive: data.isActive } : {}),
      updatedById: data.updatedById ?? null,
    },
  });
  return toPublic(admin);
}

export async function changeAdminPassword(id: number, newPassword: string): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await prisma.adminUser.update({ where: { id }, data: { passwordHash } });
}

export async function updateLastLogin(id: number, ip: string | null, ua: string | null): Promise<void> {
  await prisma.adminUser.update({
    where: { id },
    data: { lastLoginAt: new Date(), lastLoginIp: ip, lastLoginUa: ua },
  });
}

export async function countSuperAdmins(): Promise<number> {
  return prisma.adminUser.count({ where: { role: 'super_admin', isActive: true } });
}

export { toPublic };
