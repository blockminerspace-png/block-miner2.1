import { api } from '../../store/auth';
import type { AdminAuthCheckResponse } from './admin.types';

/** Validates `admin_session` with the server (same contract as legacy inline call). */
export async function fetchAdminAuthOk(): Promise<boolean> {
  try {
    const res = await api.get<AdminAuthCheckResponse>('/admin/auth/check');
    return Boolean(res.data?.ok);
  } catch {
    return false;
  }
}

/** Safe `response.data.message` from an axios-like error object (no `any`). */
export function readAxiosResponseMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const response = 'response' in err ? (err as { response?: unknown }).response : undefined;
  if (typeof response !== 'object' || response === null) return undefined;
  const data = 'data' in response ? (response as { data?: unknown }).data : undefined;
  if (typeof data !== 'object' || data === null) return undefined;
  const message = 'message' in data ? (data as { message?: unknown }).message : undefined;
  return typeof message === 'string' ? message : undefined;
}
