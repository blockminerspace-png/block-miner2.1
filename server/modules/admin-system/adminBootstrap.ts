import loggerLib from '../../utils/logger.js';
import { findAdminByEmail, createAdmin } from './adminUser.service.js';

const logger = loggerLib.child('AdminBootstrap');

function readBootstrapAdmins(): Array<{ name: string; email: string; password: string; role: string }> {
  const enabled = String(process.env.ADMIN_BOOTSTRAP_ENABLED ?? '').trim().toLowerCase();
  if (enabled !== 'true' && enabled !== '1') return [];

  const admins: Array<{ name: string; email: string; password: string; role: string }> = [];
  let i = 1;
  while (true) {
    const name = String(process.env[`ADMIN_${i}_NAME`] ?? '').trim();
    const email = String(process.env[`ADMIN_${i}_EMAIL`] ?? '').trim().toLowerCase();
    const password = String(process.env[`ADMIN_${i}_PASSWORD`] ?? '').trim();
    const role = String(process.env[`ADMIN_${i}_ROLE`] ?? 'admin').trim();
    if (!name && !email) break;
    if (name && email && password) admins.push({ name, email, password, role });
    i++;
    if (i > 20) break;
  }
  return admins;
}

export async function bootstrapAdminUsers(): Promise<void> {
  const candidates = readBootstrapAdmins();
  if (candidates.length === 0) return;

  for (const candidate of candidates) {
    try {
      const existing = await findAdminByEmail(candidate.email);
      if (existing) {
        logger.info('AdminBootstrap: skipping existing admin', { email: candidate.email });
        continue;
      }
      await createAdmin({
        name: candidate.name,
        email: candidate.email,
        password: candidate.password,
        role: candidate.role,
      });
      logger.info('AdminBootstrap: created admin', { email: candidate.email, role: candidate.role });
    } catch (err) {
      logger.error('AdminBootstrap: failed to create admin', {
        email: candidate.email,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
