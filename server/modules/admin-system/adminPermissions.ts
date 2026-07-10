export type AdminRole = 'super_admin' | 'admin' | 'moderator' | 'finance' | 'support' | 'readonly';

export const ADMIN_ROLES: AdminRole[] = ['super_admin', 'admin', 'moderator', 'finance', 'support', 'readonly'];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [
    'dashboard', 'users', 'miners', 'inventory', 'store', 'payments',
    'withdrawals', 'deposits', 'support', 'logs', 'monitoring', 'promotions',
    'events', 'offerwall', 'ptc', 'shortlinks', 'checkin', 'mining',
    'tournaments', 'banners', 'config', 'audit', 'admins',
  ],
  moderator: ['dashboard', 'users.view', 'users.ban', 'support', 'logs.view'],
  finance: ['dashboard', 'users.view', 'payments', 'withdrawals', 'deposits'],
  support: ['dashboard', 'users.view', 'support'],
  readonly: ['dashboard'],
};

export function resolvePermissions(role: string, permissionsOverride: unknown): string[] {
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? ['dashboard'];
  if (!Array.isArray(permissionsOverride) || permissionsOverride.length === 0) return defaults;
  return permissionsOverride.filter((p): p is string => typeof p === 'string');
}

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  const module = required.split('.')[0];
  return permissions.includes(module);
}
